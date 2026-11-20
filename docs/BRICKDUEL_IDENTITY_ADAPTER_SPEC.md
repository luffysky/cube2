# 轉磚（BRICKDUEL）× SnowRealm Identity：整合規格與現況

更新：2026-11-20（第二版）｜負責：Claude（cube2）｜對照文件：GPT〈SnowRealm Identity × 轉磚：整合協定定案 v1.0〉、〈SnowRealm Games × Claude 完整交接包 2026-11-20〉、cube1〈BRICKDUEL_ACCOUNT_INTEGRATION_APPROVAL_zh-TW.md〉（Owner 核准書）

> 這份文件分清楚「已上線」「已寫碼未上線」「待 GPT」「待雙方」。**SnowRealm Identity 目前沒有正式服務，轉磚沒有、也不會用假 token 接上正式環境。**

## 1. 現況（以 cube2 `main` 為準）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 轉磚自己的雲端存檔 | **已上線** | 不註冊、不存信箱密碼。第一次需要時伺服器發一組裝置憑證（只存在瀏覽器），換裝置用 10 分鐘一次性的引繼碼。資料在 Neon `zz` schema。 |
| 「登入／註冊」入口 | **已上線（引導）** | 主選單「登入／註冊」與個人頁都有「SnowRealm Games 帳號」區塊，按鈕開新分頁到 `https://games.snowrealm.pet/`，說明「右上角『登入』→『註冊』」。13 歲以下不顯示註冊按鈕，只說明不用註冊也能玩。 |
| 轉磚 ↔ SnowRealm 帳號綁定 | **未開放** | 等 Identity 上線並完成雙方驗收。畫面上已告知玩家：轉磚的進度與金幣保留，綁定時再接上。 |
| 驗 Identity JWT 的伺服器端轉接層 | **已寫碼、已部署，開關關閉** | `server/identity.js`（驗證器）、`server/core.js` 的 `idStatus`／`idLink`／`idRecover`、`/api/rpc` 動作 `idStatus`／`idLink`／`idRecover`。沒設 `IDENTITY_*` 就回 503 `off`；離線測試 `test/identity.test.js` 49 條通過。 |
| 資料表 `zz.identity`、`zz.idjti` | **已加入建表程式（非破壞性 CREATE IF NOT EXISTS）** | 正式資料庫在下一次 API 建表檢查時建立；開關關閉時不寫入任何資料。DDL 與回滾見 `docs/BRICKDUEL_IDENTITY_MIGRATION.md`。 |
| BFF（授權碼 + PKCE、callback、HttpOnly 工作階段） | **待 GPT 提供授權端點後實作** | 現在 `idLink`／`idRecover` 暫收請求內的短效 JWT（`idt`），只供離線測試；正式上線前要改成 BFF callback 換得的伺服器端工作階段。 |
| 磚塊小遊戲（/games）金幣與紀錄 | **已上線** | 小遊戲結果先排在瀏覽器佇列，打開轉磚時由 Meta 入帳；有雲端存檔時伺服器重算（op `mini`，時間額度與每日 300 上限）。紀錄存在轉磚自己的玩家資料，與 cube1 無關。 |

## 2. 身分與資料歸屬（沿用 GPT 定案）

- 平台玩家 ID：Identity JWT 的 `sub`（SnowRealm 平台 UUID）。**不是** SteamID、不是 Neon Auth `sub`、也不是轉磚玩家 ID。
- 轉磚保留自己的玩家 ID（`zz.players.id`）、金幣、道具、段位、排行榜與對戰紀錄。cube1／cube2 不互通遊戲經濟，不共用資料庫或密碼。
- 綁定表：`zz.identity(platform_id uuid PRIMARY KEY, pid uuid NOT NULL UNIQUE REFERENCES zz.players(id) ON DELETE CASCADE, linked_at double precision NOT NULL, provider_hint text)`，一對一。**更正：第一版誤寫 `pid bigint`，`zz.players.id` 實際是 `uuid`，已改正（Owner 核准書第 3 節指出）。** 另有 `zz.idjti(jti text PRIMARY KEY, exp)` 防同一 token 重用。
- 轉磚 API **不處理** Steam Ticket、SteamID、Neon Auth Session；Steam 由 Identity 可信後端換成平台 UUID。

## 3. 伺服器端驗證（預定實作，開關預設關）

只在下列環境變數都設好時啟用（只列名稱）：`IDENTITY_ISSUER`、`IDENTITY_JWKS_URL`、`IDENTITY_AUDIENCE`（預期 `snowrealm:brickduel:api`）、`IDENTITY_LINK_ENABLED`（`1` 才開放綁定）。

