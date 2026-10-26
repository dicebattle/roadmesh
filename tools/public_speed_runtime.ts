/** Owned local public-source routing. Credentials never enter HTTP/bootstrap data.
 * 인증키를 HTTP·초기 화면 자료에 넣지 않는 소유 로컬 공공 경로 실행. */
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { generateKeyPair, exportJWK, importJWK, type JWK } from "jose";
import { canonical, parseJson, record, sha256 } from "./shared.js";
import { durableNodeJSON, startNodeEngine } from "./node_engine.js";
import { GatewayCompilerAdapter } from "./gateway_compiler.js";
import { gatewayFailure, gatewayHttpStatus, GatewayError, validateGatewayRequest, validateNativeRouteResult } from "./gateway_controller.js";
import { readNodeBody } from "./node_service.js";
import { abortable } from "./node_controller.js";
import { NativeRouteRejection } from "./route_contract.js";
import { startClientServer, type RunningClientServer } from "./client_server.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { geodesicSphere } from "./geodesy.js";
import { ITS_MIN_POLL_MS, ItsSpeedCollector, PublicSpeedError, publicTime, validatePublicBounds,
  type PublicBounds, type ItsRead } from "./public_speed_source.js";
import { PublicSpeedAuthority } from "./public_speed_authority.js";
import { PublicSpeedFeed, type PublicFeedSelection } from "./public_speed_feed.js";
import { RegionalSpeedCollector } from "./regional_speed_collector.js";
import { validateRegionalBounds } from "./regional_speed_source.js";
import { validateRegionalMapping } from "./regional_speed_geometry.js";
import type { PublicRoadMapping } from "./public_speed_geometry.js";
import type { PublicTrafficTrust } from "./public_speed_publication.js";
import type { TrafficBundle, TrafficGeneration, TrafficRouteRequest } from "./traffic_types.js";
import { TrafficError } from "./traffic_bundle.js";
import type { NodeNativeEngine } from "./node_types.js";
import type { ClientBootstrap } from "./client_public_types.js";
import type { GatewayRequest, GatewayRouteContext, GatewaySuccess, GatewayReason } from "./gateway_public_types.js";

