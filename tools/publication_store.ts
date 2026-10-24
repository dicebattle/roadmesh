import pg, { type PoolClient } from "pg";
import { canonical, identifier, sha256 } from "./shared.js";
import { IngestionStore } from "./ingestion_store.js";
import { utc } from "./ingestion_validation.js";
import { normalizedCatalog, windowTimes } from "./traffic_aggregation.js";
import {
  validateDraft,
  signManifest,
  strictJson,
  ARTIFACT_LIMIT,
  reject,
  PublicationError,
} from "./publication_crypto.js";
import type {
  PublicationStoreConfig,
  PublicationSigner,
  PublicationRecord,
  PublishResult,
  PublicationInspection,
  TrafficManifest,
  TrafficSnapshot,
} from "./publication_types.js";
const schema = `
CREATE SCHEMA IF NOT EXISTS routelens_p07;
CREATE TABLE IF NOT EXISTS routelens_p07.streams(namespace text NOT NULL,publisher_id text NOT NULL,region_id text NOT NULL,high_water bigint NOT NULL DEFAULT 0,current_snapshot_id text,PRIMARY KEY(namespace,publisher_id,region_id));
CREATE TABLE IF NOT EXISTS routelens_p07.publications(namespace text NOT NULL,publisher_id text NOT NULL,region_id text NOT NULL,sequence bigint NOT NULL,graph_id text NOT NULL,window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,published_at timestamptz NOT NULL,valid_until timestamptz NOT NULL,kid text NOT NULL,candidate_sha256 text NOT NULL,catalog_sha256 text NOT NULL,traffic_snapshot_id text NOT NULL,artifact bytea NOT NULL,jws text NOT NULL,PRIMARY KEY(namespace,publisher_id,region_id,sequence),UNIQUE(namespace,publisher_id,region_id,traffic_snapshot_id),FOREIGN KEY(namespace,publisher_id,region_id) REFERENCES routelens_p07.streams);
CREATE OR REPLACE FUNCTION routelens_p07.invalidate_candidate_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.canonical_sha256 IS DISTINCT FROM NEW.canonical_sha256 THEN
 UPDATE routelens_p07.streams s SET current_snapshot_id=NULL FROM routelens_p07.publications p
 WHERE s.namespace=OLD.namespace AND s.namespace=p.namespace AND s.publisher_id=p.publisher_id AND s.region_id=p.region_id
 AND s.current_snapshot_id=p.traffic_snapshot_id AND p.graph_id=OLD.graph_id AND p.window_start=OLD.window_start
 AND p.candidate_sha256=OLD.canonical_sha256 AND p.catalog_sha256=OLD.catalog_sha256 AND OLD.source_class='SYNTHETIC';
 END IF;
 RETURN OLD;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='p07_invalidate_candidate' AND tgrelid='routelens_p06.candidates'::regclass) THEN
 CREATE TRIGGER p07_invalidate_candidate AFTER DELETE OR UPDATE OF canonical_sha256 ON routelens_p06.candidates FOR EACH ROW EXECUTE FUNCTION routelens_p07.invalidate_candidate_publication();
 END IF;
END $$;
`;
const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();
export function recordFromRow(row: Record<string, unknown>): PublicationRecord {
  const sequence = Number(row.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    reject("INVALID_SEQUENCE");
  return {
    simulation_namespace: String(row.namespace),
    publisher_id: String(row.publisher_id),
    region_id: "seoul-pilot-corridors-v1",
    graph_id: String(row.graph_id),
    sequence,
    window_start: iso(row.window_start),
    window_end: iso(row.window_end),
    published_at: iso(row.published_at),
    valid_until: iso(row.valid_until),
    kid: String(row.kid),
    candidate_sha256: String(row.candidate_sha256),
    traffic_snapshot_id: String(row.traffic_snapshot_id),
    artifact: Uint8Array.from(row.artifact as Buffer),
    jws: String(row.jws),
  };
}
export class PublicationStore {
  private readonly pool: pg.Pool;
  private readonly clock: IngestionStore;
  readonly config: PublicationStoreConfig;
  constructor(config: PublicationStoreConfig) {
    identifier(config.publisher_id, "publisher_id");
    if (
      config.aggregation.source_class !== "SYNTHETIC" ||
      config.aggregation.store.matching_policy !== "seoul-observed-v3"
    )
      reject("WRONG_SCOPE");
    this.config = {
      ...config,
      aggregation: {
        ...config.aggregation,
        catalog: normalizedCatalog(config.aggregation.catalog),
      },
    };
    this.clock = new IngestionStore(config.aggregation.store);
    this.pool = new pg.Pool({
      connectionString: config.aggregation.store.database_url,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      lock_timeout: 5000,
      application_name: "routelens-p07",
    });
    this.pool.on("error", () => {});
  }
  private keys(): string[] {
    return [
      this.config.aggregation.store.namespace,
      this.config.publisher_id,
      "seoul-pilot-corridors-v1",
    ];
  }
  async initialize(): Promise<void> {
    try {
      await this.pool.query(schema);
      await this.verifyInitialized();
    } catch {
      reject("SCHEMA_NOT_INITIALIZED");
    }
  }
  async verifyInitialized(): Promise<void> {
    try {
      const row = (
        await this.pool.query(
          "SELECT to_regclass('routelens_p07.streams') IS NOT NULL AS streams,to_regclass('routelens_p07.publications') IS NOT NULL AS publications,EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='p07_invalidate_candidate' AND tgrelid=to_regclass('routelens_p06.candidates') AND tgenabled IN ('O','A')) AS trigger",
        )
      ).rows[0];
      if (!row?.streams || !row.publications || !row.trigger)
        reject("SCHEMA_NOT_INITIALIZED");
      if (
        !(
          await this.pool.query(
            "SELECT 1 FROM routelens_p05.namespace_clock WHERE namespace=$1",
            [this.keys()[0]],
          )
        ).rowCount
      )
        reject("SCHEMA_NOT_INITIALIZED");
    } catch {
      reject("SCHEMA_NOT_INITIALIZED");
    }
  }
  private async tx<T>(
    run: (client: PoolClient, now: string) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool
      .connect()
      .catch(() => reject("STORE_UNAVAILABLE"));
    try {
      await client.query("BEGIN");
      const row = (
        await client.query(
          "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1 FOR SHARE",
          [this.keys()[0]],
        )
      ).rows[0];
      if (!row) reject("SCHEMA_NOT_INITIALIZED");
      const result = await run(client, iso(row.event_time_utc));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof PublicationError) throw error;
      reject("STORE_UNAVAILABLE");
    } finally {
      client.release();
    }
  }
  async publish(
    windowStartUtc: string,
    eventTimeUtc: string,
    signer: PublicationSigner,
    beforeCommit?: () => Promise<void>,
  ): Promise<PublishResult> {
    const times = windowTimes(windowStartUtc);
    await this.clock.advanceEventTime(eventTimeUtc);
    return this.tx(async (client, now) => {
      const [namespace, publisher, region] = this.keys();
      const candidate = (
        await client.query(
          "SELECT * FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 AND window_start=$5 FOR SHARE",
          [
            namespace,
            this.config.aggregation.store.graph_id,
            "seoul-window-median-v1",
            "SYNTHETIC",
            new Date(times.start).toISOString(),
          ],
        )
      ).rows[0];
      if (!candidate) return { code: "CANDIDATE_MISSING", publication: null };
      if (utc(now) >= times.validUntil)
        return { code: "EXPIRED", publication: null };
      if (utc(now) < times.deadline) reject("WINDOW_OPEN");
      const bytes = candidate.canonical_json as Buffer;
      if (
        sha256(bytes) !== candidate.canonical_sha256 ||
        candidate.catalog_sha256 !==
          sha256(canonical(this.config.aggregation.catalog))
      )
        reject("CANDIDATE_MISMATCH");
      const draft = validateDraft(
        strictJson(bytes, ARTIFACT_LIMIT),
        this.config.aggregation.catalog,
        this.config.aggregation.store.graph_id,
      );
      if (
        !canonical(draft).equals(bytes) ||
        draft.window_start !== new Date(times.start).toISOString() ||
        draft.window_end !== iso(candidate.window_end) ||
        candidate.aggregation_policy !== draft.aggregation_policy ||
        candidate.source_class !== "SYNTHETIC"
      )
        reject("CANDIDATE_MISMATCH");
      await client.query(
        "INSERT INTO routelens_p07.streams(namespace,publisher_id,region_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        this.keys(),
      );
      const stream = (
        await client.query(
          "SELECT * FROM routelens_p07.streams WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3 FOR UPDATE",
          this.keys(),
        )
      ).rows[0];
      const previous = (
        await client.query(
          "SELECT * FROM routelens_p07.publications WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3 ORDER BY sequence DESC LIMIT 1",
          this.keys(),
        )
      ).rows[0];
      if (previous && utc(iso(previous.window_start)) > times.start)
        return { code: "OLDER_WINDOW", publication: null };
      if (
        previous &&
        previous.candidate_sha256 === candidate.canonical_sha256 &&
        iso(previous.window_start) === draft.window_start &&
        previous.kid === signer.kid
      ) {
        await client.query(
          "UPDATE routelens_p07.streams SET current_snapshot_id=$4 WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3",
          [...this.keys(), previous.traffic_snapshot_id],
        );
        await beforeCommit?.();
        return { code: "UNCHANGED", publication: recordFromRow(previous) };
      }
      const previousSequence = BigInt(stream.high_water);
      if (previousSequence >= BigInt(Number.MAX_SAFE_INTEGER))
        reject("SEQUENCE_EXHAUSTED");
      const sequence = Number(previousSequence + 1n),
        snapshot: TrafficSnapshot = {
          ...draft,
          simulation_namespace: namespace!,
          publisher_id: publisher!,
          sequence,
          published_at: now,
        },
        artifact = canonical(snapshot),
        snapshotId = sha256(artifact);
      if (artifact.length > ARTIFACT_LIMIT) reject("OVERSIZE");
      const manifest: TrafficManifest = {
        schema_version: "0.1",
        simulation_namespace: namespace!,
        publisher_id: publisher!,
        graph_id: draft.graph_id,
        region_id: "seoul-pilot-corridors-v1",
        sequence,
        window_start: draft.window_start,
        window_end: draft.window_end,
        published_at: now,
        valid_until: draft.valid_until,
        aggregation_policy: draft.aggregation_policy,
        traffic_snapshot_id: snapshotId,
        byte_length: artifact.length,
        media_type: "application/json",
      };
      const jws = await signManifest(manifest, signer);
      const row = (
        await client.query(
          "INSERT INTO routelens_p07.publications(namespace,publisher_id,region_id,sequence,graph_id,window_start,window_end,published_at,valid_until,kid,candidate_sha256,catalog_sha256,traffic_snapshot_id,artifact,jws) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
          [
            namespace,
            publisher,
            region,
            sequence,
            draft.graph_id,
            draft.window_start,
            draft.window_end,
            now,
            draft.valid_until,
            signer.kid,
            candidate.canonical_sha256,
            candidate.catalog_sha256,
            snapshotId,
            artifact,
            jws,
          ],
        )
      ).rows[0];
      await client.query(
        "UPDATE routelens_p07.streams SET high_water=$4,current_snapshot_id=$5 WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3",
        [...this.keys(), sequence, snapshotId],
      );
      await beforeCommit?.();
      return { code: "PUBLISHED", publication: recordFromRow(row) };
    });
  }
  async current(): Promise<
    | { code: "AVAILABLE"; publication: PublicationRecord }
    | { code: "MISSING" | "EXPIRED"; publication: null }
  > {
    return this.tx(async (client, now) => {
      const row = (
        await client.query(
          "SELECT p.* FROM routelens_p07.streams s JOIN routelens_p07.publications p ON p.namespace=s.namespace AND p.publisher_id=s.publisher_id AND p.region_id=s.region_id AND p.traffic_snapshot_id=s.current_snapshot_id WHERE s.namespace=$1 AND s.publisher_id=$2 AND s.region_id=$3 FOR SHARE OF s",
          this.keys(),
        )
      ).rows[0];
      if (!row) return { code: "MISSING", publication: null };
      const publication = recordFromRow(row);
      if (utc(now) >= utc(publication.valid_until))
        return { code: "EXPIRED", publication: null };
      return { code: "AVAILABLE", publication };
    });
  }
  async artifact(hash: string): Promise<PublicationRecord | null> {
    if (!/^[a-f0-9]{64}$/.test(hash)) reject("INVALID_HASH");
    return this.tx(async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM routelens_p07.publications WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3 AND traffic_snapshot_id=$4",
          [...this.keys(), hash],
        )
      ).rows[0];
      return row ? recordFromRow(row) : null;
    });
  }
  async inspect(): Promise<PublicationInspection> {
    return this.tx(async (client) => {
      const streams = (
        await client.query(
          "SELECT * FROM routelens_p07.streams WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3",
          this.keys(),
        )
      ).rows.map((row) => ({
        publisher_id: String(row.publisher_id),
        region_id: String(row.region_id),
        high_water: Number(row.high_water),
        current_snapshot_id: row.current_snapshot_id as string | null,
      }));
      const publications = (
        await client.query(
          "SELECT * FROM routelens_p07.publications WHERE namespace=$1 AND publisher_id=$2 AND region_id=$3 ORDER BY sequence",
          this.keys(),
        )
      ).rows.map(recordFromRow);
      return { streams, publications };
    });
  }
  async close(): Promise<void> {
    await Promise.all([this.pool.end(), this.clock.close()]);
  }
}
