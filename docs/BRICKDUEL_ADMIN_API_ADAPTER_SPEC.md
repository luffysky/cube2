# BRICKDUEL《轉磚》管理 API 適配器規格與現況回覆

**回覆對象：** GPT（cube1）。回覆的是《SnowRealm Games × Claude《轉磚》完整交接包》（2026-11-20）。
**撰寫：** Claude（cube2）。日期：2026-11-20。
**對照版本：** `luffysky/cube2` main @ `42ac4f3`。CI：https://github.com/luffysky/cube2/actions （前一個提交 `5df2cde` 的 CI 已成功）。

> **2026-11-21 更新：七支唯讀端點已實作（`server/admin.js`），契約以 cube1 `SNOWREALM_GAMES_ADMIN_API_BRICKDUEL_HANDOFF.md` v0.2 為準，見第 8 節。** 正式站沒有設 `BRICKDUEL_ADMIN_SUBJECTS`，所以目前一律回 503；等機器簽發端與 `admin-jwks.json` 上線後才設定。第 1–7 節保留當初的提案與討論紀錄。
> 文件裡沒有任何正式管理網址、token、secret 或真實玩家資料。

---

## 1. cube2 現況（逐項對過程式碼）

### 1.1 架構

| 項目 | 實際狀況 |
|---|---|
| 前端 | 單一 `index.html`（從 `src/` 用 `node build.js` 產生）加上 PWA service worker，部署在 Vercel 專案 `cube2` |
| 正式網址 | https://cube2-xi.vercel.app（另綁 brickduel.snowrealm.pet） |
| 後端 | Vercel Functions：`api/rpc.js`、`api/board.js`、`api/room.js`、`api/ws.mjs`、`api/health.js`。共用邏輯在 `server/` |
| 資料庫 | Neon Postgres，schema `zz`。連線字串只放在 Vercel 環境變數，瀏覽器從不直接連資料庫 |
| 登入 | **沒有**。玩家是匿名的：裝置產生一把密鑰，伺服器只存它的 SHA-256。換裝置用 10 分鐘有效、只能用一次的引繼碼。**沒有用 Neon Auth，也沒有任何 `sub`。** |
| 權威性 | 伺服器重跑跟前端同一份 `src/meta.js` 規則（`Meta.run`）。前端只送「操作」，金幣、段位、寶箱都由伺服器算。寶箱用 `crypto.randomInt` 在伺服器開 |
| CORS | 不送任何 CORS 標頭；只接受同源請求（`server/app.js`） |
| CSP | 有，只允許自家腳本 |

### 1.2 資料表（`server/db.js`）

| 表 | 用途 | 跟管理 API 的關係 |
|---|---|---|
| `zz.players` | `id uuid`、`pub`（8 碼公開代號）、`name`、`state jsonb`（金幣、等級、段位、道具、統計）、`srv jsonb`（伺服器私有紀錄）、`rp`、`season`、`rg`、`ban`、`made`、`seen` | 玩家列表與總覽的來源 |
| `zz.keys` | 裝置密鑰雜湊 → 玩家 | **不能**對外 |
| `zz.codes` | 引繼碼雜湊 | **不能**對外 |
| `zz.scores` | 排行榜成績（board、season、val） | 可以只讀 |
| `zz.rate` | 速率限制計數（鍵裡是加了密鑰的網路位址雜湊，最多留兩天） | **不能**對外 |
| `zz.rooms` / `zz.post` | 連線房間與訊息，最久三小時 | 只能取數量 |
| `zz.queue` | 隨機配對中等待的房間 | 只能取數量 |
| `zz.draws` | 每次開寶箱的時間與結果 | 可以只讀（核對機率用） |

### 1.3 玩家用的端點（不是管理用）

`/api/rpc`（`hello` `sync` `code` `redeem` `delete`）、`/api/board`、`/api/room`（`open` `join` `quick` `x` `still` `lock` `close`）、`/api/ws`、`/api/health`。

**目前沒有任何管理端點**，也沒有任何管理寫入的路徑。`ban` 欄位存在，但只能直接改資料庫，沒有 API。

---

## 2. 跟交接包不一致的地方

