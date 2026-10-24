#!/usr/bin/env node
/** Independent read-only selected hosted P08 evidence inspection; never imports product validators.
 * 생산 검증기를 가져오지 않는 선별 원격 P08 근거의 독립 읽기 전용 검사입니다.
 * Usage / 사용법: node data/inspect-p08-hosted.mjs ROOT GRAPH_DIRECTORY [--output OUTSIDE_ROOT.json]
 * Exit / 종료: 0 all required checks passed / 전체 통과; 1 incomplete or invalid evidence / 누락·부적합; 2 input error / 입력 오류.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const CASES = [
  "authored-source",
  "http-matched-timing",
  "no-neighbor-contributions",
  "three-live-medians",
  "signed-http-acceptance",
  "blank-bundle",
  "exact-compiled-bytes",
  "identical-retry",
  "generation-concurrency",
  "generation-precommit-kill",
  "generation-postcommit-kill",
  "corrupt-bundle",
  "truncated-cache",
  "baseline-route",
  "live-detour",
  "restart-cache",
  "publisher-outage",
  "accepted-key-revoked",
  "database-outage",
  "database-restart",
  "engine-unavailable",
  "superseded-compile",
  "http-revoked-correction",
  "offline-ttl",
  "new-empty-window",
  "before-expiry",
  "exact-expiry",
  "route-result-expiry",
  "compile-selection-expiry",
  "clock-only-baseline",
  "public-privacy",
  "owned-cleanup",
].map((x) => "p08-" + x);
const TARGETS = [
  {
    label: "west",
    start: [127.036993, 37.500712],
    end: [127.037245, 37.50079],
  },
  {
    label: "middle",
    start: [127.037245, 37.50079],
    end: [127.03768, 37.500924],
  },
  { label: "east", start: [127.03768, 37.500924], end: [127.038474, 37.50117] },
];
const POLICY = "valhalla-current-v1",
  RADIUS = 6371008.8,
  MAX_ARCHIVE = 512 * 1024 * 1024;
const checks = [],
  limitations = [
    "This is an offline byte/state-record audit, not an independent real-road accuracy or map-legality certification. / 오프라인 바이트·저장기록 감사이며 독립 실도로 정확도·지도 통행 합법성 인증이 아닙니다.",
    "Archived process/SQL/HTTP records cannot independently attest that the recorder was honest. No current-host PID/Docker/DB queries are performed. / 보존 기록 자체로 기록자의 정직성을 독립 보장하지 않으며 현재 호스트 PID·Docker·DB는 조회하지 않습니다.",
    "P05 source inspection omits persisted trip_activity; explicit TRAVEL is checked in authored expectations, not asserted as an independent SQL activity read-back. / P05 조회에 영속 trip_activity가 없어 합성 기대값의 TRAVEL만 검사하며 독립 SQL 활동 조회로 주장하지 않습니다.",
  ];
function need(ok, message) {
  if (!ok) throw Error(message);
}
function equal(a, b, message) {
  need(stable(a) === stable(b), message);
}
function near(a, b, tolerance, message) {
  need(
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance,
    message + ` (${a} vs ${b}, tol ${tolerance})`,
  );
}
function keys(value, expected, message) {
  need(value && typeof value === "object" && !Array.isArray(value), message);
  equal(Object.keys(value).sort(), [...expected].sort(), message);
}
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function hashFile(path) {
  const fd = openSync(path, "r"),
    h = createHash("sha256"),
    buf = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = readSync(fd, buf, 0, buf.length, null)))
      h.update(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return h.digest("hex");
}
function inside(base, path) {
  const r = relative(base, path);
  return (
    r === "" || (!isAbsolute(r) && r !== ".." && !r.startsWith(".." + sep))
  );
}
function safe(base, name) {
  need(
    typeof name === "string" &&
      name &&
      !isAbsolute(name) &&
      !name.includes("\\") &&
      !name.includes("\0") &&
      !name.split("/").some((p) => !p || p === "." || p === ".."),
    "Unsafe evidence path / 안전하지 않은 근거 경로",
  );
  let current = base;
  for (const p of name.split("/")) {
    current = join(current, p);
    need(
      !lstatSync(current).isSymbolicLink(),
      "Evidence symlink / 근거 심볼릭 링크: " + name,
    );
  }
  need(inside(base, current), "Evidence escaped root / 근거 범위 이탈");
  return current;
}
function bytes(base, name, limit = 64 * 1024 * 1024) {
  const p = safe(base, name),
    s = lstatSync(p);
  need(
    s.isFile() && s.size <= limit,
    "Missing/nonregular/oversized evidence / 누락·비일반·크기초과: " + name,
  );
  return readFileSync(p);
}
/** A small JSON grammar walk checks duplicate object keys before standard JSON.parse.
 * 표준 JSON.parse 전에 작은 문법 순회로 객체 키 중복을 검사합니다. */
function strictJSON(raw) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  let p = 0;
  const ws = () => {
    while (/[\t\r\n ]/.test(text[p] ?? "!")) p++;
  };
  const str = () => {
    const begin = p++;
    for (;;) {
      need(
        p < text.length,
        "Unterminated JSON string / 끝나지 않은 JSON 문자열",
      );
      const c = text[p++];
      if (c === '"') return JSON.parse(text.slice(begin, p));
      if (c === "\\") p++;
    }
  };
  const val = () => {
    ws();
    if (text[p] === "{") {
      p++;
      ws();
      const seen = new Set();
      if (text[p] === "}") {
        p++;
        return;
      }
      for (;;) {
        need(text[p] === '"', "JSON object key required / JSON 객체 키 필요");
        const k = str();
        need(!seen.has(k), "Duplicate JSON key / JSON 키 중복: " + k);
        seen.add(k);
        ws();
        need(text[p++] === ":", "JSON colon required / JSON 콜론 필요");
        val();
        ws();
        const c = text[p++];
        if (c === "}") return;
        need(c === ",", "JSON comma required / JSON 쉼표 필요");
        ws();
      }
    }
    if (text[p] === "[") {
      p++;
      ws();
      if (text[p] === "]") {
        p++;
        return;
      }
      for (;;) {
        val();
        ws();
        const c = text[p++];
        if (c === "]") return;
        need(c === ",", "JSON array comma required / JSON 배열 쉼표 필요");
      }
    }
    if (text[p] === '"') {
      str();
      return;
    }
    const match =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(p),
      );
    need(match, "Invalid JSON token / 잘못된 JSON 토큰");
    p += match[0].length;
  };
  val();
  ws();
  need(p === text.length, "Trailing JSON bytes / JSON 뒤 추가 바이트");
  return JSON.parse(text);
}
function json(base, name) {
  return strictJSON(bytes(base, name));
}
function tree(base, prefix = "") {
  const all = [];
  for (const n of readdirSync(prefix ? join(base, prefix) : base).sort()) {
    const r = prefix ? prefix + "/" + n : n,
      p = safe(base, r),
      s = lstatSync(p);
    if (s.isDirectory()) all.push(...tree(base, r));
    else {
      need(s.isFile(), "Nonregular evidence / 비일반 근거: " + r);
      all.push(r);
    }
  }
  return all.sort();
}
function iso(s) {
  need(
    typeof s === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
      new Date(s).toISOString() === s,
    "Invalid UTC timestamp / 잘못된 UTC 시각",
  );
  return Date.parse(s);
}
function byteObject(value) {
  if (value?.type === "Buffer" && Array.isArray(value.data))
    return Buffer.from(value.data);
  need(
    value && typeof value === "object",
    "Missing original byte representation / 원바이트 표현 누락",
  );
  const k = Object.keys(value);
  equal(
    k,
    Array.from({ length: k.length }, (_, i) => String(i)),
    "Noncontiguous byte-object keys / 바이트 객체 키 불연속",
  );
  need(
    Object.values(value).every(
      (v) => Number.isInteger(v) && v >= 0 && v <= 255,
    ),
    "Invalid byte-object value / 잘못된 바이트 객체 값",
  );
  return Buffer.from(Object.values(value));
}
function section(id, fn) {
  try {
    const detail = fn();
    checks.push({ id, status: "PASS", detail: detail ?? null });
  } catch (error) {
    checks.push({
      id,
      status: "FAIL",
      message: String(error?.message ?? error),
    });
  }
}
function dist(a, b) {
  const rad = Math.PI / 180,
    p = a[1] * rad,
    q = b[1] * rad,
    h =
      Math.sin((q - p) / 2) ** 2 +
      Math.cos(p) * Math.cos(q) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return (
    2 *
    RADIUS *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
function lineLength(line) {
  return line.slice(1).reduce((sum, b, i) => sum + dist(line[i], b), 0);
}
function midpointPosition(line, d) {
  let left = d;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      length = dist(a, b);
    if (left <= length || i === line.length - 1) {
      const f = Math.max(0, Math.min(1, left / length)),
        rad = Math.PI / 180,
        cart = (p) => [
          Math.cos(p[1] * rad) * Math.cos(p[0] * rad),
          Math.cos(p[1] * rad) * Math.sin(p[0] * rad),
          Math.sin(p[1] * rad),
        ],
        x = cart(a),
        y = cart(b),
        angle = length / RADIUS;
      if (angle < 1e-14) return a;
      const s = Math.sin(angle),
        v = x.map(
          (n, j) =>
            (n * Math.sin((1 - f) * angle)) / s +
            (y[j] * Math.sin(f * angle)) / s,
        );
      return [
        Math.atan2(v[1], v[0]) / rad,
        Math.atan2(v[2], Math.hypot(v[0], v[1])) / rad,
      ];
    }
    left -= length;
  }
  throw Error("Empty geometry / 빈 지형");
}
function timeAt(vehicle, d) {
  let t = vehicle.departure_ms,
    left = d;
  for (const p of vehicle.speed_profile) {
    need(
      p.duration_ms > 0 && p.speed_mps > 0,
      "Invalid authored speed profile / 합성 속도 형식 오류",
    );
    const travel = (p.duration_ms * p.speed_mps) / 1000;
    if (left <= travel + 1e-10) return t + (left / p.speed_mps) * 1000;
    left -= travel;
    t += p.duration_ms;
  }
  throw Error("Authored distance exceeds profile / 합성 거리가 속도 설정 초과");
}
function distanceAt(vehicle, t) {
  let elapsed = Math.max(0, t - vehicle.departure_ms),
    sum = 0;
  for (const p of vehicle.speed_profile) {
    const step = Math.min(elapsed, p.duration_ms);
    sum += (step * p.speed_mps) / 1000;
    elapsed -= step;
    if (elapsed <= 0) break;
  }
  return sum;
}
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  need(s.length > 0, "Empty median / 빈 중앙값");
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
function b64(s) {
  need(
    typeof s === "string" && /^[A-Za-z0-9_-]+$/.test(s),
    "Invalid base64url / 잘못된 base64url",
  );
  const b = Buffer.from(s, "base64url");
  need(
    b.toString("base64url") === s,
    "Noncanonical base64url / 정규형이 아닌 base64url",
  );
  return b;
}
function tileBase(path) {
  need(
    /^[0-2]\/(?:\d{3}\/)*\d{3}\.gph$/.test(path),
    "Bad graph tile path / 그래프 타일 경로 오류",
  );
  const [level, ...parts] = path.split("/"),
    tile = Number(parts.join("").replace(/\.gph$/, "")),
    id = tile * 8 + Number(level);
  need(id < 2 ** 25, "Graph tile ID overflow / 타일 ID 초과");
  return id;
}
function octal(b) {
  const s = b.toString("ascii").replace(/\0.*$/s, "").trim();
  need(/^[0-7]+$/.test(s), "Invalid TAR octal / 잘못된 TAR 팔진수");
  return parseInt(s, 8);
}
function parseTrafficTar(b, tiles, catalog) {
  need(
    b.length <= MAX_ARCHIVE && b.length % 512 === 0,
    "Archive size / 아카이브 크기",
  );
  const tar = [];
  let cursor = 0;
  while (cursor + 512 <= b.length) {
    const h = b.subarray(cursor, cursor + 512);
    if (h.every((x) => x === 0)) break;
    const sum = h.reduce((s, v, i) => s + (i >= 148 && i < 156 ? 32 : v), 0);
    need(
      octal(h.subarray(148, 156)) === sum &&
        h[156] === 48 &&
        h.subarray(257, 263).toString() === "ustar\0" &&
        h.subarray(345, 500).every((x) => x === 0),
      "Invalid regular TAR header/checksum / 일반 TAR 헤더·검사합 오류",
    );
    const name = h.subarray(0, 100).toString("ascii").replace(/\0.*$/s, ""),
      size = octal(h.subarray(124, 136)),
      offset = cursor + 512;
    need(offset + size <= b.length, "TAR member bounds / TAR 멤버 범위");
    tar.push({ name, size, offset });
    cursor = offset + Math.ceil(size / 512) * 512;
  }
  need(
    b.length - cursor >= 1024 && b.subarray(cursor).every((x) => x === 0),
    "TAR ending missing / TAR 끝 누락",
  );
  const first = tar.shift();
  need(
    first?.name === "index.bin" &&
      first.offset === 512 &&
      first.size === 16 * tiles.length,
    "First index.bin contract / 첫 index.bin 계약",
  );
  equal(
    tar.map((t) => t.name).sort(),
    [...tiles].sort(),
    "Complete graph membership / 전체 타일 목록",
  );
  const members = [],
    seen = new Set();
  for (let p = 512; p < 512 + first.size; p += 16) {
    const big = b.readBigUInt64LE(p);
    need(
      big <= BigInt(Number.MAX_SAFE_INTEGER),
      "Offset precision / 위치 정밀도",
    );
    const offset = Number(big),
      base = b.readUInt32LE(p + 8),
      size = b.readUInt32LE(p + 12),
      entry = tar.find((t) => t.offset === offset);
    need(
      entry &&
        entry.size === size &&
        tileBase(entry.name) === base &&
        !seen.has(base),
      "Index/member identity / 목록·멤버 식별",
    );
    seen.add(base);
    need(
      size >= 32 &&
        b.readBigUInt64LE(offset) === BigInt(base) &&
        b.readBigUInt64LE(offset + 8) === 0n &&
        b.readUInt32LE(offset + 20) === 3 &&
        b.readUInt32LE(offset + 24) === 0 &&
        b.readUInt32LE(offset + 28) === 0,
      "Header32/version3/timestamp / 헤더32·버전3·시각",
    );
    const count = b.readUInt32LE(offset + 16);
    need(size === 32 + count * 8, "Speed8/member count / 속도8·멤버 개수");
    members.push({ base, offset, size, count });
  }
  members.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < members.length; i++)
    need(
      members[i].offset >= members[i - 1].offset + members[i - 1].size,
      "Overlapping records / 기록 겹침",
    );
  for (const c of catalog) recordOffset(members, c.edge_id);
  return members;
}
function recordOffset(members, id) {
  need(/^(0|[1-9]\d*)$/.test(id), "Invalid packed edge ID / 잘못된 구간 ID");
  const n = BigInt(id),
    base = Number(n & ((1n << 25n) - 1n)),
    index = n >> 25n,
    m = members.find((m) => m.base === base);
  need(
    m && index < BigInt(m.count),
    "Catalog edge outside archive / 목록 구간 범위초과",
  );
  return m.offset + 32 + Number(index) * 8;
}
function rawEngineJSON(b) {
  const s = b.toString("utf8");
  try {
    return strictJSON(b);
  } catch {}
  for (const line of s.trim().split("\n").reverse())
    if (line.trim().startsWith("{")) {
      try {
        return strictJSON(Buffer.from(line));
      } catch {}
    }
  throw Error("No original engine JSON / 원 엔진 JSON 누락");
}

