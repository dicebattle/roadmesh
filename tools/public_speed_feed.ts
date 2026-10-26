/** One serialized source producer with restart-safe original observations.
 * 원 관측·재시작을 보존하는 직렬 공공 자료 발급자. */
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JWK } from "jose";
import { canonical, parseJson, record, sha256 } from "./shared.js";
import { durableNodeJSON } from "./node_engine.js";
import { normalizeItsResponse, PublicSpeedError, publicTime, type ItsRead, type PublicBounds,
  type PublicSpeedBatch } from "./public_speed_source.js";
import { buildPublicTrafficSnapshot, signPublicTraffic } from "./public_speed_publication.js";
import { matchesPublicMappingNodes, type PublicRoadMapping } from "./public_speed_geometry.js";
import { PublicSpeedAuthority, type PublicAcceptedSelection } from "./public_speed_authority.js";
import type { CatalogEdge } from "./aggregation_types.js";
import type { PublicTrafficContext } from "./gateway_public_types.js";
import { normalizeRegionalResponse } from "./regional_speed_source.js";

export interface PublicFeedConfig {
  directory: string;
  bounds: PublicBounds;
  mapping: PublicRoadMapping;
  catalog: CatalogEdge[];
  publisher_id: string;
  signer: {kid: string; private_jwk: JWK};
  authority: PublicSpeedAuthority;
  collect(): Promise<ItsRead>;
  clock?: () => number;
  evidence_directory?: string;
}
export interface PublicFeedSelection {
  selection: PublicAcceptedSelection;
  metadata: PublicTrafficContext;
}
export class PublicSpeedFeed {
  private batch: PublicSpeedBatch | null = null;
  private refreshState: PublicTrafficContext["refresh_state"] = "WAITING";
  private serial: Promise<unknown> = Promise.resolve();
  private refreshing?: Promise<void>;
  private stopped = false;
  private constructor(private readonly config: PublicFeedConfig) {}
  private now(): string { return new Date((this.config.clock ?? Date.now)()).toISOString(); }
  private normalize(raw: Uint8Array, retrieved_at: string): PublicSpeedBatch {
    return this.config.mapping.policy === "kr-regional-envelope-v1"
      ? normalizeRegionalResponse(raw,retrieved_at,this.config.bounds,this.config.mapping)
      : normalizeItsResponse(raw,retrieved_at,this.config.bounds);
  }
  private queue<T>(run: () => Promise<T>): Promise<T> {
    if (this.stopped) return Promise.reject(new PublicSpeedError("PUBLIC_FEED_CLOSED"));
    const work = this.serial.then(run); this.serial = work.catch(() => {}); return work;
  }
  static open(config: PublicFeedConfig): PublicSpeedFeed {
    const feed = new PublicSpeedFeed(config), path = join(config.directory, "source-cache.json");
    if (!existsSync(path)) return feed;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 12 * 1024 * 1024)
      throw new PublicSpeedError("INVALID_PUBLIC_CACHE");
    const value = parseJson(readFileSync(path));
    record(value, "public cache", ["schema_version", "bounds", "retrieved_at", "raw_sha256", "raw_base64"]);
    if (value.schema_version !== "public-source-cache-0.1" || typeof value.raw_base64 !== "string" ||
        typeof value.retrieved_at !== "string" || !canonical(value.bounds).equals(canonical(config.bounds)) ||
        publicTime(value.retrieved_at) > publicTime(feed.now())) throw new PublicSpeedError("INVALID_PUBLIC_CACHE");
    const raw = Buffer.from(value.raw_base64, "base64");
    if (raw.toString("base64") !== value.raw_base64 || sha256(raw) !== value.raw_sha256)
      throw new PublicSpeedError("INVALID_PUBLIC_CACHE");
    feed.batch = feed.normalize(raw, value.retrieved_at);
    feed.refreshState = "OK";
    return feed;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.stopped) return Promise.reject(new PublicSpeedError("PUBLIC_FEED_CLOSED"));
    const work = (async () => {
      let result: ItsRead;
      try {result = await this.config.collect();}
      catch {
        if (!this.stopped) await this.queue(async () => {this.refreshState = "FAILED";});
        return;
      }
      if (this.stopped) return;
      await this.queue(async () => {
      try {
        // Recompute from exact raw bytes; a forged normalized object cannot authorize a speed.
        // 정규화 객체의 주장 대신 정확한 원문으로 다시 계산합니다.
        const batch = this.normalize(result.raw, result.batch.retrieved_at);
        if (!canonical(batch).equals(canonical(result.batch)) || publicTime(batch.retrieved_at) > publicTime(this.now()) ||
            (this.batch && publicTime(batch.retrieved_at) < publicTime(this.batch.retrieved_at)))
          throw new PublicSpeedError("PUBLIC_SOURCE_TIME_ROLLBACK");
        durableNodeJSON(join(this.config.directory, "source-cache.json"), {schema_version: "public-source-cache-0.1",
          bounds: this.config.bounds, retrieved_at: batch.retrieved_at, raw_sha256: batch.raw_sha256,
          raw_base64: Buffer.from(result.raw).toString("base64")});
        this.batch = batch; this.refreshState = "OK";
        if (this.config.evidence_directory) {
          const name = batch.retrieved_at.replace(/[:.]/g, "-") + "-" + batch.raw_sha256;
          writeFileSync(join(this.config.evidence_directory, name + ".response.json"), result.raw, {flag: "wx"});
          durableNodeJSON(join(this.config.evidence_directory, name + ".batch.json"), batch);
        }
      } catch {
        this.refreshState = "FAILED";
        // Keep previous observation times unchanged, including when credentials/provider fail.
        // 인증·기관 장애에서도 이전 관측 시각을 바꾸지 않습니다.
      }
      });
    })();
    this.refreshing = work;
    void work.finally(() => {if (this.refreshing === work) this.refreshing = undefined;}).catch(() => {});
    return work;
  }
  select(): Promise<PublicFeedSelection> {
    return this.queue(async () => {
      let state = await this.config.authority.inspect();
      const batch = this.batch;
      if (batch && (!state.active || publicTime(batch.retrieved_at) >= publicTime(state.active.snapshot.retrieved_at))) {
        const candidate = buildPublicTrafficSnapshot(batch, this.config.mapping, this.config.publisher_id,
          state.high_water + 1, this.now());
        const semantic = (v: NonNullable<typeof candidate>) => canonical({raw_sha256: v.raw_sha256,
          retrieved_at: v.retrieved_at, entries: v.entries, coverage: v.coverage});
        if (candidate && (!state.active || !semantic(candidate).equals(semantic(state.active.snapshot)))) {
          const signed = await signPublicTraffic(candidate, this.config.signer.kid, this.config.signer.private_jwk, this.config.catalog);
          await this.config.authority.accept(signed.jws, signed.artifact);
          if (this.config.evidence_directory) {
            const base = join(this.config.evidence_directory, "sequence-" + signed.snapshot.sequence);
            writeFileSync(base + ".artifact.json", signed.artifact, {flag: "wx"});
            writeFileSync(base + ".jws", signed.jws, {flag: "wx"});
            durableNodeJSON(base + ".manifest.json", signed.manifest);
          }
          state = await this.config.authority.inspect();
        } else if (!candidate && state.active) {
          await this.config.authority.withdraw(batch.raw_sha256);
          state = await this.config.authority.inspect();
        }
      }
      const snapshot = state.active?.snapshot;
      const byId = new Map(batch?.observations.map(o => [o.link_id, o]) ?? []);
      const mapped = this.config.mapping.entries.map(e => {
        const o = byId.get(e.link_id);
        return o && matchesPublicMappingNodes(this.config.mapping, e, o.start_node_id, o.end_node_id) ? o : null;
      }).filter(o => o !== null);
      const times = snapshot ? snapshot.entries.map(e => e.observed_at) : mapped.flatMap(o => o.observed_at ? [o.observed_at] : []);
      times.sort();
      const metadata: PublicTrafficContext = {provider: this.config.mapping.policy === "kr-regional-envelope-v1" ? "kr-regional" : "kr-its",
        source_state: snapshot ? "CURRENT" : !batch ? "UNAVAILABLE" :
          mapped.some(o => o.valid_until !== null && publicTime(o.valid_until) <= publicTime(state.checked_at_utc)) ? "EXPIRED" : "NO_MAPPED_SPEEDS",
        refresh_state: this.refreshState, retrieved_at: snapshot?.retrieved_at ?? batch?.retrieved_at ?? null,
        observed_from: times[0] ?? null, observed_until: times.at(-1) ?? null,
        graph_edges: this.config.catalog.length, mapped_edges: this.config.mapping.entries.length,
        live_edges: snapshot?.entries.length ?? 0};
      if (metadata.provider === "kr-regional") metadata.sources = (["kr-gits","kr-ex"] as const).map(provider => {
        const prefix = provider === "kr-gits" ? "gits:" : "ex:";
        const entries = snapshot?.entries.filter(e => e.link_id.startsWith(prefix)) ?? [];
        const observed = entries.map(e => e.observed_at).sort();
        return {provider,live_edges:entries.length,access:provider === "kr-gits" ? "ANONYMOUS_WEBSITE" : "OFFICIAL_PUBLIC_DEMO_BROWSER_DOCUMENT",
          observed_from:observed[0] ?? null,observed_until:observed.at(-1) ?? null};
      });
      return {selection: state, metadata};
    });
  }
  async close(): Promise<void> { this.stopped = true; await this.refreshing; await this.serial; }
}