| # | 交接包的寫法 | cube2 實際 | 建議 |
|---|---|---|---|
| D1 | `matches` 端點回傳「比賽 ID、參賽人、模式、狀態、開始結束時間、伺服器結算結果」 | **（2026-11-20 林董決定要存，已加 `zz.matches`，見 3.5。）** 原本 cube2 不存任何對局紀錄。 每場的落點紀錄只在結算時核對一次就丟掉，只留種子編號防重送。打電腦的比賽完全在瀏覽器裡跑；連線對戰是兩台裝置各自結算、互相交換分數。伺服器驗的是「這個分數跟落點紀錄對不對得上」，不是由伺服器判勝負 | 已新增 `zz.matches`，隱私政策已更新（保存一年） |
| D2 | `activeMatches`、`rankedQueue` | 排位賽是打電腦，伺服器看不到「進行中」。伺服器只看得到連線房間數（`zz.rooms`）和隨機配對等待數（`zz.queue`） | 欄位改名 `openRooms`、`quickQueue`，名稱照實際意思 |
| D3 | `totalMatches` | 沒有對局表；每個玩家的 `state.tot.games` 有累計場數（客戶端回報、經伺服器規則驗證） | 用 `sum(state->'tot'->>'games')`，標明是「玩家累計場數」 |
| D4 | 玩家 ID 要分 `neon_sub` / `game_user_id` / `snowrealm_player_id` | cube2 只有 `game_user_id`（`zz.players.id`），沒有 Neon Auth | 回傳 `gameUserId`、`snowrealmPlayerId: null`（Identity 上線前一律 null），不回 `neon_sub` |
| D5 | 地區由使用者自選，「不靠 IP 假設居住地」；年齡五段 | cube2 第一次進來問三段年齡（18+／13–17／未滿 13），只存在裝置上。條款寫的是註冊帳號時「用網路位置判斷國家」 | **林董已決定照 cube1 改**：自選地區＋五段年齡，不用網路位置判斷 |
| D6 | 「政策文本缺正式法人、聯絡方式」 | cube2 的 `privacy.html`、`terms.html` 已寫營運方「斯諾瑞姆工作室（SnowRealm）」、聯絡 service@snowrealm.pet、各類資料保存期限 | cube1 可以參考 |
| D7 | 路徑 `/internal/admin/v1/*` | 可以照用。用 `vercel.json` rewrite 到新的 `api/admin.js` | 照交接包 |

---

## 3. cube2 管理 API 提案（v1，只讀）

### 3.1 共通規則

- **路徑**：`GET /internal/admin/v1/{overview|players|draws}`。只接受 `GET`；其他方法回 405。
- **認證**：`Authorization: Bearer <JWT>`。
  - 演算法只接受 `EdDSA`（Ed25519）。`alg` 不符就拒絕，不接受 `none`。
  - 公鑰由環境變數 `BRICKDUEL_ADMIN_JWKS_URL`（或 `BRICKDUEL_ADMIN_JWKS` 直接放 JWKS JSON）取得，依 `kid` 選鑰匙，快取 10 分鐘。
  - 必驗：`iss` = `BRICKDUEL_ADMIN_ISSUER`；`aud` = `snowrealm:brickduel:admin`；`scope` 含 `brickduel:admin:read`；`exp`、`nbf`、`iat`（允許 60 秒時鐘誤差）；`exp - iat` ≤ 600 秒；`jti` 必填但**唯讀端點不限制只能用一次**（GPT 2026-11-20 意見：避免重新整理、分頁、重試被擋），只寫進稽核紀錄。防重放的一次性 nonce／冪等鍵留給 v2 的寫入端點。
  - `sub` 必須在 `BRICKDUEL_ADMIN_SUBJECTS`（逗號分隔）白名單裡。**白名單沒設就全部拒絕。**
  - 普通玩家的 token（之後 Identity 的 `aud=snowrealm:brickduel:api`）拿來打管理 API 一律拒絕。
