# P07 signed publication and trust / 서명 게시·신뢰 계약

Status: main design fixed before implementation,2026-10-25. P06 is merged through protected PR#7 (`d9b08e9`), with local/hosted151 and Node22/24 each183 verified. Sol implements this contract; main reviews and executes the fresh whole system. P07 means actual publication and durable consumer verification, not routing-engine activation (P08).

상태:2026-10-25 구현 전에 메인이 설계를 고정합니다. P06은 보호된 PR#7로 병합됐고 로컬·원격151개와 Node각183개를 검증했습니다. Sol이 구현하고 메인이 검토·새 전체 실행을 맡습니다. P07은 실제 게시·영속 수신 검증이며 경로 엔진 활성화는 P08입니다.

## Reuse and ownership / 재사용·책임

Pin `jose@6.2.13` for standard compact JWS signing/verification and Ed25519 keys (`alg=EdDSA`). Reuse Node WebCrypto, existing strict JSON parsing, SHA256, PostgreSQL18.6/pg transactions and owned process/DB cleanup. No handwritten cryptography, remote key discovery, TUF substitute or engine fork. TUF for graph/program deployment stays separate. RouteLens owns schema, permissions, ordering, freshness, atomic publication and durable acceptance. Publisher serialization may be stable for idempotency; verifier signs/verifies exact standard JWS payload bytes and hashes exact artifact bytes, never reserializes incoming JSON as signature input.

표준JWS・Ed25519は固定したjoseを使い、既存の厳格JSON・SHA256・PostgreSQL・所有資源管理を再利用します。暗号を自作せず、鍵のネットワーク自動取得やエンジン改変もしません。地図・プログラム配布のTUFは別です。RouteLensは契約・権限・順番・鮮度・원자 게시・영속 수용を担当します。受信JSONの並べ替えで署名を検証せず、受け取ったJWSとファイルの正確なバイトを検証します。

## Wire contract / 通信契約

`TrafficSnapshot` extends the exact P06 public draft with `simulation_namespace`, `publisher_id`, positive safe-integer `sequence`, and `published_at`. Retain `forward` in entries. All entries in this executable pilot are SYNTHETIC; retain every verified catalog edge, exactly once and sorted. No raw coordinates, contributor/trip/sample IDs or private inputs are public. `traffic_snapshot_id` is SHA256 of exact UTF-8 artifact bytes and is not inside the artifact itself.

TrafficSnapshotはP06公開候補に試験領域・発行者・正の安全整数順番・発行時刻を加えます。方向を保ち、実行対象の全区間はSYNTHETICで検証済み一覧を重複なく保持します。元座標・個人/旅行/標本識別子・非公開入力は出しません。ファイル識別子は正確なUTF-8バイトのSHA256で、循環を避けファイル自身に含めません。

Compact JWS protected header is exactly `{alg:"EdDSA",kid,typ:"routelens-traffic-manifest+jws"}`. No jku/jwk/x5u/crit/b64 or unprotected metadata. Its JSON payload is exactly:

```typescript
type TrafficManifest = {
  schema_version: "0.1";
  simulation_namespace: string;
  publisher_id: string;
  graph_id: string;
  region_id: "seoul-pilot-corridors-v1";
  sequence: number;
  window_start: string;
  window_end: string;
  published_at: string;
  valid_until: string;
  aggregation_policy: "seoul-window-median-v1";
  traffic_snapshot_id: string; // SHA256 / 내용 해시
  byte_length: number;
  media_type: "application/json";
};
```

The artifact and manifest must agree on every duplicated field. Exact fields/enums, finite numbers, strict UTC millisecond timestamps, safe integers, duplicate JSON keys, duplicate edges, full catalog identity, positive LIVE speeds with allowed buckets and null non-LIVE speed/bucket are checked. Reject unknown fields for this pilot version. Maximum manifest64KiB, artifact2MiB,10,000 entries. Invalid UTF-8 fails. Unknown algorithms, unknown/duplicate kid and asymmetric key types other than public OKP/Ed25519 fail. Limits are checked before parsing or unbounded response accumulation.

