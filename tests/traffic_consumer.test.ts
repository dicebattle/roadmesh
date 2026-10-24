import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK } from "jose";
import { PublicationConsumer } from "../tools/publication_consumer.js";
import type { ConsumerConfig } from "../tools/publication_types.js";
test("Accepted inspection binds event time and state to one transaction while status keeps its old shape / 수용 조회는 같은 트랜잭션의 시각·상태를 반환하고 기존 상태 형식 유지", async () => {
  const { publicKey } = await generateKeyPair("EdDSA", { extractable: true }),
    graph = "a".repeat(64),
    time = "2026-10-25T00:04:00.000Z";
  const config: ConsumerConfig = {
    store: {
      database_url: "postgresql://unused",
      namespace: "pilot",
      graph_id: graph,
      matching_policy: "seoul-observed-v3",
    },
    consumer_id: "consumer",
    publisher_id: "publisher",
    region_id: "seoul-pilot-corridors-v1",
    allowed_graph_ids: [graph],
    catalogs: [
      {
        graph_id: graph,
        edges: [{ edge_id: "10", forward: true, distance_m: 75 }],
      },
    ],
    origin: "http://127.0.0.1:1",
    trust_roots: [
      {
        kid: "key",
        public_jwk: await exportJWK(publicKey),
        publisher_id: "publisher",
        simulation_namespace: "pilot",
        region_id: "seoul-pilot-corridors-v1",
        allowed_graph_ids: [graph],
        source_class: "SYNTHETIC",
        valid_from: "2026-10-25T00:00:00.000Z",
        valid_until: "2026-10-26T00:00:00.000Z",
        revoked: false,
      },
    ],
  };
  const consumer = new PublicationConsumer(config),
    sql: string[] = [];
  let releases = 0;
  const query = async (text: string) => {
    sql.push(text);
    if (text.startsWith("SELECT event_time_utc"))
      return { rows: [{ event_time_utc: time }] };
    if (text.startsWith("SELECT * FROM routelens_p07.consumer_states"))
      return { rows: [{ high_water: "3", artifact: null, jws: null }] };
    return { rows: [] };
  };
  // No production injection API: this isolated test replaces the private lazy pool.
  // 생산 주입 API 없이 격리 검사에서만 비공개 지연 연결 풀을 대체합니다.
  (
    consumer as unknown as {
      pool: unknown;
    }
  ).pool = {
    connect: async () => ({
      query,
      release: () => {
        releases++;
      },
    }),
    query: () => {
      throw Error("Outside-transaction query / 트랜잭션 밖 조회");
    },
    end: async () => {},
  };
  try {
    assert.deepEqual(await consumer.inspectAccepted(), {
      high_water: 3,
      active: null,
      checked_at_event_time: time,
    });
    assert.equal(sql[0], "BEGIN");
    assert.match(sql[1]!, /namespace_clock.*FOR SHARE/);
    assert.match(sql[2]!, /consumer_states.*FOR UPDATE/);
    assert.equal(sql[3], "COMMIT");
    assert.equal(releases, 1);
    assert.deepEqual(await consumer.status(), { high_water: 3, active: null });
    assert.equal(releases, 2);
  } finally {
    await consumer.close();
  }
});