- **錯誤碼**：

  | 狀態 | 何時 | body |
  |---|---|---|
  | 503 | 上面任一個環境變數沒設（功能未啟用） | `{"error":"disabled"}` |
  | 401 | 沒帶 token、簽章錯、過期、還沒生效、`iss`/`aud` 不對、沒有 `jti` | `{"error":"unauthorized"}`（不說明哪一項錯） |
  | 403 | token 有效但 `sub` 不在白名單或沒有 scope | `{"error":"forbidden"}` |
  | 404 | 路徑不存在 | `{"error":"not_found"}` |
  | 405 | 非 `GET` | `{"error":"method"}` |
  | 429 | 同一個 `sub` 每分鐘超過 60 次 | `{"error":"slow"}` |
  | 400 | 參數不合法（`limit`、`cursor`） | `{"error":"bad_request"}` |

- **其他**：
  - 回應都帶 `Cache-Control: no-store`，不送 CORS 標頭；service worker 不攔 `/internal/` 開頭的路徑。
  - 每次呼叫寫一筆稽核紀錄 `zz.admin_log(at, sub, jti, path, status)`，保存 180 天。
  - 時間一律 ISO 8601 UTC 字串；金額類數字用字串，避免精度問題。
  - 分頁用不透明 `cursor`（base64url 的 `(made, id)`）；`limit` 1–100，預設 25。
  - **v1 沒有任何寫入。**加扣幣、改段位、停權、刪帳號，要等 RBAC、原因欄位、二次確認、不可竄改的稽核紀錄都做好，再另外定 v2。

### 3.2 `GET /internal/admin/v1/overview`

```json
{
  "gameId": "brickduel",
  "apiVersion": "1",
  "players": 0,
  "playersActive7d": 0,
  "bannedPlayers": 0,
  "coinsOutstanding": "0",
  "playerGamesTotal": 0,
  "openRooms": 0,
  "quickQueue": 0,
  "boxesOpened7d": 0,
  "generatedAt": "2026-11-20T00:00:00Z"
}
```
數字只是格式範例。來源：`zz.players` 筆數、`seen` 在 7 天內的筆數、`ban` 筆數、`sum(state->>'coins')`、`sum(state->'tot'->>'games')`、`zz.rooms` 未過期筆數、`zz.queue` 筆數、`zz.draws` 7 天內的箱數。

### 3.3 `GET /internal/admin/v1/players?limit=25&cursor=…`

```json
{
  "items": [{
    "gameUserId": "uuid",
    "snowrealmPlayerId": null,
    "publicTag": "ab12cd34",
    "nickname": "",
    "level": 1,
    "coins": "200",
    "rating": 0,
    "season": "2026-11",
    "rankedGames": 0,
    "games": 0,
    "banned": false,
    "createdAt": "…", "lastSeenAt": "…"
  }],
  "nextCursor": null
}
```
**不回傳**：裝置密鑰雜湊、引繼碼、`srv`、任何網路位址相關資料、完整 `state`。

### 3.4 `GET /internal/admin/v1/draws?limit=25&cursor=…&from=…&to=…`

交接包沒有這支，但台灣規定機率型內容要保存紀錄、能核對公布的機率，客服處理爭議也用得到。回傳每次開箱的 `drawId`、`gameUserId`、`at`、`boxes[]`（等級與內容），外加一個 `summary`：期間內各等級實際開出比例 vs 公布機率。

### 3.5 `GET /internal/admin/v1/matches?limit=25&cursor=…&player=…&room=…`

林董已決定要存。資料表 `zz.matches`（已寫碼，`server/db.js`）：每個有雲端存檔的玩家每場一列，保存一年後自動刪除，玩家刪除雲端資料時一併刪除。

```json
{
  "items": [{
    "matchLogId": "123",
    "gameUserId": "uuid",
    "at": "…",
    "mode": "ai|rank|ghost|net|sprint",
    "result": 1,
    "proven": true,
    "room": "AB23C",
    "seats": 4,
    "level": 3, "durationMs": 120000, "ko": 2, "koOpp": 1, "score": 12000, "sent": 14, "lines": 30, "pieces": 90, "spins": 2, "itemsUsed": 0, "team": false, "quick": false
  }],
  "nextCursor": null
}
```

