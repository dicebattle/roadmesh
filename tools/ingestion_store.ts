import pg, { type PoolClient } from "pg";
import { canonical, identifier } from "./shared.js";
import { validateEnvelope } from "./matching_evidence.js";
import type { Observation } from "./vehicle_simulator.js";
import {
  IngestionError,
  type StoreConfig,
  type Principal,
  type IngestBatch,
  type Acceptance,
  type Claim,
  type CompletionInput,
  type Completion,
  type FailureResult,
  type StoreInspection,
  type StoredTraversal,
  type SweepResult,
} from "./ingestion_types.js";
import {
  batchValid,
  batchRequestHash,
  completeValid,
  digest,
  issue,
  matchingId,
  principalValid,
  utc,
} from "./ingestion_validation.js";
const schema = `
CREATE SCHEMA IF NOT EXISTS routelens_p05;
CREATE TABLE IF NOT EXISTS routelens_p05.namespace_clock(namespace text PRIMARY KEY,event_time_utc timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS routelens_p05.contributors(namespace text NOT NULL,contributor_id text NOT NULL,vehicle_id text NOT NULL,consent_version text NOT NULL,active boolean NOT NULL DEFAULT true,PRIMARY KEY(namespace,contributor_id));
CREATE TABLE IF NOT EXISTS routelens_p05.trips(namespace text NOT NULL,contributor_id text NOT NULL,trip_id text NOT NULL,vehicle_id text NOT NULL,graph_id text NOT NULL,matching_policy text NOT NULL,consent_version text NOT NULL,source_class text NOT NULL,trip_start_utc timestamptz NOT NULL,state text NOT NULL DEFAULT 'WAITING',final_seq integer,fence bigint NOT NULL DEFAULT 0,owner_id text,lease_until timestamptz,attempt integer NOT NULL DEFAULT 0,first_received_at timestamptz NOT NULL,last_activity_at timestamptz NOT NULL,raw_expires_at timestamptz NOT NULL,tombstone_expires_at timestamptz NOT NULL,matching_digest text,matched_samples integer,excluded_samples integer,PRIMARY KEY(namespace,contributor_id,trip_id),FOREIGN KEY(namespace,contributor_id) REFERENCES routelens_p05.contributors ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS routelens_p05.batches(namespace text NOT NULL,contributor_id text NOT NULL,batch_id text NOT NULL,trip_id text NOT NULL,batch_seq integer NOT NULL,request_hash text NOT NULL,is_final boolean NOT NULL,received_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(namespace,contributor_id,batch_id),UNIQUE(namespace,contributor_id,trip_id,batch_seq),FOREIGN KEY(namespace,contributor_id,trip_id) REFERENCES routelens_p05.trips ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS routelens_p05.samples(namespace text NOT NULL,contributor_id text NOT NULL,trip_id text NOT NULL,sample_id text NOT NULL,offset_ms integer NOT NULL,value_hash text NOT NULL,observation jsonb,PRIMARY KEY(namespace,contributor_id,trip_id,sample_id),UNIQUE(namespace,contributor_id,trip_id,offset_ms),FOREIGN KEY(namespace,contributor_id,trip_id) REFERENCES routelens_p05.trips ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS routelens_p05.traversals(namespace text NOT NULL,observation_id text NOT NULL,contributor_id text NOT NULL,trip_id text NOT NULL,graph_id text NOT NULL,matching_policy text NOT NULL,traversal_id text NOT NULL,edge_id text NOT NULL,forward boolean NOT NULL,occurrence integer NOT NULL,entered_at_utc timestamptz NOT NULL,exited_at_utc timestamptz NOT NULL,distance_m double precision NOT NULL,duration_s double precision NOT NULL,source_class text NOT NULL,PRIMARY KEY(namespace,observation_id),FOREIGN KEY(namespace,contributor_id,trip_id) REFERENCES routelens_p05.trips ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS routelens_p05.events(namespace text NOT NULL,event_id bigserial NOT NULL,contributor_id text NOT NULL,trip_id text NOT NULL,code text NOT NULL,state text NOT NULL,fence bigint NOT NULL,attempt integer NOT NULL,at_event_utc timestamptz NOT NULL,at_database_utc timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(namespace,event_id),FOREIGN KEY(namespace,contributor_id,trip_id) REFERENCES routelens_p05.trips ON DELETE CASCADE);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='routelens_p05.trips'::regclass AND attname='trip_activity' AND NOT attisdropped) THEN
 ALTER TABLE routelens_p05.trips ADD COLUMN IF NOT EXISTS trip_activity text NOT NULL DEFAULT 'TRAVEL';
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS p05_ready ON routelens_p05.trips(namespace,state,lease_until);
`;
type Row = Record<string, unknown>;
const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();
export class IngestionStore {
  private readonly pool: pg.Pool;
  constructor(readonly config: StoreConfig) {
    identifier(config.namespace, "namespace");
    if (
      !/^[a-f0-9]{64}$/.test(config.graph_id) ||
      !["seoul-observed-v2", "seoul-observed-v3"].includes(
        config.matching_policy,
      )
    )
      throw new Error(
        "Invalid pinned store configuration / 고정 저장소 설정이 올바르지 않습니다",
      );
    this.pool = new pg.Pool({
      connectionString: config.database_url,
      max: 4,
      connectionTimeoutMillis: 5000,
      application_name: "routelens-p05",
    });
    this.pool.on("error", () => {});
  }
  private async tx<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool
      .connect()
      .catch(() =>
        issue(
          503,
          "STORE_UNAVAILABLE",
          "Store is unavailable.",
          "저장소를 사용할 수 없습니다.",
        ),
      );
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1 FOR SHARE",
        [this.config.namespace],
      );
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof IngestionError || error instanceof LeaseLost)
        throw error;
      return issue(
        503,
        "STORE_UNAVAILABLE",
        "Store transaction did not complete.",
        "저장소 처리가 완료되지 않았습니다.",
      );
    } finally {
      client.release();
    }
  }
  async initialize(principals: Principal[] = []): Promise<void> {
    await this.pool.query(schema);
    await this.pool.query(
      "INSERT INTO routelens_p05.namespace_clock(namespace,event_time_utc) VALUES($1,\'1970-01-01T00:00:00Z\') ON CONFLICT DO NOTHING",
      [this.config.namespace],
    );
    for (const principal of principals) {
      principalValid(principal);
      await this.tx(async (client) => {
        await client.query(
          "INSERT INTO routelens_p05.contributors(namespace,contributor_id,vehicle_id,consent_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [
            this.config.namespace,
            principal.contributor_id,
            principal.vehicle_id,
            principal.consent_version,
          ],
        );
        const row = await this.contributor(client, principal);
        if (
          row.vehicle_id !== principal.vehicle_id ||
          row.consent_version !== principal.consent_version
        )
          issue(
            409,
            "TRIP_CONFLICT",
            "Contributor registration conflicts.",
            "기여자 등록이 충돌합니다.",
          );
      });
    }
  }
  async advanceEventTime(eventTimeUtc: string): Promise<string> {
    utc(eventTimeUtc);
    try {
      await this.pool.query(
        "UPDATE routelens_p05.namespace_clock SET event_time_utc=$2 WHERE namespace=$1 AND event_time_utc<$2::timestamptz",
        [this.config.namespace, eventTimeUtc],
      );
      const row = (
        await this.pool.query(
          "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1",
          [this.config.namespace],
        )
      ).rows[0];
      if (!row)
        throw new Error(
          "Namespace clock is not initialized / 시험 영역 시계가 초기화되지 않았습니다",
        );
      return iso(row.event_time_utc);
    } catch {
      return issue(
        503,
        "STORE_UNAVAILABLE",
        "Trusted clock is unavailable.",
        "신뢰한 시계를 사용할 수 없습니다.",
      );
    }
  }
  private async timedTx<T>(
    requested: string,
    run: (client: PoolClient, effective: string) => Promise<T>,
  ): Promise<T> {
    await this.advanceEventTime(requested);
    return this.tx(async (client) => {
      const clock = (
        await client.query(
          "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1 FOR SHARE",
          [this.config.namespace],
        )
      ).rows[0];
      if (!clock)
        issue(
          503,
          "STORE_UNAVAILABLE",
          "Trusted clock is unavailable.",
          "신뢰한 시계를 사용할 수 없습니다.",
        );
      return run(client, iso(clock.event_time_utc));
    });
  }
  private async contributor(
    client: PoolClient,
    principal: Principal,
  ): Promise<Row> {
    const row = (
      await client.query(
        "SELECT * FROM routelens_p05.contributors WHERE namespace=$1 AND contributor_id=$2 FOR UPDATE",
        [this.config.namespace, principal.contributor_id],
      )
    ).rows[0] as Row | undefined;
    if (!row || row.vehicle_id !== principal.vehicle_id)
      issue(
        401,
        "UNAUTHORIZED",
        "Contributor is not authorized.",
        "기여자 권한이 없습니다.",
      );
    return row;
  }
  private async event(
    client: PoolClient,
    row: Row,
    code: string,
    time: string,
  ): Promise<void> {
    await client.query(
      "INSERT INTO routelens_p05.events(namespace,contributor_id,trip_id,code,state,fence,attempt,at_event_utc) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        this.config.namespace,
        row.contributor_id,
        row.trip_id,
        code,
        row.state,
        row.fence,
        row.attempt,
        time,
      ],
    );
    await client.query(
      "DELETE FROM routelens_p05.events WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 AND event_id IN (SELECT event_id FROM routelens_p05.events WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 ORDER BY event_id DESC OFFSET 64)",
      [this.config.namespace, row.contributor_id, row.trip_id],
    );
  }
  async accept(
    principal: Principal,
    value: IngestBatch,
    eventTimeUtc: string,
  ): Promise<Acceptance> {
    let now = utc(eventTimeUtc),
      batch = batchValid(value, principal, this.config),
      hash = batchRequestHash(batch),
      n = this.config.namespace;
    return this.timedTx(eventTimeUtc, async (client, effectiveTime) => {
      eventTimeUtc = effectiveTime;
      now = utc(effectiveTime);
      const contributor = await this.contributor(client, principal);
      if (!contributor.active)
        issue(
          403,
          "CONSENT_REVOKED",
          "Consent was revoked.",
          "동의가 철회되었습니다.",
        );
      if (contributor.consent_version !== batch.consent_version)
        issue(
          409,
          "VERSION_MISMATCH",
          "Current consent differs.",
          "현재 동의 버전이 다릅니다.",
        );
      let trip = (
        await client.query(
          "SELECT * FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 FOR UPDATE",
          [n, principal.contributor_id, batch.trip_id],
        )
      ).rows[0] as Row | undefined;
      const replay = (
        await client.query(
          "SELECT * FROM routelens_p05.batches WHERE namespace=$1 AND contributor_id=$2 AND batch_id=$3",
          [n, principal.contributor_id, batch.batch_id],
        )
      ).rows[0] as Row | undefined;
      if (replay) {
        if (replay.request_hash !== hash || replay.trip_id !== batch.trip_id)
          issue(
            409,
            "BATCH_CONFLICT",
            "Batch content conflicts.",
            "배치 내용이 충돌합니다.",
          );
        if (now >= utc(iso(replay.expires_at)) || !trip)
          issue(
            410,
            "TRIP_EXPIRED",
            "Replay retention expired.",
            "재시도 보관 기간이 만료되었습니다.",
          );
        if (
          !["SUCCEEDED", "FAILED"].includes(String(trip.state)) &&
          (now >= utc(iso(trip.raw_expires_at)) || trip.state === "EXPIRED")
        )
          issue(
            410,
            "TRIP_EXPIRED",
            "Trip context expired.",
            "여행 문맥이 만료되었습니다.",
          );
        return this.acceptance(client, trip, "DUPLICATE");
      }
      if (trip) {
        if (
          trip.graph_id !== batch.graph_id ||
          trip.matching_policy !== batch.matching_policy ||
          trip.consent_version !== batch.consent_version ||
          trip.vehicle_id !== principal.vehicle_id ||
          trip.source_class !== batch.source_class ||
          trip.trip_activity !== batch.trip_activity ||
          iso(trip.trip_start_utc) !==
            new Date(batch.trip_start_utc).toISOString()
        )
          issue(
            409,
            "TRIP_CONFLICT",
            "Immutable trip metadata conflicts.",
            "여행의 고정 정보가 충돌합니다.",
          );
        if (
          now >= utc(iso(trip.raw_expires_at)) ||
          now >= utc(iso(trip.tombstone_expires_at)) ||
          trip.state === "EXPIRED"
        )
          issue(
            410,
            "TRIP_EXPIRED",
            "Trip context expired.",
            "여행 문맥이 만료되었습니다.",
          );
        if (trip.state !== "WAITING")
          issue(
            409,
            "TRIP_CONFLICT",
            "Trip has already finalized.",
            "여행이 이미 종료되었습니다.",
          );
      } else {
        if (now >= utc(batch.trip_start_utc) + 3600000)
          issue(
            410,
            "TRIP_EXPIRED",
            "Trip absolute lifetime expired.",
            "여행의 절대 보관 기간이 만료되었습니다.",
          );
        const active = Number(
          (
            await client.query(
              "SELECT count(*) FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 AND state IN ('WAITING','READY','LEASED') AND raw_expires_at>$3",
              [n, principal.contributor_id, eventTimeUtc],
            )
          ).rows[0].count,
        );
        if (active >= 20)
          issue(
            429,
            "CAPACITY_EXCEEDED",
            "Active trip capacity reached.",
            "활성 여행 한도에 도달했습니다.",
          );
        await client.query(
          "INSERT INTO routelens_p05.trips(namespace,contributor_id,trip_id,vehicle_id,graph_id,matching_policy,consent_version,source_class,trip_start_utc,trip_activity,first_received_at,last_activity_at,raw_expires_at,tombstone_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$11,$10,$10,LEAST($10::timestamptz+interval '10 minutes',$9::timestamptz+interval '1 hour'),$10::timestamptz+interval '24 hours')",
          [
            n,
            principal.contributor_id,
            batch.trip_id,
            principal.vehicle_id,
            batch.graph_id,
            batch.matching_policy,
            batch.consent_version,
            batch.source_class,
            batch.trip_start_utc,
            eventTimeUtc,
            batch.trip_activity,
          ],
        );
        trip = (
          await client.query(
            "SELECT * FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 FOR UPDATE",
            [n, principal.contributor_id, batch.trip_id],
          )
        ).rows[0] as Row;
      }
      const previous = (
        await client.query(
          "SELECT batch_seq FROM routelens_p05.batches WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3",
          [n, principal.contributor_id, batch.trip_id],
        )
      ).rows as { batch_seq: number }[];
      if (previous.some((row) => row.batch_seq === batch.batch_seq))
        issue(
          409,
          "BATCH_CONFLICT",
          "Batch sequence is already used.",
          "배치 순서가 이미 사용되었습니다.",
        );
      if (
        (trip.final_seq !== null && batch.batch_seq > Number(trip.final_seq)) ||
        (batch.is_final &&
          trip.final_seq !== null &&
          batch.batch_seq !== Number(trip.final_seq)) ||
        (batch.is_final &&
          previous.some((row) => row.batch_seq > batch.batch_seq))
      )
        issue(
          409,
          "TRIP_CONFLICT",
          "Final sequence conflicts.",
          "마지막 순서가 충돌합니다.",
        );
      const samples = (
        await client.query(
          "SELECT sample_id,offset_ms,value_hash FROM routelens_p05.samples WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3",
          [n, principal.contributor_id, batch.trip_id],
        )
      ).rows as { sample_id: string; offset_ms: number; value_hash: string }[];
      const known = new Map(samples.map((row) => [row.sample_id, row]));
      let novel = 0;
      for (const sample of batch.samples) {
        const existing = known.get(sample.sample_id);
        if (existing) {
          if (existing.value_hash !== digest(sample))
            issue(
              409,
              "TRIP_CONFLICT",
              "Overlapping sample content conflicts.",
              "중첩 표본 내용이 충돌합니다.",
            );
          continue;
        }
        if (samples.some((row) => row.offset_ms === sample.offset_ms))
          issue(
            409,
            "TRIP_CONFLICT",
            "Sample timestamp is already used.",
            "표본 시각이 이미 사용되었습니다.",
          );
        const age = now - utc(sample.event_time_utc);
        if (age > 120000 || age <= -30000)
          issue(
            422,
            "OBSERVATION_TIME_INVALID",
            "New observation is too old or too far in the future.",
            "신규 관측이 너무 오래되었거나 미래 시각입니다.",
          );
        novel++;
      }
      if (samples.length + novel > 3001 || previous.length >= 128)
        issue(
          429,
          "CAPACITY_EXCEEDED",
          "Trip input capacity reached.",
          "여행 입력 한도에 도달했습니다.",
        );
      for (const sample of batch.samples)
        await client.query(
          "INSERT INTO routelens_p05.samples(namespace,contributor_id,trip_id,sample_id,offset_ms,value_hash,observation) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
          [
            n,
            principal.contributor_id,
            batch.trip_id,
            sample.sample_id,
            sample.offset_ms,
            digest(sample),
            JSON.stringify(sample),
          ],
        );
      await client.query(
        "INSERT INTO routelens_p05.batches(namespace,contributor_id,batch_id,trip_id,batch_seq,request_hash,is_final,received_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          n,
          principal.contributor_id,
          batch.batch_id,
          batch.trip_id,
          batch.batch_seq,
          hash,
          batch.is_final,
          eventTimeUtc,
          trip.tombstone_expires_at,
        ],
      );
      const final = batch.is_final ? batch.batch_seq : trip.final_seq;
      let state = "WAITING";
      if (
        final !== null &&
        Array.from({ length: Number(final) + 1 }, (_, index) => index).every(
          (index) =>
            index === batch.batch_seq ||
            previous.some((row) => row.batch_seq === index),
        )
      ) {
        const merged = (
          await client.query(
            "SELECT observation FROM routelens_p05.samples WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 ORDER BY offset_ms",
            [n, principal.contributor_id, batch.trip_id],
          )
        ).rows.map((row) => row.observation) as Observation[];
        try {
          validateEnvelope(
            {
              schema_version: "0.1",
              matching_id: matchingId(
                n,
                principal.contributor_id,
                batch.trip_id,
              ),
              graph_id: batch.graph_id,
              observations: merged,
            },
            {
              graphId: batch.graph_id,
              edges: [],
              fixture: { fixture_id: "seoul-osm-20261023-v1" },
            },
          );
        } catch {
          issue(
            409,
            "TRIP_CONFLICT",
            "Merged observations do not form a valid bounded trip.",
            "합친 관측이 유효한 제한 여행을 이루지 않습니다.",
          );
        }
        state = "READY";
      }
      trip = (
        await client.query(
          "UPDATE routelens_p05.trips SET final_seq=$4,state=$5,last_activity_at=$6,raw_expires_at=LEAST($6::timestamptz+interval '10 minutes',trip_start_utc+interval '1 hour',tombstone_expires_at) WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
          [
            n,
            principal.contributor_id,
            batch.trip_id,
            final,
            state,
            eventTimeUtc,
          ],
        )
      ).rows[0] as Row;
      await this.event(client, trip, "ACCEPTED", eventTimeUtc);
      return this.acceptance(client, trip, "ACCEPTED");
    });
  }
  private async acceptance(
    client: PoolClient,
    trip: Row,
    code: Acceptance["code"],
  ): Promise<Acceptance> {
    const counts = (
      await client.query(
        "SELECT (SELECT count(*) FROM routelens_p05.samples WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3) AS sample_count,(SELECT count(*) FROM routelens_p05.batches WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3) AS batch_count",
        [this.config.namespace, trip.contributor_id, trip.trip_id],
      )
    ).rows[0];
    return {
      code,
      trip_id: String(trip.trip_id),
      state: trip.state as Acceptance["state"],
      sample_count: Number(counts.sample_count),
      batch_count: Number(counts.batch_count),
    };
  }
  private keys(row: Row): unknown[] {
    return [this.config.namespace, row.contributor_id, row.trip_id];
  }
  private async purge(client: PoolClient, row: Row): Promise<void> {
    await client.query(
      "UPDATE routelens_p05.samples SET observation=NULL WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3",
      this.keys(row),
    );
  }
  async claim(
    ownerId: string,
    eventTimeUtc: string,
    leaseMs = 120000,
  ): Promise<Claim | null> {
    identifier(ownerId, "owner_id");
    utc(eventTimeUtc);
    if (!Number.isInteger(leaseMs) || leaseMs < 100 || leaseMs > 120000)
      issue(
        422,
        "INVALID_INPUT",
        "Lease duration is invalid.",
        "임대 시간이 올바르지 않습니다.",
      );
    for (;;) {
      const result = await this.timedTx<Claim | null | "CLEANED">(
        eventTimeUtc,
        async (client, effectiveTime) => {
          eventTimeUtc = effectiveTime;
          const contributor = (
            await client.query(
              "SELECT c.* FROM routelens_p05.contributors c WHERE c.namespace=$1 AND c.active AND EXISTS(SELECT 1 FROM routelens_p05.trips t WHERE t.namespace=c.namespace AND t.contributor_id=c.contributor_id AND t.graph_id=$2 AND t.matching_policy=$3 AND (t.state='READY' OR (t.state='LEASED' AND t.lease_until<=clock_timestamp()))) ORDER BY c.contributor_id FOR UPDATE SKIP LOCKED LIMIT 1",
              [
                this.config.namespace,
                this.config.graph_id,
                this.config.matching_policy,
              ],
            )
          ).rows[0] as Row | undefined;
          if (!contributor) return null;
          const trip = (
            await client.query(
              "SELECT * FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 AND graph_id=$3 AND matching_policy=$4 AND (state='READY' OR (state='LEASED' AND lease_until<=clock_timestamp())) ORDER BY first_received_at,trip_id FOR UPDATE SKIP LOCKED LIMIT 1",
              [
                this.config.namespace,
                contributor.contributor_id,
                this.config.graph_id,
                this.config.matching_policy,
              ],
            )
          ).rows[0] as Row | undefined;
          if (!trip) return null;
          if (
            utc(eventTimeUtc) >= utc(iso(trip.raw_expires_at)) ||
            Number(trip.attempt) >= 3
          ) {
            const state = Number(trip.attempt) >= 3 ? "FAILED" : "EXPIRED";
            const ended = (
              await client.query(
                "UPDATE routelens_p05.trips SET state=$4,fence=fence+1,owner_id=NULL,lease_until=NULL WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
                [...this.keys(trip), state],
              )
            ).rows[0] as Row;
            await this.purge(client, trip);
            await this.event(client, ended, state, eventTimeUtc);
            return "CLEANED";
          }
          const claimed = (
            await client.query(
              "UPDATE routelens_p05.trips SET state='LEASED',fence=fence+1,attempt=attempt+1,owner_id=$4,lease_until=clock_timestamp()+($5::double precision*interval '1 millisecond') WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
              [...this.keys(trip), ownerId, leaseMs],
            )
          ).rows[0] as Row;
          const observations = (
            await client.query(
              "SELECT observation FROM routelens_p05.samples WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 ORDER BY offset_ms",
              this.keys(trip),
            )
          ).rows.map((row) => row.observation) as Observation[];
          if (observations.some((value) => value === null))
            issue(
              410,
              "TRIP_EXPIRED",
              "Trip observations expired.",
              "여행 관측이 만료되었습니다.",
            );
          await this.event(client, claimed, "LEASED", eventTimeUtc);
          return {
            namespace: this.config.namespace,
            contributor_id: String(trip.contributor_id),
            trip_id: String(trip.trip_id),
            vehicle_id: String(trip.vehicle_id),
            graph_id: String(trip.graph_id),
            matching_policy: this.config.matching_policy,
            trip_start_utc: iso(trip.trip_start_utc),
            matching_id: matchingId(
              this.config.namespace,
              String(trip.contributor_id),
              String(trip.trip_id),
            ),
            owner_id: ownerId,
            fence: String(claimed.fence),
            attempt: Number(claimed.attempt),
            lease_until_utc: iso(claimed.lease_until),
            observations,
          };
        },
      );
      if (result !== "CLEANED") return result;
    }
  }
  private async owned(
    client: PoolClient,
    claim: Claim,
    time: string,
  ): Promise<Row | null> {
    if (
      claim.namespace !== this.config.namespace ||
      claim.graph_id !== this.config.graph_id ||
      claim.matching_policy !== this.config.matching_policy
    )
      return null;
    const contributor = (
      await client.query(
        "SELECT * FROM routelens_p05.contributors WHERE namespace=$1 AND contributor_id=$2 FOR UPDATE",
        [this.config.namespace, claim.contributor_id],
      )
    ).rows[0] as Row | undefined;
    const trip = (
      await client.query(
        "SELECT *,lease_until>clock_timestamp() AS lease_valid FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 FOR UPDATE",
        [this.config.namespace, claim.contributor_id, claim.trip_id],
      )
    ).rows[0] as Row | undefined;
    return contributor?.active &&
      contributor.consent_version === "pilot-consent-v1" &&
      contributor.vehicle_id === claim.vehicle_id &&
      trip?.state === "LEASED" &&
      trip.graph_id === claim.graph_id &&
      trip.matching_policy === claim.matching_policy &&
      trip.owner_id === claim.owner_id &&
      String(trip.fence) === claim.fence &&
      trip.lease_valid &&
      utc(time) < utc(iso(trip.raw_expires_at)) &&
      utc(time) < utc(iso(trip.tombstone_expires_at))
      ? trip
      : null;
  }
  async complete(
    claim: Claim,
    input: CompletionInput,
    eventTimeUtc: string,
    beforeCommit?: () => Promise<void>,
  ): Promise<Completion> {
    utc(eventTimeUtc);
    completeValid(input);
    if (
      input.matched_samples + input.excluded_samples !==
      claim.observations.length
    )
      issue(
        422,
        "INVALID_INPUT",
        "Matching summary count differs from claimed observations.",
        "매칭 요약 수와 확보한 관측 수가 다릅니다.",
      );
    try {
      return await this.timedTx(eventTimeUtc, async (client, effectiveTime) => {
        eventTimeUtc = effectiveTime;
        const trip = await this.owned(client, claim, eventTimeUtc);
        if (!trip) return { code: "LEASE_LOST", stored_count: 0 };
        for (const value of input.accepted) {
          const observationId = digest([
            this.config.namespace,
            claim.contributor_id,
            claim.trip_id,
            value.traversal_id,
          ]);
          const expected = {
            observation_id: observationId,
            contributor_id: claim.contributor_id,
            trip_id: claim.trip_id,
            graph_id: claim.graph_id,
            matching_policy: claim.matching_policy,
            ...value,
          };
          await client.query(
            "INSERT INTO routelens_p05.traversals(namespace,observation_id,contributor_id,trip_id,graph_id,matching_policy,traversal_id,edge_id,forward,occurrence,entered_at_utc,exited_at_utc,distance_m,duration_s,source_class) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING",
            [
              this.config.namespace,
              observationId,
              claim.contributor_id,
              claim.trip_id,
              claim.graph_id,
              claim.matching_policy,
              value.traversal_id,
              value.edge_id,
              value.forward,
              value.occurrence,
              value.entered_at_utc,
              value.exited_at_utc,
              value.distance_m,
              value.duration_s,
              value.source_class,
            ],
          );
          const stored = (
            await client.query(
              "SELECT * FROM routelens_p05.traversals WHERE namespace=$1 AND observation_id=$2",
              [this.config.namespace, observationId],
            )
          ).rows[0] as Row;
          const actual = { ...stored };
          delete actual.namespace;
          actual.entered_at_utc = iso(actual.entered_at_utc);
          actual.exited_at_utc = iso(actual.exited_at_utc);
          const normalized = {
            ...expected,
            entered_at_utc: iso(expected.entered_at_utc),
            exited_at_utc: iso(expected.exited_at_utc),
          };
          if (!canonical(actual).equals(canonical(normalized)))
            issue(
              409,
              "TRIP_CONFLICT",
              "Stored traversal identity conflicts.",
              "저장된 통과 식별자가 충돌합니다.",
            );
        }
        await beforeCommit?.();
        if (!(await this.owned(client, claim, eventTimeUtc)))
          throw new LeaseLost();
        const done = (
          await client.query(
            "UPDATE routelens_p05.trips SET state='SUCCEEDED',owner_id=NULL,lease_until=NULL,matching_digest=$4,matched_samples=$5,excluded_samples=$6 WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
            [
              ...this.keys(trip),
              input.semantic_sha256,
              input.matched_samples,
              input.excluded_samples,
            ],
          )
        ).rows[0] as Row;
        await this.purge(client, trip);
        await this.event(client, done, "SUCCEEDED", eventTimeUtc);
        if (
          !(
            await client.query(
              "SELECT clock_timestamp()<$1::timestamptz AS valid",
              [trip.lease_until],
            )
          ).rows[0].valid
        )
          throw new LeaseLost();
        return { code: "SUCCEEDED", stored_count: input.accepted.length };
      });
    } catch (error) {
      if (error instanceof LeaseLost)
        return { code: "LEASE_LOST", stored_count: 0 };
      throw error;
    }
  }
  async fail(
    claim: Claim,
    errorCode: string,
    eventTimeUtc: string,
  ): Promise<FailureResult> {
    utc(eventTimeUtc);
    if (!/^[A-Z_]{1,64}$/.test(errorCode))
      issue(
        422,
        "INVALID_INPUT",
        "Failure code is invalid.",
        "실패 코드가 올바르지 않습니다.",
      );
    return this.timedTx(eventTimeUtc, async (client, effectiveTime) => {
      eventTimeUtc = effectiveTime;
      const trip = await this.owned(client, claim, eventTimeUtc);
      if (!trip) return { code: "LEASE_LOST", attempt: claim.attempt };
      const terminal = Number(trip.attempt) >= 3;
      const ended = (
        await client.query(
          "UPDATE routelens_p05.trips SET state=$4,fence=fence+1,owner_id=NULL,lease_until=NULL WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
          [...this.keys(trip), terminal ? "FAILED" : "READY"],
        )
      ).rows[0] as Row;
      if (terminal) await this.purge(client, trip);
      await this.event(client, ended, errorCode, eventTimeUtc);
      return {
        code: terminal ? "FAILED" : "RETRY",
        attempt: Number(trip.attempt),
      };
    });
  }
  async sweep(eventTimeUtc: string): Promise<SweepResult> {
    let now = utc(eventTimeUtc);
    return this.timedTx(eventTimeUtc, async (client, effectiveTime) => {
      eventTimeUtc = effectiveTime;
      now = utc(effectiveTime);
      let expired = 0,
        deleted = 0;
      const contributors = (
        await client.query(
          "SELECT * FROM routelens_p05.contributors WHERE namespace=$1 ORDER BY contributor_id FOR UPDATE",
          [this.config.namespace],
        )
      ).rows;
      for (const contributor of contributors) {
        const trips = (
          await client.query(
            "SELECT *,lease_until<=clock_timestamp() AS lease_expired FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 ORDER BY trip_id FOR UPDATE",
            [this.config.namespace, contributor.contributor_id],
          )
        ).rows as Row[];
        for (const trip of trips) {
          if (now >= utc(iso(trip.tombstone_expires_at))) {
            await client.query(
              "DELETE FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3",
              this.keys(trip),
            );
            deleted++;
            continue;
          }
          const active = ["WAITING", "READY", "LEASED"].includes(
            String(trip.state),
          );
          const exhausted =
            trip.state === "LEASED" &&
            trip.lease_expired &&
            Number(trip.attempt) >= 3;
          if (active && (now >= utc(iso(trip.raw_expires_at)) || exhausted)) {
            const ended = (
              await client.query(
                "UPDATE routelens_p05.trips SET state=$4,fence=fence+1,owner_id=NULL,lease_until=NULL WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
                [...this.keys(trip), exhausted ? "FAILED" : "EXPIRED"],
              )
            ).rows[0] as Row;
            await this.purge(client, trip);
            await this.event(client, ended, String(ended.state), eventTimeUtc);
            expired++;
          }
        }
      }
      return { expired, deleted };
    });
  }
  async revoke(principal: Principal, eventTimeUtc: string): Promise<void> {
    utc(eventTimeUtc);
    principalValid(principal);
    await this.timedTx(eventTimeUtc, async (client, effectiveTime) => {
      eventTimeUtc = effectiveTime;
      await this.contributor(client, principal);
      await client.query(
        "UPDATE routelens_p05.contributors SET active=false WHERE namespace=$1 AND contributor_id=$2",
        [this.config.namespace, principal.contributor_id],
      );
      const trips = (
        await client.query(
          "SELECT * FROM routelens_p05.trips WHERE namespace=$1 AND contributor_id=$2 ORDER BY trip_id FOR UPDATE",
          [this.config.namespace, principal.contributor_id],
        )
      ).rows as Row[];
      for (const trip of trips) {
        if (trip.state === "REVOKED") continue;
        const ended = (
          await client.query(
            "UPDATE routelens_p05.trips SET state='REVOKED',fence=fence+1,owner_id=NULL,lease_until=NULL WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 RETURNING *",
            this.keys(trip),
          )
        ).rows[0] as Row;
        await this.purge(client, trip);
        await client.query(
          "DELETE FROM routelens_p05.traversals WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3",
          this.keys(trip),
        );
        await this.event(client, ended, "REVOKED", eventTimeUtc);
      }
    });
  }
  async inspect(
    principal?: Principal,
    tripId?: string,
  ): Promise<StoreInspection> {
    return this.tx(async (client) => {
      const n = this.config.namespace,
        params: unknown[] = [n];
      let where = "namespace=$1";
      if (principal) {
        principalValid(principal);
        where += " AND contributor_id=$2";
        params.push(principal.contributor_id);
      }
      if (tripId) {
        identifier(tripId, "trip_id");
        where += ` AND trip_id=$${params.length + 1}`;
        params.push(tripId);
      }
      const rows = (
        await client.query(
          `SELECT * FROM routelens_p05.trips WHERE ${where} ORDER BY contributor_id,trip_id`,
          params,
        )
      ).rows as Row[];
      const trips: StoreInspection["trips"] = [];
      for (const row of rows) {
        const counts = (
          await client.query(
            "SELECT (SELECT count(*) FROM routelens_p05.samples WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3) sample_count,(SELECT count(*) FROM routelens_p05.samples WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3 AND observation IS NOT NULL) raw_payload_count,(SELECT count(*) FROM routelens_p05.batches WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3) batch_count,(SELECT count(*) FROM routelens_p05.traversals WHERE namespace=$1 AND contributor_id=$2 AND trip_id=$3) traversal_count",
            this.keys(row),
          )
        ).rows[0];
        trips.push({
          contributor_id: String(row.contributor_id),
          trip_id: String(row.trip_id),
          vehicle_id: String(row.vehicle_id),
          state: row.state as StoreInspection["trips"][number]["state"],
          fence: String(row.fence),
          owner_id: row.owner_id as string | null,
          attempt: Number(row.attempt),
          final_seq: row.final_seq as number | null,
          first_received_at: iso(row.first_received_at),
          last_activity_at: iso(row.last_activity_at),
          raw_expires_at: iso(row.raw_expires_at),
          tombstone_expires_at: iso(row.tombstone_expires_at),
          lease_until_utc: row.lease_until ? iso(row.lease_until) : null,
          sample_count: Number(counts.sample_count),
          batch_count: Number(counts.batch_count),
          raw_payload_count: Number(counts.raw_payload_count),
          traversal_count: Number(counts.traversal_count),
          matching_digest: row.matching_digest as string | null,
        });
      }
      const traversals = (
        await client.query(
          `SELECT * FROM routelens_p05.traversals WHERE ${where} ORDER BY observation_id`,
          params,
        )
      ).rows.map((row) => ({
        ...row,
        entered_at_utc: iso(row.entered_at_utc),
        exited_at_utc: iso(row.exited_at_utc),
      })) as StoredTraversal[];
      const counts = {} as StoreInspection["counts"];
      for (const table of [
        "contributors",
        "trips",
        "batches",
        "samples",
        "traversals",
        "events",
      ] as const)
        counts[table] = Number(
          (
            await client.query(
              `SELECT count(*) FROM routelens_p05.${table} WHERE namespace=$1`,
              [n],
            )
          ).rows[0].count,
        );
      counts.raw_payloads = Number(
        (
          await client.query(
            "SELECT count(*) FROM routelens_p05.samples WHERE namespace=$1 AND observation IS NOT NULL",
            [n],
          )
        ).rows[0].count,
      );
      return { counts, trips, traversals };
    });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
class LeaseLost extends Error {}
