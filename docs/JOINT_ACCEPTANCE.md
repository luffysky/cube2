# cube1 × cube2 聯合驗收清單（staged，非正式 E2E）

**用途**：cube1 準備好 staging 簽發端以後，兩邊依這份清單一起跑。在那之前，cube2 只有本機模擬測試（`test/admin.test.js`、`test/bff.test.js`），**不算**正式 E2E。
**cube2 版本**：main `b20f521` 起。`IDENTITY_LINK_ENABLED` 一律關著，`BRICKDUEL_ADMIN_SUBJECTS` 沒有設在 production。

## 怎麼在 cube2 這邊接 staging（不碰 production）

- 用 Vercel 的 **Preview** 環境，不用 Production。`BRICKDUEL_ADMIN_TEST_TRUST` 在 production 一律無效。
- 環境變數由 Owner 設在 Preview，值不經過聊天或 GitHub：

| 變數 | Admin（A） | 登入（B） |
|---|---|---|
| `BRICKDUEL_ADMIN_SUBJECTS` | staging 的服務 sub | — |
| `BRICKDUEL_ADMIN_TEST_TRUST` | `1` | — |
| `BRICKDUEL_ADMIN_ISSUER` | staging issuer | — |
| `BRICKDUEL_ADMIN_JWKS_URL` | staging 的 admin JWKS（https） | — |
| `IDENTITY_ISSUER` / `IDENTITY_JWKS_URL` / `IDENTITY_AUDIENCE` | — | staging 值 |
| `IDENTITY_AUTHORIZE_URL` / `IDENTITY_TOKEN_URL` / `IDENTITY_STATUS_URL` | — | staging 值 |
| `IDENTITY_BRICKDUEL_CLIENT_SECRET` | — | staging 專用，不可跟正式共用 |
| `IDENTITY_LINK_ENABLED` | — | `1`（只設在 Preview） |

- **Staging 回呼（2026-11-21 已實作，`server/bff.js`）**：
  - 只有 `VERCEL_ENV` 不是 `production` 且設了 `IDENTITY_STAGING=1` 才生效。production 上所有 staging 設定一律忽略。
  - 回呼網址只接受 `IDENTITY_STAGING_REDIRECT` 這一個精確值：
    - 必須是 https，路徑必須是 `/api/auth/callback`
    - 不能帶 port、query、`#`、帳密，不能有萬用字元，不能是正式站的 host
  - 只有在這個 host 上才能開始登入、接收 callback，cookie 也只會設在這個 host。
  - Client ID 用 `IDENTITY_STAGING_CLIENT_ID`，預設 `brickduel-bff-staging`，不能是 `brickduel-bff`。
  - Secret 用 `IDENTITY_STAGING_CLIENT_SECRET`，不能跟正式的相同。
  - 以下不能用正式的值：issuer、token、status；入口網址必須明確給，不能是正式入口。
- **Staging 不讀正式資料庫（`server/db.js`）**：Preview 現在拿到的 `DATABASE_URL` 跟 production 是同一個。所以只要設了 `IDENTITY_STAGING=1` 或 `BRICKDUEL_ADMIN_TEST_TRUST=1`，就只會用 `STAGING_DATABASE_URL`；沒設就完全沒有資料庫（相關端點回 503），不會碰到正式玩家資料。
- **提案的固定網址**：`https://brickduel-staging.snowrealm.pet/api/auth/callback`。
  - 目前狀態：**已生效**（2026-11-22）。Vercel 綁 `staging` 分支，Cloudflare CNAME 設成 DNS only，TLS 已驗證，可以拿去 cube1 登記。
  - 網站有 Vercel 部署保護。自動化呼叫要帶 `x-vercel-protection-bypass` 標頭，密碼由 Owner 交給 cube1，不寫進 repo。

## A. Admin 機器 token（staged admin JWT／JWKS）

cube1 提供：
- 會簽短效 token 的 staging signer
- 只有公開鑰的 staging admin JWKS
- 每一項要用的 token（或簽發腳本）

