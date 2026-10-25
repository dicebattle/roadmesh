import { test } from "node:test";
import assert from "node:assert/strict";
import { ITS_BODY_LIMIT, ITS_ENDPOINT, ITS_MIN_POLL_MS, ItsSpeedCollector, normalizeItsResponse,
  parseItsKoreanTime, PublicSpeedError, readItsSpeeds, type PublicBounds } from "../tools/public_speed_source.js";

const bounds: PublicBounds = [126.98, 37.46, 127.10, 37.56];
const now = "2026-10-25T14:01:10.000Z", clock = () => Date.parse(now);
const key = "private-fixture-key";
const row = {roadName: "장충단로", roadDrcType: "", linkNo: "", linkId: "1010000301",
  startNodeId: "1010000600", endNodeId: "1010006900", speed: "21", travelTime: "10.65", createdDate: "20261025230000"};
function bytes(rows: unknown[] = [row]): Buffer {
  return Buffer.from(JSON.stringify({header: {resultCode: 0, resultMsg: "SUCCESS"}, body: {totalCount: rows.length, items: rows}}));
}
function normalized(rows: unknown[] = [row], at = now) { return normalizeItsResponse(bytes(rows), at, bounds); }
const response = (body: string | Uint8Array = bytes(), headers: Record<string, string> = {}) => new Response(typeof body === "string" ? body : new Uint8Array(body).buffer,
  {headers: {"content-type": "application/json;charset=UTF-8", ...headers}});
const transport = (run: (...args: Parameters<typeof fetch>) => Promise<Response>) => run as typeof fetch;