let ROOT, GRAPH, OUTPUT;
try {
  const a = process.argv.slice(2);
  need(
    a.length >= 2,
    "ROOT GRAPH_DIRECTORY required / ROOT GRAPH_DIRECTORY 필요",
  );
  ROOT = realpathSync(resolve(a.shift()));
  GRAPH = realpathSync(resolve(a.shift()));
  while (a.length) {
    const option = a.shift();
    if (option === "--output") {
      need(a.length, "--output requires path / 출력 경로 필요");
      OUTPUT = resolve(a.shift());
    } else throw Error("Unknown option / 알 수 없는 옵션: " + option);
  }
  need(
    lstatSync(ROOT).isDirectory() && lstatSync(GRAPH).isDirectory(),
    "Real directories required / 실제 폴더 필요",
  );
  if (OUTPUT) {
    need(
      !inside(ROOT, OUTPUT),
      "Output must be outside ROOT / 출력은 ROOT 밖이어야 함",
    );
    let parent = dirname(OUTPUT);
    while (!existsSync(parent)) parent = dirname(parent);
    need(
      !inside(ROOT, realpathSync(parent)),
      "Output resolves into ROOT / 출력이 ROOT 내부를 가리킴",
    );
    need(
      existsSync(dirname(OUTPUT)) && !existsSync(OUTPUT),
      "Output parent must exist and output must be new / 출력 부모가 존재하고 출력 파일은 새 경로여야 함",
    );
  }
} catch (error) {
  process.stderr.write(String(error?.message ?? error) + "\n");
  process.exitCode = 2;
}

