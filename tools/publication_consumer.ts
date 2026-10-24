import pg, { type PoolClient } from "pg";
import { identifier } from "./shared.js";
import { IngestionStore } from "./ingestion_store.js";
import { utc } from "./ingestion_validation.js";
import { normalizedCatalog } from "./traffic_aggregation.js";
import {
  verifyPublication,
  verifyManifest,
  validateRoots,
  reject,
  PublicationError,
  MANIFEST_LIMIT,
  ARTIFACT_LIMIT,
} from "./publication_crypto.js";
import type {
  ConsumerConfig,
  ConsumerResult,
  ConsumerStatus,
  VerifiedPublication,
} from "./publication_types.js";
const schema = `CREATE TABLE IF NOT EXISTS routelens_p07.consumer_states(namespace text NOT NULL,consumer_id text NOT NULL,publisher_id text NOT NULL,region_id text NOT NULL,high_water bigint NOT NULL DEFAULT 0,last_snapshot_id text,last_window_start timestamptz,artifact bytea,jws text,PRIMARY KEY(namespace,consumer_id,publisher_id,region_id));`;
const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();
export function validateOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    reject("INVALID_ORIGIN");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    reject("INVALID_ORIGIN");
  return url.origin;
}
export async function boundedFetch(
  url: string,
  limit: number,
  mediaType: string,
): Promise<Uint8Array> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 5000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status !== 200) reject(`HTTP_${response.status}`);
    if (
      response.headers.get("content-type")?.split(";")[0]?.trim() !== mediaType
    )
      reject("MEDIA_TYPE");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
      reject("OVERSIZE");
    if (!response.body) reject("TRUNCATED");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) reject("OVERSIZE");
      chunks.push(part.value);
    }
    if (length !== null && size !== Number(length)) reject("TRUNCATED");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("TRANSPORT_FAILED");
  } finally {
    clearTimeout(timer);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}
