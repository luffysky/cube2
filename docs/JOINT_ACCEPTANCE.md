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

## 實測報告

只記錄真的在 staging 雙端跑出來的結果。本機演練和 CI 都不算。cube2 SHA 指的是 staging 上部署的版本。

| # | 結果 | 時間（UTC） | 證據 | 原因／下一步 |
|---|---|---|---|---|
| A1 | BLOCKED | 2026-11-22 | staging `/internal/admin/v1/overview` → 503 `disabled` | 等 cube1 的 staging admin signer、issuer、admin-jwks.json；拿到後 Owner 設進 Preview，cube1 執行 `tools/joint-admin-check.js` |
| A2 | BLOCKED | 2026-11-22 | 同上 | 同上 |
| A3 | BLOCKED | 2026-11-22 | 同上 | 同上 |
| A4 | BLOCKED | 2026-11-22 | 同上 | 同上 |
| A5 | BLOCKED | 2026-11-22 | 同上 | 同上 |
| A6 | BLOCKED | 2026-11-22 | 同上 | 同上 |
| A7 | BLOCKED | 2026-11-22 | — | 同上，另需 cube1 在 staging JWKS 並列兩把金鑰 |
| A8 | BLOCKED | 2026-11-22 | — | 同 A7 |
| A9 | BLOCKED | 2026-11-22 | — | 同上，另需 cube1 讓 staging JWKS 暫時無法存取 |
| A10 | BLOCKED | 2026-11-22 | — | 同 A1 |
| A11 | BLOCKED | 2026-11-22 | — | 同 A1 |
| A12 | BLOCKED | 2026-11-22 | — | 同 A1 |
| A13 | BLOCKED | 2026-11-22 | — | 同 A1（POST 要由 cube1 送；cube2 這邊的工具只能發 GET） |
| A14 | BLOCKED | 2026-11-22 | — | A1–A13 跑完後，Owner 在 Neon staging 分支查 `zz.admin_log` |
| B1 | BLOCKED | 2026-11-22 | staging `/api/health` → `link: false` | 等 cube1 的 staging Identity（issuer、JWKS、authorize、token、status、client secret），以及登記 callback |
| B2 | BLOCKED | 2026-11-22 | 同上 | 同上，另需第二台裝置 |
| B3 | BLOCKED | 2026-11-22 | 同上 | 同上，另需兩個測試帳號 |
| B4 | BLOCKED | 2026-11-22 | 同上 | 同上，另需 cube1 的隔離 harness（有效簽章、沒有 nonce） |
| B5 | BLOCKED | 2026-11-22 | 同上 | 同 B1 |
| B6 | BLOCKED | 2026-11-22 | 同上 | 同 B1 |
| B7 | BLOCKED | 2026-11-22 | 同上 | 同 B1 |
| B8 | BLOCKED | 2026-11-22 | 同上 | 同 B1 |
| B9 | BLOCKED | 2026-11-22 | 同上 | 同 B1，另需 cube1 可以撤銷 token |
| B10 | BLOCKED | 2026-11-22 | 同上 | 同 B1，另需 cube1 讓 status 端點暫時失效 |
| B11 | BLOCKED | 2026-11-22 | 同上 | 同 B1 |
| B12 | BLOCKED | 2026-11-22 | 同上 | 同 B1 |
| B13 | BLOCKED | 2026-11-22 | 正式站排行榜與健康檢查正常，但這是正式站的旁證，不算 staging 的結果 | 同 B1 |

**cube2 這邊已經實際確認的（不屬於 27 項）**：

| 項目 | 結果 | 證據 |
|---|---|---|
| staging 網域 TLS、部署保護、bypass | 通 | cube1 用 bypass 打 staging `/api/health` 得到 200（cube1 回報） |
| staging 用的是獨立資料庫 | 通 | staging `/api/health?deep=1`：`db: true`、`ready: true`；staging 排行榜是空的，正式站有玩家；部署這次 commit 後再用 `dbSource` 確認（見 DEVLOG） |
| 管理 API 在 staging 沒設定前回 503 | 通 | staging `/internal/admin/v1/overview` → 503 `{"error":"disabled"}` |
