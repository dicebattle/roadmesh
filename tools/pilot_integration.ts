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
import {
  runNodeChecks,
  requireNodeCases,
  NODE_CASE_IDS,
} from "./node_checks.js";
import {
  runGatewayChecks,
  requireGatewayCases,
  GATEWAY_CASE_IDS,
} from "./gateway_checks.js";
import {
  runClientChecks,
  requireClientCases,
  CLIENT_CASE_IDS,
} from "./client_checks.js";
import { requireProgressCases } from "./progress_checks.js";
import { requireGuidanceCases } from "./guidance_checks.js";
import { runPublicSpeedChecks, requirePublicSpeedCases } from "./public_speed_checks.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
import {
  runCloudflareChecks,
  requireCloudflareCases,
} from "./cloudflare_checks.js";
import { runScenarioChecks, requireScenarioCases } from "./scenario_checks.js";
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
    if (
      Number(data.assertions.length) !== 238 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw new Error(
        "All 238 prior fresh cases are required / 기존 새 검사238개 전체 통과 필요",
      );
    const nodesStarted = performance.now();
    const nodes = await runNodeChecks(
      join(output, "seoul/graph"),
      join(output, "nodes"),
    );
    verifyRegionalChild(join(output, "nodes"), verified, data.graph_id);
    requireNodeCases(nodes.assertions);
    data.nodes = {
      ...nodes.nodes,
      routes: nodes.nodes.routes.map((r) => ({
        ...r,
        evidence_path: "nodes/" + r.evidence_path,
      })),
      events: nodes.nodes.events.map((e) => ({
        ...e,
        evidence_path: "nodes/" + e.evidence_path,
      })),
      cases: nodes.nodes.cases.map((c) => ({
        ...c,
        evidence_path: "nodes/" + c.evidence_path,
      })),
      evidence: nodes.nodes.evidence.map((e) => ({
        ...e,
        path: "nodes/" + e.path,
      })),
    };
    data.stages.push({
      id: "p09",
      name_en: "Persistent native two-node routing, draining and expiry",
      name_ko: "지속 엔진 두 노드 경로·요청 마무리·만료",
      status: "PASS",
      evidence_path: "nodes/manifest.json",
      duration_ms: performance.now() - nodesStarted,
    });
    data.assertions.push(
      ...nodes.assertions.map((a) => ({
        ...a,
        evidence_path: "nodes/" + a.evidence_path,
      })),
    );
    if (Number(data.assertions.length) !== 238 + NODE_CASE_IDS.length)
      throw new Error(
        "P09 whole case inventory mismatch / P09 전체 검사 목록 불일치",
      );
    if (
      Number(data.assertions.length) !== 270 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw new Error(
        "All270 prior fresh cases are required / 기존 새270검사 전체통과 필요",
      );
    const gatewayStarted = performance.now();
    const gateway = await runGatewayChecks(
      join(output, "seoul/graph"),
      join(output, "gateway"),
    );
    verifyRegionalChild(join(output, "gateway"), verified, data.graph_id);
    requireGatewayCases(gateway.assertions);
    data.gateway = {
      ...gateway.gateway,
      routes: gateway.gateway.routes.map((r) => ({
        ...r,
        evidence_path: "gateway/" + r.evidence_path,
      })),
      events: gateway.gateway.events.map((e) => ({
        ...e,
        evidence_path: "gateway/" + e.evidence_path,
      })),
      cases: gateway.gateway.cases.map((c) => ({
        ...c,
        evidence_path: "gateway/" + c.evidence_path,
      })),
      evidence: gateway.gateway.evidence.map((e) => ({
        ...e,
        path: "gateway/" + e.path,
      })),
    };
    data.stages.push({
      id: "p10",
      name_en: "Version-aware route gateway and bounded failover",
      name_ko: "버전확인 경로중계·제한된 전환",
      status: "PASS",
      evidence_path: "gateway/manifest.json",
      duration_ms: performance.now() - gatewayStarted,
    });
    data.assertions.push(
      ...gateway.assertions.map((a) => ({
        ...a,
        evidence_path: "gateway/" + a.evidence_path,
      })),
    );
    if (Number(data.assertions.length) !== 270 + GATEWAY_CASE_IDS.length)
      throw new Error(
        "P10 whole case inventory mismatch / P10 전체검사목록 불일치",
      );
    if (
      Number(data.assertions.length) !== 302 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw new Error(
        "All302 prior fresh cases required / 기존 새302검사 전체통과 필요",
      );
    const clientStarted = performance.now();
    const client = await runClientChecks(
      join(output, "seoul/graph"),
      join(output, "client"),
    );
    verifyRegionalChild(join(output, "client"), verified, data.graph_id);
    requireClientCases(client.assertions);
    data.client = {
      ...client.client,
      screenshots: client.client.screenshots.map((s) => ({
        ...s,
        path: "client/" + s.path,
      })),
      routes: client.client.routes.map((r) => ({
        ...r,
        evidence_path: "client/" + r.evidence_path,
      })),
      events: client.client.events.map((e) => ({
        ...e,
        evidence_path: "client/" + e.evidence_path,
      })),
      cases: client.client.cases.map((c) => ({
        ...c,
        evidence_path: "client/" + c.evidence_path,
      })),
      evidence: client.client.evidence.map((e) => ({
        ...e,
        path: "client/" + e.path,
      })),
    };
    data.stages.push({
      id: "p11",
      name_en: "Actual same-origin browser route client and freshness",
      name_ko: "실제 같은 출처 브라우저 경로·신선도",
      status: "PASS",
      evidence_path: "client/manifest.json",
      duration_ms: performance.now() - clientStarted,
    });
    data.assertions.push(
      ...client.assertions.map((a) => ({
        ...a,
        evidence_path: "client/" + a.evidence_path,
      })),
    );
    if (Number(data.assertions.length) !== 302 + CLIENT_CASE_IDS.length)
      throw new Error(
        "P11 whole case inventory mismatch / P11 전체검사 목록 불일치",
      );
    const scenarioStarted = performance.now();
    const scenarios = await runScenarioChecks(
      join(output, "seoul/graph"),
      join(output, "scenarios"),
      { root: output, assertions: data.assertions as SimulationAssertion[] },
    );
    verifyRegionalChild(join(output, "scenarios"), verified, data.graph_id);
    requireScenarioCases(scenarios.assertions);
    data.scenarios = {
      ...scenarios.scenarios,
      matrix_path: "scenarios/matrix.json",
      cases: scenarios.scenarios.cases.map((c) => ({
        ...c,
        evidence_path: "scenarios/" + c.evidence_path,
      })),
      screenshots: scenarios.scenarios.screenshots.map((s) => ({
        ...s,
        path: "scenarios/" + s.path,
      })),
    };
    data.stages.push({
      id: "p12",
      name_en: "Whole-system faults and same-run S01–S15 evidence",
      name_ko: "전체 장애·같은 실행 S01~S15 근거",
      status: "PASS",
      evidence_path: "scenarios/manifest.json",
      duration_ms: performance.now() - scenarioStarted,
    });
    data.assertions.push(
      ...scenarios.assertions.map((a) => ({
        ...a,
        evidence_path: "scenarios/" + a.evidence_path,
      })),
    );
    if (
      Number(data.assertions.length) !== 358 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw Error("All358 cases required / 전체358개 통과 필요");
    const cloudflareStarted = performance.now();
    const cloudflare = await runCloudflareChecks(
      join(output, "seoul/graph"),
      join(output, "aggregation"),
      join(output, "cloudflare"),
    );
    verifyRegionalChild(join(output, "cloudflare"), verified, data.graph_id);
    requireCloudflareCases(cloudflare.assertions);
    data.cloudflare = {
      ...cloudflare.cloudflare,
      cases: cloudflare.cloudflare.cases.map((c) => ({
        ...c,
        evidence_path: "cloudflare/" + c.evidence_path,
      })),
      parity: cloudflare.cloudflare.parity.map((p) => ({
        ...p,
        evidence_path: "cloudflare/" + p.evidence_path,
      })),
    };
    data.stages.push({
      id: "p13",
      name_en: "Actual local Worker, Queue and SQLite aggregation parity",
      name_ko: "실제 로컬 Worker·큐·SQLite 집계 비교",
      status: "PASS",
      evidence_path: "cloudflare/manifest.json",
      duration_ms: performance.now() - cloudflareStarted,
    });
    data.assertions.push(
      ...cloudflare.assertions.map((a) => ({
        ...a,
        evidence_path: "cloudflare/" + a.evidence_path,
      })),
    );
    if (
      Number(data.assertions.length) !== 390 ||
      data.assertions.some((a) => a.status !== "PASS")
    )
      throw Error("All390 cases required / 전체390개 통과 필요");
    requireGuidanceCases(client.navigation);
    data.navigation = client.navigation.map(a=>({...a,evidence_path:"client/"+a.evidence_path}));
    data.assertions.push(...data.navigation);
    data.stages.push({id:"nav01",name_en:"Native English/Korean turn guidance and browser boundaries",name_ko:"엔진 한영 회전 안내·브라우저 경계",status:"PASS",evidence_path:"client/guidance/assertions.json",duration_ms:0});
    if (Number(data.assertions.length) !== 406 || data.assertions.some(a=>a.status!=="PASS"))
      throw Error("All406 cases required / 전체406개 통과 필요");
    requireProgressCases(client.progress);
    data.progress=client.progress.map(a=>({...a,evidence_path:"client/"+a.evidence_path}));
    data.assertions.push(...data.progress);
    data.stages.push({id:"nav02",name_en:"Actual Seoul route progress and synthetic GPS replay",name_ko:"실제 서울 경로 진행·합성 GPS 재생",status:"PASS",evidence_path:"client/progress/assertions.json",duration_ms:0});
    if(Number(data.assertions.length)!==438||data.assertions.some(a=>a.status!=="PASS"))throw Error("All438 cases required / 전체438개 통과 필요");
    const publicStarted=performance.now();
    const publicSpeeds=await runPublicSpeedChecks(join(output,"seoul/graph"),join(output,"traffic/bundle"),join(output,"public-speeds"));
    verifyRegionalChild(join(output,"public-speeds"),verified,data.graph_id);
    requirePublicSpeedCases(publicSpeeds.assertions);
    data.assertions.push(...publicSpeeds.assertions.map(a=>({...a,evidence_path:"public-speeds/"+a.evidence_path})));
    data.stages.push({id:"public-speeds",name_en:"Public-source native refresh, expiry, recovery and durable withdrawal",name_ko:"공공 출처 엔진 갱신·만료·복구·영속 철회",
      status:"PASS",evidence_path:"public-speeds/manifest.json",duration_ms:performance.now()-publicStarted});
    if(Number(data.assertions.length)!==462||data.assertions.some(a=>a.status!=="PASS"))throw Error("All462 cases required / 전체462개 통과 필요");
    data.summary.assertions_passed = data.assertions.filter(
      (a) => a.status === "PASS",
    ).length;
    data.summary.assertions_total = data.assertions.length;
    data.limitations = data.limitations.map((item) => ({
      ...item,
      message_en: item.message_en.replace(
        "P05–P14 remain incomplete",
        "P14b delivery and geographic/production gates remain separate",
      ),
      message_ko: item.message_ko.replace(
        "P05~P14는 미완료",
        "P14b 반영·실제 지역/운영 기준은 별도입니다",
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
      "# Whole implemented-system pilot / 구현된 전체 파일럿\n\n" +
      `PASS: ${data.summary.assertions_passed}/${data.summary.assertions_total} assertions. / 전체 ${data.summary.assertions_total}개 중 ${data.summary.assertions_passed}개 통과.\n\n` +
      data.stages.map(s=>`- ${s.id}: ${s.name_en} / ${s.name_ko}\n`).join("") +
      "\nActual Seoul OSM; authored movement, traffic and provider-protocol faults. Actual agency acquisition/browser proof is separate. Geographic quality, device behavior and production gates remain open.\n실제 서울 OSM 위 자체 이동·교통·제공자 규격 장애 검사입니다. 실제 기관 수집/화면 근거는 별도이며 실도로 품질·단말·운영 기준은 남아 있습니다.\n",
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
    "nodes/manifest.json",
    "gateway/manifest.json",
    "client/manifest.json",
    "scenarios/manifest.json",
    "cloudflare/manifest.json",
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