| # | 情境 | 預期 |
|---|---|---|
| A1 | 有效 token 讀 `overview`、`players`、`players/{id}`、`draws`、`matches`、`metrics`、`metrics/daily` | 200，欄位照 handoff v0.2 |
| A2 | 錯 audience（例如 `snowrealm:brickduel:api`） | 401 |
| A3 | 錯 issuer | 401 |
| A4 | 缺 scope 或 scope 不對 | 403 |
| A5 | sub 不在名單 | 403 |
| A6 | 簽章用的 kid 不在 JWKS（缺 key） | 401 |
| A7 | 換鑰：JWKS 同時列新舊兩把，用新 kid 簽 | 200（最多 1 分鐘內生效） |
| A8 | 移除舊鑰後用舊 kid 簽 | 快取過期（≤10 分鐘）後 401 |
| A9 | JWKS 暫時抓不到 | 503 `unavailable` |
| A10 | 過期、`nbf` 在未來、`exp − iat > 600` | 401 |
| A11 | 同一個 token 重新整理、翻頁 | 200（唯讀可以重複用） |
| A12 | 每分鐘超過 60 次 | 429 |
| A13 | POST | 405 |
| A14 | `zz.admin_log` | 有 A1–A12 的 `sub/jti/path/status`，沒有 token |

## B. 玩家登入（staged player token，nonce 必填）

cube1 提供：
- staging 的 `/oauth/authorize`，要有可信的同意確認
- staging 的 `/oauth/token`、`/v1/token/status`
- 兩個測試帳號

| # | 情境 | 預期結果字 |
|---|---|---|
| B1 | 帳號 1 在裝置 X 連結存檔 | `linked`，裝置換新金鑰 |
| B2 | 帳號 1 在裝置 Y 找回 | `recovered`，同一份存檔 |
| B3 | 帳號 2 想連已經連給帳號 1 的存檔 | `conflict`，兩份存檔、金幣都不變 |
| B4 | token 沒有 `nonce`（cube1 用測試開關簽一張） | `token` |
| B5 | token 的 `nonce` 不同 | `token` |
| B6 | 同一個 callback 網址重送 | `replay` |
| B7 | 超過 10 分鐘才回來 | `expired` |
| B8 | 在別的瀏覽器打開 callback | `session` 或 `state` |
| B9 | 先撤銷再完成（`/v1/token/status` 回 `active:false`） | `revoked` |
| B10 | status 端點 503 或逾時 | `unavailable` |
| B11 | 玩家在入口按取消 | `denied` |
| B12 | 帳號 1 的存檔刪除後在 30 天內用 `restore` 找回 | `recovered`，刪除取消 |
| B13 | 匿名玩家（不按連結）照常玩、同步、排行榜 | 不受影響 |

## 誰記錄什麼

- 每一項的時間、結果、cube1 與 cube2 的 commit，雙方各寫進自己的 DEVLOG。
- 兩邊都通過以後，才由 Owner 決定要不要打開 production 的 `BRICKDUEL_ADMIN_SUBJECTS` 和 `IDENTITY_LINK_ENABLED`。
- 驗收用的測試帳號和資料，事後要不要刪，由 Owner 另外決定。

## Staging 管理 API 的啟用條件（cube2 Preview，只限 `staging` 分支）

| 變數 | 值 | 誰提供 |
|---|---|---|
| `BRICKDUEL_ADMIN_TEST_TRUST` | `1`（只在 Preview 有效；production 一律無效） | Owner 設 |
| `BRICKDUEL_ADMIN_ISSUER` | cube1 staging admin signer 的 issuer（不能是 `https://identity.snowrealm.pet`） | cube1 |
| `BRICKDUEL_ADMIN_JWKS_URL` | cube1 staging 的 `/.well-known/admin-jwks.json`（https，只放公開 JWK） | cube1 |
| `BRICKDUEL_ADMIN_SUBJECTS` | `svc:snowrealm-games-admin` | 固定 |

cube1 預定的值是 issuer `https://identity-staging.snowrealm.pet`、JWKS `https://identity-staging.snowrealm.pet/.well-known/admin-jwks.json`。2026-11-22 22:55 查過：這個網域**沒有 DNS 紀錄**，Vercel 也查不到 A 或 CNAME，連線直接失敗，所以**還不存在**。

2026-11-22 22:46，Owner 已經在 Preview（只限 `staging` 分支）設了這四個變數。staging 部署 `fcd6d24` 的 `/api/health` 現在是 `admin: true`、`dbSource: "staging"`；正式站維持 `admin: false`、`dbSource: "main"`。因為 JWKS 網址還連不上，現在任何帶簽章的呼叫都會得到 503 `unavailable`（拿不到公鑰時一律拒絕）；identity-staging 上線後，不用重新部署，最多 10 分鐘就會抓到新金鑰。
| `aud`／`scope`（token 內） | `snowrealm:brickduel:admin`／`brickduel:admin:read` | 固定 |