注意：
- `result` 是**玩家回報、經伺服器規則與落點紀錄核對**的結果，不是伺服器判出來的勝負。`proven` = 落點紀錄核對通過（排位與競速一定是 true；連線對戰目前沒有落點紀錄，所以是 false）。
- 一場連線對戰會有每個座位各一列，用 `room` + 時間 把它們湊在一起；目前沒有共用的比賽 ID。

---


### 3.6 後台 Dashboard 用的統計（林董 2026-11-20 要求：CRM、ERP、動態圖表、越詳細越好）

後台（GPT）負責 CRM、ERP 畫面和圖表；cube2 提供數據。全部唯讀，認證同 3.1。

**`GET /internal/admin/v1/metrics`**：當下的數字

| 欄位 | 意思 | 來源 / 狀態 |
|---|---|---|
| `players.total` | 有雲端存檔的玩家數 | `zz.players` |
| `players.guest` | 路人（沒綁 SnowRealm Games 帳號） | 目前 = total；Identity 上線後扣掉已綁定的 |
| `players.linked` | 已綁 SnowRealm Games 帳號 | 目前 0（`null` 表示功能未上線） |
| `players.steam` | 用 Steam 登入或綁 Steam 的 | **預留**，目前 `null` |
| `players.banned` | 被停權 | `ban` |
| `players.minorDeclared` | 自填未滿 18 的 | **需要新增**：目前地區年齡只存在裝置上，要不要同步到伺服器需另外決定（只存區間） |
| `devices.total` | 綁在雲端存檔上的裝置數 | `zz.keys` 筆數（每個玩家最多 5 台） |
| `devices.perPlayer` | 平均每人幾台 | 同上 |
| `devices.unsaved` | 玩過但還沒建雲端存檔的裝置 | **伺服器看不到**；要算就得加匿名開啟計數，需另外決定 |
| `subs.active` | 目前是會員的 | `state.sub.until > now`（現在是免費體驗） |
| `subs.trial` / `subs.paid` | 體驗 / 付費會員 | 目前全是體驗；付費上線後區分；**Steam 訂閱預留** |
| `active.d1` `active.d7` `active.d30` | 1、7、30 天內有上線的玩家 | `seen` |
| `economy.coinsOutstanding` | 玩家手上金幣總和 | `state.coins` |
| `economy.itemsOutstanding` | 各道具總數 | `state.items` |
| `matches.today` 依模式 | 今天各模式場數 | `zz.matches` |
| `boxes.today` 依等級 | 今天開出的寶箱 | `zz.draws` |
| `online.openRooms` `online.quickQueue` | 連線房間、配對等待 | `zz.rooms`、`zz.queue` |
| `regions` | 各地區玩家數 | 同 `minorDeclared`，需先決定要不要把自選地區同步到伺服器 |

**`GET /internal/admin/v1/metrics/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`**：給動態圖表，每天一列

`date`、`newPlayers`（`made`）、`activePlayers`（當天有對局紀錄的不同玩家數，來自 `zz.matches`）、`matches`（依模式）、`rankedGames`、`onlineMatches`、`boxesOpened`（依等級）、`coinsEarned` / `coinsSpent`（來自 `zz.ledger`，依 `kind` 分類）、`newSubs`、`steam*`（預留，`null`）。

**`GET /internal/admin/v1/players/{gameUserId}`**：CRM 查單一玩家

代號、名字、等級、段位、金幣、道具、會員狀態、建立與最後上線時間、裝置數、最近 50 場對局、最近 50 次開箱、停權狀態。不回傳密鑰雜湊、引繼碼、網路位址。

**ERP 相關目前缺的資料**（要做的話各自是新功能，先跟林董確認）：
1. ~~金幣流水帳~~ **已實作（2026-11-20）**：`zz.ledger(pid, key, kind, why, delta, bal, at)`，伺服器套用每個操作時依規則算出的差額寫入，`key` 是操作 ID（冪等，`UNIQUE(pid,key)`），跟存檔同一個交易寫入；客戶端無法直接寫。開帳號時寫一筆 `open`。
2. 付款與訂單：還沒有付費，之後接金流或 Steam 再設計。
3. 伺服器自選地區與年齡區間（只存區間，不存生日）。

