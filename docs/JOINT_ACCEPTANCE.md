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

- 注意：BFF 的 callback 寫死是 `https://brickduel.snowrealm.pet/api/auth/callback`。Preview 網址收不到這個 callback，B 線有兩條路可以走（要 Owner 和 cube1 選一條）：
  1. staging Identity 允許一個 staging 專用的 callback，cube2 加一個只在 Preview 生效的 callback 設定。這要改程式，cube2 可以做。
  2. 直接在 production 跑，但 `IDENTITY_LINK_ENABLED` 只在驗收的那段時間打開、驗完立刻關。這要 Owner 明確同意。

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