export interface PublicRuntimeConfig {
  source?: "kr-its" | "kr-regional";
  regional_input_path?: string;
  graph_directory: string;
  bundle_directory: string;
  mapping_path: string;
  state_directory: string;
  output_directory: string;
  assets_directory: string;
  bounds: PublicBounds;
  lifetime_ms?: number;
  /** Only explicit authored acceptance runs persist HTTP requests. / 자체 수용 실행만 HTTP 요청을 보존합니다. */
  capture_evidence?: boolean;
}
export interface PublicRuntimeDependencies {
  /** Internal tests only; the CLI never exposes a clock/provider override.
   * 내부 검사 전용이며 CLI는 시계·제공자 변경을 노출하지 않습니다. */
  clock?: () => number;
  collect?: () => Promise<ItsRead>;
  api_key?: string;
}
interface Slot {engine: NodeNativeEngine; generation: TrafficGeneration; users: number; retiring: boolean}
interface SigningState {
  kid: string; private_jwk: JWK; public_jwk: JWK; publisher_id: string;
  graph_id: string; mapping_sha256: string; valid_from: string; valid_until: string;
}
function reject(code: string): never { throw new PublicSpeedError(code); }
function selectionIdentity(v: PublicFeedSelection): string {
  return canonical({high_water: v.selection.high_water, snapshot: v.selection.active?.manifest.traffic_snapshot_id ?? null}).toString();
}
function tokenEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function validateConfig(c: PublicRuntimeConfig): void {
  if(c.source!==undefined && c.source!=="kr-its" && c.source!=="kr-regional") reject("INVALID_RUNTIME_SOURCE");
  if(c.source==="kr-regional") {
    validateRegionalBounds(c.bounds);
    if(typeof c.regional_input_path!=="string" || !c.regional_input_path || c.regional_input_path.includes("\0"))
      reject("REGIONAL_INPUT_REQUIRED");
  } else {
    validatePublicBounds(c.bounds);
    if(c.regional_input_path!==undefined)reject("REGIONAL_INPUT_SOURCE_MISMATCH");
  }
  for (const v of [c.graph_directory, c.bundle_directory, c.mapping_path, c.state_directory, c.output_directory, c.assets_directory])
    if (typeof v !== "string" || !v || v.includes("\0")) reject("INVALID_RUNTIME_PATH");
  const lifetime = c.lifetime_ms ?? 900000;
  if (!Number.isSafeInteger(lifetime) || lifetime < 1000 || lifetime > 86400000) reject("INVALID_RUNTIME_LIFETIME");
}
export class PublicSpeedRuntime {
  bootstrap!: ClientBootstrap;
  readonly ended: Promise<boolean>;
  private finish!: (clean: boolean) => void;
  private readonly abort = new AbortController();
  private readonly token = randomBytes(32).toString("hex");
  private readonly slots = new Map<string, Slot>();
  private readonly preparing = new Map<string, Promise<Slot>>();
  private readonly retiring = new Set<Promise<void>>();
  private readonly requests = new Set<AbortController>();
  private readonly routeJobs = new Set<Promise<GatewaySuccess>>();
  private readonly events: unknown[] = [];
  private bundle!: TrafficBundle;
  private mapping!: PublicRoadMapping;
  private compiler?: GatewayCompilerAdapter;
  private authority?: PublicSpeedAuthority;
  private feed?: PublicSpeedFeed;
  private app?: RunningClientServer;
  private gateway?: Server;
  private gatewayOrigin = "";
  private ticking?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private lifetime?: ReturnType<typeof setTimeout>;
  private nextPoll = 0;
  private closing = false;
  private closed?: Promise<boolean>;
  private cleanupFailed = false;
  private constructor(readonly config: PublicRuntimeConfig, private readonly dependencies: PublicRuntimeDependencies) {
    validateConfig(config);
    mkdirSync(resolve(config.output_directory), {mode: 0o700});
    for (const name of ["engines", "generations", "app", "readbacks"])
      mkdirSync(join(config.output_directory, name), {mode: 0o700});
    this.ended = new Promise(done => {this.finish = done;});
  }
  get origin(): string { if (!this.app) reject("PUBLIC_CLIENT_NOT_READY"); return this.app.origin; }
  private now(): number { return (this.dependencies.clock ?? Date.now)(); }
  private guard(): void { if (this.closing || this.abort.signal.aborted) reject("PUBLIC_RUNTIME_CLOSING"); }
  private record(code: string, detail: unknown = {}): void {
    this.events.push({code, at_utc: new Date(this.now()).toISOString(), detail});
    durableNodeJSON(join(this.config.output_directory, "events.json"), this.events);
  }
  static async start(config: PublicRuntimeConfig, dependencies: PublicRuntimeDependencies = {}, signal?: AbortSignal): Promise<PublicSpeedRuntime> {
    if (signal?.aborted) reject("PUBLIC_RUNTIME_CLOSING");
    const runtime = new PublicSpeedRuntime(config, dependencies);
    const stopStartup = () => runtime.abort.abort();
    signal?.addEventListener("abort", stopStartup, {once: true});
    try { await runtime.initialize(); runtime.guard(); }
    catch (e) { await runtime.close(); throw e; }
    finally { signal?.removeEventListener("abort", stopStartup); }
    if (signal) {
      const stop = () => {void runtime.close();};
      signal.addEventListener("abort", stop, {once: true});
      void runtime.ended.then(() => signal.removeEventListener("abort", stop));
      if (signal.aborted) {await runtime.close(); reject("PUBLIC_RUNTIME_CLOSING");}
    }
    return runtime;
  }
  private async signingState(directory: string): Promise<SigningState> {
    const prefix=this.config.source==="kr-regional" ? "regional" : "its";
    const path = join(directory, "signing.private.json"), scope = {publisher_id: `local-${prefix}-bootstrap`, graph_id: this.bundle.graph_id,
      mapping_sha256: sha256(canonical(this.mapping))};
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) reject("INVALID_LOCAL_SIGNING_STATE");
      const raw = parseJson(readFileSync(path));
      record(raw, "local signer", ["kid", "private_jwk", "public_jwk", "publisher_id", "graph_id", "mapping_sha256", "valid_from", "valid_until"]);
      const state = raw as unknown as SigningState;
      if (state.publisher_id !== scope.publisher_id || state.graph_id !== scope.graph_id || state.mapping_sha256 !== scope.mapping_sha256 ||
          state.kid !== `local-${prefix}-key` || state.private_jwk?.kty !== "OKP" || state.private_jwk.crv !== "Ed25519" ||
          !state.private_jwk.d || state.public_jwk?.kty !== "OKP" || state.public_jwk.crv !== "Ed25519" ||
          state.public_jwk.x !== state.private_jwk.x || "d" in state.public_jwk ||
          publicTime(state.valid_from) > this.now() || publicTime(state.valid_until) <= this.now()) reject("INVALID_LOCAL_SIGNING_STATE");
      await importJWK(state.private_jwk, "EdDSA");
      return state;
    }
    if (existsSync(join(directory, "accepted.sqlite"))) reject("LOCAL_SIGNER_MISSING");
    const keys = await generateKeyPair("EdDSA", {crv: "Ed25519", extractable: true});
    const state: SigningState = {...scope, kid: `local-${prefix}-key`, private_jwk: await exportJWK(keys.privateKey),
      public_jwk: await exportJWK(keys.publicKey), valid_from: new Date(this.now() - 60000).toISOString(),
      valid_until: new Date(this.now() + 365 * 86400000).toISOString()};
    writeFileSync(path, canonical(state), {flag: "wx", mode: 0o600}); return state;
  }
  private async initialize(): Promise<void> {
    const root = this.config.output_directory;
    this.compiler = await GatewayCompilerAdapter.start({graph_directory: resolve(this.config.graph_directory),
      bundle_directory: resolve(this.config.bundle_directory), generation_root: resolve(join(root, "generations"))}, join(root, "compiler"));
    this.bundle = await this.compiler.loadBundle(); this.guard();
    const graph = loadSeoulGraph(this.config.graph_directory);
    const stat = lstatSync(this.config.mapping_path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) reject("INVALID_MAPPING_FILE");
    this.mapping = parseJson(readFileSync(this.config.mapping_path)) as PublicRoadMapping;
    const regional=this.config.source==="kr-regional";
    if ((regional ? this.mapping.schema_version!=="kr-directed-mapping-0.2" || this.mapping.policy!=="kr-regional-envelope-v1"
      : this.mapping.schema_version !== "kr-directed-mapping-0.1" || this.mapping.policy !== "kr-directed-envelope-v1") ||
        this.mapping.graph_id !== this.bundle.graph_id || this.mapping.graph_edges_sha256 !== sha256(canonical(graph.edges))) reject("MAPPING_GRAPH_MISMATCH");
    const listed = [...this.mapping.entries, ...this.mapping.excluded].map(e => e.edge_id).sort();
    if (!canonical(listed).equals(canonical(this.bundle.catalog.map(e => e.edge_id).sort())) || new Set(listed).size !== listed.length ||
        this.mapping.entries.some(e => this.bundle.catalog.find(c => c.edge_id === e.edge_id)?.forward !== e.forward)) reject("MAPPING_CATALOG_MISMATCH");
    if(regional)validateRegionalMapping(this.mapping,this.bundle.catalog);
    const stream = sha256(canonical({graph_id: this.bundle.graph_id, mapping_sha256: sha256(canonical(this.mapping))}));
    const stateRoot = join(resolve(this.config.state_directory), stream);
    mkdirSync(stateRoot, {recursive: true, mode: 0o700});
    const signer = await this.signingState(stateRoot); this.guard();
    const trust: PublicTrafficTrust = {kid: signer.kid, public_jwk: signer.public_jwk, publisher_id: signer.publisher_id,
      graph_id: signer.graph_id, mapping_sha256: signer.mapping_sha256, valid_from: signer.valid_from, valid_until: signer.valid_until, revoked: false};
    durableNodeJSON(join(root, "trust-public.json"), trust);
    this.authority = await PublicSpeedAuthority.open({state_path: join(stateRoot, "accepted.sqlite"), trust,
      mapping: this.mapping, catalog: this.bundle.catalog, clock: () => this.now()});
    const collector = regional
      ? new RegionalSpeedCollector(this.config.regional_input_path!,this.config.bounds,this.mapping,{clock:()=>this.now(),signal:this.abort.signal})
      : new ItsSpeedCollector(this.dependencies.api_key ?? process.env.ROUTELENS_ITS_API_KEY ?? "", this.config.bounds,
        {clock: () => this.now(), signal: this.abort.signal});
    if (this.config.capture_evidence) mkdirSync(join(root, "public-source"));
    this.feed = PublicSpeedFeed.open({directory: stateRoot, bounds: this.config.bounds, mapping: this.mapping, catalog: this.bundle.catalog,
      publisher_id: signer.publisher_id, signer, authority: this.authority,
      collect: this.dependencies.collect ?? (() => collector.collect()), clock: () => this.now(),
      ...(this.config.capture_evidence ? {evidence_directory: join(root, "public-source")} : {})});
    const preferred = this.mapping.entries.find(e => this.mapping.provider_node_bindings?.some(b => b.link_id === e.link_id)) ?? this.mapping.entries[0];
    const edge = graph.edges.find(e => e.edge_id === preferred?.edge_id) ?? graph.edges.find(e => e.car_access && geodesicSphere.length(e.directed_geometry) > 75);
    if (!edge) reject("NO_BOOTSTRAP_ROAD");
    const length = geodesicSphere.length(edge.directed_geometry), p = [0.1, 0.9].map(f => geodesicSphere.position(edge.directed_geometry, length * f));
    const features = graph.context_roads.map(r => ({type: "Feature" as const, properties: {name: r.name},
      geometry: {type: "LineString" as const, coordinates: r.coordinates}}));
    const points = features.flatMap(r => r.geometry.coordinates);
    const regionalPreset=regional && existsSync(join(graph.directory,"regional-scenes.json"))
      ? (parseJson(readFileSync(join(graph.directory,"regional-scenes.json"))) as
        {scenes:Array<{route_id:string;locations:Array<{lon:number;lat:number}>}>}).scenes.find(s=>s.route_id==="regional-gyeongbu-south") : undefined;
    if(regionalPreset && regionalPreset.locations.length!==2)reject("REGIONAL_PRESET_REQUIRED");
    const long = regionalPreset ? {origin:{longitude:regionalPreset.locations[0]!.lon,latitude:regionalPreset.locations[0]!.lat},
      destination:{longitude:regionalPreset.locations[1]!.lon,latitude:regionalPreset.locations[1]!.lat}} :
      {origin:{longitude:127.029,latitude:37.4984},destination:{longitude:127.049,latitude:37.5045}};
    this.bootstrap = {schema_version: "public-route-0.1", graph_id: graph.graphId, source_class: "PUBLIC_AGENCY", clock_basis: "WALL_CLOCK_UTC",
      bounds: [Math.min(...points.map(p => p[0]!)), Math.min(...points.map(p => p[1]!)), Math.max(...points.map(p => p[0]!)), Math.max(...points.map(p => p[1]!))],
      roads: {type: "FeatureCollection", features}, presets: {long, short: {origin: {longitude: p[0]![0]!, latitude: p[0]![1]!},
        destination: {longitude: p[1]![0]!, latitude: p[1]![1]!}}}, attribution: {text: "© OpenStreetMap contributors · ODbL 1.0", url: "https://www.openstreetmap.org/copyright"}};
    durableNodeJSON(join(root, "app/bootstrap.json"), this.bootstrap);
    await this.feed.refresh(); this.nextPoll = this.now() + ITS_MIN_POLL_MS; this.guard();
    await this.ensureEngine(await this.feed.select(), true); this.guard();
    await this.startGateway(); this.guard();
    this.app = await startClientServer({gateway_origin: this.gatewayOrigin, gateway_token: this.token,
      assets_directory: this.config.assets_directory, bootstrap: this.bootstrap,
      ...(this.config.capture_evidence ? {evidence_directory: join(root, "app/http")} : {})});
    this.record("PUBLIC_CLIENT_READY", {origin: this.app.origin, stream, source_class: "PUBLIC_AGENCY"});
    this.timer = setInterval(() => {void this.tick();}, 1000);
    this.lifetime = setTimeout(() => {void this.close();}, this.config.lifetime_ms ?? 900000);
  }
  private nativeRequest(): TrafficRouteRequest {
    const s = this.bootstrap.presets.short;
    return {graph_id: this.bundle.graph_id, locations: [{lon: s.origin.longitude, lat: s.origin.latitude},
      {lon: s.destination.longitude, lat: s.destination.latitude}]};
  }
  private retire(slot: Slot): void {
    if (slot.users || !slot.retiring || this.slots.get(slot.generation.generation_id) !== slot) return;
    this.slots.delete(slot.generation.generation_id);
    const work = slot.engine.stop(); this.retiring.add(work);
    void work.catch(() => {this.cleanupFailed = true;}).finally(() => this.retiring.delete(work));
  }
  private activate(slot: Slot): void {
    for (const old of this.slots.values()) if (old !== slot && old.generation.traffic_snapshot_id !== null) {
      old.retiring = true; this.retire(old);
    }
  }
  private async ensureEngine(selected: PublicFeedSelection, verify: boolean): Promise<Slot> {
    this.guard();
    const snapshot = selected.selection.active?.manifest.traffic_snapshot_id ?? "baseline";
    const existing = [...this.slots.values()].find(s => (s.generation.traffic_snapshot_id ?? "baseline") === snapshot && !s.retiring);
    if (existing) {
      if (verify) await this.compiler!.prepare(selected.selection.active);
      this.guard();
      if (selectionIdentity(await this.feed!.select()) !== selectionIdentity(selected)) reject("PUBLIC_TRAFFIC_CHANGED");
      this.activate(existing); return existing;
    }
    const waiting = this.preparing.get(snapshot); if (waiting) return waiting;
    const work = (async () => {
      const generation = await this.compiler!.prepare(selected.selection.active); this.guard();
      const engine = await startNodeEngine(this.bundle, generation, resolve(join(this.config.output_directory, "engines")), this.nativeRequest(), this.abort.signal);
      try {
        this.guard();
        if (selectionIdentity(await this.feed!.select()) !== selectionIdentity(selected)) reject("PUBLIC_TRAFFIC_CHANGED");
        const slot: Slot = {engine, generation, users: 0, retiring: false}; this.slots.set(generation.generation_id, slot);
        this.activate(slot);
        this.record("PUBLIC_ENGINE_READY", {generation_id: generation.generation_id, snapshot_id: generation.traffic_snapshot_id});
        return slot;
      } catch (e) {await engine.stop(); throw e;}
    })();
    this.preparing.set(snapshot, work);
    void work.finally(() => {if (this.preparing.get(snapshot) === work) this.preparing.delete(snapshot);}).catch(() => {});
    return work;
  }
  private tick(): Promise<void> {
    if (this.ticking) return this.ticking;
    if (this.closing) return Promise.resolve();
    const work = (async () => {
      try {
        if (this.now() >= this.nextPoll) {
          this.nextPoll = this.now() + ITS_MIN_POLL_MS;
          await this.feed!.refresh(); this.guard();
          this.record("PUBLIC_SOURCE_REFRESH", (await this.feed!.select()).metadata);
        }
        await this.ensureEngine(await this.feed!.select(), false);
      } catch {
        if (!this.closing) this.record("PUBLIC_RECONCILE_UNAVAILABLE");
      }
    })();
    this.ticking = work; void work.finally(() => {if (this.ticking === work) this.ticking = undefined;}).catch(() => {}); return work;
  }
  async context(): Promise<GatewayRouteContext> {
    this.guard(); const {selection: s, metadata} = await this.feed!.select(); this.guard();
    return {schema_version: "public-route-0.1", graph_id: this.bundle.graph_id, traffic_snapshot_id: s.active?.manifest.traffic_snapshot_id ?? null,
      sequence: s.active?.manifest.sequence ?? null, high_water: s.high_water, checked_at_event_time: s.checked_at_utc,
      traffic_published_at: s.active?.snapshot.published_at ?? null, traffic_valid_until: s.active?.snapshot.valid_until ?? null,
      source_class: "PUBLIC_AGENCY", clock_basis: "WALL_CLOCK_UTC", public_traffic: metadata};
  }
  async route(request: GatewayRequest, signal: AbortSignal, deadline = performance.now() + 12000): Promise<GatewaySuccess> {
    this.guard();
    const left = Math.ceil(deadline - performance.now());
    if (signal.aborted || left <= 0) throw new GatewayError("DEADLINE_EXCEEDED");
    const combined = AbortSignal.any([signal, this.abort.signal, AbortSignal.timeout(Math.min(12000, left))]);
    const work = this.routeWork(request, combined, deadline); this.routeJobs.add(work);
    void work.finally(() => this.routeJobs.delete(work)).catch(() => {});
    return abortable(work, combined);
  }
  private async routeWork(request: GatewayRequest, signal: AbortSignal, deadline: number): Promise<GatewaySuccess> {
    this.guard(); validateGatewayRequest(request);
    const [west, south, east, north] = this.bundle.coverage_bounds;
    for (const p of [request.origin, request.destination]) if (p.longitude < west || p.longitude > east || p.latitude < south || p.latitude > north)
      throw new GatewayError("OUT_OF_COVERAGE");
    const selected = await this.feed!.select();
    if (signal.aborted) throw new GatewayError("DEADLINE_EXCEEDED");
    const slot = await this.ensureEngine(selected, true); this.guard();
    if (slot.retiring) throw new GatewayError("TRAFFIC_CHANGED");
    if (signal.aborted || performance.now() >= deadline) throw new GatewayError("DEADLINE_EXCEEDED");
    slot.users++;
    try {
      if (selectionIdentity(await this.feed!.select()) !== selectionIdentity(selected)) throw new GatewayError("TRAFFIC_CHANGED");
      await this.compiler!.verify(slot.generation);
      const nativeRequest: TrafficRouteRequest = {graph_id: this.bundle.graph_id,
        locations: [{lon: request.origin.longitude, lat: request.origin.latitude}, {lon: request.destination.longitude, lat: request.destination.latitude}],
        ...(request.snap_policy ? {snap_policy: request.snap_policy} : {}), ...(request.guidance_language ? {guidance_language: request.guidance_language} : {})};
      let native: Awaited<ReturnType<NodeNativeEngine["route"]>>;
      try {native = await slot.engine.route(nativeRequest, signal, deadline);}
      catch (e) {
        if (selectionIdentity(await this.feed!.select()) !== selectionIdentity(selected)) throw new GatewayError("TRAFFIC_CHANGED");
        if (e instanceof NativeRouteRejection) throw new GatewayError(e.reason); throw e;
      }
      const result = validateNativeRouteResult(native, request, "local-public-node", this.bundle, slot.generation);
      const final = await this.feed!.select();
      if (selectionIdentity(final) !== selectionIdentity(selected)) throw new GatewayError("TRAFFIC_CHANGED");
      await this.compiler!.verify(slot.generation); this.guard();
      const last = await this.feed!.select();
      if (selectionIdentity(last) !== selectionIdentity(selected)) throw new GatewayError("TRAFFIC_CHANGED");
      if (signal.aborted || performance.now() >= deadline) throw new GatewayError("DEADLINE_EXCEEDED");
      const s = last.selection;
      const response: GatewaySuccess = {...result, calculated_at: new Date(this.now()).toISOString(),
        high_water: s.high_water, checked_at_event_time: s.checked_at_utc, traffic_published_at: s.active?.snapshot.published_at ?? null,
        traffic_valid_until: s.active?.snapshot.valid_until ?? null, source_class: "PUBLIC_AGENCY", clock_basis: "WALL_CLOCK_UTC", public_traffic: last.metadata};
      if (this.config.capture_evidence) durableNodeJSON(join(this.config.output_directory, "readbacks", request.request_id + ".json"), {request, native, response});
      return response;
    } finally {slot.users--; this.retire(slot);}
  }
  private async startGateway(): Promise<void> {
    const server = createServer((req, res) => {void (async () => {
      res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store");
      const send = (status: number, body: unknown) => {if (!res.destroyed) {res.writeHead(status); res.end(JSON.stringify(body));}};
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 12000);
      this.requests.add(abort);
      const disconnect = () => {if (!res.writableEnded) abort.abort();};
      req.once("aborted", disconnect); res.once("close", disconnect);
      try {
        if (this.closing) {req.resume(); send(503, gatewayFailure("NO_HEALTHY_NODE")); return;}
        if (this.requests.size > 4) {req.resume(); send(gatewayHttpStatus("RATE_LIMITED"), gatewayFailure("RATE_LIMITED")); return;}
        if (req.headers.host !== this.gatewayOrigin.slice(7) || !tokenEqual(req.headers.authorization ?? "", "Bearer " + this.token)) {
          req.resume(); send(403, gatewayFailure("AUTH_REQUIRED")); return;
        }
        if (req.method === "GET" && req.url === "/v1/route-context") {send(200, await this.context()); return;}
        if (req.method !== "POST" || req.url !== "/v1/routes") {req.resume(); send(404, gatewayFailure("INVALID_INPUT")); return;}
        const deadline = performance.now() + 12000;
        let value: unknown;
        try {value = await readNodeBody(req, deadline);}
        catch (e) {throw new GatewayError(abort.signal.aborted || e instanceof TrafficError && e.reason === "REQUEST_DEADLINE"
          ? "DEADLINE_EXCEEDED" : "INVALID_INPUT");}
        validateGatewayRequest(value);
        send(200, await this.route(value, abort.signal, deadline));
      } catch (e) {
        const reason: GatewayReason = abort.signal.aborted ? "DEADLINE_EXCEEDED" : e instanceof GatewayError ? e.reason :
          e instanceof PublicSpeedError && e.code === "PUBLIC_TRAFFIC_CHANGED" ? "TRAFFIC_CHANGED" : "NO_HEALTHY_NODE";
        send(gatewayHttpStatus(reason), gatewayFailure(reason));
      } finally {clearTimeout(timer); this.requests.delete(abort); req.off("aborted", disconnect); res.off("close", disconnect);}
    })();});
    server.headersTimeout = 5000; server.requestTimeout = 15000; this.gateway = server;
    await new Promise<void>((done, fail) => {server.once("error", fail); server.listen(0, "127.0.0.1", () => {server.off("error", fail); done();});});
    const address = server.address(); if (!address || typeof address === "string") reject("PUBLIC_GATEWAY_ADDRESS");
    this.gatewayOrigin = "http://127.0.0.1:" + address.port;
  }
  close(): Promise<boolean> {
    return (this.closed ??= (async () => {
      this.closing = true; this.abort.abort(); clearInterval(this.timer); clearTimeout(this.lifetime);
      let clean = true;
      const settle = async (run: () => Promise<unknown>) => {try {await run();} catch {clean = false;}};
      for (const request of this.requests) request.abort();
      await settle(async () => this.app?.close());
      await settle(async () => {if (this.gateway) await new Promise<void>(done => {this.gateway!.close(() => done()); this.gateway!.closeAllConnections();});});
      await settle(async () => {const result = await this.compiler?.close(); if (result && !result.cleanup_verified) clean = false;});
      await Promise.allSettled([...this.preparing.values()]);
      for (const slot of this.slots.values()) await settle(() => slot.engine.stop());
      this.slots.clear();
      await Promise.allSettled(this.routeJobs);
      const retired = await Promise.allSettled(this.retiring); if (retired.some(r => r.status === "rejected") || this.cleanupFailed) clean = false;
      await settle(async () => this.ticking); await settle(async () => this.feed?.close()); await settle(async () => this.authority?.close());
      try {durableNodeJSON(join(this.config.output_directory, "cleanup.json"), {cleanup_verified: clean, source_class: "PUBLIC_AGENCY",
        message_en: "Owned public client, compiler, native engines and SQLite closed; failures remain explicit.",
        message_ko: "소유 공공 화면·변환·엔진·SQLite를 종료했으며 실패는 명시합니다."});} catch {clean = false;}
      this.finish(clean); return clean;
    })());
  }
}