### 3.6-1 看廣告領獎勵（已寫碼，預設關閉）

- 每次 15 金幣、每日 30 次（2026-11-20 林董定）；會員免看直接領，共用每日次數。
- 回呼：`GET /api/ad`（廣告平台呼叫，不給瀏覽器）。驗 Google SSV 格式的 ECDSA 簽章（金鑰從 `ADS_SSV_KEYS_URL` 取、快取 12 小時）、`ad_unit` 在 `ADS_AD_UNITS` 白名單、`timestamp` 一小時內；`custom_data` = 玩家公開代號。
- 冪等：`zz.adtx(tx PK)` + 操作 ID `ad:<tx>` + 流水帳 `UNIQUE(pid,key)` 三層。發幣用伺服器專用操作 `adGrant`，頁面無法送出（不在 `Meta.OPS`）。
- 兩個環境變數沒設就回 503、`/api/health` 的 `ads: false`，前端按鈕不能按。
- 後台可讀：`zz.adtx`（每次回呼、是否發幣）、`zz.ledger` 的 `adGrant` / `adFree`。
- 尚未做：前端載入廣告 SDK、CMP/TCF 同意流程（等廣告帳號核准）。

### 3.7 Steam 預留介面（還不實作）

- 管理 API 的所有 Steam 欄位先回 `null`，欄位名稱先固定，之後不用改後台。
- 玩家登入：`BRICKDUEL_IDENTITY_ADAPTER_SPEC.md` 會定義可替換的身分來源，`provider` 先列 `device`（現在的匿名裝置）、`snowrealm`、`steam`。Steam 預計流程是在伺服器用 Steam Web API 驗證 session ticket，換成 SnowRealm Identity 的身分；**cube2 不碰真實 ticket**，等 GPT 的 Identity 設計好再接。
- Steam 銷售與玩家數據（Steamworks 報表）由後台直接向 Steam 拿，不經過 cube2。

## 4. 階段對照

| 端點 / 項目 | 規劃 | 已寫碼 | CI 成功 | 測試環境上線 | 正式可用 |
|---|---|---|---|---|---|
| `overview` | ✓ | ✓ | ✓ | 正式站回 503（未設定） | 等機器憑證 |
| `players` | ✓ | ✓ | ✓ | 同上 | 等機器憑證 |
| `draws` | ✓ | ✓ | ✓ | 同上 | 等機器憑證 |
| `matches` | ✓ | ✓ | ✓ | 同上 | 等機器憑證 |
| `metrics`、`metrics/daily`、`players/{id}` | ✓ | ✓ | ✓ | 同上 | 等機器憑證 |
| Steam 欄位與登入 | 預留 | 欄位回 `null` | ✓ | — | — |
| JWT 驗證層 | ✓ | ✓（`server/admin.js`） | ✓ | 同上 | 等 `admin-jwks.json` |
| 稽核紀錄表 | ✓ | ✓（`zz.admin_log`） | ✓ | — | 180 天後清除待 Owner 核准 |

正式網址：**TBD**（部署後會是 cube2 的網址加上 `/internal/admin/v1/…`）。

---

## 5. 阻塞清單：需要 GPT 交付或確認

1. **誰簽發管理 token**：SnowRealm 管理 API 呼叫 cube2 時用的機器身分。需要：`iss` 字串、JWKS 網址、`kid` 輪替方式、撤銷方式（短效 + `jti` 夠不夠，還是另有撤銷清單）。
2. **確認 `aud` 與 `scope` 字串**：GPT 同意用遊戲專屬 audience。我提 `aud=snowrealm:brickduel:admin`、`scope=brickduel:admin:read`；請在 cube1 的管理服務規格寫同一個字串，雙方程式用同一份契約。
3. **`sub` 格式**：管理員本人還是管理 API 的服務帳號？白名單要放哪一種。
4. **欄位確認**：第 3 節的欄位名稱和型別。尤其請確認 D2、D3 的改名。
5. **呼叫來源**：管理 API 會從哪裡呼叫 cube2（Cloudflare Worker？Vercel？）。如果有固定的出口網址，可以多加一層來源限制。
6. **測試用簽章**：請提供一組**只用於測試**的 Ed25519 公鑰和一個範例 token 格式（不要真的私鑰）。我的自動測試會在測試裡自己產生金鑰對，不會打正式服務。
7. **Identity**（交接包第 5 節）：上線前 cube2 一律 `snowrealmPlayerId: null`，不會用假 token 接正式服務。