중복 필드はファイルと署名一覧で一致が必要です。固定フィールド・列挙値・有限数・UTCミリ秒・安全整数・JSONキー/区間重複・完全な区間一覧・LIVE正速度/許可標本区間・それ以外nullを検証します。この版では未知フィールドを拒否します。上限は署名一覧64KiB・内容2MiB・10,000区間です。UTF-8不正・未知アルゴリズム・未知/重複kid・公開Ed25519以外を拒否し、解析や応答蓄積前に上限を適用します。

## Trusted scope and time / 信頼範囲・時刻

Trust roots are explicit local configuration: public JWK, kid, publisher, simulation namespace, region, exact allowed graph IDs, SYNTHETIC source, valid_from/valid_until and revoked flag. Keys never authorize themselves through signed data or URL metadata. Require key validity at published_at and current effective time, and not revoked. Allow preconfigured key rotation for the same publisher without resetting sequence. Generation is per run; private keys remain only in owned0600 private files and process memory. Archive public roots and signed bytes, never private JWK `d` or DSNs/tokens.

信頼鍵はローカル設定に公開JWK・kid・発行者・試験領域・地域・許可グラフ・合成出所・有効期間・失効を明記します。署名されたデータやURLだけで自分自身を信頼させません。発行時と現在の両方で鍵が有効かつ未失効であることを要求します。事前設定した鍵交換でも順番を維持します。秘密鍵は毎回生成し所有する0600設定・メモリだけに置き、公開鍵・署名バイトだけを証拠に残します。

Use the existing persisted monotonic namespace event clock for simulated time, never a stale caller's timestamp. Windows remain60s; published_at must be >=window_end+30s and <=effective now; valid_until must equal window_end+180s; now>=valid_until is expired. A delayed publication cannot extend TTL. Read current publication/consumer state against the current clock on every call. Advancing only the clock must remove usable traffic without a publisher or sweep. Keep the highest observed sequence after expiry/restart. Database/process real time still controls operation timeouts.

合成時間は既存の永続・単調な領域時刻を使い、古い呼び出し時刻に戻しません。60秒窓・終了+30秒以降の発行・発行時刻が現在以前・有効期限が終了+180秒であることを要求し、現在が期限以上なら失効です。遅い発行で期限を延ばしません。現在値・受信状態を読むたびに時刻を確認し、時計だけ進めても速度利用が止まります。失効・再起動後も最高順番は保持します。

## Durable publisher / 永続する発行側

A publisher worker reads a **current authoritative P06 candidate row**, not an arbitrary caller-supplied draft. Verify its canonical hash/catalog/graph/source/window and freshness. In a single PostgreSQL transaction, lock clock SHARE, candidate SHARE, then the stream row UPDATE; sign and insert immutable artifact bytes+JWS and advance current pointer/sequence together. Stream identity is(namespace,publisher,region), across graph/key changes. Initial row insertion must be concurrency-safe. Statement15s/lock5s bounds apply. A sequence never exceeds Number.MAX_SAFE_INTEGER.

発行処理は任意の渡された候補ではなく、現在の正しいP06候補行を読みます。内容ハッシュ・一覧・地図・出所・窓・鮮度を検証し、時計共有→候補共有→発行系列更新の順にロックします。同じDBトランザクションで不変ファイルバイト・JWS・現在参照・順番をまとめて保存します。系列は領域/発行者/地域で、地図・鍵交換では順番を戻しません。初回作成の競合にも対応し、既存の処理/ロック時間制限・安全整数上限を守ります。

An unchanged latest candidate hash/window/kid returns exactly the same committed sequence/artifact/JWS. Changed candidate or signing kid produces the next sequence; older windows never become current. After pre-commit SIGKILL, no partial artifact/pointer/sequence is visible. After committed-but-unacknowledged SIGKILL, retry returns identical bytes with no increment. Two workers racing the same candidate converge to one version. Retain old artifacts immutable for the bounded run; no public-artifact garbage collection or backup erasure claim.

