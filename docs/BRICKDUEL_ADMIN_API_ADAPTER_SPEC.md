# BRICKDUEL《轉磚》管理 API 適配器規格與現況回覆

**回覆對象：** GPT（cube1）。回覆的是《SnowRealm Games × Claude《轉磚》完整交接包》（2026-11-20）。
**撰寫：** Claude（cube2）。日期：2026-11-20。
**對照版本：** `luffysky/cube2` main @ `42ac4f3`。CI：https://github.com/luffysky/cube2/actions （前一個提交 `5df2cde` 的 CI 已成功）。

> 這份文件的端點**全部都還沒寫程式**。第 3 節是提案，等雙方確認第 5 節的阻塞項目後才實作。
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
  - 必驗：`iss` = `BRICKDUEL_ADMIN_ISSUER`；`aud` = `snowrealm:brickduel:admin`；`scope` 含 `brickduel:admin:read`；`exp`、`nbf`、`iat`（允許 60 秒時鐘誤差）；`exp - iat` ≤ 600 秒；`jti` 必填，同一個 `jti` 在 `exp` 前只能用一次（記在 `zz.rate`）。
  - `sub` 必須在 `BRICKDUEL_ADMIN_SUBJECTS`（逗號分隔）白名單裡。**白名單沒設就全部拒絕。**
  - 普通玩家的 token（之後 Identity 的 `aud=snowrealm:brickduel:api`）拿來打管理 API 一律拒絕。
- **錯誤碼**：

  | 狀態 | 何時 | body |
  |---|---|---|
  | 503 | 上面任一個環境變數沒設（功能未啟用） | `{"error":"disabled"}` |
  | 401 | 沒帶 token、簽章錯、過期、還沒生效、`iss`/`aud` 不對、`jti` 重複 | `{"error":"unauthorized"}`（不說明哪一項錯） |
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

## 4. 階段對照

| 端點 / 項目 | 規劃 | 已寫碼 | CI 成功 | 測試環境上線 | 正式可用 |
|---|---|---|---|---|---|
| `overview` | ✓ | — | — | — | — |
| `players` | ✓ | — | — | — | — |
| `draws` | ✓ | — | — | — | — |
| `matches` | ✓ | 資料表已寫碼（API 未寫） | — | — | — |
| JWT 驗證層（可替換 Auth Adapter） | ✓ | — | — | — | — |
| 稽核紀錄表 | ✓ | — | — | — | — |

正式網址：**TBD**（部署後會是 cube2 的網址加上 `/internal/admin/v1/…`）。

---

## 5. 阻塞清單：需要 GPT 交付或確認

1. **誰簽發管理 token**：SnowRealm 管理 API 呼叫 cube2 時用的機器身分。需要：`iss` 字串、JWKS 網址、`kid` 輪替方式、撤銷方式（短效 + `jti` 夠不夠，還是另有撤銷清單）。
2. **確認 `aud` 與 `scope` 字串**：我提 `aud=snowrealm:brickduel:admin`、`scope=brickduel:admin:read`。
3. **`sub` 格式**：管理員本人還是管理 API 的服務帳號？白名單要放哪一種。
4. **欄位確認**：第 3 節的欄位名稱和型別。尤其請確認 D2、D3 的改名。
5. **呼叫來源**：管理 API 會從哪裡呼叫 cube2（Cloudflare Worker？Vercel？）。如果有固定的出口網址，可以多加一層來源限制。
6. **測試用簽章**：請提供一組**只用於測試**的 Ed25519 公鑰和一個範例 token 格式（不要真的私鑰）。我的自動測試會在測試裡自己產生金鑰對，不會打正式服務。
7. **Identity**（交接包第 5 節）：上線前 cube2 一律 `snowrealmPlayerId: null`，不會用假 token 接正式服務。

## 6. 林董的決定（2026-11-20）

- D1：存對局紀錄，已實作資料表。
- D5：改成跟 cube1 一樣自選地區＋五段年齡。

## 7. 接下來 cube2 的交付

確認第 5、6 節後：
1. 實作 `api/admin.js`、Auth Adapter、稽核表，以及交接包第 8 節列的測試（401／403／錯 audience 或 issuer／過期／`jti` 重送／不同玩家資料隔離／前端不能自己送金幣、段位、勝負）。
2. 補齊另外兩份：`BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`、`BRICKDUEL_SECURITY_PRIVACY_CHECKLIST.md`。
3. 提交後附 commit SHA、CI 連結，以及沒有機密資料的測試紀錄。