export class PublicationConsumer {
  private readonly pool: pg.Pool;
  private readonly clock: IngestionStore;
  readonly config: ConsumerConfig;
  constructor(config: ConsumerConfig) {
    identifier(config.consumer_id, "consumer_id");
    identifier(config.publisher_id, "publisher_id");
    if (
      config.region_id !== "seoul-pilot-corridors-v1" ||
      !Array.isArray(config.allowed_graph_ids) ||
      !config.allowed_graph_ids.length ||
      new Set(config.allowed_graph_ids).size !==
        config.allowed_graph_ids.length ||
      !Array.isArray(config.catalogs) ||
      config.catalogs.length !== config.allowed_graph_ids.length
    )
      reject("WRONG_SCOPE");
    validateRoots(config.trust_roots);
    for (const id of config.allowed_graph_ids)
      if (
        !/^[a-f0-9]{64}$/.test(id) ||
        config.catalogs.filter((value) => value.graph_id === id).length !== 1
      )
        reject("WRONG_SCOPE");
    this.config = {
      ...config,
      origin: validateOrigin(config.origin),
      catalogs: config.catalogs.map((value) => ({
        ...value,
        edges: normalizedCatalog(value.edges),
      })),
    };
    this.clock = new IngestionStore(config.store);
    this.pool = new pg.Pool({
      connectionString: config.store.database_url,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      lock_timeout: 5000,
      application_name: "routelens-p07-consumer",
    });
    this.pool.on("error", () => {});
  }
  private keys(): string[] {
    return [
      this.config.store.namespace,
      this.config.consumer_id,
      this.config.publisher_id,
      this.config.region_id,
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
      const result = (
        await this.pool.query(
          "SELECT to_regclass('routelens_p07.consumer_states') IS NOT NULL AS ready",
        )
      ).rows[0];
      if (
        !result?.ready ||
        !(
          await this.pool.query(
            "SELECT 1 FROM routelens_p05.namespace_clock WHERE namespace=$1",
            [this.config.store.namespace],
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
          [this.config.store.namespace],
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
  private async currentTime(): Promise<string> {
    const row = (
      await this.pool.query(
        "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1",
        [this.config.store.namespace],
      )
    ).rows[0];
    if (!row) reject("SCHEMA_NOT_INITIALIZED");
    return iso(row.event_time_utc);
  }
  async accept(
    jws: string,
    artifact: Uint8Array,
    eventTimeUtc: string,
    afterVerify?: () => Promise<void>,
  ): Promise<ConsumerResult> {
    try {
      const now = await this.clock.advanceEventTime(eventTimeUtc);
      await verifyPublication(jws, artifact, this.config, now);
      await afterVerify?.();
      return await this.tx(async (client, current) => {
        const verified = await verifyPublication(
            jws,
            artifact,
            this.config,
            current,
          ),
          manifest = verified.manifest;
        await client.query(
          "INSERT INTO routelens_p07.consumer_states(namespace,consumer_id,publisher_id,region_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          this.keys(),
        );
        const row = (
            await client.query(
              "SELECT * FROM routelens_p07.consumer_states WHERE namespace=$1 AND consumer_id=$2 AND publisher_id=$3 AND region_id=$4 FOR UPDATE",
              this.keys(),
            )
          ).rows[0],
          highWater = Number(row.high_water);
        if (!Number.isSafeInteger(highWater) || highWater < 0)
          reject("INVALID_SEQUENCE");
        if (manifest.sequence < highWater)
          return {
            code: "REJECTED",
            reason: "REPLAY",
            high_water: highWater,
            traffic_snapshot_id: null,
          };
        if (manifest.sequence === highWater) {
          if (row.last_snapshot_id !== manifest.traffic_snapshot_id)
            return {
              code: "REJECTED",
              reason: "SEQUENCE_CONFLICT",
              high_water: highWater,
              traffic_snapshot_id: null,
            };
          return {
            code: "DUPLICATE",
            high_water: highWater,
            traffic_snapshot_id: manifest.traffic_snapshot_id,
          };
        }
        if (
          row.last_window_start &&
          utc(manifest.window_start) < utc(iso(row.last_window_start))
        )
          return {
            code: "REJECTED",
            reason: "WINDOW_ROLLBACK",
            high_water: highWater,
            traffic_snapshot_id: null,
          };
        await client.query(
          "UPDATE routelens_p07.consumer_states SET high_water=$5,last_snapshot_id=$6,last_window_start=$7,artifact=$8,jws=$9 WHERE namespace=$1 AND consumer_id=$2 AND publisher_id=$3 AND region_id=$4",
          [
            ...this.keys(),
            manifest.sequence,
            manifest.traffic_snapshot_id,
            manifest.window_start,
            Buffer.from(artifact),
            jws,
          ],
        );
        return {
          code: "ACCEPTED",
          high_water: manifest.sequence,
          traffic_snapshot_id: manifest.traffic_snapshot_id,
        };
      });
    } catch (error) {
      const status = await this.status();
      return {
        code: "REJECTED",
        reason:
          error instanceof PublicationError ? error.code : "INVALID_METADATA",
        high_water: status.high_water,
        traffic_snapshot_id: null,
      };
    }
  }
  async pull(
    eventTimeUtc: string,
    afterVerify?: () => Promise<void>,
  ): Promise<ConsumerResult> {
    try {
      await this.clock.advanceEventTime(eventTimeUtc);
      const prefix = `${this.config.origin}/v1/simulations/${this.config.store.namespace}`,
        jwsBytes = await boundedFetch(
          `${prefix}/regions/${this.config.region_id}/current`,
          MANIFEST_LIMIT,
          "application/jose",
        );
      let jws: string;
      try {
        jws = new TextDecoder("utf-8", { fatal: true }).decode(jwsBytes);
      } catch {
        reject("INVALID_UTF8");
      }
      const { manifest } = await verifyManifest(
        jws,
        this.config,
        await this.currentTime(),
      );
      const artifact = await boundedFetch(
        `${prefix}/artifacts/${manifest.traffic_snapshot_id}`,
        ARTIFACT_LIMIT,
        "application/json",
      );
      return await this.accept(jws, artifact, eventTimeUtc, afterVerify);
    } catch (error) {
      const status = await this.status();
      return {
        code: "REJECTED",
        reason:
          error instanceof PublicationError ? error.code : "TRANSPORT_FAILED",
        high_water: status.high_water,
        traffic_snapshot_id: null,
      };
    }
  }
  async status(): Promise<ConsumerStatus> {
    return this.tx(async (client, now) => {
      const row = (
        await client.query(
          "SELECT * FROM routelens_p07.consumer_states WHERE namespace=$1 AND consumer_id=$2 AND publisher_id=$3 AND region_id=$4 FOR UPDATE",
          this.keys(),
        )
      ).rows[0];
      if (!row) return { high_water: 0, active: null };
      const highWater = Number(row.high_water);
      if (!Number.isSafeInteger(highWater) || highWater < 0)
        reject("INVALID_SEQUENCE");
      let active: VerifiedPublication | null = null;
      if (row.artifact && row.jws) {
        try {
          active = await verifyPublication(
            String(row.jws),
            Uint8Array.from(row.artifact),
            this.config,
            now,
          );
          if (
            active.manifest.sequence !== highWater ||
            active.manifest.traffic_snapshot_id !== row.last_snapshot_id
          )
            reject("STATE_CONFLICT");
        } catch {
          await client.query(
            "UPDATE routelens_p07.consumer_states SET artifact=NULL,jws=NULL WHERE namespace=$1 AND consumer_id=$2 AND publisher_id=$3 AND region_id=$4",
            this.keys(),
          );
          active = null;
        }
      }
      return { high_water: highWater, active };
    });
  }
  async close(): Promise<void> {
    await Promise.all([this.pool.end(), this.clock.close()]);
  }
}