最新候補の内容・窓・kidが同じなら保存済み順番/内容/JWSをそのまま返します。候補や鍵が変われば次の順番を発行し、古い窓は現在値にしません。コミット前強制終了では半端な参照を見せず、コミット後応答前の終了でも再試行は同一バイト・同一順番です。同一候補の競合も1版に収束します。古い公開内容は試験中不変で保持し、公開ファイルGCやバックアップ消去は主張しません。

A P07 AFTER DELETE or changed-canonical-hash UPDATE trigger on P06 candidates clears a matching current pointer in the same transaction. This extends P05 revoke→P06 invalidation to the publication lookup. Keep immutable historical bytes and the stream high-water counter. Recompute P06 and publish a higher-sequence correction for future pulls; previously downloaded files remain cryptographically valid until TTL unless the consumer receives a newer version or key revocation. Do not promise immediate recall from offline clients. Publisher locks must not invert the existing revoke/aggregation lock order.

P06候補の削除・内容ハッシュ変更と同一トランザクションで、対応する現在参照を無効化します。P05撤回→P06無効化を公開取得まで接続し、履歴バイト・最高順番は残します。再集計後は次の順番で訂正版を発行します。既に取得された内容は新しい版や鍵失効を受け取るまでは期限内の署名が有効なので、オフライン利用者からの即時回収は保証しません。既存の撤回/集計とのロック順を逆転させません。

## HTTP and consumer / HTTP・受信側

A separate real loopback service exposes GET `/v1/simulations/{namespace}/regions/{region}/current` (compact JWS, application/jose, no-store) and GET `/v1/simulations/{namespace}/artifacts/{sha256}` (exact immutable JSON bytes, length/hash metadata). Missing/invalidated current is404; expired current410; unsupported method405; errors are bounded bilingual structured messages. Only a configured owned127.0.0.1 origin is used by the pilot fetcher. It constructs artifact paths from verified hash, follows no redirects, uses5s timeouts and streaming byte bounds. Manifest-supplied origins/paths are not accepted. This is local transport proof, not production HTTPS/authentication.

別の実プロセスで現在JWSと不変内容をHTTP提供します。現在参照はキャッシュせず、未作成/無効化404・期限切れ410・非対応メソッド405を使い、エラーは制限した二言語の構造化形式です。受信側は設定済みの所有ローカル接続先のみを使い、検証したハッシュから内容パスを作ります。リダイレクト追跡なし・5秒制限・ストリーム容量制限で、受信一覧にある任意URLには接続しません。運用HTTPS・認証の証明ではありません。

A separate consumer worker verifies JWS/trust, bounded artifact bytes/hash/length, strict snapshot contents and expected scope, then atomically persists accepted bytes, snapshot ID, sequence and window under consumer identity+stream. Verification alone is not acceptance. Concurrent consumers lock one state row; sequence<high-water is replay, same sequence with different ID is conflict, same sequence/ID is an idempotent retry, and a newer sequence cannot move window backward. Recheck current clock inside the acceptance transaction after network/crypto work. Invalid candidates preserve a still-valid accepted version and never advance high-water. Consumer restart/SIGKILL after commit cannot roll back durable state. Current status rechecks expiry and configured trust, clears unusable active state and retains high-water. P08 will consume this verified state; P07 must not label it engine-activated.

独立した受信処理が署名/信頼・サイズ/ハッシュ・厳格内容・期待範囲を検証し、受信者/系列ごとに内容・識別子・順番・窓を原子的に受理します。署名確認だけでは受理完了としません。競合は同じ行をロックし、低い順番を再生攻撃・同一順番別内容を衝突とし、同一内容の再試行は同じ結果です。新順番でも窓は後退させません。通信/暗号処理後のトランザクション内でも現在時刻を確認します。不正内容で有効な旧版や最高順番を変えず、再起動/強制終了でも保持します。状態取得でも期限/設定信頼を再確認し、利用不可の内容を外して最高順番は残します。エンジン活性化とは表示しません。