if (process.exitCode !== 2) {
  const ctx = {};
  section("complete-manifest-and-all-output-hashes", () => {
    const m = json(ROOT, "manifest.json");
    need(
      m.status === "PASS" && m.cleanup_verified === true,
      "Successful completed manifest required / 성공 완료 명세 필요",
    );
    need(
      !existsSync(join(ROOT, "failure.json")),
      "Failure marker remains / 실패 표식 잔존",
    );
    need(
      m.output_sha256 && Object.keys(m.output_sha256).length > 0,
      "No output hash inventory / 출력 해시 목록 없음",
    );
    const files = tree(ROOT).filter(
      (p) => p !== "manifest.json" && p !== "manifest.json.tmp",
    );
    const omitted = ["bundle/graph.tar", "negative/corrupt-bundle/graph.tar"];
    const declared = Object.keys(m.output_sha256).sort();
    equal(
      declared.filter((p) => !files.includes(p)),
      omitted.sort(),
      "Exactly two declared P08 graph extracts may be omitted / P08선언추출파일2개만제외허용",
    );
    equal(
      files.filter((p) => !declared.includes(p)),
      [],
      "Unexpected hosted P08 output files / 예상밖원격P08파일",
    );
    ctx.omissions = omitted.map((path) => {
      const declared_sha256 = m.output_sha256[path];
      need(
        /^[a-f0-9]{64}$/.test(declared_sha256),
        "Omitted root file needs manifest hash / 제외원본파일명세해시필요",
      );
      return {
        scope: "ROOT",
        path,
        declared_sha256,
        actual_bytes_verified: false,
      };
    });
    for (const p of files) {
      need(
        /^[a-f0-9]{64}$/.test(m.output_sha256[p]),
        "Invalid output hash / 출력 해시 오류: " + p,
      );
      need(
        hashFile(safe(ROOT, p)) === m.output_sha256[p],
        "Output hash differs / 출력 해시 불일치: " + p,
      );
    }
    ctx.manifest = m;
    ctx.files = files;
    return { files: files.length };
  });
  section("independent-graph-identity-and-original-catalog", () => {
    const g = json(GRAPH, "manifest.json");
    need(
      g.status === "PASS" &&
        g.graph_loaded &&
        g.engine_executed &&
        g.cleanup_verified,
      "Graph proof incomplete / 그래프 증거 미완료",
    );
    const files = tree(GRAPH).filter((p) => p !== "manifest.json");
    const tilePaths = Object.keys(g.tile_sha256).sort();
    need(
      tilePaths.length === 14,
      "Expected exactly14 pinned graph tiles / 고정그래프타일정확14개필요",
    );
    const omitted = [
      "seoul.osm.pbf",
      ...tilePaths.map((p) => "tiles/" + p),
    ].sort();
    const declared = Object.keys(g.files_sha256).sort();
    equal(
      declared.filter((p) => !files.includes(p)),
      omitted,
      "Only source PBF and14 declared tiles may be omitted / 원본PBF·선언타일14개만제외허용",
    );
    equal(
      files.filter((p) => !declared.includes(p)),
      [],
      "Unexpected hosted graph file / 예상밖원격그래프파일",
    );
    for (const path of omitted) {
      const declared_sha256 = g.files_sha256[path];
      need(
        /^[a-f0-9]{64}$/.test(declared_sha256),
        "Omitted graph file needs manifest hash / 제외지도파일명세해시필요",
      );
      if (path === "seoul.osm.pbf")
        need(
          declared_sha256 === g.pbf_sha256,
          "Declared PBF hash binding / 선언PBF해시연결",
        );
      else
        need(
          declared_sha256 === g.tile_sha256[path.slice(6)],
          "Declared tile hash binding / 선언타일해시연결",
        );
      ctx.omissions.push({
        scope: "GRAPH",
        path,
        declared_sha256,
        actual_bytes_verified: false,
      });
    }
    need(
      ctx.omissions.length === 17,
      "Exactly17 intentional omissions / 정확17개제외",
    );
    for (const p of files)
      need(
        hashFile(safe(GRAPH, p)) === g.files_sha256[p],
        "Graph hash mismatch / 그래프 해시 불일치: " + p,
      );
    const identity = {
      source_lock_sha256: g.source_lock_sha256,
      source_sha256: g.map_source.sha256,
      pbf_sha256: g.pbf_sha256,
      config_sha256: g.config_sha256,
      image: g.image,
      engine: g.engine,
      tile_sha256: g.tile_sha256,
    };
    need(
      hash(Buffer.from(stable(identity))) === g.graph_id,
      "Graph identity mismatch / 그래프 식별 불일치",
    );
    equal(
      ctx.manifest.graph_id,
      g.graph_id,
      "Evidence graph mismatch / 근거 지도 불일치",
    );
    need(
      hashFile(safe(GRAPH, "manifest.json")) ===
        ctx.manifest.graph_manifest_sha256,
      "Graph manifest hash / 그래프 명세 해시",
    );
    const map = json(GRAPH, "edge-map.json"),
      catalog = json(ROOT, "catalog.json");
    need(
      map.length === 79 && catalog.length === 79,
      "Expected catalog79 / 목록79 필요",
    );
    for (const c of catalog) {
      const matches = map.filter(
        (e) => e.edge_id === c.edge_id && e.forward === c.forward,
      );
      need(
        matches.length === 1 && matches[0].car_access,
        "Unique directed car geometry / 고유 자동차 방향 지형",
      );
      near(
        c.distance_m,
        lineLength(matches[0].directed_geometry),
        1e-7,
        "Independent catalog sphere length / 독립 구면거리",
      );
    }
    need(
      new Set(catalog.map((c) => c.edge_id + ":" + c.forward)).size === 79,
      "Duplicate catalog / 목록 중복",
    );
    ctx.graph = g;
    ctx.edgeMap = map;
    ctx.catalog = catalog;
    return { graph_id: g.graph_id, edges: map.length };
  });
  section(
    "authored-spec-fulltruth-observations-and-independent-kinematics",
    () => {
      const ex = json(ROOT, "expected.json"),
        spec = json(ROOT, "synthetic-scenario.json"),
        truth = json(ROOT, "synthetic-full-truth.json"),
        obs = json(ROOT, "synthetic-observations.json");
      need(
        ex.calculated_before_matching === true &&
          ex.trips.length === 15 &&
          ex.targets.length === 3,
        "Authored expectations missing / 합성 기대값 누락",
      );
      need(
        ex.timing_tolerance_ms === 150 &&
          ex.speed_relative_tolerance === 0.02 &&
          ex.expected_live_count === 3 &&
          ex.contributors_per_target === 5 &&
          ex.encoded_kmh === 2 &&
          ex.detour_minimum_distance_m === 50 &&
          ex.detour_minimum_eta_s === 5,
        "Acceptance thresholds changed / 완료기준 변경",
      );
      need(
        spec.graph_id === ctx.graph.graph_id &&
          spec.duration_ms === 240000 &&
          spec.sample_interval_ms === 500 &&
          spec.vehicles.length === 15,
        "Fixed source spec / 고정 원본 계약",
      );
      need(
        new Set(ex.trips.map((t) => t.contributor_id)).size === 15 &&
          new Set(ex.trips.map((t) => t.trip_id)).size === 15 &&
          new Set(spec.vehicles.map((v) => v.vehicle_id)).size === 15,
        "Unique authored identities / 합성 식별자 고유성",
      );
      for (const target of TARGETS) {
        const found = ctx.edgeMap.filter(
          (e) =>
            e.osm_way_id === 919983793 &&
            e.car_access &&
            e.directed_geometry[0].every(
              (v, i) => Math.abs(v - target.start[i]) <= 1e-7,
            ) &&
            e.directed_geometry
              .at(-1)
              .every((v, i) => Math.abs(v - target.end[i]) <= 1e-7),
        );
        need(
          found.length === 1,
          "Fixed source geometry drift / 고정 원본 지형 변경",
        );
        const selected = ex.targets.find((e) => e.label === target.label);
        need(
          selected?.edge_id === found[0].edge_id &&
            selected.forward === found[0].forward,
          "Wrong fixed target / 고정 대상 불일치",
        );
      }
      equal(
        [...new Set(obs.map((o) => o.vehicle_id))].sort(),
        ex.trips.map((e) => e.vehicle_id).sort(),
        "No extra observation vehicles / 추가관측차량없음",
      );
      const starts = iso(spec.start_time_utc);
      need(
        iso(ex.window_start) === starts + 180000 &&
          iso(ex.window_end) === starts + 240000 &&
          iso(ex.finalize_at) === starts + 270000 &&
          iso(ex.valid_until) === starts + 420000,
        "Window/expiry changed / 시간창·만료 변경",
      );
      let coordinateMax = 0,
        truthSamples = 0;
      for (const trip of ex.trips) {
        const v = spec.vehicles.find((v) => v.vehicle_id === trip.vehicle_id);
        need(
          v &&
            v.noise_radius_m === 0 &&
            v.drop_intervals.length === 0 &&
            trip.trip_activity === "TRAVEL",
          "Authored TRAVEL/clean input / TRAVEL·잡음없는 입력",
        );
        const edges = v.path.map((p) => {
          const matches = ctx.edgeMap.filter(
            (e) => e.label === p.label && e.forward === p.forward,
          );
          need(matches.length === 1, "Path geometry missing / 경로 지형 누락");
          return matches[0];
        });
        need(
          edges.length === 3 &&
            edges[1].edge_id === trip.target.edge_id &&
            edges[0].edge_id === trip.predecessor_edge_id &&
            edges[2].edge_id === trip.successor_edge_id,
          "Authored context path / 합성 문맥 경로",
        );
        const lengths = edges.map((e) => lineLength(e.directed_geometry)),
          entry = timeAt(v, lengths[0]),
          exit = timeAt(v, lengths[0] + lengths[1]),
          arrival = timeAt(
            v,
            lengths.reduce((a, b) => a + b, 0),
          );
        near(trip.entered_at_ms, entry, 1e-6, "Independent entry / 독립 진입");
        near(trip.exited_at_ms, exit, 1e-6, "Independent exit / 독립 진출");
        near(
          trip.duration_s,
          (exit - entry) / 1000,
          1e-9,
          "Independent duration / 독립 시간",
        );
        near(
          trip.expected_average_speed_mps,
          lengths[1] / trip.duration_s,
          1e-10,
          "Independent average / 독립 평균",
        );
        need(
          Math.abs(trip.expected_average_speed_mps / trip.speed_mps - 1) <
            0.0001,
          "Authored average drift / 합성 평균 변경",
        );
        const full = truth.traversals.filter(
          (t) => t.vehicle_id === v.vehicle_id,
        );
        need(
          full.length === 3,
          "Full truth context count / 전체 정답 문맥 개수",
        );
        let d = 0;
        for (let i = 0; i < 3; i++) {
          const rows = full.filter(
            (t) =>
              t.edge_id === edges[i].edge_id && t.forward === edges[i].forward,
          );
          need(
            rows.length === 1,
            "Truth directed-edge identity / 정답 방향 구간",
          );
          const t = rows[0];
          near(t.distance_m, lengths[i], 1e-7, "Truth length / 정답 길이");
          near(
            t.entered_at_ms,
            timeAt(v, d),
            1.000001,
            "Truth entry within1ms simulator rounding / 정답 진입1ms이내반올림",
          );
          d += lengths[i];
          near(
            t.exited_at_ms,
            timeAt(v, d),
            1.000001,
            "Truth exit within1ms simulator rounding / 정답 진출1ms이내반올림",
          );
        }
        const samples = truth.samples
            .filter((s) => s.vehicle_id === v.vehicle_id)
            .sort((a, b) => a.offset_ms - b.offset_ms),
          offsets = [];
        for (let t = v.departure_ms; t <= Math.ceil(arrival); t += 500)
          offsets.push(t);
        if (offsets.at(-1) !== Math.ceil(arrival))
          offsets.push(Math.ceil(arrival));
        equal(
          samples.map((s) => s.offset_ms),
          offsets,
          "Full truth sampling schedule / 전체 정답 표본 간격",
        );
        truthSamples += samples.length;
        for (const s of samples) {
          need(
            s.sample_id ===
              `${spec.simulation_id}:${v.vehicle_id}:${s.offset_ms}` &&
              iso(s.event_time_utc) === starts + s.offset_ms,
            "Sample identity/time / 표본 식별·시각",
          );
          const traveled = Math.min(
            d,
            distanceAt(v, Math.min(s.offset_ms, arrival)),
          );
          let begin = 0,
            index = 0;
          while (index < 2 && traveled >= begin + lengths[index] - 1e-9) {
            begin += lengths[index];
            index++;
          }
          need(
            s.edge_id === edges[index].edge_id,
            "Truth sample edge / 정답 표본 구간",
          );
          const p = midpointPosition(
              edges[index].directed_geometry,
              traveled - begin,
            ),
            error = dist(p, [s.longitude, s.latitude]);
          coordinateMax = Math.max(coordinateMax, error);
          need(
            error < 0.001,
            "Truth source coordinate inconsistent / 정답 원본 좌표 불일치",
          );
        }
        const clipped = samples.filter(
            (s) =>
              s.offset_ms >= trip.observation_start_ms &&
              s.offset_ms <= trip.observation_end_ms,
          ),
          actual = obs
            .filter((s) => s.vehicle_id === v.vehicle_id)
            .sort((a, b) => a.offset_ms - b.offset_ms);
        near(
          trip.observation_start_ms,
          entry - 1600,
          1e-6,
          "Eight-meter context start / 8m문맥 시작",
        );
        near(
          trip.observation_end_ms,
          exit + 1600,
          1e-6,
          "Eight-meter context end / 8m문맥 끝",
        );
        equal(
          actual.map((s) => s.sample_id),
          clipped.map((s) => s.sample_id),
          "Clipped observation IDs / 잘린 관측 식별",
        );
        for (let i = 0; i < actual.length; i++) {
          const a = actual[i],
            t = clipped[i];
          keys(
            a,
            [
              "sample_id",
              "vehicle_id",
              "offset_ms",
              "event_time_utc",
              "longitude",
              "latitude",
              "accuracy_m",
              "source_class",
            ],
            "Matcher input must not carry truth IDs / 매칭 입력에 정답 ID 금지",
          );
          for (const key of [
            "sample_id",
            "vehicle_id",
            "offset_ms",
            "event_time_utc",
            "longitude",
            "latitude",
          ])
            equal(
              a[key],
              t[key],
              "Observation/truth mismatch / 관측·정답 불일치",
            );
          need(
            a.accuracy_m === 0.01 && a.source_class === "SYNTHETIC",
            "Observation metadata / 관측 정보",
          );
        }
      }
      need(
        truth.traversals.length === 45 &&
          truthSamples === truth.samples.length &&
          new Set(obs.map((o) => o.sample_id)).size === obs.length,
        "Extra truth/observations / 추가 정답·관측",
      );
      for (const t of ex.targets)
        equal(
          ex.trips
            .filter((e) => e.target.edge_id === t.edge_id)
            .map((e) => e.speed_mps)
            .sort(),
          [0.4, 0.45, 0.5, 0.55, 0.6],
          "Five authored speeds / 합성 속도5개",
        );
      ctx.expected = ex;
      ctx.spec = spec;
      ctx.truth = truth;
      ctx.observations = obs;
      return {
        trips: 15,
        full_traversals: 45,
        samples: truthSamples,
        clipped_samples: obs.length,
        max_coordinate_error_m: coordinateMax,
      };
    },
  );
  section("actual-http-p05-storage-targets-and-matcher-inputs", () => {
    const db = json(ROOT, "readbacks/source-db.json"),
      http = json(ROOT, "readbacks/source-http.json"),
      ex = ctx.expected,
      start = iso(ctx.spec.start_time_utc);
    need(
      db.trips.length === 15 &&
        db.traversals.length === 15 &&
        db.counts.trips === 15 &&
        db.counts.traversals === 15 &&
        db.counts.samples === ctx.observations.length,
      "P05 source counts / P05 원본 개수",
    );
    need(
      http.length === db.counts.batches &&
        new Set(http.map((r) => r.batch_id)).size === http.length,
      "HTTP batch inventory / HTTP 배치 목록",
    );
    let previous = -Infinity,
      maxBoundaryError = 0;
    for (const r of http) {
      need(
        r.status === 202 &&
          r.body.code === "ACCEPTED" &&
          iso(r.checked_at_event_time) >= previous,
        "Actual HTTP accepted/monotonic clock / 실제 HTTP 접수·단조시계",
      );
      previous = iso(r.checked_at_event_time);
      const e = ex.trips.find((e) => e.vehicle_id === r.vehicle_id);
      need(
        e && r.body.trip_id === e.trip_id,
        "HTTP vehicle/trip identity / HTTP 차량·여행 식별",
      );
    }
    for (const e of ex.trips) {
      const trips = db.trips.filter(
          (t) =>
            t.trip_id === e.trip_id &&
            t.contributor_id === e.contributor_id &&
            t.vehicle_id === e.vehicle_id,
        ),
        rows = db.traversals.filter(
          (t) =>
            t.trip_id === e.trip_id && t.contributor_id === e.contributor_id,
        );
      need(
        trips.length === 1 &&
          trips[0].state === "SUCCEEDED" &&
          trips[0].attempt === 1 &&
          String(trips[0].fence) === "1" &&
          trips[0].raw_payload_count === 0,
        "P05 successful distinct fenced trip / 성공한 고유 P05 여행",
      );
      need(
        rows.length === 1 &&
          rows[0].edge_id === e.target.edge_id &&
          rows[0].forward === e.target.forward &&
          rows[0].graph_id === ctx.graph.graph_id &&
          rows[0].source_class === "SYNTHETIC" &&
          rows[0].matching_policy === "seoul-observed-v3",
        "Exactly one target and no neighboring contribution / 대상1개·이웃기여0",
      );
      const row = rows[0],
        entryError = Math.abs(
          iso(row.entered_at_utc) - start - e.entered_at_ms,
        ),
        exitError = Math.abs(iso(row.exited_at_utc) - start - e.exited_at_ms);
      need(
        entryError <= 150 && exitError <= 150,
        "P05 independent150ms boundary / P05 독립150ms경계",
      );
      maxBoundaryError = Math.max(maxBoundaryError, entryError, exitError);
      near(
        row.duration_s,
        (iso(row.exited_at_utc) - iso(row.entered_at_utc)) / 1000,
        1e-9,
        "Stored duration/time consistency / 저장 시간 일치",
      );
      near(
        row.distance_m,
        e.target.distance_m,
        1e-7,
        "Stored target distance / 저장 대상 거리",
      );
      need(
        iso(row.exited_at_utc) >= iso(ex.window_start) &&
          iso(row.exited_at_utc) < iso(ex.window_end),
        "Target exit outside same window / 대상 진출 시간창 이탈",
      );
      const observations = ctx.observations.filter(
          (o) => o.vehicle_id === e.vehicle_id,
        ),
        receipts = http.filter((r) => r.vehicle_id === e.vehicle_id);
      need(
        receipts.length === trips[0].batch_count &&
          receipts.at(-1).body.state === "READY" &&
          receipts.at(-1).body.sample_count === observations.length &&
          trips[0].sample_count === observations.length,
        "HTTP final ready/samples / HTTP 최종READY·표본",
      );
    }
    for (const t of ex.targets)
      need(
        new Set(
          db.traversals
            .filter((r) => r.edge_id === t.edge_id && r.forward === t.forward)
            .map((r) => r.contributor_id),
        ).size === 5,
        "Five distinct stored contributors / 영속 기여자5명",
      );
    const manifests = (ctx.files ?? tree(ROOT)).filter((p) =>
      /^synthetic-engine\/[^/]+\/manifest\.json$/.test(p),
    );
    need(
      manifests.length === 15,
      "Fifteen actual matcher manifests required / 실제 매칭 명세15개 필요",
    );
    const seenVehicles = new Set();
    for (const p of manifests) {
      const m = json(ROOT, p),
        dir = dirname(p),
        input = json(ROOT, dir + "/input.json");
      need(
        m.status === "PASS" &&
          m.graph_id === ctx.graph.graph_id &&
          m.graph_manifest_sha256 === ctx.manifest.graph_manifest_sha256,
        "Matcher source graph binding / 매칭 원본 지도 연결",
      );
      equal(
        m.source,
        ctx.manifest.source,
        "Matcher source identity / 매칭 소스 식별",
      );
      const vehicles = [
        ...new Set(input.observations.map((o) => o.vehicle_id)),
      ];
      need(
        vehicles.length === 1 && !seenVehicles.has(vehicles[0]),
        "Distinct matcher vehicle / 고유 매칭 차량",
      );
      seenVehicles.add(vehicles[0]);
      equal(
        input.observations,
        ctx.observations
          .filter((o) => o.vehicle_id === vehicles[0])
          .sort((a, b) => a.offset_ms - b.offset_ms),
        "Exact real matcher observation bytes as JSON / 실제 매칭 입력 관측의 정확한 JSON 일치",
      );
    }
    ctx.sourceDB = db;
    return {
      http_batches: http.length,
      stored_targets: 15,
      other_contributions: 0,
      contributors_per_target: 5,
      max_boundary_error_ms: maxBoundaryError,
    };
  });
  section("independent-duration-median-and-original-sphere-geometry", () => {
    const c = json(ROOT, "readbacks/candidate.json");
    need(
      c.code === "FINALIZED" && c.draft.entries.length === 79,
      "Complete finalized candidate / 전체 마감 후보",
    );
    need(
      c.canonical_sha256 === hash(Buffer.from(stable(c.draft))),
      "Candidate canonical hash / 후보 정규해시",
    );
    const lives = c.draft.entries.filter((e) => e.status === "LIVE");
    need(lives.length === 3, "Exactly3 LIVE / 정확히LIVE3개");
    const diagnostics = [];
    for (const target of ctx.expected.targets) {
      const rows = ctx.sourceDB.traversals.filter(
          (r) => r.edge_id === target.edge_id && r.forward === target.forward,
        ),
        duration = median(rows.map((r) => r.duration_s)),
        geometry = ctx.edgeMap.find(
          (e) => e.edge_id === target.edge_id && e.forward === target.forward,
        ),
        length = lineLength(geometry.directed_geometry),
        speed = length / duration,
        entry = lives.find(
          (e) => e.edge_id === target.edge_id && e.forward === target.forward,
        ),
        selection = c.selections.find(
          (e) => e.edge_id === target.edge_id && e.forward === target.forward,
        );
      need(
        rows.length === 5 && entry && selection?.eligible_contributors === 5,
        "Five matching median contributors / 중앙값 기여자5명",
      );
      near(
        entry.speed_mps,
        Math.round(speed * 1e6) / 1e6,
        1e-12,
        "Independent rounded median speed / 독립 반올림 중앙값속도",
      );
      need(
        Math.abs(entry.speed_mps / 0.5 - 1) <= 0.02 &&
          entry.sample_bucket === "5-9",
        "Median speed/bucket bound / 중앙값속도·표본범위",
      );
      near(
        selection.median_duration_s,
        duration,
        1e-12,
        "Independent duration median / 독립 시간중앙값",
      );
      equal(
        [...selection.selected_observation_ids].sort(),
        rows.map((r) => r.observation_id).sort(),
        "Exact selected stored IDs / 선택 저장ID 일치",
      );
      diagnostics.push({
        edge_id: target.edge_id,
        length_m: length,
        median_duration_s: duration,
        speed_mps: speed,
      });
    }
    for (const e of c.draft.entries)
      if (
        !ctx.expected.targets.some(
          (t) => t.edge_id === e.edge_id && t.forward === e.forward,
        )
      )
        need(
          e.status === "UNKNOWN" &&
            e.speed_mps === null &&
            e.sample_bucket === null,
          "Unexpected other live/contribution / 다른실시간·기여",
        );
    ctx.candidate = c;
    return diagnostics;
  });
  section("node-standard-ed25519-original-jws-artifact-json-and-trust", () => {
    const roots = json(ROOT, "public/trust-roots.json");
    need(
      Array.isArray(roots) && roots.length > 0,
      "Public trust roots missing / 공개 신뢰키 누락",
    );
    for (const root of roots)
      need(
        root.public_jwk?.kty === "OKP" &&
          root.public_jwk.crv === "Ed25519" &&
          !("d" in root.public_jwk),
        "Public Ed25519 key only / 공개Ed25519키만허용",
      );
    const artifacts = readdirSync(safe(ROOT, "public"))
      .filter((n) => /^sequence-\d+\.json$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    equal(
      artifacts,
      ["sequence-1.json", "sequence-2.json", "sequence-3.json"],
      "All three original signed sequences required / 세원문서명순번필요",
    );
    const signed = [];
    for (const file of artifacts) {
      const artifact = bytes(ROOT, "public/" + file, 2097152),
        snapshot = strictJSON(artifact),
        jws = bytes(
          ROOT,
          "public/" + file.replace(".json", ".jws.txt"),
          65536,
        ).toString("utf8"),
        parts = jws.split(".");
      need(parts.length === 3, "Compact JWS required / 압축JWS필요");
      const header = strictJSON(b64(parts[0])),
        manifest = strictJSON(b64(parts[1])),
        signature = b64(parts[2]);
      keys(
        header,
        ["alg", "kid", "typ"],
        "Exact protected JWS header / 정확한보호헤더",
      );
      need(
        header.alg === "EdDSA" &&
          header.typ === "routelens-traffic-manifest+jws" &&
          signature.length === 64,
        "JWS algorithm/type/signature / JWS알고리즘·형식·서명",
      );
      const candidates = roots.filter((r) => r.kid === header.kid);
      need(candidates.length === 1, "Unique configured kid / 고유설정키");
      const root = candidates[0];
      need(
        verify(
          null,
          Buffer.from(parts[0] + "." + parts[1], "ascii"),
          createPublicKey({ key: root.public_jwk, format: "jwk" }),
          signature,
        ),
        "Node Ed25519 verification failed / Node Ed25519검증실패",
      );
      keys(
        manifest,
        [
          "schema_version",
          "simulation_namespace",
          "publisher_id",
          "graph_id",
          "region_id",
          "sequence",
          "window_start",
          "window_end",
          "published_at",
          "valid_until",
          "aggregation_policy",
          "traffic_snapshot_id",
          "byte_length",
          "media_type",
        ],
        "Exact manifest JSON fields / 정확한명세필드",
      );
      keys(
        snapshot,
        [
          "schema_version",
          "simulation_namespace",
          "publisher_id",
          "graph_id",
          "region_id",
          "sequence",
          "window_start",
          "window_end",
          "published_at",
          "valid_until",
          "aggregation_policy",
          "entries",
        ],
        "Exact snapshot fields / 정확한자료필드",
      );
      need(
        hash(artifact) === manifest.traffic_snapshot_id &&
          artifact.length === manifest.byte_length &&
          manifest.media_type === "application/json",
        "Exact signed artifact bytes / 서명된정확파일바이트",
      );
      for (const k of Object.keys(snapshot).filter((k) => k !== "entries"))
        equal(
          snapshot[k],
          manifest[k],
          "Artifact/manifest JSON equality / 파일·명세JSON일치",
        );
      need(
        manifest.graph_id === ctx.graph.graph_id &&
          manifest.region_id === "seoul-pilot-corridors-v1" &&
          manifest.aggregation_policy === "seoul-window-median-v1" &&
          manifest.schema_version === "0.1",
        "Snapshot scope / 자료범위",
      );
      need(
        root.publisher_id === manifest.publisher_id &&
          root.simulation_namespace === manifest.simulation_namespace &&
          root.region_id === manifest.region_id &&
          root.allowed_graph_ids.includes(manifest.graph_id) &&
          root.source_class === "SYNTHETIC" &&
          root.revoked === false,
        "Configured signature scope / 설정서명범위",
      );
      const published = iso(manifest.published_at),
        end = iso(manifest.window_end),
        until = iso(manifest.valid_until),
        start = iso(manifest.window_start);
      need(
        end - start === 60000 &&
          start % 60000 === 0 &&
          published >= end + 30000 &&
          until === end + 180000 &&
          published < until &&
          published >= iso(root.valid_from) &&
          published < iso(root.valid_until),
        "Signed time/key bounds / 서명시간·키경계",
      );
      need(
        snapshot.entries.length === ctx.catalog.length,
        "Full signed catalog / 전체서명목록",
      );
      equal(
        snapshot.entries.map((e) => e.edge_id + ":" + e.forward),
        [...ctx.catalog]
          .sort((a, b) =>
            a.edge_id < b.edge_id
              ? -1
              : a.edge_id > b.edge_id
                ? 1
                : Number(a.forward) - Number(b.forward),
          )
          .map((e) => e.edge_id + ":" + e.forward),
        "Exact sorted signed catalog / 정확한정렬서명목록",
      );
      for (const e of snapshot.entries) {
        keys(
          e,
          [
            "edge_id",
            "forward",
            "source_class",
            "status",
            "speed_mps",
            "sample_bucket",
          ],
          "Exact public edge fields / 정확한공개구간필드",
        );
        need(e.source_class === "SYNTHETIC", "Synthetic namespace / 합성영역");
        if (e.status === "LIVE")
          need(
            Number.isFinite(e.speed_mps) &&
              e.speed_mps > 0 &&
              ["5-9", "10-19", "20+"].includes(e.sample_bucket),
            "LIVE status/speed / LIVE상태·속도",
          );
        else
          need(
            ["UNKNOWN", "INSUFFICIENT", "STALE"].includes(e.status) &&
              e.speed_mps === null &&
              e.sample_bucket === null,
            "Non-LIVE null speed / 비LIVE의null속도",
          );
      }
      need(
        manifest.sequence === Number(file.match(/\d+/)[0]),
        "Filename sequence / 파일순번",
      );
      signed.push({ manifest, snapshot, artifact, jws, root });
    }
    equal(
      signed[0].snapshot.entries,
      ctx.candidate.draft.entries,
      "Actual first signed aggregate entries / 최초실제서명집계일치",
    );
    const accepted = json(ROOT, "readbacks/accepted.json");
    need(
      accepted.high_water === 1 && accepted.active,
      "Durable first acceptance / 최초영속수용",
    );
    equal(
      accepted.active.manifest,
      signed[0].manifest,
      "Accepted manifest bytes / 수용명세",
    );
    equal(
      accepted.active.snapshot,
      signed[0].snapshot,
      "Accepted snapshot JSON / 수용자료JSON",
    );
    need(
      byteObject(accepted.active.artifact).equals(signed[0].artifact) &&
        accepted.active.jws === signed[0].jws,
      "Exact durable accepted bytes/JWS / 영속수용바이트·JWS일치",
    );
    ctx.signed = signed;
    return {
      signatures: 3,
      algorithm: "Node crypto Ed25519",
      snapshot_ids: signed.map((s) => s.manifest.traffic_snapshot_id),
    };
  });
  section(
    "independent-tar-index-header-blank-skeleton-and-exact-generations",
    () => {
      const bundle = json(ROOT, "bundle/manifest.json"),
        skeleton = bytes(ROOT, "bundle/traffic.tar", MAX_ARCHIVE),
        members = parseTrafficTar(
          skeleton,
          Object.keys(ctx.graph.tile_sha256),
          ctx.catalog,
        );
      need(
        bundle.schema_version === "p08-0.1" &&
          bundle.graph_id === ctx.graph.graph_id &&
          bundle.graph_manifest_sha256 === ctx.manifest.graph_manifest_sha256 &&
          bundle.image_id === ctx.graph.image.id,
        "Bundle graph/image binding / 묶음 지도·이미지 연결",
      );
      need(
        hash(skeleton) === bundle.skeleton_sha256 &&
          skeleton.length === bundle.skeleton_byte_length &&
          ctx.manifest.output_sha256["bundle/graph.tar"] ===
            bundle.graph_extract_sha256 &&
          ctx.manifest.output_sha256["negative/corrupt-bundle/graph.tar"] ===
            bundle.graph_extract_sha256,
        "Available skeleton bytes verified; omitted graph extracts have matching declared hashes only / 뼈대실제바이트검증·제외추출파일은선언해시일치만확인",
      );
      equal(
        bundle.catalog,
        [...ctx.catalog].sort((a, b) =>
          a.edge_id < b.edge_id
            ? -1
            : a.edge_id > b.edge_id
              ? 1
              : Number(a.forward) - Number(b.forward),
        ),
        "Bundle full catalog / 묶음전체목록",
      );
      for (const m of members)
        need(
          skeleton
            .subarray(m.offset + 32, m.offset + m.size)
            .every((x) => x === 0),
          "Skeleton nonzero record / 뼈대비영기록",
        );
      const expectedCache = new Map();
      function expectedBytes(snapshotId) {
        if (expectedCache.has(snapshotId)) return expectedCache.get(snapshotId);
        const b = Buffer.from(skeleton),
          signed =
            snapshotId === null
              ? null
              : ctx.signed.find(
                  (s) => s.manifest.traffic_snapshot_id === snapshotId,
                );
        need(
          snapshotId === null || signed,
          "Generation unsigned/unknown snapshot / 미서명·알수없는세대자료",
        );
        const diagnostics = [];
        for (const e of signed?.snapshot.entries ?? []) {
          if (e.status !== "LIVE") continue;
          need(
            Number.isFinite(e.speed_mps) &&
              e.speed_mps > 0 &&
              e.speed_mps <= 70,
            "Representable positive speed / 표현가능양수속도",
          );
          const raw = Math.max(1, Math.round((e.speed_mps * 3.6) / 2));
          need(
            raw >= 1 && raw <= 126,
            "Closure/unknown raw speed refused / 폐쇄·미확인원시속도거부",
          );
          const offset = recordOffset(members, e.edge_id),
            word = BigInt(raw) | (BigInt(raw) << 7n) | (255n << 28n);
          b.writeBigUInt64LE(word, offset);
          diagnostics.push({
            edge_id: e.edge_id,
            forward: e.forward,
            offset,
            input_speed_mps: e.speed_mps,
            raw_speed: raw,
            decoded_speed_mps: (raw * 2) / 3.6,
            quantization_error_mps: (raw * 2) / 3.6 - e.speed_mps,
          });
        }
        const result = { bytes: b, diagnostics, signed };
        expectedCache.set(snapshotId, result);
        return result;
      }
      const ready = (ctx.files ?? tree(ROOT)).filter((p) =>
        /^generations\/[^/]+\/[a-f0-9]{64}\/manifest\.json$/.test(p),
      );
      need(ready.length > 0, "No immutable generations / 불변세대없음");
      let verified = 0,
        intentionalCorrupt = 0;
      for (const path of ready) {
        const g = json(ROOT, path),
          dir = dirname(path),
          raw = bytes(ROOT, dir + "/traffic.tar", MAX_ARCHIVE);
        const identity = {
          graph_id: ctx.graph.graph_id,
          skeleton_sha256: hash(skeleton),
          traffic_snapshot_id: g.traffic_snapshot_id,
          compiler_policy: POLICY,
        };
        need(
          hash(Buffer.from(stable(identity))) === g.generation_id &&
            dir.endsWith("/" + g.generation_id),
          "Generation content identity / 세대내용식별",
        );
        if (path.startsWith("generations/corrupt-cache/")) {
          need(
            raw.length === 7 && hash(raw) !== g.traffic_sha256,
            "Intentional truncated-cache evidence absent / 의도적잘린캐시근거없음",
          );
          intentionalCorrupt++;
          continue;
        }
        const exp = expectedBytes(g.traffic_snapshot_id);
        need(
          raw.equals(exp.bytes),
          "Compiled word or preserved non-live/header/index bytes differ / 인코딩원시값·비LIVE·헤더·목록바이트불일치",
        );
        need(
          g.graph_id === ctx.graph.graph_id &&
            g.skeleton_sha256 === hash(skeleton) &&
            g.compiler_policy === POLICY &&
            g.traffic_sha256 === hash(raw) &&
            g.traffic_byte_length === raw.length,
          "Generation hash/length metadata / 세대해시·크기정보",
        );
        equal(
          g.live_edges,
          exp.diagnostics,
          "Independent encoding/quantization diagnostics / 독립인코딩·양자화진단",
        );
        need(
          g.sequence === (exp.signed?.manifest.sequence ?? null) &&
            g.valid_until === (exp.signed?.manifest.valid_until ?? null),
          "Generation snapshot provenance / 세대자료출처",
        );
        parseTrafficTar(raw, Object.keys(ctx.graph.tile_sha256), ctx.catalog);
        verified++;
      }
      need(
        intentionalCorrupt === 1,
        "Exactly one intentional corrupt generation expected / 의도손상세대1개필요",
      );
      const compiled = json(ROOT, "readbacks/compiled.json");
      need(
        compiled.message.code === "READY" && compiled.exit.code === 0,
        "Actual successful compiled worker / 실제파일생성성공",
      );
      const g = compiled.message.generation;
      need(
        g.live_edges.length === 3 &&
          g.live_edges.every((e) => e.raw_speed === 1),
        "Exactly3 two-kmh compiled records / 정확한2km/h기록3개",
      );
      ctx.recordedRoot = json(ROOT, "runtime/ownership.json").owned_output_root;
      function remap(p) {
        need(
          isAbsolute(ctx.recordedRoot) && isAbsolute(p),
          "Hosted original paths must be absolute / 원격원본경로는절대경로필요",
        );
        need(
          typeof p === "string" && p.startsWith(ctx.recordedRoot + "/"),
          "Recorded path escaped owned root / 기록경로소유범위이탈",
        );
        return p.slice(ctx.recordedRoot.length + 1);
      }
      need(
        hashFile(safe(ROOT, remap(g.traffic_path))) === g.traffic_sha256 &&
          hashFile(safe(ROOT, remap(g.manifest_path))) ===
            hash(
              Buffer.from(
                stable(
                  (({ directory, traffic_path, manifest_path, ...m }) => m)(g),
                ),
              ),
            ),
        "Descriptor paths/ready manifest exact / 설명경로·준비명세일치",
      );
      ctx.skeleton = skeleton;
      ctx.members = members;
      ctx.generation = g;
      ctx.remap = remap;
      return {
        members: members.length,
        skeleton_bytes: skeleton.length,
        verified_ready_generations: verified,
        intentional_corrupt_generations: intentionalCorrupt,
        live_offsets: g.live_edges.map((e) => ({
          edge_id: e.edge_id,
          offset: e.offset,
          raw_hex: expectedBytes(g.traffic_snapshot_id)
            .bytes.subarray(e.offset, e.offset + 8)
            .toString("hex"),
        })),
      };
    },
  );
  section(
    "actual-routes-original-ordinary-requests-and-raw-engine-traces",
    () => {
      const ordinary = {
          locations: [
            { lon: 127.029, lat: 37.4984 },
            { lon: 127.049, lat: 37.5045 },
          ],
          costing: "auto",
          units: "kilometers",
          language: "en-US",
          date_time: { type: 0 },
        },
        routeFiles = readdirSync(safe(ROOT, "routes")).filter((p) =>
          p.endsWith(".json"),
        ),
        records = {};
      const runtimeRouteFiles = (ctx.files ?? tree(ROOT)).filter((p) =>
        /^generations\/[^/]+\/runtime\/[^/]+\/route\.response\.json$/.test(p),
      );
      const provenanceKeys = [
        "graph_id",
        "high_water",
        "sequence",
        "traffic_snapshot_id",
        "compiler_policy",
        "generation_id",
        "traffic_sha256",
        "traffic_byte_length",
        "checked_at_event_time",
        "valid_until",
        "traffic_mode",
        "engine",
        "message_en",
        "message_ko",
      ];
      for (const file of routeFiles) {
        const receipt = json(ROOT, "routes/" + file),
          r = receipt.message;
        if (r.code !== "ROUTE")
          throw Error("Unsuccessful route record / 실패경로기록: " + file);
        need(
          receipt.exit.code === 0 && receipt.exit.signal === null,
          "Route worker exit / 경로처리자종료",
        );
        equal(
          r.engine_result.request,
          ordinary,
          "No native option/exclusion/waypoint changes / 기본옵션·제외·경유변경금지",
        );
        const e = r.engine_result,
          trip = e.route?.trip;
        need(
          trip?.status === 0 &&
            trip.legs.length === 1 &&
            typeof trip.legs[0].shape === "string" &&
            e.trace.edges.length > 0 &&
            Number.isFinite(trip.summary.time) &&
            Number.isFinite(trip.summary.length) &&
            Number.isFinite(trip.summary.cost),
          "Actual route/trace structure / 실제경로·trace구조",
        );
        keys(
          r.provenance,
          provenanceKeys,
          "Public provenance exact field whitelist / 공개출처필드허용목록",
        );
        const p = r.provenance;
        need(
          /^[a-f0-9]{64}$/.test(p.generation_id) &&
            /^[a-f0-9]{64}$/.test(p.traffic_sha256) &&
            Number.isSafeInteger(p.high_water) &&
            p.high_water >= 0,
          "Public hash/highwater types / 공개해시·최고순번형식",
        );
        const publicText = stable(p);
        need(
          !/postgres(?:ql)?:\/\/|private_jwk|database_url|contributor_id|trip_id|sample_id/.test(
            publicText,
          ) &&
            !ctx.expected.trips.some((t) =>
              [t.contributor_id, t.trip_id, t.vehicle_id].some((id) =>
                publicText.includes(id),
              ),
            ),
          "Private routing provenance / 경로출처비공개정보",
        );
        keys(
          p.engine,
          ["image_id", "version"],
          "Public engine identity fields / 공개엔진식별필드",
        );
        need(
          p.engine.image_id === ctx.graph.image.id &&
            p.engine.version === "3.9.1" &&
            p.graph_id === ctx.graph.graph_id &&
            p.compiler_policy === POLICY &&
            r.traffic_mode === p.traffic_mode,
          "Actual route identity / 실제경로식별",
        );
        if (r.traffic_mode === "NO_USABLE_SNAPSHOT")
          need(
            p.traffic_snapshot_id === null &&
              p.sequence === null &&
              p.valid_until === null,
            "Baseline identity / 기본식별",
          );
        else {
          const signed = ctx.signed.find(
            (s) => s.manifest.traffic_snapshot_id === p.traffic_snapshot_id,
          );
          need(
            signed &&
              p.sequence === signed.manifest.sequence &&
              p.valid_until === signed.manifest.valid_until &&
              p.high_water >= p.sequence &&
              iso(p.checked_at_event_time) < iso(p.valid_until),
            "Fresh route accepted provenance / 경로의신선한수용출처",
          );
          need(
            iso(p.checked_at_event_time) >= iso(signed.root.valid_from) &&
              iso(p.checked_at_event_time) < iso(signed.root.valid_until),
            "Route key validity / 경로키유효기간",
          );
        }
        const rawMatches = runtimeRouteFiles.filter(
          (path) => stable(json(ROOT, path)) === stable(e.route),
        );
        let found = false;
        for (const path of rawMatches) {
          const dir = dirname(path);
          if (
            stable(json(ROOT, dir + "/trace.response.json")) !==
              stable(e.trace) ||
            stable(json(ROOT, dir + "/route.request.json")) !== stable(ordinary)
          )
            continue;
          const copied = bytes(ROOT, dir + "/traffic.tar", MAX_ARCHIVE);
          if (
            hash(copied) !== p.traffic_sha256 ||
            copied.length !== p.traffic_byte_length
          )
            continue;
          const traceRequest = json(ROOT, dir + "/trace.request.json");
          need(
            traceRequest.encoded_polyline === trip.legs[0].shape &&
              traceRequest.shape_match === "edge_walk" &&
              traceRequest.costing === "auto" &&
              traceRequest.date_time.type === 0,
            "Actual edge_walk over returned shape / 반환지형의실제edge_walk",
          );
          const commands = json(ROOT, dir + "/commands.json");
          for (const action of ["route", "trace_attributes"]) {
            const command = commands.find(
              (c) =>
                c.args[0] === "exec" &&
                c.args.includes("valhalla_service") &&
                c.args.includes(action),
            );
            need(
              command?.exit_code === 0,
              "Actual successful engine command / 실제엔진성공명령",
            );
            const parsed = rawEngineJSON(
              bytes(ROOT, dir + "/" + command.stdout),
            );
            equal(
              parsed,
              action === "route" ? e.route : e.trace,
              "Original engine stdout equality / 원엔진표준출력일치",
            );
          }
          const version = commands.find((c) => c.args.includes("--version"));
          need(
            version?.exit_code === 0 &&
              bytes(ROOT, dir + "/" + version.stdout)
                .toString()
                .trim() === "3.9.1",
            "Actual engine version / 실제엔진버전",
          );
          found = true;
          break;
        }
        need(
          found,
          "No corresponding raw engine response/bytes / 대응원엔진응답·바이트없음",
        );
        records[file.slice(0, -5)] = {
          receipt,
          result: r,
          trip,
          edges: e.trace.edges.map((x) => String(x.id)),
        };
      }
      for (const label of [
        "baseline",
        "live",
        "restart-cache",
        "publisher-outage",
        "accepted-key-revoked",
        "database-restart",
        "correction",
        "new-empty-window",
        "before-expiry",
        "expired",
      ])
        need(records[label], "Required route missing / 필수경로누락: " + label);
      const base = records.baseline,
        live = records.live,
        expired = records.expired;
      need(
        base.result.traffic_mode === "NO_USABLE_SNAPSHOT" &&
          base.result.provenance.high_water === 0,
        "Initial baseline before acceptance / 수용전기본",
      );
      need(
        live.result.traffic_mode === "LIVE" &&
          live.result.provenance.sequence === 1,
        "First live route / 최초LIVE경로",
      );
      need(
        live.trip.legs[0].shape !== base.trip.legs[0].shape &&
          live.trip.summary.length * 1000 - base.trip.summary.length * 1000 >=
            50 &&
          live.trip.summary.time - base.trip.summary.time >= 5,
        "Required real detour geometry/distance/time / 실제우회지형·거리·시간기준",
      );
      for (const target of ctx.expected.targets) {
        need(
          base.edges.includes(target.edge_id),
          "Baseline target missing / 기본경로대상누락",
        );
        need(
          !live.edges.includes(target.edge_id),
          "Live detour still uses target / 우회경로대상사용",
        );
      }
      need(
        expired.result.traffic_mode === "NO_USABLE_SNAPSHOT" &&
          expired.result.provenance.high_water === 1 &&
          expired.result.provenance.traffic_snapshot_id === null &&
          expired.trip.legs[0].shape === base.trip.legs[0].shape,
        "Exact baseline restoration identity/shape / 정확한기본복구식별·지형",
      );
      near(
        expired.trip.summary.time,
        base.trip.summary.time,
        1e-6,
        "Exact baseline time / 정확한기본시간",
      );
      need(
        iso(expired.result.provenance.checked_at_event_time) ===
          iso(ctx.expected.valid_until),
        "Exact expiry time / 정확한만료시각",
      );
      for (const label of [
        "restart-cache",
        "publisher-outage",
        "database-restart",
      ])
        need(
          records[label].result.traffic_mode === "LIVE" &&
            records[label].result.provenance.traffic_snapshot_id ===
              live.result.provenance.traffic_snapshot_id,
          "Retained live identity / LIVE식별유지: " + label,
        );
      need(
        records["before-expiry"].result.traffic_mode === "LIVE" &&
          iso(
            records["before-expiry"].result.provenance.checked_at_event_time,
          ) ===
            iso(ctx.expected.valid_until) - 1,
        "419.999 validity / 419.999초유효",
      );
      need(
        records["accepted-key-revoked"].result.traffic_mode ===
          "NO_USABLE_SNAPSHOT" &&
          records["accepted-key-revoked"].result.provenance.high_water === 1,
        "Accepted key revocation / 수용키철회",
      );
      for (const [label, index] of [
        ["correction", 1],
        ["new-empty-window", 2],
      ])
        need(
          records[label].result.traffic_mode === "NO_LIVE_COVERAGE" &&
            records[label].result.provenance.traffic_snapshot_id ===
              ctx.signed[index].manifest.traffic_snapshot_id,
          "Non-LIVE snapshot retained / 비LIVE자료식별유지",
        );
      ctx.routes = records;
      return {
        route_records: routeFiles.length,
        baseline: {
          time: base.trip.summary.time,
          cost: base.trip.summary.cost,
          length_km: base.trip.summary.length,
        },
        live: {
          time: live.trip.summary.time,
          cost: live.trip.summary.cost,
          length_km: live.trip.summary.length,
        },
        expired: {
          time: expired.trip.summary.time,
          cost: expired.trip.summary.cost,
        },
        target_ids_avoided: ctx.expected.targets.map((t) => t.edge_id),
      };
    },
  );
  section("negative-exact-code-reason-and-actual-kill-boundaries", () => {
    const expected = [
      ["negative/corrupt-bundle.json", "UNAVAILABLE", "INVALID_TAR_HEADER"],
      ["negative/truncated-cache.json", "UNAVAILABLE", "GENERATION_CONFLICT"],
      ["negative/database-outage.json", "UNAVAILABLE", "STORE_UNAVAILABLE"],
      ["negative/engine-unavailable.json", "UNAVAILABLE", "ENGINE_UNAVAILABLE"],
      ["readbacks/superseded.json", "REJECTED", "ACCEPTED_STATE_CHANGED"],
      [
        "readbacks/route-result-expiry.json",
        "UNAVAILABLE",
        "ACCEPTED_STATE_CHANGED",
      ],
      [
        "readbacks/compile-selection-expiry.json",
        "REJECTED",
        "ACCEPTED_STATE_CHANGED",
      ],
    ];
    for (const [path, code, reason] of expected) {
      const value = json(ROOT, path),
        r = value.result ?? value;
      need(
        r.message.code === code &&
          r.message.reason === reason &&
          r.exit.code === 1 &&
          r.exit.signal === null,
        "Wrong negative outcome / 부정결과불일치: " + path,
      );
      need(
        !("engine_result" in r.message) &&
          !("provenance" in r.message) &&
          typeof r.message.message_en === "string" &&
          typeof r.message.message_ko === "string",
        "Failure exposed a successful route / 실패에서성공경로노출: " + path,
      );
    }
    const processes = json(ROOT, "process-events.json");
    for (const [file, phase] of [
      ["readbacks/superseded.json", "AFTER_TRAFFIC_WRITE"],
      ["readbacks/route-result-expiry.json", "AFTER_ROUTE_RESULT"],
      ["readbacks/compile-selection-expiry.json", "AFTER_TRAFFIC_COMMIT"],
    ]) {
      const r = json(ROOT, file),
        p = processes.find((p) => p.pid === r.pid);
      need(
        p &&
          p.messages.some((m) => m.type === "PHASE" && m.phase === phase) &&
          p.messages.some(
            (m) =>
              m.type === "RESULT" &&
              m.code === r.message.code &&
              m.reason === r.message.reason,
          ),
        "Original stale-worker phase/result / 원문낡은처리자단계·결과: " + file,
      );
    }
    for (const [label, phase] of [
      ["precommit", "AFTER_TRAFFIC_WRITE"],
      ["postcommit", "AFTER_TRAFFIC_COMMIT"],
    ]) {
      const killed = json(ROOT, "readbacks/" + label + "-kill.json"),
        p = processes.find((p) => p.pid === killed.pid);
      need(
        killed.signal === "SIGKILL" &&
          p?.signal === "SIGKILL" &&
          p.messages.some((m) => m.type === "PHASE" && m.phase === phase),
        "Actual SIGKILL phase evidence / 실제SIGKILL단계근거",
      );
      need(
        killed.retry.message.code === "READY" &&
          killed.retry.exit.code === 0 &&
          killed.retry.message.generation.generation_id ===
            ctx.generation.generation_id &&
          killed.retry.message.generation.traffic_sha256 ===
            ctx.generation.traffic_sha256,
        "Killed generation retry identity / 종료세대재시도식별",
      );
      if (label === "precommit")
        need(
          !killed.directories_after_kill.includes(
            ctx.generation.generation_id,
          ) &&
            killed.directories_after_kill.some((d) =>
              d.startsWith(".staging-"),
            ),
          "Partial precommit was exposed ready / 미완성파일준비노출",
        );
      else
        need(
          killed.directories_after_kill.includes(ctx.generation.generation_id),
          "Postcommit ready generation missing / 커밋후준비세대누락",
        );
    }
    const retry = json(ROOT, "readbacks/retry.json"),
      race = json(ROOT, "readbacks/concurrent.json");
    need(
      retry.message.code === "READY" &&
        retry.message.generation.generation_id ===
          ctx.generation.generation_id &&
        retry.message.generation.traffic_sha256 ===
          ctx.generation.traffic_sha256,
      "Idempotent retry / 동일재시도",
    );
    need(
      race.length === 2 &&
        race[0].pid !== race[1].pid &&
        race.every(
          (r) =>
            r.exit.code === 0 &&
            r.message.code === "READY" &&
            r.message.generation.generation_id ===
              ctx.generation.generation_id &&
            r.message.generation.traffic_sha256 ===
              ctx.generation.traffic_sha256,
        ),
      "Actual concurrent distinct worker convergence / 실제고유처리자동시수렴",
    );
    const engine = json(ROOT, "negative/engine-ownership.json"),
      labels = engine.engine.Config.Labels,
      id = labels["io.routelens.run_id"],
      phase = engine.phase;
    need(
      /^[a-f0-9-]{36}$/.test(id) &&
        engine.engine.Name === "/routelens-p02-" + id &&
        engine.engine.Name === "/" + phase.engine_container &&
        phase.phase === "AFTER_ENGINE_READY" &&
        engine.owned_output_root === ctx.recordedRoot &&
        phase.engine_run_directory.startsWith(ctx.recordedRoot + "/") &&
        engine.engine.Mounts.some(
          (m) =>
            m.Destination === "/work" &&
            m.Source === phase.engine_run_directory,
        ),
      "Killed exact owned engine / 정확소유엔진종료",
    );
    const unavailable = json(ROOT, "negative/engine-unavailable.json");
    need(
      unavailable.engine_name === phase.engine_container,
      "Killed engine/result identity / 종료엔진·결과식별",
    );
    ctx.processes = processes;
    return {
      negative_cases: expected.length,
      actual_sigkill_boundaries: 2,
      concurrent_workers: 2,
    };
  });
  section("durable-corrections-ttl-expiry-highwater-and-restart", () => {
    const correction = json(ROOT, "readbacks/correction.json"),
      offline = json(ROOT, "readbacks/offline-ttl.json"),
      empty = json(ROOT, "readbacks/empty.json"),
      exact = json(ROOT, "readbacks/exact-expiry.json"),
      final = json(ROOT, "readbacks/final-consumer-db.json"),
      first = ctx.signed[0],
      second = ctx.signed[1],
      third = ctx.signed[2];
    need(
      correction.revoked_http.length === 3 &&
        correction.revoked_http.every(
          (r) => r.status === 200 && r.body.code === "REVOKED",
        ),
      "Actual three HTTP revocations / 실제HTTP철회3개",
    );
    need(
      correction.sequence === 2 &&
        correction.candidate.code === "FINALIZED" &&
        correction.state.high_water === 2 &&
        correction.state.active.manifest.traffic_snapshot_id ===
          second.manifest.traffic_snapshot_id,
      "Durable higher-sequence correction / 영속상위순번정정",
    );
    equal(
      correction.state.active.snapshot,
      second.snapshot,
      "Accepted correction JSON / 수용정정JSON",
    );
    need(
      byteObject(correction.state.active.artifact).equals(second.artifact) &&
        correction.state.active.jws === second.jws,
      "Accepted correction exact bytes / 수용정정원바이트",
    );
    for (const t of ctx.expected.targets) {
      const e = second.snapshot.entries.find(
          (e) => e.edge_id === t.edge_id && e.forward === t.forward,
        ),
        selection = correction.candidate.selections.find(
          (e) => e.edge_id === t.edge_id && e.forward === t.forward,
        );
      need(
        e?.status === "INSUFFICIENT" &&
          e.speed_mps === null &&
          selection?.eligible_contributors === 4,
        "Correction has four per target / 정정구간별4명",
      );
    }
    need(
      second.snapshot.entries.every((e) => e.status !== "LIVE"),
      "Correction retained live records / 정정에LIVE잔존",
    );
    need(
      offline.high_water === 1 &&
        offline.active.manifest.traffic_snapshot_id ===
          first.manifest.traffic_snapshot_id &&
        offline.active.manifest.valid_until === ctx.expected.valid_until,
      "Offline original TTL retained / 오프라인원TTL유지",
    );
    need(
      byteObject(offline.active.artifact).equals(first.artifact) &&
        offline.active.jws === first.jws,
      "Offline exact accepted bytes / 오프라인정확수용바이트",
    );
    need(
      empty.code === "FINALIZED" &&
        empty.draft.entries.every(
          (e) => e.status === "UNKNOWN" && e.speed_mps === null,
        ) &&
        third.snapshot.entries.every(
          (e) => e.status === "UNKNOWN" && e.speed_mps === null,
        ),
      "New empty window default bytes / 새빈창기본바이트",
    );
    need(
      third.manifest.window_start === ctx.expected.window_end &&
        third.manifest.sequence === 3,
      "Newer empty window/sequence / 새빈창·순번",
    );
    need(
      exact.high_water === 1 && exact.active === null,
      "Exact expiry preserves high-water / 정확만료최고순번유지",
    );
    equal(
      final.map((r) => r.consumer_id).sort(),
      ["p08-key-revocation", "p08-main", "p08-offline-ttl"],
      "Final consumer identity inventory / 최종수신자목록",
    );
    for (const [id, index, active] of [
      ["p08-key-revocation", 0, false],
      ["p08-offline-ttl", 0, false],
      ["p08-main", 2, true],
    ]) {
      const row = final.find((r) => r.consumer_id === id),
        s = ctx.signed[index];
      need(
        Number(row.high_water) === s.manifest.sequence &&
          row.last_snapshot_id === s.manifest.traffic_snapshot_id &&
          row.last_window_start === s.manifest.window_start &&
          row.artifact_byte_length === (active ? s.artifact.length : null),
        "Final durable high-water/bytes / 최종영속최고순번·바이트: " + id,
      );
    }
    const restart = json(ROOT, "runtime/database-restart.json");
    need(
      restart.same_container_id === true &&
        typeof restart.same_named_volume === "string" &&
        restart.restarted === true &&
        restart.host_tcp_ready === true &&
        Number.isInteger(restart.previous_host_port) &&
        Number.isInteger(restart.current_host_port),
      "Actual same-container durable restart / 동일컨테이너영속재시작",
    );
    const outage = json(ROOT, "readbacks/publisher-outage.json");
    need(
      outage.message.code === "REJECTED" &&
        outage.message.reason === "TRANSPORT_FAILED" &&
        outage.message.high_water === 1 &&
        outage.exit.code === 1,
      "Actual HTTP publisher outage rejection / 실제게시자장애거부",
    );
    const pubs = json(ROOT, "readbacks/publication-3.json");
    need(
      pubs.publications.length === 3,
      "Durable publication history / 영속게시이력",
    );
    for (const p of pubs.publications) {
      const s = ctx.signed.find((s) => s.manifest.sequence === p.sequence);
      need(
        s &&
          p.traffic_snapshot_id === s.manifest.traffic_snapshot_id &&
          byteObject(p.artifact).equals(s.artifact) &&
          p.jws === s.jws,
        "Durable publication exact signed bytes / 영속게시정확서명바이트",
      );
    }
    return {
      sequences: [1, 2, 3],
      final_highwaters: final.map((r) => ({
        consumer: r.consumer_id,
        high_water: Number(r.high_water),
        active_bytes: r.artifact_byte_length,
      })),
      database_ports: {
        before: restart.previous_host_port,
        after: restart.current_host_port,
      },
    };
  });
  section("32-unique-pass-cases-report-and-public-privacy", () => {
    const assertions = json(ROOT, "assertions.json"),
      report = json(ROOT, "report-traffic.json");
    equal(
      assertions.map((a) => a.assertion_id).sort(),
      [...CASES].sort(),
      "Exactly32 unique required case IDs / 필수32개고유사례",
    );
    need(
      new Set(assertions.map((a) => a.assertion_id)).size === 32 &&
        assertions.every((a) => a.status === "PASS"),
      "Every required case PASS / 필수사례전체통과",
    );
    for (const a of assertions) {
      safe(ROOT, a.evidence_path);
      need(
        ctx.manifest.output_sha256[a.evidence_path],
        "Unhashed case evidence / 해시없는사례근거",
      );
    }
    need(
      report.assertions_passed === 32 &&
        report.assertions_total === 32 &&
        report.cleanup_verified === true,
      "Complete report counters / 전체보고개수",
    );
    equal(
      report.cases
        .map((c) => ({ id: c.case_id, status: c.status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      assertions
        .map((a) => ({ id: a.assertion_id, status: a.status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      "Report/assertion exact case membership / 보고서·검사목록일치",
    );
    for (const r of report.routes) {
      const original = ctx.routes[r.label];
      need(
        original &&
          r.shape === original.trip.legs[0].shape &&
          r.eta_s === original.trip.summary.time &&
          r.distance_m === original.trip.summary.length * 1000 &&
          r.snapshot_id === original.result.provenance.traffic_snapshot_id &&
          r.generation_id === original.result.provenance.generation_id,
        "Report actual route provenance / 보고서실제경로출처",
      );
      equal(
        r.trace_edge_ids,
        original.edges,
        "Report actual trace IDs / 보고서실제traceID",
      );
    }
    for (const file of readdirSync(safe(ROOT, "public"))) {
      const text = bytes(ROOT, "public/" + file).toString("utf8");
      need(
        !/"(?:contributor_id|trip_id|sample_id|longitude|latitude|database_url|private_jwk|d)"\s*:/.test(
          text,
        ) && !text.includes("postgresql://"),
        "Private public artifact field / 공개자료비공개필드",
      );
    }
    return {
      cases: 32,
      duplicates: 0,
      all_pass: true,
      report_routes: report.routes.length,
    };
  });
  section("recorded-owned-process-engine-database-cleanup", () => {
    const owner = json(ROOT, "runtime/ownership.json"),
      cleanup = json(ROOT, "runtime/cleanup.json"),
      db = json(ROOT, "runtime/database.json"),
      processes = ctx.processes ?? json(ROOT, "process-events.json");
    need(
      cleanup.cleanup_verified === true &&
        cleanup.private_files_removed === true &&
        cleanup.processes_exited === true &&
        cleanup.failures.length === 0,
      "Owned cleanup failed / 소유정리실패",
    );
    need(
      owner.planned_before_creation === true &&
        owner.container === "routelens-p05-" + owner.run_id &&
        owner.volume === owner.container + "-db" &&
        db.named_volume === owner.volume &&
        db.loopback_only === true,
      "Exact DB ownership / 정확DB소유",
    );
    equal(
      db.settings,
      { fsync: "on", synchronous_commit: "on", full_page_writes: "on" },
      "Durable database settings / 영속DB설정",
    );
    need(
      new Set(processes.map((p) => p.pid)).size === processes.length,
      "Duplicate child PIDs / 하위PID중복",
    );
    equal(
      owner.processes.map((p) => p.pid).sort((a, b) => a - b),
      processes.map((p) => p.pid).sort((a, b) => a - b),
      "Owned process inventory / 소유프로세스목록",
    );
    for (const p of processes) {
      need(
        Number.isInteger(p.pid) &&
          p.pid > 1 &&
          (p.exit_code !== null || p.signal !== null),
        "Unexited child / 미종료하위프로세스",
      );
      need(
        p.exit_code === 0 ||
          p.exit_code === 1 ||
          ["SIGKILL", "SIGTERM"].includes(p.signal),
        "Unexpected child termination / 예상밖종료",
      );
      need(
        !/postgres(?:ql)?:\/\/|"private_jwk"|"database_url"|"d"\s*:/.test(
          p.diagnostics ?? "",
        ),
        "Credential diagnostics / 인증값진단",
      );
    }
    need(
      owner.processes.every(
        (p) => p.exited === true && p.spawn_recorded_before_start === true,
      ),
      "Ownership exit records / 소유종료기록",
    );
    const engines = new Map(),
      commandsFiles = (ctx.files ?? tree(ROOT)).filter((p) =>
        p.endsWith("/commands.json"),
      );
    for (const file of commandsFiles) {
      const records = json(ROOT, file);
      if (!Array.isArray(records)) continue;
      for (const c of records) {
        const a = c.args;
        if (!Array.isArray(a) || a[0] !== "create") continue;
        const name = a[a.indexOf("--name") + 1];
        if (!name?.startsWith("routelens-p02-")) continue;
        const id = name.slice("routelens-p02-".length);
        need(
          /^[a-f0-9-]{36}$/.test(id) &&
            a.includes("io.routelens.run_id=" + id) &&
            a[a.indexOf("--network") + 1] === "none" &&
            a[a.indexOf("--cpus") + 1] === "2" &&
            a[a.indexOf("--memory") + 1] === "4g" &&
            a.includes(ctx.graph.image.id),
          "Owned engine create isolation / 소유엔진생성격리",
        );
        const mounts = a.filter((x, i) => a[i - 1] === "--mount"),
          work = mounts.find((x) => x.endsWith(",dst=/work"));
        need(
          work && work.includes("src=" + owner.owned_output_root + "/"),
          "Owned /work boundary / 소유work경계",
        );
        need(
          mounts.some((x) => x.includes("dst=/graph,readonly")),
          "Readonly graph mount / 읽기전용그래프연결",
        );
        engines.set(name, { name, id, work });
      }
    }
    need(
      engines.size >= 16,
      "Missing engine ownership inventory / 엔진소유목록누락",
    );
    for (const file of (ctx.files ?? tree(ROOT)).filter((p) =>
      p.endsWith("/cleanup.json"),
    )) {
      const c = json(ROOT, file);
      need(
        c.cleanup_verified === true,
        "Recorded engine/runtime cleanup failure / 엔진·런타임정리실패: " +
          file,
      );
    }
    const eventResults = processes.flatMap((p) =>
      p.messages
        .filter((m) => m.type === "RESULT")
        .map((m) => ({ pid: p.pid, message: m })),
    );
    for (const p of processes.filter((p) =>
      p.role.startsWith("p08-source-worker-"),
    ))
      need(
        p.messages.some((m) => m.type === "RESULT" && m.code === "SUCCEEDED") &&
          p.exit_code === 0,
        "Actual fifteen source workers / 실제원본처리자15개",
      );
    need(
      processes.filter((p) => p.role.startsWith("p08-source-worker-"))
        .length === 15,
      "Source worker count / 원본처리자수",
    );
    ctx.owner = owner;
    ctx.engines = [...engines.values()];
    return {
      child_processes: processes.length,
      engine_containers: engines.size,
      result_messages: eventResults.length,
      recorded_cleanup: true,
    };
  });
  limitations.push(
    "The 17 explicitly listed omitted file bytes cannot be verified; their hashes are declarations only. / 명시한 누락17개 파일의 바이트는 검증하지 못하며 해시는 선언값만 확인했습니다.",
    "Remote cleanup is supported only by archived ownership/commands/process/cleanup evidence; no current-host PID, Docker or DB was queried. / 원격 정리는 보존된 소유·명령·프로세스·정리 기록만 확인했으며 현재 호스트 PID·Docker·DB는 조회하지 않았습니다.",
  );
  const report = {
    schema_version: "independent-p08-hosted-evidence-0.1",
    status: checks.some((c) => c.status === "FAIL") ? "FAIL" : "PASS",
    root: ROOT,
    graph_directory: GRAPH,
    read_only: true,
    production_validator_imports: false,
    local_checks_requested: false,
    actual_current_host_queries: false,
    intentional_omissions: ctx.omissions ?? [],
    checks_passed: checks.filter((c) => c.status === "PASS").length,
    checks_total: checks.length,
    checks,
    limitations,
  };
  const output = JSON.stringify(report, null, 2) + "\n";
  if (OUTPUT) writeFileSync(OUTPUT, output, { flag: "wx" });
  else process.stdout.write(output);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