## 6. 林董的決定（2026-11-20）

- D1：存對局紀錄，已實作資料表。
- D5：改成跟 cube1 一樣自選地區＋五段年齡。另外林董要求加上**香港、澳門**，cube2 現在是 12 個地區；請 cube1 也加，兩邊才一致。

## 6-1. GPT 回覆後的調整（2026-11-20）

- `jti` 改成不限一次（見 3.1）。
- 管理 API 只允許伺服器對伺服器呼叫，不送 CORS、不給瀏覽器用。
- 不等 Identity：先做資料查詢、API 結構、測試；正式機器憑證沒設定前，端點一律回 503。

## 7. 接下來 cube2 的交付

確認第 5、6 節後：
1. 實作 `api/admin.js`、Auth Adapter、稽核表，以及交接包第 8 節列的測試（401／403／錯 audience 或 issuer／過期／`jti` 重送／不同玩家資料隔離／前端不能自己送金幣、段位、勝負）。
2. 補齊另外兩份：`BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`、`BRICKDUEL_SECURITY_PRIVACY_CHECKLIST.md`。
3. 提交後附 commit SHA、CI 連結，以及沒有機密資料的測試紀錄。

## 8. v1 實作（2026-11-21，cube2 `server/admin.js`）

**路徑**：`GET https://brickduel.snowrealm.pet/internal/admin/v1/{overview | players | players/{gameUserId} | draws | matches | metrics | metrics/daily}`（`vercel.json` rewrite 到 `api/admin.js`）。

**認證**（與 cube1 handoff §5 相同）：
- `Authorization: Bearer <JWT>`；header `alg=EdDSA`、`kid` 必填、不接受 `crit`。
- 公鑰只從管理專用 JWKS：預設 `https://identity.snowrealm.pet/.well-known/admin-jwks.json`（不接受玩家的 `jwks.json`），快取 10 分鐘；未知 `kid` 每分鐘最多重抓一次；同一個 `kid` 出現兩把鑰匙時兩把都不信。緊急換鑰可改用 `BRICKDUEL_ADMIN_JWKS`（直接放 JWKS JSON）。
- `iss` 必須正好是 `https://identity.snowrealm.pet`（測試用的別的 issuer 要 `BRICKDUEL_ADMIN_TEST_TRUST=1`，而且在 Vercel production 一律拒絕）。
- `aud` 含 `snowrealm:brickduel:admin`；`scope` 用空白切開後要有完整的 `brickduel:admin:read`；`sub` 必須是 `svc:snowrealm-games-admin` 且列在 `BRICKDUEL_ADMIN_SUBJECTS`（2026-11-21 起：測試以外，名單裡別的值一律被忽略，只有別的值時整個功能視為未設定、回 503）。
- `iat`、`nbf`、`exp` 都要是整數秒；`iat`、`nbf` 不晚於現在 +60 秒；`exp` 超過現在 −60 秒；`0 < exp − iat ≤ 600`；`jti` 必填，唯讀可以重複使用。

**錯誤**：

| 狀態 | body | 何時 |
|---|---|---|
| 405 | `{"error":"method"}` | 不是 GET（不論有沒有設定）|
| 503 | `{"error":"disabled"}` | `BRICKDUEL_ADMIN_SUBJECTS` 沒設或沒有合法值、issuer／JWKS 設定不合規 |
| 503 | `{"error":"unavailable"}` | JWKS 抓不到、資料庫不通。後台要顯示「來源不可用」，不能當 0 |
| 401 | `{"error":"unauthorized"}` | token 缺、格式錯、簽章錯、未知 kid、iss／aud／時間／jti 不對（不說是哪一項），帶 `WWW-Authenticate: Bearer` |
| 403 | `{"error":"forbidden"}` | 簽章與聲明都對，但 `sub` 不在名單或沒有 scope |
| 404 | `{"error":"not_found"}` | 路徑不存在、玩家 ID 格式不對或查無此人（含等待刪除中的存檔）|
| 400 | `{"error":"bad_request"}` | `limit` 不在 1–100、`cursor` 壞掉、日期格式錯、`from` 晚於 `to`、日報超過 366 天 |
| 429 | `{"error":"slow"}` | 同一個 `sub` 每分鐘超過 60 次，帶 `Retry-After` |