## Direct acceptance evidence / 直接検証

Before any final whole run, focused tests cover parser/crypto/scope/time/order boundaries. Integration starts real PostgreSQL, actual short Seoul GPS→HTTP→P05 worker→P06 aggregation, publisher worker/service and separate consumer processes. Do not seed a successful public draft directly into the P07 store or substitute previous PASS files. A controlled real HTTP fault server may serve deliberately invalid signed/unsigned bytes only for negative cases. Keep authored expected values before engine execution.

最終全体実行の前に解析/暗号/範囲/時刻/順番の集中検査を行います。統合は実DB・実際の短い서울GPS→HTTP→P05処理→P06集計・発行処理/サーバー・別受信プロセスを起動します。成功候補を直接P07へ注入したり昔の成功ファイルで代用しません。不正応答専用の実HTTP試験サーバーは負例に限り使用できます。期待値はエンジンより先に保存します。

Required evidence groups (individual cases must be named, asserted and linked):

1. Actual P06→signed publication→HTTP bytes→durable acceptance, all79 entries and source hashes preserved; immutable same-hash retrieval and repeated publication identity.
2. Real publisher SIGKILL before commit and after commit/before response, retry bytes and sequence, concurrent publication and process restart.
3. Invalid signature, changed artifact/hash, wrong length, truncation, oversize, duplicate JSON keys, unsupported fields/algorithm and disallowed key fail before state mutation.
4. Validly signed wrong graph/namespace/region/publisher and revoked/expired/not-yet-valid key scopes rejected; preconfigured new-key rotation accepted without sequence reset.
5. Old sequence after consumer process restart, same-sequence different content, and newer-sequence older window rejected; two consumers racing newer/older valid versions never lower high-water.
6. Real consumer SIGKILL after committed acceptance but before acknowledgement; retry idempotent. Pause after crypto verification, advance clock to exact expiry, then ensure acceptance refuses expired data.
7. Published-at future, expiry239.999/240.000, stale callers, actual HTTP publisher outage retaining a still-valid accepted version then removing it on clock-only expiry; highest sequence survives.
8. P05 HTTP revoke while publication is paused: actual DB lock evidence, acknowledged deletion already removes current; fresh P06 recompute/publish gives higher-sequence INSUFFICIENT; a newer empty window replaces rather than inherits speed.
9. Original signed bytes/public roots, DB read-backs and process records contain no private key material/DSNs/tokens; only owned services/processes/DB/volumes/ports are cleaned.

필수 근거는 실제 연결·불변성·발행 전후강제종료/경쟁·변조/크기/형식·권한·순번/재시작/경쟁·수신 후강제종료·검증중만료·정확한시각/장애·철회잠금/현재참조삭제/상위순번정정·새빈창·비밀미노출·소유자원정리입니다. 각 사례에 이름·판정·원문 링크가 있어야 합니다.

The whole runner retains all151 existing checks and appends P07 groups; no weaker denominator or skip-success path. It displays original/P06 playback plus recorded publication/acceptance/rejection/expiry evidence, clearly separate from routing activation. Main independently verifies standard JWS signatures from public keys and exact downloaded bytes, accepted state, process failures and cleanup; then captures bilingual desktop/mobile/screenshots/actual video, updates READMEs and report, pushes, inspects hosted Node22/24/full Docker results and merges only through protected checks.

전체 실행은 기존151개를 유지하고 P07을 추가하며 분모나 생략 성공을 바꾸지 않습니다. 기존/P06재생에 실제게시/수용/거부/만료근거를 연결하되 경로 반영과 구분합니다. 메인은 공개키로 표준JWS·다운로드바이트·저장상태·장애·정리를 독립 검사하고 한영화면/모바일/실제녹화/README/보고서를 갱신해 푸시·원격검사·보호병합합니다.
