import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";
import { generateKeyPair, exportJWK, CompactSign, importJWK } from "jose";
import { canonical, sha256 } from "../tools/shared.js";
import {
  signManifest,
  verifyPublication,
  verifyManifest,
  validateRoots,
  MANIFEST_LIMIT,
  ARTIFACT_LIMIT,
} from "../tools/publication_crypto.js";
import { boundedFetch, validateOrigin } from "../tools/publication_consumer.js";
import { startPublicationService } from "../tools/publication_service.js";
import type {
  ConsumerConfig,
  TrafficSnapshot,
  TrafficManifest,
  PublicationRecord,
  TrustRoot,
  PublicationStoreConfig,
} from "../tools/publication_types.js";
const graph = "a".repeat(64),
  start = Date.parse("2026-10-24T00:00:00Z"),
  time = (ms: number) => new Date(start + ms).toISOString();
const pair = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  }),
  privateJwk = await exportJWK(pair.privateKey),
  publicJwk = await exportJWK(pair.publicKey);
const root: TrustRoot = {
  kid: "key-one",
  public_jwk: publicJwk,
  publisher_id: "publisher",
  simulation_namespace: "pilot",
  region_id: "seoul-pilot-corridors-v1",
  allowed_graph_ids: [graph],
  source_class: "SYNTHETIC",
  valid_from: time(0),
  valid_until: time(1000000),
  revoked: false,
};
const config = (): ConsumerConfig => ({
  store: {
    database_url: "private",
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
      edges: [{ edge_id: "123", forward: true, distance_m: 100 }],
    },
  ],
  trust_roots: [structuredClone(root)],
  origin: "http://127.0.0.1:1",
});
const snapshot = (): TrafficSnapshot => ({
  schema_version: "0.1",
  graph_id: graph,
  region_id: "seoul-pilot-corridors-v1",
  aggregation_policy: "seoul-window-median-v1",
  window_start: time(0),
  window_end: time(60000),
  valid_until: time(240000),
  entries: [
    {
      edge_id: "123",
      forward: true,
      source_class: "SYNTHETIC",
      status: "LIVE",
      speed_mps: 10,
      sample_bucket: "5-9",
    },
  ],
  simulation_namespace: "pilot",
  publisher_id: "publisher",
  sequence: 1,
  published_at: time(90000),
});
function manifest(artifact: Uint8Array, value = snapshot()): TrafficManifest {
  const { entries, ...rest } = value;
  return {
    ...rest,
    traffic_snapshot_id: sha256(artifact),
    byte_length: artifact.byteLength,
    media_type: "application/json",
  };
}
async function signed(
  value = snapshot(),
  artifact: Uint8Array = canonical(value),
  change: Partial<TrafficManifest> = {},
) {
  const m = { ...manifest(artifact, value), ...change };
  return {
    artifact,
    manifest: m,
    jws: await signManifest(m, { kid: "key-one", private_jwk: privateJwk }),
  };
}
async function rawJws(
  payload: Uint8Array,
  extra: Record<string, unknown> = {},
) {
  return new CompactSign(payload)
    .setProtectedHeader({
      alg: "EdDSA",
      kid: "key-one",
      typ: "routelens-traffic-manifest+jws",
      ...extra,
    })
    .sign(await importJWK(privateJwk, "EdDSA"));
}
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
test("Real Ed25519 JWS verifies exact standard payload and artifact bytes / 실제 Ed25519 서명과 원문 바이트 검증", async () => {
  const value = snapshot(),
    artifact = Buffer.from(JSON.stringify(value, null, 2)),
    record = await signed(value, artifact),
    verified = await verifyPublication(
      record.jws,
      artifact,
      config(),
      time(90000),
    );
  assert.equal(verified.manifest.traffic_snapshot_id, sha256(artifact));
  assert.deepEqual(verified.snapshot, value);
  await assert.rejects(
    verifyPublication(record.jws, canonical(value), config(), time(90000)),
  );
  const changed = Buffer.from(artifact);
  changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
  await assert.rejects(
    verifyPublication(record.jws, changed, config(), time(90000)),
  );
});
test("Protected header rejects unknown metadata, algorithms and keys / 보호 헤더의 미지원 정보·알고리즘·키 거부", async () => {
  const record = await signed();
  for (const extra of [
    { jku: "http://127.0.0.1:1" },
    { jwk: publicJwk },
    { kid: "unknown" },
  ]) {
    const jws = await rawJws(canonical(record.manifest), extra);
    await assert.rejects(verifyManifest(jws, config(), time(90000)));
  }
  const segments = record.jws.split(".");
  segments[0] = Buffer.from(
    JSON.stringify({
      alg: "HS256",
      kid: "key-one",
      typ: "routelens-traffic-manifest+jws",
    }),
  ).toString("base64url");
  await assert.rejects(
    verifyManifest(segments.join("."), config(), time(90000)),
  );
  const signatureParts = record.jws.split(".");
  signatureParts[2] =
    (signatureParts[2]!.startsWith("A") ? "B" : "A") +
    signatureParts[2]!.slice(1);
  await assert.rejects(
    verifyManifest(signatureParts.join("."), config(), time(90000)),
  );
});
test("Signed duplicate keys and unsupported fields still fail strict parsing / 서명된 중복 키와 미지원 필드도 거부", async () => {
  const record = await signed();
  const duplicate = Buffer.from(
    JSON.stringify(record.manifest).replace(
      '"sequence":1',
      '"sequence":1,"sequence":1',
    ),
  );
  await assert.rejects(
    verifyManifest(await rawJws(duplicate), config(), time(90000)),
  );
  const bad = await signed({
    ...snapshot(),
    unexpected: "private",
  } as TrafficSnapshot);
  await assert.rejects(
    verifyPublication(bad.jws, bad.artifact, config(), time(90000)),
  );
  const bytes = Buffer.from(
      JSON.stringify(snapshot()).replace(
        '"sequence":1',
        '"sequence":1,"sequence":1',
      ),
    ),
    dup = await signed(snapshot(), bytes);
  await assert.rejects(
    verifyPublication(dup.jws, bytes, config(), time(90000)),
  );
});
test("Bounds, length, truncation and invalid UTF-8 fail before acceptance / 크기·길이·절단·UTF-8 오류 거부", async () => {
  const record = await signed();
  await assert.rejects(
    verifyManifest("x".repeat(MANIFEST_LIMIT + 1), config(), time(90000)),
  );
  await assert.rejects(
    verifyPublication(
      record.jws,
      new Uint8Array(ARTIFACT_LIMIT + 1),
      config(),
      time(90000),
    ),
  );
  const length = await signed(snapshot(), record.artifact, {
    byte_length: record.artifact.length + 1,
  });
  await assert.rejects(
    verifyPublication(length.jws, record.artifact, config(), time(90000)),
  );
  await assert.rejects(
    verifyPublication(
      record.jws,
      record.artifact.slice(0, -1),
      config(),
      time(90000),
    ),
  );
  const bytes = Uint8Array.of(255),
    bad = await signed(snapshot(), bytes);
  await assert.rejects(
    verifyPublication(bad.jws, bytes, config(), time(90000)),
  );
});
test("Every signed scope field is checked against local trust / 서명된 범위를 로컬 신뢰 설정과 대조", async () => {
  for (const change of [
    { simulation_namespace: "other" },
    { publisher_id: "other" },
    { graph_id: "b".repeat(64) },
    { region_id: "other" },
  ]) {
    const record = await signed({
      ...snapshot(),
      ...change,
    } as TrafficSnapshot);
    await assert.rejects(
      verifyPublication(record.jws, record.artifact, config(), time(90000)),
    );
  }
});
test("Duplicate, private and non-Ed25519 trust keys are rejected / 중복·비공개·다른 형식 신뢰 키 거부", () => {
  assert.throws(() => validateRoots([root, root]));
  for (const jwk of [
    privateJwk,
    { kty: "RSA", n: "x", e: "AQAB" },
    { ...publicJwk, crv: "X25519" },
    { ...publicJwk, alg: "HS256" },
    { ...publicJwk, key_ops: ["sign"] },
  ])
    assert.throws(() => validateRoots([{ ...root, public_jwk: jwk }]));
});
test("Key revocation and both current/published validity boundaries are enforced / 키 철회와 발행·현재 유효시각 경계", async () => {
  const record = await signed();
  for (const change of [
    { revoked: true },
    { valid_from: time(90001) },
    { valid_until: time(90000) },
  ])
    await assert.rejects(
      verifyPublication(
        record.jws,
        record.artifact,
        { ...config(), trust_roots: [{ ...root, ...change }] },
        time(90000),
      ),
    );
  await assert.rejects(
    verifyPublication(
      record.jws,
      record.artifact,
      { ...config(), trust_roots: [{ ...root, valid_from: time(90001) }] },
      time(100000),
    ),
  );
});
test("Preconfigured key rotation preserves the signed sequence / 사전 설정 키 교환은 서명 순번을 유지", async () => {
  const second = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    }),
    secondPrivate = await exportJWK(second.privateKey),
    secondPublic = await exportJWK(second.publicKey),
    value = { ...snapshot(), sequence: 2 },
    artifact = canonical(value),
    m = manifest(artifact, value),
    jws = await signManifest(m, { kid: "key-two", private_jwk: secondPrivate }),
    verified = await verifyPublication(
      jws,
      artifact,
      {
        ...config(),
        trust_roots: [
          root,
          { ...root, kid: "key-two", public_jwk: secondPublic },
        ],
      },
      time(90000),
    );
  assert.equal(verified.manifest.sequence, 2);
});
test("Exact expiry, future publication and immutable TTL are enforced / 정확한 만료·미래 발행·고정 유효기간 검사", async () => {
  const record = await signed();
  await verifyPublication(record.jws, record.artifact, config(), time(239999));
  await assert.rejects(
    verifyPublication(record.jws, record.artifact, config(), time(240000)),
  );
  for (const change of [
    { published_at: time(90001) },
    { published_at: time(89999) },
    { valid_until: time(240001) },
    { window_end: time(60001) },
    { window_start: "2026-10-24T00:00:00Z" },
  ]) {
    const bad = await signed({ ...snapshot(), ...change });
    await assert.rejects(
      verifyPublication(bad.jws, bad.artifact, config(), time(90000)),
    );
  }
});
test("Entries enforce full sorted catalog, finite positive live speed and non-live nulls / 전체 정렬 목록·속도·상태별 null 검사", async () => {
  for (const entries of [
    [],
    [...snapshot().entries, ...snapshot().entries],
    [{ ...snapshot().entries[0]!, edge_id: "456" }],
    [{ ...snapshot().entries[0]!, forward: false }],
    [{ ...snapshot().entries[0]!, source_class: "CAR" }],
    [{ ...snapshot().entries[0]!, speed_mps: 0 }],
    [{ ...snapshot().entries[0]!, status: "UNKNOWN", speed_mps: 10 }],
    [{ ...snapshot().entries[0]!, sample_bucket: "1-4" }],
  ]) {
    const record = await signed({ ...snapshot(), entries } as TrafficSnapshot);
    await assert.rejects(
      verifyPublication(record.jws, record.artifact, config(), time(90000)),
    );
  }
  for (const status of ["UNKNOWN", "INSUFFICIENT", "STALE"] as const) {
    const record = await signed({
      ...snapshot(),
      entries: [
        {
          ...snapshot().entries[0]!,
          status,
          speed_mps: null,
          sample_bucket: null,
        },
      ],
    });
    await verifyPublication(record.jws, record.artifact, config(), time(90000));
  }
});
test("Duplicated manifest/artifact metadata and unsafe sequences are rejected / 목록·내용 불일치와 안전 범위 밖 순번 거부", async () => {
  const mismatch = await signed(snapshot(), canonical(snapshot()), {
    sequence: 2,
  });
  await assert.rejects(
    verifyPublication(mismatch.jws, mismatch.artifact, config(), time(90000)),
  );
  const zero = await signed({ ...snapshot(), sequence: 0 });
  await assert.rejects(
    verifyPublication(zero.jws, zero.artifact, config(), time(90000)),
  );
  const unsafe = await signed({
    ...snapshot(),
    sequence: Number.MAX_SAFE_INTEGER + 1,
  });
  await assert.rejects(
    verifyPublication(unsafe.jws, unsafe.artifact, config(), time(90000)),
  );
});
test("Fetcher permits only configured loopback origins / 수신기는 설정된 로컬 출처만 허용", () => {
  assert.equal(
    validateOrigin("http://127.0.0.1:1234"),
    "http://127.0.0.1:1234",
  );
  for (const value of [
    "http://localhost:1234",
    "https://127.0.0.1:1234",
    "http://user:pass@127.0.0.1:1234",
    "http://127.0.0.1:1234/path",
    "http://127.0.0.1:1234/?x=1",
    "http://example.com",
  ])
    assert.throws(() => validateOrigin(value));
});
test("Early type rejection and chunked oversize abort owned HTTP responses / 형식 조기 거부와 분할 크기 초과 후 HTTP 연결 종료", async () => {
  const closed: Array<Promise<void>> = [];
  const server = createServer((req, res) => {
    closed.push(new Promise<void>((resolve) => res.once("close", resolve)));
    res.writeHead(200, {
      "content-type":
        req.url === "/type" ? "application/octet-stream" : "application/json",
    });
    res.write("x".repeat(101));
  });
  const port = await listen(server);
  try {
    for (const path of ["/type", "/large"]) {
      await assert.rejects(
        boundedFetch(
          `http://127.0.0.1:${port}${path}`,
          100,
          "application/json",
        ),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          closed.at(-1)!,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Owned response did not close / 소유 응답이 종료되지 않았습니다",
                  ),
                ),
              1000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    await close(server);
  }
});
test("Real loopback service returns exact immutable bytes and bounded 404/410/405 errors / 실제 로컬 서비스 바이트와 오류 계약", async () => {
  const record = await signed(),
    publication: PublicationRecord = {
      simulation_namespace: "pilot",
      publisher_id: "publisher",
      region_id: "seoul-pilot-corridors-v1",
      graph_id: graph,
      sequence: 1,
      window_start: time(0),
      window_end: time(60000),
      published_at: time(90000),
      valid_until: time(240000),
      kid: "key-one",
      candidate_sha256: "c".repeat(64),
      traffic_snapshot_id: record.manifest.traffic_snapshot_id,
      artifact: record.artifact,
      jws: record.jws,
    };
  let state: "AVAILABLE" | "MISSING" | "EXPIRED" = "AVAILABLE";
  const serviceConfig: PublicationStoreConfig = {
    aggregation: {
      store: config().store,
      catalog: config().catalogs[0]!.edges,
      source_class: "SYNTHETIC",
    },
    publisher_id: "publisher",
  };
  const service = await startPublicationService(
    { publication: serviceConfig },
    {
      verifyInitialized: async () => {},
      close: async () => {},
      current: async () =>
        state === "AVAILABLE"
          ? { code: state, publication }
          : { code: state, publication: null },
      artifact: async (hash) =>
        hash === publication.traffic_snapshot_id ? publication : null,
    },
  );
  try {
    const prefix = `http://127.0.0.1:${service.port}/v1/simulations/pilot`,
      current = `${prefix}/regions/seoul-pilot-corridors-v1/current`;
    const jws = await boundedFetch(current, MANIFEST_LIMIT, "application/jose");
    assert.equal(Buffer.from(jws).toString(), record.jws);
    const artifact = await boundedFetch(
      `${prefix}/artifacts/${publication.traffic_snapshot_id}`,
      ARTIFACT_LIMIT,
      "application/json",
    );
    assert.deepEqual(artifact, Uint8Array.from(record.artifact));
    for (const [next, status] of [
      ["MISSING", 404],
      ["EXPIRED", 410],
    ] as const) {
      state = next;
      const response = await fetch(current);
      assert.equal(response.status, status);
      assert.ok(((await response.json()) as { message_ko: string }).message_ko);
    }
    const response = await fetch(current, { method: "POST" });
    assert.equal(response.status, 405);
    await response.json();
  } finally {
    await service.close();
  }
});
