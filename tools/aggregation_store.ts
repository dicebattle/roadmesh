import pg, { type PoolClient } from "pg";
import { canonical, identifier, sha256 } from "./shared.js";
import { IngestionStore } from "./ingestion_store.js";
import { utc } from "./ingestion_validation.js";
import {
  aggregateWindow,
  normalizedCatalog,
  windowTimes,
  AGGREGATION_POLICY,
} from "./traffic_aggregation.js";
import type {
  AggregationStoreConfig,
  AggregationResult,
  AggregationInspection,
  AggregationContribution,
  AggregationCandidateRow,
} from "./aggregation_types.js";
const schema = `
CREATE SCHEMA IF NOT EXISTS routelens_p06;
CREATE TABLE IF NOT EXISTS routelens_p06.candidates(
 namespace text NOT NULL,graph_id text NOT NULL,aggregation_policy text NOT NULL,source_class text NOT NULL,
 window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,canonical_json bytea NOT NULL,
 canonical_sha256 text NOT NULL,input_sha256 text NOT NULL,catalog_sha256 text NOT NULL,finalized_at_utc timestamptz NOT NULL,
 PRIMARY KEY(namespace,graph_id,aggregation_policy,source_class,window_start));
CREATE OR REPLACE FUNCTION routelens_p06.invalidate_deleted_traversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM routelens_p06.candidates WHERE namespace=OLD.namespace AND graph_id=OLD.graph_id
 AND aggregation_policy='seoul-window-median-v1' AND source_class=OLD.source_class
 AND window_start=to_timestamp(floor(extract(epoch FROM OLD.exited_at_utc)/60)*60);
 RETURN OLD;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='p06_invalidate_traversal' AND tgrelid='routelens_p05.traversals'::regclass) THEN
 CREATE TRIGGER p06_invalidate_traversal AFTER DELETE ON routelens_p05.traversals FOR EACH ROW EXECUTE FUNCTION routelens_p06.invalidate_deleted_traversal();
 END IF;
END $$;
`;
const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();
function unavailable(): never {
  throw new Error(
    "Aggregation transaction did not complete / 집계 트랜잭션이 완료되지 않았습니다",
  );
}
export class AggregationStore {
  private readonly pool: pg.Pool;
  private readonly ingestion: IngestionStore;
  readonly config: AggregationStoreConfig;
  constructor(config: AggregationStoreConfig) {
    identifier(config.store.namespace, "namespace");
    if (
      config.source_class !== "SYNTHETIC" ||
      config.store.matching_policy !== "seoul-observed-v3"
    )
      throw new Error(
        "Only pinned synthetic v3 aggregation is allowed / 집계는 고정된 합성 v3 정책만 허용합니다",
      );
    this.config = { ...config, catalog: normalizedCatalog(config.catalog) };
    this.ingestion = new IngestionStore(config.store);
    this.pool = new pg.Pool({
      connectionString: config.store.database_url,
      max: 4,
      connectionTimeoutMillis: 5000,
      application_name: "routelens-p06",
      statement_timeout: 15000,
      lock_timeout: 5000,
    });
    this.pool.on("error", () => {});
  }
  async initialize(): Promise<void> {
    await this.ingestion.initialize();
    try {
      await this.pool.query(schema);
    } catch {
      unavailable();
    }
  }
  async verifyInitialized(): Promise<void> {
    try {
      const result = (
        await this.pool.query(`SELECT
        to_regclass('routelens_p06.candidates') IS NOT NULL AS candidates_exists,
        to_regclass('routelens_p05.namespace_clock') IS NOT NULL AS clock_exists,
        EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='p06_invalidate_traversal' AND tgrelid=to_regclass('routelens_p05.traversals') AND NOT tgisinternal AND tgenabled IN ('O','A')) AS trigger_exists,
        EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('routelens_p05.trips') AND attname='trip_activity' AND NOT attisdropped) AS activity_exists`)
      ).rows[0];
      if (
        !result?.candidates_exists ||
        !result.clock_exists ||
        !result.trigger_exists ||
        !result.activity_exists
      )
        unavailable();
      if (
        !(
          await this.pool.query(
            "SELECT 1 FROM routelens_p05.namespace_clock WHERE namespace=$1",
            [this.config.store.namespace],
          )
        ).rowCount
      )
        unavailable();
    } catch {
      throw new Error(
        "Aggregation schema is not initialized / 집계 스키마가 초기화되지 않았습니다",
      );
    }
  }
  private async tx<T>(
    run: (client: PoolClient, now: string) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect().catch(unavailable);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='15000ms'");
      await client.query("SET LOCAL lock_timeout='5000ms'");
      const clock = (
        await client.query(
          "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1 FOR SHARE",
          [this.config.store.namespace],
        )
      ).rows[0];
      if (!clock) unavailable();
      const value = await run(client, iso(clock.event_time_utc));
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (
        error instanceof Error &&
        error.message.includes("Invalid aggregation")
      )
        throw error;
      return unavailable();
    } finally {
      client.release();
    }
  }
  async finalize(
    windowStartUtc: string,
    eventTimeUtc: string,
    beforeCommit?: () => Promise<void>,
  ): Promise<AggregationResult> {
    const times = windowTimes(windowStartUtc);
    await this.ingestion.advanceEventTime(eventTimeUtc);
    return this.tx(async (client, now) => {
      const n = this.config.store.namespace;
      await client.query(
        "SELECT contributor_id FROM routelens_p05.contributors WHERE namespace=$1 ORDER BY contributor_id FOR SHARE",
        [n],
      );
      const rows = (
        await client.query(
          `SELECT v.observation_id,v.contributor_id,v.graph_id,v.matching_policy,v.source_class,t.trip_activity,v.edge_id,v.forward,v.entered_at_utc,v.exited_at_utc,v.distance_m,v.duration_s,available.at_event_utc AS available_at_utc
   FROM routelens_p05.traversals v JOIN routelens_p05.trips t USING(namespace,contributor_id,trip_id)
   JOIN routelens_p05.contributors c ON c.namespace=t.namespace AND c.contributor_id=t.contributor_id
   LEFT JOIN LATERAL(SELECT min(e.at_event_utc) AS at_event_utc FROM routelens_p05.events e WHERE e.namespace=t.namespace AND e.contributor_id=t.contributor_id AND e.trip_id=t.trip_id AND e.code='SUCCEEDED') available ON true
   WHERE v.namespace=$1 AND v.graph_id=$2 AND v.source_class=$3 AND t.state='SUCCEEDED' AND c.active AND t.tombstone_expires_at>$7::timestamptz AND v.matching_policy=$6 AND t.matching_policy=$6 AND t.graph_id=v.graph_id AND v.exited_at_utc >=$4 AND v.exited_at_utc<$5 ORDER BY v.observation_id`,
          [
            n,
            this.config.store.graph_id,
            this.config.source_class,
            new Date(times.start).toISOString(),
            new Date(times.end).toISOString(),
            this.config.store.matching_policy,
            now,
          ],
        )
      ).rows.map((row) => {
        if (row.available_at_utc === null)
          throw new Error(
            "Invalid aggregation availability metadata / 집계 사용 가능 시각 정보가 올바르지 않습니다",
          );
        return {
          ...row,
          entered_at_utc: iso(row.entered_at_utc),
          exited_at_utc: iso(row.exited_at_utc),
          available_at_utc: iso(row.available_at_utc),
        };
      }) as AggregationContribution[];
      const result = aggregateWindow({
        namespace: n,
        graph_id: this.config.store.graph_id,
        source_class: this.config.source_class,
        window_start: windowStartUtc,
        now_utc: now,
        catalog: this.config.catalog,
        contributions: rows,
      });
      if (result.code === "RETENTION_EXPIRED") {
        await client.query(
          "DELETE FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 AND window_start=$5",
          [
            n,
            this.config.store.graph_id,
            AGGREGATION_POLICY,
            this.config.source_class,
            new Date(times.start).toISOString(),
          ],
        );
        return result;
      }
      if (result.code !== "FINALIZED") return result;
      const previous = (
        await client.query(
          "SELECT catalog_sha256 FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 AND window_start=$5 FOR UPDATE",
          [
            n,
            this.config.store.graph_id,
            AGGREGATION_POLICY,
            this.config.source_class,
            result.draft.window_start,
          ],
        )
      ).rows[0];
      if (previous && previous.catalog_sha256 !== result.catalog_sha256)
        throw new Error(
          "Invalid aggregation catalog identity / 집계 목록 식별자가 일치하지 않습니다",
        );
      const written = await client.query(
        `INSERT INTO routelens_p06.candidates(namespace,graph_id,aggregation_policy,source_class,window_start,window_end,canonical_json,canonical_sha256,input_sha256,catalog_sha256,finalized_at_utc) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
   ON CONFLICT(namespace,graph_id,aggregation_policy,source_class,window_start) DO UPDATE SET canonical_json=EXCLUDED.canonical_json,canonical_sha256=EXCLUDED.canonical_sha256,input_sha256=EXCLUDED.input_sha256,catalog_sha256=EXCLUDED.catalog_sha256,finalized_at_utc=EXCLUDED.finalized_at_utc
   WHERE candidates.catalog_sha256=EXCLUDED.catalog_sha256 RETURNING catalog_sha256`,
        [
          n,
          this.config.store.graph_id,
          AGGREGATION_POLICY,
          this.config.source_class,
          result.draft.window_start,
          result.draft.window_end,
          canonical(result.draft),
          result.canonical_sha256,
          result.input_sha256,
          result.catalog_sha256,
          now,
        ],
      );
      if (written.rowCount !== 1)
        throw new Error(
          "Invalid aggregation catalog identity / 집계 목록 식별자가 일치하지 않습니다",
        );
      await beforeCommit?.();
      return result;
    });
  }
  async inspect(): Promise<AggregationInspection> {
    return this.tx(async (client, now) => {
      const n = this.config.store.namespace;
      await client.query(
        "SELECT contributor_id FROM routelens_p05.contributors WHERE namespace=$1 ORDER BY contributor_id FOR SHARE",
        [n],
      );
      const rows = (
        await client.query(
          "SELECT * FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 ORDER BY window_start FOR UPDATE",
          [
            n,
            this.config.store.graph_id,
            AGGREGATION_POLICY,
            this.config.source_class,
          ],
        )
      ).rows;
      const candidates: AggregationCandidateRow[] = [];
      for (const row of rows) {
        const start = iso(row.window_start),
          times = windowTimes(start);
        if (utc(now) >= times.retentionUntil) {
          await client.query(
            "DELETE FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 AND window_start=$5",
            [n, row.graph_id, row.aggregation_policy, row.source_class, start],
          );
          continue;
        }
        const bytes = row.canonical_json as Buffer;
        if (
          sha256(bytes) !== row.canonical_sha256 ||
          row.catalog_sha256 !== sha256(canonical(this.config.catalog))
        )
          unavailable();
        let normalized = bytes;
        if (utc(now) >= times.validUntil) {
          const draft = JSON.parse(bytes.toString("utf8"));
          for (const entry of draft.entries) {
            if (entry.status === "LIVE") {
              entry.status = "STALE";
              entry.speed_mps = null;
              entry.sample_bucket = null;
            }
          }
          normalized = canonical(draft);
          if (!normalized.equals(bytes))
            await client.query(
              "UPDATE routelens_p06.candidates SET canonical_json=$6,canonical_sha256=$7 WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 AND window_start=$5",
              [
                n,
                row.graph_id,
                row.aggregation_policy,
                row.source_class,
                start,
                normalized,
                sha256(normalized),
              ],
            );
        }
        candidates.push({
          namespace: n,
          graph_id: String(row.graph_id),
          aggregation_policy: AGGREGATION_POLICY,
          source_class: "SYNTHETIC",
          window_start: start,
          window_end: iso(row.window_end),
          canonical_json: normalized.toString("utf8"),
          canonical_sha256: sha256(normalized),
          input_sha256: String(row.input_sha256),
          catalog_sha256: String(row.catalog_sha256),
          finalized_at_utc: iso(row.finalized_at_utc),
        });
      }
      return { candidates };
    });
  }
  async sweep(eventTimeUtc: string): Promise<{ deleted: number }> {
    await this.ingestion.advanceEventTime(eventTimeUtc);
    return this.tx(async (client, now) => {
      const n = this.config.store.namespace;
      await client.query(
        "SELECT contributor_id FROM routelens_p05.contributors WHERE namespace=$1 ORDER BY contributor_id FOR SHARE",
        [n],
      );
      const result = await client.query(
        "DELETE FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy=$3 AND source_class=$4 AND window_end+interval '24 hours'<=$5",
        [
          n,
          this.config.store.graph_id,
          AGGREGATION_POLICY,
          this.config.source_class,
          now,
        ],
      );
      return { deleted: result.rowCount ?? 0 };
    });
  }
  async close(): Promise<void> {
    await Promise.all([this.pool.end(), this.ingestion.close()]);
  }
}