- 設了 `BRICKDUEL_ADMIN_TEST_TRUST=1`，staging 就只會用 `STAGING_DATABASE_URL`（見 `server/db.js`）。
- 如果 `STAGING_DATABASE_URL` 不小心設成正式資料庫，或指向同一個 Neon endpoint，staging 會直接沒有資料庫，不會連過去。
- `/api/health` 的 `dbSource` 會顯示 `staging`，沒接好時顯示 `staging-missing` 或 `staging-same-as-main`。另外 `admin` 顯示管理 API 有沒有啟用、`build` 顯示部署的 commit。
- 目前這幾個值都還沒有，所以 staging 的 `/internal/admin/v1/*` 回 503 `disabled`，這是正確的。

**A 組的執行工具**：`tools/joint-admin-check.js`。
- 由持有 staging signer 的一方執行（cube1），私鑰不會離開他們那邊。
- 能自動產生的情境都會自動跑：A1、A2、A3、A4、A5、A6、A10、A11、A12、A13。A7、A8、A9、A14 會列出要手動做的步驟。
- 輸出 JSON 報告，裡面沒有 token、bypass 密碼或玩家資料。
- 2026-11-22 已在本機 dev-server 演練：用測試金鑰跑一次，A1–A13 能自動化的全部照預期回應。這只是演練，**不是** staging 實測。
- **先做預檢（A0）**：每次執行都先查 `/api/health?deep=1`。必須是 `dbSource: "staging"`、`db: true`、`admin: true`；有給 `EXPECT_BUILD` 時，部署版本也要相符；有給 `ADMIN_JWKS_URL` 時，JWKS 必須是 https、只有公鑰、全部是 Ed25519，而且含 `ADMIN_KID`。任何一項不符就整個停下來，不建資料、不跑任何 A 項。本機演練過：沒設管理信任、或版本不符時，都會在寫入前停下。
- 加 `SEED=1` 會先在 staging 建一個合成測試玩家（名字 `staging-test-xxxxxx`），再開一次免費寶箱，讓 A1 的 `players/{id}`、`draws` 有東西可讀。正式站一律拒絕這個選項，玩家的金鑰也不會印出來。

## 實測報告

只記錄真的在 staging 雙端跑出來的結果。本機演練和 CI 都不算。cube2 SHA 指的是 staging 上部署的版本。

