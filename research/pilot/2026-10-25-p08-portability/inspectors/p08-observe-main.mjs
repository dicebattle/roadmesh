/** Main's point-in-time read of one exact owned P08 database.
 * 메인이 정확한 소유 P08 DB 한 개를 시점 조회하는 도구입니다.
 * Usage / 사용법: node data/p08-observe-main.mjs WHOLE
 * No private configuration, environment or DSN is read. / 비공개 설정·환경·DSN을 읽지 않습니다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.argv.length !== 3)
  throw Error("Use WHOLE as the only argument / WHOLE 인자 하나만 사용하세요");
const whole = resolve(process.argv[2]),
  root = join(whole, "traffic"),
  checkpoint = join(root, "readbacks/accepted.json"),
  deadline = Date.now() + 420000;
let accepted;
while (!accepted) {
  if (existsSync(checkpoint)) {
    try {
      const value = JSON.parse(readFileSync(checkpoint, "utf8"));
      if (value.active?.manifest) accepted = value;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  if (accepted) break;
  if (Date.now() >= deadline) {
    process.stderr.write(
      "P08 acceptance checkpoint not observed within420 seconds / 420초 안에 P08 수용 지점을 확인하지 못했습니다\n",
    );
    process.exit(1);
  }
  await new Promise((done) => setTimeout(done, 250));
}
const owner = JSON.parse(
  readFileSync(join(root, "runtime/ownership.json"), "utf8"),
);
const namespace = accepted.active.manifest.simulation_namespace;
const match =
  /^routelens-p05-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(
    owner.container,
  );
if (
  !match ||
  owner.run_id !== match[1] ||
  owner.planned_before_creation !== true ||
  resolve(owner.owned_output_root) !== root ||
  !/^p08-[a-f0-9]{16}$/.test(namespace) ||
  namespace !== "p08-" + match[1].replace(/-/g, "").slice(0, 16)
)
  throw Error(
    "Unexpected owned P08 container/namespace / 예상과 다른 소유 P08 컨테이너·영역",
  );
const sql = `SELECT jsonb_build_object('clock',(SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace='${namespace}'),'traversals',(SELECT count(*) FROM routelens_p05.traversals WHERE namespace='${namespace}'),'publications',(SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT publisher_id,sequence,traffic_snapshot_id,encode(sha256(artifact),'hex') AS actual_artifact_sha256,octet_length(artifact) AS byte_length,published_at,valid_until FROM routelens_p07.publications WHERE namespace='${namespace}' ORDER BY publisher_id,sequence)p),'consumers',(SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT consumer_id,high_water,last_snapshot_id,octet_length(artifact) AS active_byte_length FROM routelens_p07.consumer_states WHERE namespace='${namespace}' ORDER BY consumer_id)c));`;
const result = spawnSync(
  "docker",
  [
    "exec",
    owner.container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "routelens",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    sql,
  ],
  { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 },
);
if (result.error || result.status !== 0)
  throw Error(
    "Owned P08 SQL read failed / 소유 P08 SQL 조회 실패: " +
      String(result.error ?? result.stderr),
  );
const readback = JSON.parse(result.stdout);
for (const publication of readback.publications ?? [])
  if (publication.traffic_snapshot_id !== publication.actual_artifact_sha256)
    throw Error(
      "Live artifact byte hash mismatch / 실행 중 파일 바이트 해시 불일치",
    );
const path = join(whole, "main-live-traffic.json");
writeFileSync(
  path,
  JSON.stringify(
    {
      observed_at_utc: new Date().toISOString(),
      owned_container: owner.container,
      namespace,
      query: sql,
      readback,
      point_in_time_only: true,
      message_en:
        "Main read the exact owned P08 database during execution; counts and versions are a point-in-time observation, not final totals.",
      message_ko:
        "메인이 실행 중 정확한 소유 P08 DB를 직접 읽었습니다. 개수와 버전은 그 시점의 관측이며 최종 합계가 아닙니다.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    output: path,
    clock: readback.clock,
    traversals: readback.traversals,
    publications: readback.publications?.length ?? 0,
    consumers: readback.consumers?.length ?? 0,
    point_in_time_only: true,
  }),
);