全部回應 `Cache-Control: no-store`，不送 CORS 標頭；service worker 不攔 `/internal/`。

**稽核**：簽章通過的每一次呼叫（含 403、404、400、429）寫一筆 `zz.admin_log(at, sub, jti, path, status)`，不存 token、查詢字串、IP。驗不過的 401 不寫進資料庫（避免被灌爆），只在伺服器日誌記一個原因類別。

**欄位**：照 cube1 handoff §4、§4.1–4.3。補充：
- 等待刪除（玩家按了刪除、30 天內）的存檔不出現在任何列表與計數裡，單查回 404。
- `draws` 另有 `kind`（`box`／`wheel`／`slot`）；`summary` 只算寶箱（`kind=box`），範圍是整個 `from`–`to`（`from` 含、`to` 不含），每個等級有 `count`、`share`（期間沒有開箱時為 `null`）、`published`（公布機率，0–1）。
- `matches` 可加 `player=<uuid>`、`room=<房號>` 篩選。
- `metrics`：`players.linked` 是 `zz.identity` 筆數（功能未開，現在是 0）；`players.steam`、`players.minorDeclared`、`regions`、`devices.unsaved` 為 `null`；`subs.paid` 是 0（目前沒有付費，全是體驗）；`matches.today`、`boxes.today` 以 UTC 當日計；另附 `day`、`generatedAt`。
- `metrics/daily`：沒給日期時是最近 7 天；回 `{timezone:"UTC", from, to, items, generatedAt}`；`coinsEarned`／`coinsSpent` 來自 `zz.ledger`，不含新存檔的起始金幣（`kind=open`）；`newSubs`、`steamNewPlayers`、`steamActivePlayers` 為 `null`。
- `players/{id}`：`subscription.kind` 現在只會是 `trial` 或 `null`；`items` 只列持有量大於 0 的道具。

**測試**：`test/admin.test.js`（98 項）：自己產生的 Ed25519 金鑰、17 種 401、2 種 403、換鑰與未知 kid、JWKS 故障 503、內嵌 JWKS、404／405／400、分頁與 cursor、各端點欄位、不含金鑰雜湊／原始存檔／IP、429、稽核內容；並用 cube1 的 fixture（`test/fixtures/cube1-brickduel-admin-jwt.json`，公開鑰與已過期 token）在它的時鐘驗過、過期後 401、正式 subject／issuer 不接受它。

**清理**：`zz.admin_log` 的 180 天保存目前只有監控（`/api/cron` 的 `watch`），刪除方案見 `docs/RETENTION_PROPOSAL.md`，等 Owner 核准。

**阻塞（等 cube1）**：機器簽發端、`https://identity.snowrealm.pet/.well-known/admin-jwks.json` 上線，並給一組非正式環境可用的測試 token 來源。上線後 Owner 在 Vercel 設 `BRICKDUEL_ADMIN_SUBJECTS=svc:snowrealm-games-admin` 即開通。

## 9. 遊玩紀錄與 `metrics/plays`（2026-11-24，林董：「數據不要只存個人…都存 db」）

**為什麼**：之前伺服器只有對戰（`zz.matches`）有一場一行的紀錄；關卡、磚之冒險、挑戰大自然只在存檔 JSON 裡留最佳成績，磚塊小遊戲只留最佳分數，地城小隊什麼都沒有。所以後台算不出「每個遊戲有多少人在玩、玩幾場」。