驗證規則（照 v1.0）：
- `alg` 只收 EdDSA（Ed25519）；`none`、HS256、其他一律拒絕。header 必須有 `kid`，並在 JWKS 找得到。
- `iss` 完全相等；`aud` 完全相等（陣列時必須包含且只用於轉磚）。
- `iat` 必填、不得晚於伺服器時間 60 秒以上；`exp` 必填、`exp - iat ≤ 600`；`nbf` 有就驗；`jti` 必填（寫入稽核，短期內重複即拒絕）；`sub` 必須是 UUID。
- JWKS：有限時快取（例如 10 分鐘）、逾時重試；拿不到可驗證的金鑰就拒絕，不放行。
- 多 issuer 過渡：每個 issuer 各自的 JWKS、audience、演算法、啟用狀態與淘汰日；不做「issuer 名單一律放行」。

綁定流程（伺服器端已實作；登入畫面等 BFF）：
1. 玩家在轉磚按「綁定 SnowRealm 帳號」→ 走 Identity 的 OAuth/OIDC 授權碼 + PKCE（由 Identity／BFF 處理，轉磚不碰長期密鑰）。
2. 轉磚後端收到短效 JWT → 驗證 → 顯示「這台裝置的進度」與「平台帳號已綁的轉磚進度（如果有）」→ 玩家確認。
3. 交易內寫 `zz.identity`；平台 UUID 已綁別的轉磚玩家時**不自動合併**，請玩家選擇保留哪一份。
4. 綁定成功：這台裝置的舊憑證與所有引繼碼作廢、重新發裝置憑證（已實作）。之後排位、開房、資產操作需要有效 JWT 且 `sub` 與綁定一致（**未實作**，等登入閘門一起做）。
5. 找回（`idRecover`）：另一台裝置用平台身分取回同一份轉磚存檔，發一把新的裝置憑證（已實作）；被停權的存檔回 403。
6. 錯誤：`401 auth`（沒有裝置憑證）、`401 identity`（token 不過，`detail` 說哪一項）、`409 replay`／`linked`／`taken`／`race`、`404 none`、`503 off`（關閉）、`503 identity/jwks`（金鑰取不到）。

## 4. 測試清單

已完成（`node test/identity.test.js`，本機產生的 Ed25519 測試金鑰，不碰正式環境）：開關關閉回 503；合法通過；過期、未來 iat、壽命超過 600 秒、錯 audience（含 admin audience）、錯 issuer、錯簽章、HS256／none、缺 kid／jti／sub、sub 不是 UUID、nbf 未到、缺綁定 scope 全部拒絕；金鑰輪替（兩把並存、舊鑰撤下）、JWKS 掛掉時拒絕；綁定需要裝置憑證、舊憑證作廢、同 token 不能重用、已綁別人回 409 且兩份存檔都保留、兩台同時綁只成功一次、另一台找回同一份、Identity 掛掉時匿名遊戲照常。

等 Identity 交付後要再跑（真實服務）：

1. 合法 JWT 通過；過期、未來 `iat`、壽命超過 10 分鐘、錯 audience、錯 issuer、錯簽章、`alg` 不允許、缺 `kid`／`jti`／`sub` 全部拒絕。
2. JWKS 新舊金鑰輪替、舊鑰淘汰、JWKS 暫時連不上時安全拒絕、緊急撤銷。
3. 同一平台 UUID 不會建立兩個轉磚玩家；兩個不同平台 UUID 不會被合併；綁定競態（同時兩台綁）只成功一次。
4. 舊裝置憑證在綁定後不能操作已綁定玩家的排位、房間、資產。
5. 停權：排位入場拒絕；單機、CPU、練習、磚塊小遊戲照常可玩。
6. 開關關閉時，所有現有匿名玩法與既有測試全數通過（目前 `node test/run.js` 與瀏覽器測試）。

## 5. 需要 GPT 交付／確認

- Identity 正式網域、issuer、JWKS URL、轉磚 audience，以及可用的非機密測試金鑰或測試簽發端。
- BFF 用的授權端點、token 端點、client 註冊方式與允許的 callback（轉磚預定 `https://brickduel.snowrealm.pet/api/auth/callback`（Owner C-022 定案））。
- 平台登入入口能否支援從外部連結直接打開註冊（例如 `https://games.snowrealm.pet/?member=register`）。目前首頁沒有這種連結，轉磚只能帶到首頁並說明「右上角登入 → 註冊」。
- 綁定（link）用的授權流程端點與回呼網址規則（PKCE、state、允許的 redirect URI）。
- 停權／撤銷的查詢或通知方式。
- 不交換真實 JWT、Session Cookie 或 Steam Ticket；只用測試資料對齊。

## 6. 不做的事

- 不改 cube1，不讀 cube1 的資料庫或 Secrets。
- Identity 上線前，不在正式環境開啟綁定，不宣稱「已用 SnowRealm 帳號登入」。
- 不把轉磚金幣、道具、段位帶到其他遊戲，也不收其他遊戲的經濟資料。

