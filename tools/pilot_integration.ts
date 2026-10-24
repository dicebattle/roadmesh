/** Own the synchronous Seoul engine pipeline in a child so abort cleanup stays responsive. */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  canonical,
  parseJson,
  sha256,
  isMain,
  consoleIO,
  type ConsoleIO,
} from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";
import { verifyRegionalChild } from "./seoul_checks.js";
import { OwnedIngestionRuntime } from "./ingestion_runtime.js";
import { runIngestionChecks } from "./ingestion_checks.js";
import { runAggregationChecks } from "./aggregation_checks.js";
import {
  runPublicationChecks,
  requirePublicationCases,
} from "./publication_checks.js";
import {
  runTrafficChecks,
  requireTrafficCases,
  TRAFFIC_CASE_IDS,
} from "./traffic_checks.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "./simulation_report.js";
export async function runPilotIntegration(
  outputPath: string,
  sourcePath?: string,
): Promise<number> {
  const output = resolve(outputPath);
  mkdirSync(output);
  const owner = new OwnedIngestionRuntime(join(output, "lifecycle"), output);
  const source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  if (!source.commit || source.dirty === null)
    throw new Error("Source identity unavailable / 소스 식별 불가");
  const verified = {
    commit: source.commit,
    dirty: source.dirty,
  };
  let cleanup = false,
    failure: unknown;
  try {
    const args = [
      "--output",
      join(output, "seoul"),
      ...(sourcePath ? ["--source", sourcePath] : []),
    ];
    const child = owner.spawnCommand(
      "seoul-whole-system",
      "seoul_checks",
      args,
    );
    const started = performance.now();
    const exit = await child.exited(900000);
    writeFileSync(
      join(output, "seoul-process.json"),
      JSON.stringify(
        {
          pid: child.child?.pid,
          exit,
          duration_ms: performance.now() - started,
        },
        null,
        2,
      ) + "\n",
    );
    if (exit.code !== 0)
      throw new Error("Fresh Seoul child failed / 새 서울 하위 실행 실패");
    verifyRegionalChild(join(output, "seoul"), verified);
    const data = parseJson(
      readFileSync(join(output, "seoul/report-data.json")),
    ) as SimulationReportData;
    const p05Start = performance.now();
    const ingestion = await runIngestionChecks(
      join(output, "seoul/graph"),
      join(output, "seoul/workload"),
      join(output, "ingestion"),
    );
    verifyRegionalChild(join(output, "ingestion"), verified, data.graph_id);
    data.ingestion = {
      ...ingestion.ingestion,
      cases: ingestion.ingestion.cases.map((c) => ({
        ...c,
        evidence_path: "ingestion/" + c.evidence_path,
      })),
      evidence: ingestion.ingestion.evidence.map((e) => ({
        ...e,
        path: "ingestion/" + e.path,
      })),
    };
    data.stages = data.stages.map((s) => ({
      ...s,
      evidence_path: "seoul/" + s.evidence_path,
    }));
    data.stages.push({
      id: "p05",
      name_en: "Durable HTTP and PostgreSQL recovery",
      name_ko: "영속 HTTP·PostgreSQL 복구",
      status: "PASS",
      evidence_path: "ingestion/manifest.json",
      duration_ms: performance.now() - p05Start,
    });
    data.assertions = data.assertions
      .map((a) => ({
        ...a,
        evidence_path: "seoul/" + a.evidence_path,
      }))
      .concat(
        ingestion.assertions.map((a) => ({
          ...a,
          evidence_path: "ingestion/" + a.evidence_path,
        })),
      );
    const tiny = parseJson(
      readFileSync(join(output, "seoul/tiny/assertions.json")),
    ) as SimulationAssertion[];
    const seoulAssertions = parseJson(
      readFileSync(join(output, "seoul/workload/assertions.json")),
    ) as SimulationAssertion[];
    if (
      tiny.length !== 48 ||
      seoulAssertions.length !== 35 ||
      ingestion.assertions.length !== 34 ||
      [...tiny, ...seoulAssertions, ...ingestion.assertions].some(
        (a) => a.status !== "PASS",
      )
    )
      throw new Error(
        "All 117 prior fresh assertions are required / 기존새검사117개 전체통과가 필요합니다",
      );
    data.assertions = [
      ...tiny.map((a) => ({
        ...a,
        assertion_id: "tiny-" + a.assertion_id,
        evidence_path: "seoul/tiny/" + a.evidence_path,
      })),
      ...data.assertions,
    ];
    const aggregationStarted = performance.now();
    const aggregation = await runAggregationChecks(
      join(output, "seoul/graph"),
      join(output, "aggregation"),
    );
    verifyRegionalChild(join(output, "aggregation"), verified, data.graph_id);
    data.aggregation = {
      ...aggregation.aggregation,
      cases: aggregation.aggregation.cases.map((c) => ({
        ...c,
        evidence_path: "aggregation/" + c.evidence_path,
      })),
    };
    data.stages.push({
      id: "p06",
      name_en: "Actual short-trip ingestion and unsigned aggregation",
      name_ko: "실제짧은여행 수집·서명전집계",
      status: "PASS",
      evidence_path: "aggregation/manifest.json",
      duration_ms: performance.now() - aggregationStarted,
    });
    data.assertions.push(
      ...aggregation.assertions.map((a) => ({
        ...a,
        evidence_path: "aggregation/" + a.evidence_path,
      })),
    );
    if (
      data.assertions.length !== 151 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw new Error(
        "All 151 prior fresh assertions are required / 기존 새 검사 151개 전체 통과가 필요합니다",
      );
    const publicationStarted = performance.now();
    const publication = await runPublicationChecks(
      join(output, "seoul/graph"),
      join(output, "publication"),
    );
    verifyRegionalChild(join(output, "publication"), verified, data.graph_id);
    requirePublicationCases(publication.assertions);
    data.publication = {
      ...publication.publication,
      cases: publication.publication.cases.map((c) => ({
        ...c,
        evidence_path: "publication/" + c.evidence_path,
      })),
      versions: publication.publication.versions.map((v) => ({
        ...v,
        artifact_path: "publication/" + v.artifact_path,
        jws_path: "publication/" + v.jws_path,
      })),
      evidence: publication.publication.evidence.map((e) => ({
        ...e,
        path: "publication/" + e.path,
      })),
    };
    data.stages.push({
      id: "p07",
      name_en: "Signed HTTP publication and durable consumer acceptance",
      name_ko: "서명 HTTP 게시·영속 수신 수용",
      status: "PASS",
      evidence_path: "publication/manifest.json",
      duration_ms: performance.now() - publicationStarted,
    });
    data.assertions.push(
      ...publication.assertions.map((a) => ({
        ...a,
        evidence_path: "publication/" + a.evidence_path,
      })),
    );
    if (
      Number(data.assertions.length) !== 206 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw new Error(
        "All 206 prior fresh assertions are required / 기존 새 검사206개 전체 통과 필요",
      );
    const trafficStarted = performance.now();
    const traffic = await runTrafficChecks(
      join(output, "seoul/graph"),
      join(output, "traffic"),
    );
    verifyRegionalChild(join(output, "traffic"), verified, data.graph_id);
    requireTrafficCases(traffic.assertions);
    data.traffic = {
      ...traffic.traffic,
      cases: traffic.traffic.cases.map((c) => ({
        ...c,
        evidence_path: "traffic/" + c.evidence_path,
      })),
      routes: traffic.traffic.routes.map((r) => ({
        ...r,
        evidence_path: "traffic/" + r.evidence_path,
      })),
      evidence: traffic.traffic.evidence.map((e) => ({
        ...e,
        path: "traffic/" + e.path,
      })),
    };
    data.stages.push({
      id: "p08",
      name_en: "Accepted traffic files, actual routing and exact expiry",
      name_ko: "수용 교통파일·실제 경로·정확한 만료",
      status: "PASS",
      evidence_path: "traffic/manifest.json",
      duration_ms: performance.now() - trafficStarted,
    });
    data.assertions.push(
      ...traffic.assertions.map((a) => ({
        ...a,
        evidence_path: "traffic/" + a.evidence_path,
      })),
    );
    if (Number(data.assertions.length) !== 206 + TRAFFIC_CASE_IDS.length)
      throw new Error(
        "Whole assertion inventory mismatch / 전체 검사 목록 불일치",
      );
    data.summary.assertions_passed = data.assertions.filter(
      (a) => a.status === "PASS",
    ).length;
    data.summary.assertions_total = data.assertions.length;
    data.limitations = data.limitations.map((item) => ({
      ...item,
      message_en: item.message_en.replace(
        "P05–P14 remain incomplete",
        "P09–P14 remain incomplete",
      ),
      message_ko: item.message_ko.replace(
        "P05~P14는 미완료",
        "P09~P14는 미완료",
      ),
    }));
    data.generated_at_utc = new Date().toISOString();
    if (
      data.implementation_sha256 !== fingerprint ||
      implementationFingerprint() !== fingerprint ||
      !canonical(sourceIdentity()).equals(canonical(verified))
    )
      throw new Error(
        "Source/fingerprint changed during whole pilot / 전체파일럿 실행중 소스·지문 변경",
      );
    writeFileSync(
      join(output, "report-data.json"),
      JSON.stringify(data, null, 2) + "\n",
      {
        flag: "wx",
      },
    );
    writeFileSync(join(output, "report.html"), renderSimulationReport(data), {
      flag: "wx",
    });
    writeFileSync(
      join(output, "assertions.json"),
      JSON.stringify(data.assertions, null, 2) + "\n",
      {
        flag: "wx",
      },
    );
    writeFileSync(
      join(output, "summary.md"),
      "# Whole implemented-system pilot / 구현된 전체 파일럿\n\nPASS: fresh tiny → Seoul → P05 durable ingestion, interruption/recovery and deletion read-back → P06 unsigned synthetic aggregation → P07 signed HTTP publication and durable verification → P08 accepted immutable traffic files, real routing and exact expiry.\n통과: 새 tiny→서울→P05영속수집·실제중단/복구·삭제재조회→P06서명전합성집계→P07서명HTTP게시·영속검증→P08수용불변교통파일·실제경로·정확한만료.\n\nP09–P14 remain incomplete; no production authentication or real driver traces.\nP09~P14는 미완료이며 운영인증·실주행자료가 아닙니다.\n",
    );
  } catch (error) {
    failure = error;
  } finally {
    cleanup = await owner.cleanup();
  }
  if (failure || !cleanup) {
    writeFileSync(
      join(output, "failure.json"),
      JSON.stringify(
        {
          status: "FAIL",
          message_en: "Whole pilot incomplete.",
          message_ko: "전체 파일럿 미완료.",
          error: String(failure ?? "Cleanup incomplete"),
          cleanup_verified: cleanup,
        },
        null,
        2,
      ) + "\n",
    );
    throw failure ?? new Error("Cleanup incomplete / 정리 미완료");
  }
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(verified))
  )
    throw new Error(
      "Source changed before final completion / 최종완료 전 소스 변경",
    );
  const files = [
    "seoul/manifest.json",
    "ingestion/manifest.json",
    "aggregation/manifest.json",
    "publication/manifest.json",
    "traffic/manifest.json",
    "lifecycle/cleanup.json",
    "report-data.json",
    "report.html",
    "assertions.json",
    "summary.md",
    "seoul-process.json",
  ];
  writeFileSync(
    join(output, "manifest.json.tmp"),
    JSON.stringify(
      {
        schema_version: "0.1",
        status: "PASS",
        source: verified,
        implementation_sha256: fingerprint,
        graph_id: (
          parseJson(
            readFileSync(join(output, "report-data.json")),
          ) as SimulationReportData
        ).graph_id,
        cleanup_verified: true,
        output_sha256: Object.fromEntries(
          files.map((p) => [p, sha256(readFileSync(join(output, p)))]),
        ),
        completed_at_utc: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    {
      flag: "wx",
    },
  );
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return 0;
}
export async function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    let output = "",
      source: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--help") {
        io.out(
          "Usage / 사용법: simulation:check -- --output NEW_DIRECTORY [--source PINNED_PBF]\nFresh tiny, actual Seoul roads and durable P05 HTTP/DB/process recovery and P06 unsigned aggregation/P07 signed publication/P08 traffic routing and expiry. / 새 tiny·실제서울도로·영속P05 HTTP/DB/프로세스복구·P06서명전집계·P07서명게시·P08교통경로·만료.",
        );
        return 0;
      } else if (argv[i] === "--output" && !output) output = argv[++i] ?? "";
      else if (argv[i] === "--source" && !source) {
        source = argv[++i];
        if (!source || source.startsWith("-"))
          throw new Error("Source file required / 원본 파일이 필요합니다");
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!output || output.startsWith("-") || source?.startsWith("-"))
      throw new Error("New output required / 새출력 필요");
    return await runPilotIntegration(output, source);
  } catch (error) {
    io.error("Whole pilot incomplete / 전체파일럿 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