| # | 結果 | 時間（UTC） | 證據 | 原因／下一步 |
|---|---|---|---|---|
| A0 | PASS | 2026-11-22 17:44 | cube1 Work 於 2026-11-22 17:44:10–17:44:32 UTC 用 staging admin kid `srstagea_EWW-tM7u8uSnvCwV` 對 cube2 staging `1d1e1ca` 跑 `tools/joint-admin-check.js`（cube1 回報 PASS；證據 [cube1 Actions #45051087698](https://github.com/luffysky/cube1/actions/runs/45051087698)、[Issue #18](https://github.com/luffysky/cube1/issues/18#issuecomment-7084081394)）；預檢：`dbSource: staging`、`db`、`admin` 為 true、build `1d1e1ca`、JWKS 只有公鑰 | — |
| A1 | PASS | 2026-11-22 17:44:10–13 | cube1 Work 於 2026-11-22 17:44:10–17:44:32 UTC 用 staging admin kid `srstagea_EWW-tM7u8uSnvCwV` 對 cube2 staging `1d1e1ca` 跑 `tools/joint-admin-check.js`（cube1 回報 PASS；證據 [cube1 Actions #45051087698](https://github.com/luffysky/cube1/actions/runs/45051087698)、[Issue #18](https://github.com/luffysky/cube1/issues/18#issuecomment-7084081394)）。稽核表佐證：id 1–9 同一個 jti `3e05f934…` 依序讀 overview、players、draws、matches、metrics、metrics/daily、players/{合成玩家}，全部 200 | — |
| A2 | PASS | 2026-11-22 17:44 | cube1 Work 於 2026-11-22 17:44:10–17:44:32 UTC 用 staging admin kid `srstagea_EWW-tM7u8uSnvCwV` 對 cube2 staging `1d1e1ca` 跑 `tools/joint-admin-check.js`（cube1 回報 PASS；證據 [cube1 Actions #45051087698](https://github.com/luffysky/cube1/actions/runs/45051087698)、[Issue #18](https://github.com/luffysky/cube1/issues/18#issuecomment-7084081394)）。401 依設計不寫入稽核表（只記伺服器日誌的原因類別） | — |
| A3 | PASS | 2026-11-22 17:44 | 同 A2 | — |
| A4 | PASS | 2026-11-22 17:44:15 | cube1 Work 於 2026-11-22 17:44:10–17:44:32 UTC 用 staging admin kid `srstagea_EWW-tM7u8uSnvCwV` 對 cube2 staging `1d1e1ca` 跑 `tools/joint-admin-check.js`（cube1 回報 PASS；證據 [cube1 Actions #45051087698](https://github.com/luffysky/cube1/actions/runs/45051087698)、[Issue #18](https://github.com/luffysky/cube1/issues/18#issuecomment-7084081394)）。稽核表 id 10、11：`svc:snowrealm-games-admin`、overview、403 | — |
| A5 | PASS | 2026-11-22 17:44:15 | cube1 Work 於 2026-11-22 17:44:10–17:44:32 UTC 用 staging admin kid `srstagea_EWW-tM7u8uSnvCwV` 對 cube2 staging `1d1e1ca` 跑 `tools/joint-admin-check.js`（cube1 回報 PASS；證據 [cube1 Actions #45051087698](https://github.com/luffysky/cube1/actions/runs/45051087698)、[Issue #18](https://github.com/luffysky/cube1/issues/18#issuecomment-7084081394)）。稽核表 id 12：sub `svc:someone-else`、overview、403（被拒的 sub 照實記下） | — |
| A6 | PASS | 2026-11-22 17:44 | 同 A2 | — |
| A7 | PASS | 2026-11-22 18:04:53 → 18:10:21 | cube2 staging 部署 `5d840d1`；用 cube2 自備的**測試金鑰** k1、k2（只有公鑰進 JWKS；私鑰只在執行環境暫存，不進 repo），暫時把 staging 的 `BRICKDUEL_ADMIN_JWKS_URL` 指向 `accept-jwks` 分支的 `admin-jwks.json`（raw.githubusercontent.com，CDN 快取 300 秒）。這份 JWKS 一直保留 cube1 的 `srstagea_EWW-tM7u8uSnvCwV`，所以 A7、A8 期間 cube1 的呼叫照常可用。請求從瀏覽器打 `https://brickduel-staging.snowrealm.pet/internal/admin/v1/overview`。第 1 階段 JWKS＝{cube1, k1}：18:04:45 k1 200、k2 401。18:04:53 發布第 2 階段＝{cube1, k1, k2}（commit `e070176`）；18:09:22 k2 仍 401（GitHub CDN 還在給舊檔，快取到約 18:09:45），18:10:21 起 k2 連續 200，k1 也照舊 200。扣掉測試用 CDN 的快取，cube2 自己在 1 分鐘內接受新 kid | — |
| A8 | PASS | 2026-11-22 18:10:34 → 18:20:32 | 同 A7 的部署與 JWKS。18:10:34 發布第 3 階段＝{cube1, k2}（移除 k1，commit `09f533f`）。k1 每 20 秒打一次：18:10:44–18:20:11 都是 200（快取內），18:20:32 起 401，之後 18:21:44–18:25:34 連續 401；k2 全程 200。上次完整抓取在 18:10:21 左右，所以 k1 在約 10 分鐘快取到期時被拒 | — |
| A9 | PASS | 2026-11-22 18:21:34 → 18:35:00 | 同 A7 的部署。18:21:34 刪除 JWKS 檔案（commit `718f3a4`，raw 回 404）。k2 每 20 秒打一次：快取有效時 200，18:35:00 起連續 503 `{"error":"unavailable"}`（18:35:00、18:35:20、18:35:41、18:36:03），沒有一次放行。期間未知 kid（k1）重新抓取失敗時也是 503，抓不到就拒絕。18:36:27 已把 `BRICKDUEL_ADMIN_JWKS_URL` 改回 cube1 的 JWKS 並重新部署。只影響 staging 管理 API 約 1 分半，正式站沒有動 | — |
| A10 | PASS | 2026-11-22 17:44 | 同 A2 | — |
| A11 | PASS | 2026-11-22 17:44:10–13 | 稽核表 id 1–9 共用同一個 jti，全部 200（唯讀可重複使用） | — |
| A12 | PASS | 2026-11-22 17:44:17–32 | 稽核表：同一分鐘內第 1–60 次有效呼叫 200（id 1–9、13–63），第 61 次（id 64）429 | — |
| A13 | PASS | 2026-11-22 17:44 | cube1 Work 於 2026-11-22 17:44:10–17:44:32 UTC 用 staging admin kid `srstagea_EWW-tM7u8uSnvCwV` 對 cube2 staging `1d1e1ca` 跑 `tools/joint-admin-check.js`（cube1 回報 PASS；證據 [cube1 Actions #45051087698](https://github.com/luffysky/cube1/actions/runs/45051087698)、[Issue #18](https://github.com/luffysky/cube1/issues/18#issuecomment-7084081394)）。405 不帶 sub，依設計不寫入稽核表 | — |
| A14 | PASS | 2026-11-22 17:56（台北 11-23 01:56） | Neon 主控台 SQL Editor，專案 `neon-crimson-envelope`、**`staging` 分支**（`br-raspy-silence-azzokuib`）、資料庫 `neondb`，只執行 SELECT。見下方「A14 稽核查核」 | — |
| B1 | PASS | 2026-11-23 11:39:04–11:39:11 | cube1 Actions [45167007292](https://github.com/luffysky/cube1/actions/runs/45167007292)（staging `e1296ad`，B0 前置通過：`link: true`、`dbSource: staging`）：`linked`；結果只能讀一次並換新裝置金鑰、新金鑰看到已連結、舊金鑰 401。staging DB：session 11:39:04 `link`→`linked`（11:39:08 用掉），合成存檔 `a8ccaanz` 有 identity 列 | — |
| B2 | PASS | 2026-11-23 11:39:11–11:39:15 | 同 B1 的執行：裝置 Y `recover`→`recovered`，同一份存檔 `a8ccaanz`、拿到新金鑰。DB：session 11:39:11 `recover`→`recovered` | — |
| B3 | PASS | 2026-11-23 11:39:19–11:39:26 | 同 B1 的執行：帳號 2 連已連給帳號 1 的存檔→`conflict`，存檔仍連帳號 1；帳號 2 `recover`→`none`（沒有存檔）。Vercel 日誌 11:39:22 `[zz] auth conflict`、11:39:26 `[zz] auth none`；DB：兩個 session 各為 `conflict`、`none` | — |
| B4 | BLOCKED | 2026-11-23 11:50 | 工具標 MANUAL：cube1 的測試開關（簽一張沒有 nonce 的 token）沒有打開，沒有開關時間 | 需要 cube1 在 Identity staging 打開 B4 開關，再用 `SWITCH=B4` 跑一次（見下方「B 組第一次實跑」） |
| B5 | BLOCKED | 2026-11-23 11:50 | 同 B4（nonce 不同的 token） | 同 B4，`SWITCH=B5` |
| B6 | PASS | 2026-11-23 11:39:15–11:39:19 | 同 B1 的執行：第一次回呼 `recovered`，同一個 callback 網址再開一次→`replay`，第一次的結果仍可讀。Vercel 日誌 11:39:18 `[zz] auth replay` | — |
| B7 | FAIL（cube2，已修） | 2026-11-23 11:39:35 → 11:50:10 | 同 B1 的執行：開始後等 10.5 分鐘才回來，預期 `expired`，實得 `session`；沒有發生綁定（DB：合成存檔 `mvhx8fx8` 沒有 identity 列；那個 session 沒被用掉）。Vercel 日誌 11:50:10 `[zz] auth session`。原因在 cube2：登入流程的 cookie 壽命和 session 一樣是 10 分鐘，瀏覽器 10 分鐘後就把 cookie 丟了，伺服器收不到、只能回 `session`，認不出「過期」 | 已改成 cookie 30 分鐘、session 仍 10 分鐘（`server/bff.js` `COOKIE_LIFE`）；部署到 staging 後要用 `CASES=B7` 重跑一次 |
| B8 | PASS | 2026-11-23 11:39:27–11:39:30 | 同 B1 的執行：A 瀏覽器開始、B 瀏覽器完成→`session`（`session` 或 `state` 都算過），沒有綁定。Vercel 日誌 11:39:30 `[zz] auth session`；DB：該 session 未被用掉，存檔 `f8kf7fzw` 沒有 identity 列 | — |
| B9 | BLOCKED | 2026-11-23 11:50 | 同 B4（交換後、查狀態前撤銷 token） | 同 B4，`SWITCH=B9` |
| B10 | BLOCKED | 2026-11-23 11:50 | 同 B4（status 端點 503 或逾時） | 同 B4，`SWITCH=B10` |
| B11 | PASS | 2026-11-23 11:39:31–11:39:34 | 同 B1 的執行：在 cube1 同意頁按拒絕→`denied`，沒有綁定。Vercel 日誌 11:39:34 `[zz] auth denied`；DB：session `link`→`denied`，存檔 `evxcnqm7` 沒有 identity 列 | — |
| B12 | PASS | 2026-11-23 11:50:15–11:50:18 | 同 B1 的執行：帳號 1 的存檔先刪除（200），再用 `restore`→`recovered`，同一份存檔、可用且仍連結。DB：session 11:50:15 `restore`→`recovered`；`a8ccaanz` 狀態為使用中、有 restored 標記、仍有 identity 列 | — |
| B13 | PASS | 2026-11-22 19:38 | staging `acc6f6a`、`link: true` 時，合成匿名玩家 `staging-test-b0`（不連結）照常：`hello` 建檔、`sync` 改名與回報一場 200、`/api/board` 200、`history` 1 場。正式站同時是 `link: false` | — |

### B 組第一次實跑（2026-11-23 11:38:59–11:50:19 UTC，cube1 Actions 45167007292）

- 執行者：cube1 Work，在 cube1 Actions 的 `staging` Environment 跑 `tools/joint-link-check.js`（工具取自 cube2 `main`）。參數：`expect_build=e1296ad`、`B7=1`。
- 結果：通過 7 項（B1、B2、B3、B6、B8、B11、B12），失敗 1 項（B7），未執行 4 項（B4、B5、B9、B10）。B0 前置檢查通過。
- cube2 端的覆核（Claude，2026-11-23 12:00 UTC 左右）：
  - 工具報告：從 Actions 日誌取回完整 JSON。artifact 檔下載不到（儲存主機不在本環境的允許清單），但日誌中的 JSON 是同一份輸出。
  - Vercel staging 日誌（`dpl_CFkf5ehtKTz9BPYwjny6HJkYL6gk`，`staging` 分支）：同一時段只有 6 行 `[zz] auth`，依序為 `replay`、`conflict`、`none`、`session`、`denied`、`session`，跟報告一一對上。成功的 `linked`／`recovered` 本來就不記錄。
  - staging DB（Neon `neon-crimson-envelope` 的 `staging` 分支，只執行一次 SELECT，沒有輸出任何金鑰或識別碼）：
    - 9 個登入 session 的意圖和結果：link→linked、recover→recovered ×2、link→conflict、recover→none、link（B8，沒被用掉）、link→denied、link（B7，沒被用掉）、restore→recovered。
    - 4 份合成存檔：只有 `a8ccaanz` 有連結（B1 連結、B12 刪除後找回）；B7、B8、B11 的存檔都沒有連結。
- B7 為什麼失敗，以及怎麼修：
  - 原因：開始登入時，cube2 發的 cookie 壽命是 10 分鐘，跟 session 一樣。過了 10.5 分鐘，瀏覽器已經把 cookie 丟掉，回呼時沒帶 cookie，伺服器只能回「沒有 session」。安全上沒問題（沒有綁定），但說不出「過期了、請重來」。
  - 修法：cookie 改成 30 分鐘，session 本身仍然 10 分鐘就失效。單元測試多一項：檢查 11 分鐘後 cookie 還在、30 分鐘內消失。
  - 之前本機測試沒抓到，是因為測試是手動把 cookie 帶回去，沒有模擬瀏覽器自己丟掉 cookie。
- B4、B5、B9、B10 要 cube1 的測試開關，cube2 做不到：
  - 工具新增 `SWITCH=B4|B5|B9|B10`：cube1 打開那一項的開關後，工具用帳號 2 在新存檔上跑一次連結，檢查結果（依序 `token`、`token`、`revoked`、`unavailable`），並確認沒有綁定。
  - 可以用 `SWITCH_NOTE` 寫開關的開、關時間（不要放秘密）。
  - 本機用替身 Identity 演練過，四項都通過。替身「開關沒打開」時，工具會判 FAIL。
- 只重跑部分項目：新增 `CASES`，例如 `CASES=B7`，就只跑 B7。B1、B2、B6、B3、B12 一定一起跑，因為後面幾項都要用 B1 的存檔。
- workflow 範本 `docs/handoff/cube1-joint-link-check.yml` 多了 `cases` 和 `switch` 兩個輸入。

### B 組準備（2026-11-23 03:45 台北）

**Preview／staging 分支的 Identity 設定**（敏感值只看名稱）

| 變數 | 狀態 |
|---|---|
| `IDENTITY_STAGING` | 敏感、看不到值；但 `link: true` 只有在 staging 模式才可能成立（非 staging 模式要的是正式 secret，這裡沒有），所以實際是 `1` |
| `IDENTITY_LINK_ENABLED` | `1` |
| `IDENTITY_ISSUER` | `https://identity-staging.snowrealm.pet`（與 cube1 `/health/live` 回報的 issuer 相同） |
| `IDENTITY_JWKS_URL` | `…/.well-known/jwks.json`（玩家 kid `srstagep_nmkeJAZFwC5B6-ZJ`） |
| `IDENTITY_AUDIENCE` | `snowrealm:brickduel:api`（與 cube1 `PLAYER_AUDIENCE` 相同） |
| `IDENTITY_STAGING_REDIRECT` | `https://brickduel-staging.snowrealm.pet/api/auth/callback`（與 cube1 `STAGING_CLIENT.redirectUri` 相同） |
| `IDENTITY_STAGING_CLIENT_ID` | 沒設，用預設 `brickduel-bff-staging`（與 cube1 `STAGING_CLIENT.clientId` 相同） |
| `IDENTITY_STAGING_CLIENT_SECRET` | **暫時佔位值**（19:32 UTC 設，cube1 會拒絕）→ 要換成 cube1 staging 的 `IDENTITY_BRICKDUEL_CLIENT_SECRET` |
| `IDENTITY_AUTHORIZE_URL` | **暫時佔位值** `…/authorize-placeholder` → 要換成 cube1 的 staging 同意頁 |
| `IDENTITY_TOKEN_URL`／`_STATUS_URL` | 沒設，用 issuer 加 `/oauth/token`、`/v1/token/status` |

**會讓 `link:false` 的條件**（`server/bff.js` `settings()`）：Identity 三個值缺一、`IDENTITY_LINK_ENABLED` 不是 1、不在 staging 模式、client id 不合格或等於正式的、redirect 不是乾淨的 https 回呼或是正式網域、staging secret 少於 32 字或等於正式 secret、issuer 是正式的、沒有 `IDENTITY_AUTHORIZE_URL`、token／status 網址指向正式 issuer 或不是 https。原本缺的是 secret 和入口網址兩項，現在用佔位值補上，所以拒絕路徑可以在 staging 實測。

**與 cube1 OAuth 合約核對**（cube1 PR #17 `e6488c5`）：
- `/oauth/token`：cube2 送 `x-snowrealm-client-secret` header、`Content-Type: application/json`、剛好 6 個欄位 `clientId, redirectUri, code, codeVerifier, state, nonce`，伺服器發出不帶 Origin，全部符合 cube1 的檢查。
- 長度：state、nonce 43 字，verifier 64 字，challenge 43 字，都在 cube1 的格式範圍內。
- token：cube1 簽 `iss/sub/aud/scope/nonce/iat/nbf/exp/jti`，cube2 驗 EdDSA、kid、iss、aud、sub（UUID）、jti、時間、scope，並要求 nonce 等於自己存的那個。
- `/v1/token/status`：兩邊都用 Bearer 加 `x-snowrealm-client-secret`。
- **不相容的地方**：cube1 入口頁 `dist/sso-flow.mjs` 寫死只接受 `client_id=brickduel-bff` 與正式 callback，而且只送正式的 `https://identity.snowrealm.pet/oauth/authorize`。staging 要另做（或讓它認得 staging client 與 issuer），否則 cube2 staging 發出的入口網址會被它當成無效。

**secret 怎麼對上而不經過聊天**：cube2 無法讀 cube1 的 Neon Function 環境變數，也不該讓值經過聊天或日誌。做法是 Owner 在 Neon 主控台複製 cube1 staging 的 `IDENTITY_BRICKDUEL_CLIENT_SECRET`，直接貼進 Vercel 的 `IDENTITY_STAGING_CLIENT_SECRET`（Preview、staging 分支、Sensitive，覆蓋佔位值）。貼好後我用假 code 打一次：伺服器日誌從 `token 401`（secret 不對）變成 `token 400`（secret 對，code 無效），就證明兩邊一致，全程不用看到值。

**本機已過（不算 staging）**：`test/bff.test.js` 101 項（PKCE、state、nonce 必填與不符、replay、過期、換瀏覽器、撤銷、status 503／逾時、JWKS 抓不到、衝突、找回、30 天內 restore）、`test/identity.test.js` 55 項、`test/authui.js` 9 項（瀏覽器實際走連結、找回、衝突的畫面）、`test/api.test.js` 410 項。

### A14 稽核查核（2026-11-22 17:56 UTC，staging 分支，唯讀）

`SELECT at, sub, jti, path, status FROM zz.admin_log ORDER BY id DESC LIMIT 50;`（另外把 `at` 轉成 UTC 時間，並加查欄位結構與統計）

- 共 64 筆，時間 17:44:10–17:44:32 UTC，就是 cube1 那次執行。
- sub：除了 A5 刻意送的 `svc:someone-else`（403，照實記下被拒的身分），其他全部是 `svc:snowrealm-games-admin`。
- jti：64 筆有 56 個不同值。A1／A11 的 9 筆共用一個（`3e05f934…`），其餘每次都是新的。最長 36 字，都是 UUID。
- path：只有路徑（最長 44 字，例如 `players/af315eac-…`），沒有查詢字串。
- status：200 ×60、403 ×3（A4 兩筆、A5 一筆）、429 ×1（A12 第 61 次）。
- 欄位只有 `id bigint`、`at double precision`、`sub text`、`jti text`、`path text`、`status smallint`，沒有 token、header、IP 的欄位。
- 用正規式掃 sub、jti、path，找 `eyJ`、`bearer`、`private`、`-----BEGIN`、`secret`、`authorization`、JWT 形狀：**0 筆**。
- 程式：`server/admin.js` 的 `audit()` 只寫 `at, sub, jti, path, status`（sub ≤100 字、jti ≤200、path ≤120）；`server/app.js` 只在簽章通過、有 sub 時才寫，所以 401（A2、A3、A6、A10）、503 和 405（A13）不會進資料表，這是規格寫好的（`docs/BRICKDUEL_ADMIN_API_ADAPTER_SPEC.md`：驗不過的 401 不寫入資料庫，只記原因類別）。伺服器日誌只印 `admin 401 <原因類別>`，不印 token。
- 沒有發現完整 JWT、私鑰、Client Secret 或 Authorization header。

### A7–A9 的做法與還原

- cube1 的 Identity 簽發服務沒有動。cube2 用自己的兩把測試金鑰，暫時指定 staging 要信任的 JWKS，測的是 cube2 驗簽端在換鑰、移除舊鑰、JWKS 故障時的行為。
- 這份暫時 JWKS 一直保留 cube1 的金鑰，cube1 的呼叫只在 A9 故障的那段時間受影響。
- 測試 token 只有在這次驗收、只對 staging 有效；k1、k2 都已經不在任何被信任的 JWKS 裡。
- 還原：18:36:27 UTC 把 `BRICKDUEL_ADMIN_JWKS_URL` 改回 `https://identity-staging.snowrealm.pet/.well-known/admin-jwks.json`，並重新部署 staging（版本見 DEVLOG）。`accept-jwks` 分支只剩 README 和 vercel.json，要刪等 Owner 同意。
- 如果 cube1 也想用自己的新 kid 重跑 A7（例如真的換鑰時），流程一樣，只是 JWKS 改由 cube1 發布。

**cube2 這邊已經實際確認的（不屬於 27 項）**：

| 項目 | 結果 | 證據 |
|---|---|---|
| 2026-11-23 01:20（台北）staging 管理信任對接真實 JWKS | 通（設定面，非 A 項） | 雲端瀏覽器直接取 `https://identity-staging.snowrealm.pet/.well-known/admin-jwks.json`：一把 Ed25519 公鑰，kid `srstagea_EWW-tM7u8uSnvCwV`，沒有 `d`；玩家 JWKS 是另一把（kid `srstagep_nmkeJAZFwC5B6-ZJ`），兩邊不混用。Preview／staging 的 `BRICKDUEL_ADMIN_JWKS_URL`、`BRICKDUEL_ADMIN_ISSUER`、`BRICKDUEL_ADMIN_SUBJECTS` 重設為上述網址、`https://identity-staging.snowrealm.pet`、`svc:snowrealm-games-admin`，並重新部署。cube2 沒有建立或保存任何公鑰，金鑰一律從 JWKS 端點取得 |
| staging 網域 TLS、部署保護、bypass | 通 | cube1 用 bypass 打 staging `/api/health` 得到 200（cube1 回報） |
| staging 用的是獨立資料庫 | 通 | staging `/api/health?deep=1`：`db: true`、`ready: true`；staging 排行榜是空的，正式站有玩家；`7c2562f` 部署後 staging `/api/health` 顯示 `dbSource: "staging"`，正式站顯示 `"main"` |
| 管理 API 在 staging 沒設定前回 503 | 通 | staging `/internal/admin/v1/overview` → 503 `{"error":"disabled"}` |
| 2026-11-22 22:13 第一階段複查（staging 部署 `dpl_DuPzTTWfaBUD6uL7RkPiv4CwMJiW`，`7c2562f`；main `f2af893` 只改文件） | 通 | `/api/health`：`db: true`、`dbSource: "staging"`、`build: "7c2562f"`、`admin: false`、`link: false`。`GET /api/auth/start` → 405（`Allow: POST`）。`/api/auth/callback` → 303 導回首頁（`auth=off`）。admin → 503 `disabled` |
| cube1 進度（Issue #18，2026-11-22） | — | PR #17 到 `898a8b0`，沒有部署網址、也沒合併；staging issuer、JWKS、Identity 端點都還沒有 |