test("Korean timestamp uses UTC+9 and rejects normalized calendar errors / 한국 시각·잘못된 달력일 거부", () => {
  assert.equal(parseItsKoreanTime("20261025230000"), "2026-10-25T14:00:00.000Z");
  assert.equal(parseItsKoreanTime("20260101000000"), "2025-12-31T15:00:00.000Z");
  for (const v of ["20260230000000", "20260229000000", "20261025240000", "20261025236000", "20261025235960", "20261301000000", "20260001000000", 20261025230000])
    assert.equal(parseItsKoreanTime(v), null);
  assert.equal(parseItsKoreanTime("20240229000000"), "2024-02-28T15:00:00.000Z");
});
test("real wire fields normalize units, provenance and original-time expiry / 실제 필드 단위·출처·원시각 만료", () => {
  const b = normalized(), v = b.observations[0]!;
  assert.equal(v.speed_mps, 21 / 3.6);
  assert.equal(v.valid_until, "2026-10-25T14:10:00.000Z");
  assert.equal(b.source_class, "PUBLIC_AGENCY");
  assert.equal(b.provider, "kr-its");
  assert.equal(b.retrieved_at, now);
  assert.equal(b.endpoint, ITS_ENDPOINT);
  assert.equal(b.raw_byte_length, bytes().length);
  assert.match(b.raw_sha256, /^[a-f0-9]{64}$/);
  assert.equal("sample_bucket" in v, false);
});
test("zero, negative, missing and implausible speeds never become closures / 0·누락·오류를 폐쇄로 바꾸지 않음", () => {
  for (const speed of ["0", "-1", "", "null", "NaN", "Infinity", "253", null, undefined, " 21", "1e2", true]) {
    const v = normalized([{...row, speed}]).observations[0]!;
    assert.equal(v.status, "UNKNOWN"); assert.equal(v.speed_mps, null); assert.equal(v.reason, "INVALID_SPEED");
  }
  assert.equal(normalized([{...row, speed: "252"}]).observations[0]!.speed_mps, 70);
});
test("freshness expires at the exact source boundary and future values are unknown / 원시각 정확 만료·미래 보류", () => {
  assert.equal(normalized([row], "2026-10-25T14:09:59.999Z").observations[0]!.status, "LIVE");
  const stale = normalized([row], "2026-10-25T14:10:00.000Z").observations[0]!;
  assert.equal(stale.status, "STALE"); assert.equal(stale.speed_mps, null);
  assert.equal(stale.valid_until, "2026-10-25T14:10:00.000Z");
  assert.equal(normalized([{...row, createdDate: "20261025230200"}]).observations[0]!.reason, "FUTURE");
  assert.equal(normalized([{...row, createdDate: "20260230000000"}]).observations[0]!.reason, "INVALID_TIME");
});
test("dedup uses the latest record including invalidation, never averages duplicates / 최신 무효화·중복 평균 금지", () => {
  const latest = {...row, speed: "0", createdDate: "20261025230100"};
  for (const rows of [[row, latest], [latest, row]]) {
    const b = normalized(rows); assert.equal(b.duplicate_rows, 1);
    assert.equal(b.observations[0]!.reason, "INVALID_SPEED");
    assert.equal(b.observations[0]!.observed_at, "2026-10-25T14:01:00.000Z");
  }
  assert.equal(normalized([row, row]).observations.length, 1);
  assert.equal(normalized([row, {...row, speed: "22"}]).observations[0]!.reason, "CONFLICT");
  assert.equal(normalized([row, {...row, createdDate: ""}]).observations[0]!.reason, "INVALID_TIME");
});
test("node/ID faults remain visible and do not contribute valid speed / 노드·식별자 오류 수치 반영 금지", () => {
  assert.equal(normalized([{...row, startNodeId: row.endNodeId}]).observations[0]!.reason, "INVALID_NODES");
  const b = normalized([{...row, linkId: 1010000301}, row]);
  assert.equal(b.received_rows, 2); assert.equal(b.invalid_id_rows, 1); assert.equal(b.observations.length, 1);
});
test("provider failure, truncation and wrong payloads cannot look like an empty successful feed / 오류·절단 성공 위장 금지", () => {
  for (const raw of [Buffer.from("<error>bad key</error>"), Buffer.from('{"header":{"resultCode":0,"resultMsg":"SUCCESS"},"body":{"totalCount":2,"items":[]}}'),
    Buffer.from('{"header":{"resultCode":1,"resultMsg":"FAILURE"}}'), Buffer.from('{"header":null}'), Buffer.alloc(ITS_BODY_LIMIT + 1)])
    assert.throws(() => normalizeItsResponse(raw, now, bounds), PublicSpeedError);
  assert.equal(normalized([]).received_rows, 0);
  assert.throws(() => normalizeItsResponse(bytes(), "2026-02-30T14:00:00.000Z", bounds), /INVALID_UTC_TIME/);
});
test("HTTP request keeps the key private to the allowlisted source and rejects redirect / 기관 전용 키·리다이렉트 금지", async () => {
  const read = await readItsSpeeds(key, bounds, {clock, fetch: transport(async (url, options) => {
    const u = new URL(String(url)); assert.equal(u.origin, new URL(ITS_ENDPOINT).origin);
    assert.equal(u.searchParams.get("apiKey"), key); assert.equal(options?.redirect, "error");
    assert.equal(u.searchParams.get("minX"), String(bounds[0]));
    return response();
  })});
  assert.equal(read.batch.observations[0]!.status, "LIVE");
  assert.equal(JSON.stringify(read.batch).includes(key), false);
  await assert.rejects(readItsSpeeds(key, bounds, {fetch: transport(async () => {throw Error("secret URL: " + key);})}),
    e => e instanceof PublicSpeedError && e.code === "TRANSPORT_FAILURE" && !e.message.includes(key));
});
test("HTTP errors, media types, overlong streams and secret echoes are rejected / HTTP·미디어·크기·키 노출 거부", async () => {
  const cases = [new Response("no", {status: 302}), response("{}", {"content-type": "text/html"}),
    response("{}", {"content-length": String(ITS_BODY_LIMIT + 1)}), response(bytes(), {"content-length": "2"}),
    response(Buffer.alloc(ITS_BODY_LIMIT + 1)), response(JSON.stringify({error: key}))];
  for (const r of cases) await assert.rejects(readItsSpeeds(key, bounds, {clock, fetch: transport(async () => r)}), PublicSpeedError);
});
test("polls coalesce and outages cannot bypass the minimum interval / 동시 수집 병합·장애 시 최소 간격", async () => {
  let at = clock(), calls = 0, finish!: (v: Response) => void;
  const c = new ItsSpeedCollector(key, bounds, {clock: () => at, fetch: transport(async () => {
    calls++; return new Promise(done => {finish = done;});
  })});
  const first = c.collect(), second = c.collect();
  assert.equal(first, second); assert.equal(calls, 1); finish(response()); await first;
  await assert.rejects(c.collect(), /POLL_INTERVAL/);
  at += ITS_MIN_POLL_MS;
  const retry = c.collect(); finish(response("failure", {"content-type": "text/html"}));
  await assert.rejects(retry, /HTTP_RESPONSE/);
  await assert.rejects(c.collect(), /POLL_INTERVAL/); assert.equal(calls, 2);
});
test("bounded regions and invalid keys fail before any network read / 영역·키 오류는 호출 전에 거부", async () => {
  let calls = 0;
  const f = transport(async () => {calls++; return response();});
  for (const b of [[126, 37, 127, 38], [126, 37, 126, 37.1], [0, 0, 0.1, 0.1], [126, 37, NaN, 37.1]])
    await assert.rejects(readItsSpeeds(key, b as unknown as PublicBounds, {fetch: f}), /INVALID_BOUNDS/);
  await assert.rejects(readItsSpeeds("", bounds, {fetch: f}), /MISSING_CREDENTIAL/);
  assert.equal(calls, 0);
});