## 7. OAuth BFF（2026-11-21 實作，`server/bff.js`；開關仍關）

| 項目 | cube2 實作 |
|---|---|
| Client | `brickduel-bff`；callback 固定 `https://brickduel.snowrealm.pet/api/auth/callback` |
| 開始 | `POST /api/auth/start {intent:'link'|'recover'|'restore'}`，只接受同站；`link` 要帶這台裝置的金鑰（證明擁有這份存檔）。每 10 分鐘同一份存檔／同一網路位置最多 10 次 |
| 工作階段 | 伺服器產生 32 bytes 的 session id、state、nonce 和 PKCE verifier（S256）。瀏覽器只拿到 `__Host-zzauth` cookie（Secure、HttpOnly、SameSite=Lax、Path=/、10 分鐘）。資料庫 `zz.authsess` 只存 session id 的雜湊；verifier／state／nonce 用從 session id 衍生的金鑰（HKDF-SHA256 → AES-256-GCM）加密保存，只有資料庫讀不出來 |
| 導向 | `https://games.snowrealm.pet/?sso=brickduel&client_id=brickduel-bff&redirect_uri=…&response_type=code&code_challenge=…&code_challenge_method=S256&state=…&nonce=…`（與 cube1 `dist/sso-flow.mjs` 相符）。使用者同意由 Games 平台的可信後端確認，cube2 不採信瀏覽器的 `consent:true` |
| Callback | 要有 cookie、對得上未使用且未過期的 session；**一進來就用一條 SQL 標記為已用**（不管後面成不成功）。驗 `state`（固定時間比較）、`iss` 參數（有帶就必須相同）、`error`、code 格式 |
| 換 token | 伺服器 `POST {iss}/oauth/token`，標頭 `x-snowrealm-client-secret`，JSON `{clientId, redirectUri, code, codeVerifier, state, nonce}`，5 秒逾時，不跟隨轉址 |
| 驗 token | `server/identity.js`：EdDSA、kid、iss、aud=`snowrealm:brickduel:api`、scope=`brickduel:account:link`、sub（UUID）、iat／nbf／exp（≤600 秒）、jti；token 若帶 `nonce` 必須相同 |
| 撤銷 | `POST {iss}/v1/token/status`（Bearer token＋client secret），只有 200 且 `active === true` 才繼續；`active:false`、401、403 → `revoked`；503、逾時、JWKS 抓不到 → `unavailable`，全部 fail-closed |
| 綁定 | 沿用 `core.idLink`／`core.idRecover`：jti 只能用一次、一對一、409 衝突不合併不覆蓋不轉金幣；綁定時這台裝置換新金鑰、舊金鑰和引繼碼作廢；等待刪除的存檔 30 天內可用 `restore` 取消刪除 |
| 回到遊戲 | `303 /?auth=<結果>`（只有一個字，沒有 token、code）。頁面立刻把網址清掉，再 `POST /api/auth/result`（同一個 cookie）拿一次結果；新裝置金鑰讀過就從資料庫清掉，cookie 同時清除 |
| 結果字 | `linked` `recovered` `conflict` `pending` `none` `ban` `purged` `session` `expired` `replay` `state` `denied` `code` `token` `revoked` `unavailable` `off` |
| 開關 | `IDENTITY_ISSUER`、`IDENTITY_JWKS_URL`、`IDENTITY_AUDIENCE`、`IDENTITY_LINK_ENABLED=1`、`IDENTITY_BRICKDUEL_CLIENT_SECRET`（至少 32 字）都在才開；否則 start／result 回 503、callback 導回 `/?auth=off`，`/api/health` 的 `link` 為 false，頁面不顯示連結按鈕 |

**測試**：`test/bff.test.js`（66 項，用測試自己產生的金鑰模擬 Identity）：正常綁定、錯 state、錯 nonce（token 端拒絕、token 內 nonce 不同）、同一 callback 重放、已換過的 code、過期、沒有 cookie／別人的 cookie（換機）、409（兩份存檔都不變、金幣不變）、已綁的存檔不能再綁別的帳號、撤銷（active:false、403、503、逾時、`active` 不是 true）、token 端 503／逾時、JWKS 失聯、拒絕的情況都沒有發出裝置金鑰、另一台裝置找回、等待刪除後恢復、限流；`test/authui.js`（瀏覽器 9 項）。

**還沒做到（不能假裝通過）**：cube1 的 `/oauth/authorize`、`/oauth/token` 目前回 503，`identity.snowrealm.pet` 尚無正式部署，所以**沒有任何正式 E2E**。開 `IDENTITY_LINK_ENABLED` 要等兩邊用兩個測試帳號驗收。開之前還要 Owner 決定過期 session 怎麼清。同意畫面與隱私權政策已改成「會用一個必要 cookie」並寫明名稱、用途、內容、期限（2026-11-21）。