**新表 `zz.plays`**：每玩一場一行，不管哪種遊戲。欄位：`pid`（雲端存檔）、`at`、`game`、`mode`、`ms`、`result`（1 贏、0、−1 輸）、`proven`（只有對戰和關卡有可重播證據時為 true）、`score`、`lv`、`ref`（同一場用 `(pid, ref)` 擋重複）。全部由伺服器依自己套用的結果寫，跟存檔同一個交易寫入；頁面送什麼都不直接進表。存檔被刪時一起刪（`ON DELETE CASCADE`）。第一次建表時把現有 `zz.matches`（一年內）整批帶進來，所以統計不是從 0 開始。

| `game` | 名稱 | 來源 | `mode` |
|---|---|---|---|
| `main` | 轉磚對戰 | 對局結算 `fin` | 對戰模式（`ai`、`rank`、`net`、`sprint`…） |
| `level` | 關卡挑戰 | `lvl`（過關）、`endless`、`custom`、輸掉時的 `play` | `clear`、`endless`、`custom`、`fail` |
| `rpg` | 磚之冒險 | `rpg`（過關）、輸掉時的 `play` | `win`、`lose` |
| `wx` | 挑戰大自然 | `wx`、`wxb` | `run`、`practice`、`battle`、`net` |
| `snake`…`sweep` | 九款磚塊小遊戲 | `mini`（小遊戲頁直接送，或之後轉磚送；同一場只算一次） | `easy`、`normal`、`hard` |
| `dungeon` | 地城小隊 | 每位玩家自己的頁面在一局結束時送 `play` | `solo1`、`party2`–`party4` |

**新端點 `GET /internal/admin/v1/metrics/plays?from=YYYY-MM-DD&to=YYYY-MM-DD`**（認證、錯誤、稽核與其他端點相同；沒給日期時是最近 14 天，最長 366 天）：

```json
{
  "gameId": "brickduel", "apiVersion": "1",
  "players": { "playedToday": 12, "played7d": 40, "played30d": 95 },
  "plays": { "last7d": 610, "last30d": 2400, "total": "5100", "since": "2025-11-25T03:00:00.000Z" },
  "games": [
    { "id": "main", "name": "轉磚對戰", "kind": "mode",
      "today": { "plays": 30, "players": 9 },
      "last7d": { "plays": 300, "players": 28, "minutes": 1500, "wins": 160 },
      "last30d": { "plays": 1200, "players": 70 },
      "modes": [ { "mode": "ai", "name": "對電腦", "today": {}, "last7d": {}, "last30d": {} } ] }
  ],
  "daily": { "timezone": "UTC", "from": "2026-11-11", "to": "2026-11-24",
    "items": [ { "date": "2026-11-24", "players": 12, "plays": 80, "playsByGame": { "main": 30, "snake": 10 }, "playersByGame": { "main": 9, "snake": 4 } } ] },
  "generatedAt": "…"
}
```

- 「玩家」是雲端存檔：同一個人在幾台裝置用同一份存檔算一人。
- `games` 列出所有已知遊戲（沒人玩的是 0，不會不見），依 30 天場數排序；不認得的 `game` 照原樣列出。
- `minutes` 是頁面回報的時間加總，只供參考（不是證據）。
- 只有計數，沒有玩家 id、金鑰、IP。
- `metrics/games` 也加上 `plays7d`、`playPlayers7d`（磚塊小遊戲、磚之冒險、關卡、挑戰大自然、地城小隊），地城小隊的 `source` 從 `null` 改成 `plays`；`overview` 多 `playersPlayed7d`。全部是加欄位，舊欄位不變。

**還沒算到的**：在沒有雲端存檔的瀏覽器上、而且從沒開過轉磚的人，只玩磚塊小遊戲或地城時，紀錄先留在那台瀏覽器，等他打開轉磚才送出。

**保存期限**：等 Owner 決定（建議跟對局紀錄一樣一年後自動刪除）；決定前不刪。

**測試**：`test/admin.test.js` 122 項（`metrics/plays` 各區塊、同一場小遊戲送兩次只算一次、不認得的遊戲不算、不含玩家 id）；`test/api.test.js` 462 項（每種玩法各寫一行、只照伺服器的判斷、重複不算、建表時帶入對局紀錄且只帶一次）；瀏覽器 `minipay` 16 項（小遊戲頁直接送到雲端存檔、地城一局結束送出、伺服器不通時留在瀏覽器、轉磚打開時補送）。
