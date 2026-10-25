/** Durable public-feed order, independent of the synthetic event clock.
 * 합성 관측 시계와 독립적인 공공 수신 상태·영속 순서. */
import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonical, parseJson, record, sha256 } from "./shared.js";
import { PublicSpeedError, publicTime } from "./public_speed_source.js";
import { readPublicTrafficArtifact, verifyPublicTraffic, type PublicTrafficPublication,
  type PublicTrafficTrust } from "./public_speed_publication.js";
import type { PublicRoadMapping } from "./public_speed_geometry.js";
import type { CatalogEdge } from "./aggregation_types.js";

interface AcceptedState {
  schema_version: "public-acceptance-0.1";
  scope_sha256: string;
  high_water: number;
  snapshot_id: string;
  accepted_at: string;
  manifest: PublicTrafficPublication["manifest"];
  jws: string;
  artifact_base64: string;
  withdrawn?: true;
  withdrawal_raw_sha256?: string;
}
export interface PublicAuthorityConfig {
  state_path: string;
  trust: PublicTrafficTrust;
  mapping: PublicRoadMapping;
  catalog: CatalogEdge[];
  clock?: () => number;
}
export interface PublicAcceptedSelection {
  high_water: number;
  checked_at_utc: string;
  active: PublicTrafficPublication | null;
}
export class PublicSpeedAuthority {
  private serial: Promise<unknown> = Promise.resolve();
  private readonly db: DatabaseSync;
  private readonly trust: PublicTrafficTrust;
  private readonly mapping: PublicRoadMapping;
  private readonly catalog: CatalogEdge[];
  private readonly clock: () => number;
  private readonly scope: string;
  private closing = false;
  private ended?: Promise<void>;
  private constructor(config: PublicAuthorityConfig) {
    const path = resolve(config.state_path);
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new PublicSpeedError("INVALID_PUBLIC_STATE_PATH");
    }
    this.trust = structuredClone(config.trust);
    this.mapping = structuredClone(config.mapping);
    this.catalog = structuredClone(config.catalog);
    this.clock = config.clock ?? Date.now;
    this.scope = sha256(canonical({kid: this.trust.kid, public_jwk: this.trust.public_jwk,
      publisher_id: this.trust.publisher_id, graph_id: this.trust.graph_id,
      mapping_sha256: this.trust.mapping_sha256, catalog: this.catalog}));
    this.db = new DatabaseSync(path);
    try {
      this.db.exec("PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.db.exec("CREATE TABLE IF NOT EXISTS public_acceptance (singleton INTEGER PRIMARY KEY CHECK(singleton=1), record_json TEXT NOT NULL) STRICT");
    } catch {
      this.db.close();
      throw new PublicSpeedError("PUBLIC_STATE_UNAVAILABLE");
    }
  }
  private now(): string { return new Date(this.clock()).toISOString(); }
  private guard(): void { if (this.closing) throw new PublicSpeedError("PUBLIC_AUTHORITY_CLOSED"); }
  private current(): string | null {
    const row = this.db.prepare("SELECT record_json FROM public_acceptance WHERE singleton=1").get();
    if (!row) return null;
    if (typeof row.record_json !== "string" || Buffer.byteLength(row.record_json) > 12 * 1024 * 1024)
      throw new PublicSpeedError("INVALID_PUBLIC_STATE");
    return row.record_json;
  }
  private decode(raw: string): AcceptedState {
    const value = parseJson(raw);
    record(value, "public acceptance", ["schema_version", "scope_sha256", "high_water", "snapshot_id", "accepted_at", "manifest", "jws", "artifact_base64"], ["withdrawn", "withdrawal_raw_sha256"]);
    if (value.schema_version !== "public-acceptance-0.1" || value.scope_sha256 !== this.scope ||
        typeof value.artifact_base64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.artifact_base64) ||
        typeof value.jws !== "string" || typeof value.accepted_at !== "string")
      throw new PublicSpeedError("INVALID_PUBLIC_STATE");
    if ((Object.hasOwn(value, "withdrawn") || Object.hasOwn(value, "withdrawal_raw_sha256")) &&
        (value.withdrawn !== true || typeof value.withdrawal_raw_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.withdrawal_raw_sha256)))
      throw new PublicSpeedError("INVALID_PUBLIC_STATE");
    const bytes = Buffer.from(value.artifact_base64, "base64");
    if (bytes.toString("base64") !== value.artifact_base64) throw new PublicSpeedError("INVALID_PUBLIC_STATE");
    const state = value as unknown as AcceptedState;
    const snapshot = readPublicTrafficArtifact(state.manifest, bytes, this.catalog);
    if (state.high_water !== snapshot.sequence || state.snapshot_id !== state.manifest.traffic_snapshot_id ||
        publicTime(state.accepted_at) < publicTime(snapshot.published_at)) throw new PublicSpeedError("INVALID_PUBLIC_STATE");
    return state;
  }
  private async historical(state: AcceptedState): Promise<void> {
    // Restore signed order after expiry/revocation; this is never current authorization.
    // 만료·철회 뒤 과거 서명 순서를 복구할 뿐 현재 사용 승인은 아닙니다.
    await verifyPublicTraffic(state.jws, Buffer.from(state.artifact_base64, "base64"), {...this.trust, revoked: false},
      this.mapping, this.catalog, state.manifest.published_at);
  }
  static async open(config: PublicAuthorityConfig): Promise<PublicSpeedAuthority> {
    const instance = new PublicSpeedAuthority(config);
    try {
      const raw = instance.current();
      if (raw !== null) await instance.historical(instance.decode(raw));
      return instance;
    } catch (error) { instance.db.close(); throw error; }
  }
  accept(jws: string, artifact: Uint8Array): Promise<"ACCEPTED" | "DUPLICATE"> {
    if (this.closing) return Promise.reject(new PublicSpeedError("PUBLIC_AUTHORITY_CLOSED"));
    const copy = Buffer.from(artifact);
    const work = this.serial.then(async () => {
      const publication = await verifyPublicTraffic(jws, copy, this.trust, this.mapping, this.catalog, this.now());
      for (let attempt = 0; attempt < 3; attempt++) {
        const oldRaw = this.current(), previous = oldRaw === null ? null : this.decode(oldRaw);
        if (previous) {
          await this.historical(previous);
          if (publication.snapshot.sequence < previous.high_water) throw new PublicSpeedError("PUBLIC_SEQUENCE_ROLLBACK");
          if (publication.snapshot.sequence === previous.high_water &&
              publication.manifest.traffic_snapshot_id !== previous.snapshot_id) throw new PublicSpeedError("PUBLIC_SEQUENCE_CONFLICT");
          const old = readPublicTrafficArtifact(previous.manifest, Buffer.from(previous.artifact_base64, "base64"), this.catalog);
          if (publicTime(publication.snapshot.retrieved_at) < publicTime(old.retrieved_at) ||
              publicTime(publication.snapshot.published_at) < publicTime(old.published_at))
            throw new PublicSpeedError("PUBLIC_SOURCE_TIME_ROLLBACK");
        }
        let committed = false;
        this.db.exec("BEGIN IMMEDIATE");
        try {
          if (this.current() !== oldRaw) continue;
          const at = this.now();
          if (publicTime(at) >= publicTime(publication.snapshot.valid_until) || this.trust.revoked ||
              publicTime(at) < publicTime(this.trust.valid_from) || publicTime(at) >= publicTime(this.trust.valid_until))
            throw new PublicSpeedError("PUBLIC_SCOPE_OR_TIME");
          if (previous?.high_water === publication.snapshot.sequence) return "DUPLICATE" as const;
          const state: AcceptedState = {schema_version: "public-acceptance-0.1", scope_sha256: this.scope,
            high_water: publication.snapshot.sequence, snapshot_id: publication.manifest.traffic_snapshot_id,
            accepted_at: at, manifest: publication.manifest, jws, artifact_base64: copy.toString("base64")};
          this.db.prepare("INSERT INTO public_acceptance(singleton,record_json) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET record_json=excluded.record_json")
            .run(canonical(state).toString("utf8"));
          this.db.exec("COMMIT"); committed = true;
          return "ACCEPTED" as const;
        } finally { if (!committed) this.db.exec("ROLLBACK"); }
      }
      throw new PublicSpeedError("PUBLIC_ACCEPTANCE_BUSY");
    });
    this.serial = work.catch(() => {});
    return work;
  }
  setRevoked(revoked: boolean): void {
    this.guard();
    if (typeof revoked !== "boolean") throw new PublicSpeedError("INVALID_PUBLIC_REVOCATION");
    this.trust.revoked = revoked;
  }
  /** Local producer withdrawal only removes authority; it cannot add a speed or reset order.
   * 로컬 발급자의 철회는 사용 승인만 제거하며 속도 추가·순서 초기화를 하지 않습니다. */
  withdraw(raw_sha256: string): Promise<void> {
    if (this.closing || !/^[a-f0-9]{64}$/.test(raw_sha256))
      return Promise.reject(new PublicSpeedError("INVALID_PUBLIC_WITHDRAWAL"));
    const work = this.serial.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const raw = this.current(); if (raw === null) return;
        const state = this.decode(raw); await this.historical(state);
        if (state.withdrawn) return;
        let committed = false;
        this.db.exec("BEGIN IMMEDIATE");
        try {
          if (this.current() !== raw) continue;
          this.db.prepare("UPDATE public_acceptance SET record_json=? WHERE singleton=1")
            .run(canonical({...state, withdrawn: true, withdrawal_raw_sha256: raw_sha256}).toString());
          this.db.exec("COMMIT"); committed = true; return;
        } finally { if (!committed) this.db.exec("ROLLBACK"); }
      }
      throw new PublicSpeedError("PUBLIC_ACCEPTANCE_BUSY");
    });
    this.serial = work.catch(() => {}); return work;
  }
  async inspect(): Promise<PublicAcceptedSelection> {
    this.guard();
    const raw = this.current(), state = raw === null ? null : this.decode(raw), at = this.now();
    const empty: PublicAcceptedSelection = {high_water: state?.high_water ?? 0, checked_at_utc: at, active: null};
    if (!state) return empty;
    await this.historical(state);
    if (state.withdrawn || this.trust.revoked || publicTime(at) >= publicTime(state.manifest.valid_until) ||
        publicTime(at) < publicTime(this.trust.valid_from) || publicTime(at) >= publicTime(this.trust.valid_until)) return empty;
    const active = await verifyPublicTraffic(state.jws, Buffer.from(state.artifact_base64, "base64"), this.trust,
      this.mapping, this.catalog, at);
    this.guard();
    if (this.current() !== raw || this.trust.revoked || publicTime(this.now()) >= publicTime(state.manifest.valid_until)) {
      const latest = this.current();
      return {high_water: latest === null ? 0 : this.decode(latest).high_water, checked_at_utc: this.now(), active: null};
    }
    return {high_water: state.high_water, checked_at_utc: at, active};
  }
  close(): Promise<void> {
    if (!this.ended) {
      this.closing = true;
      this.ended = this.serial.then(() => { this.db.close(); });
    }
    return this.ended;
  }
}
