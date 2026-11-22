# B1–B12 帳號綁定 staging 驗收：給 cube1 Work 的執行手冊

更新：2026-11-23 04:40（Asia/Taipei）。Owner 指示由 Work 用 staging 測試帳號實際登入；cube2（Claude）負責核對伺服器端的證據並填表。

## 現況（cube2 已確認）

- cube2 staging：`https://brickduel-staging.snowrealm.pet`，部署 `e1296ad`。`/api/health?deep=1` 回 `link: true`、`dbSource: "staging"`、`ready: true`。
- client 是 `brickduel-bff-staging`，callback 是 `https://brickduel-staging.snowrealm.pet/api/auth/callback`。
- cube2 的 `IDENTITY_STAGING_CLIENT_SECRET` 與 cube1 staging 一致：拿假 code 去換 token 時，cube1 回 400 `invalid_grant`，表示 client 驗證通過。
- 入口是 `https://identity-staging.snowrealm.pet/oauth/authorize`（v4）。cube2 自己確認過，用不存在的帳號登入會顯示「登入失敗」。
- 正式站：`link: false`、`admin: false`，不要碰。

## 進入 staging

- staging 有 Vercel 部署保護，請用你們 GitHub Environment 裡的 bypass。
- 在瀏覽器網址後面加 `?x-vercel-protection-bypass=<bypass>&x-vercel-set-bypass-cookie=true`。
- 開一次之後，同一個瀏覽器設定檔就會帶著 cookie，可以正常使用。

## 怎麼按

1. 打開 `https://brickduel-staging.snowrealm.pet/`。
2. 打完一場（或在個人資料改暱稱），讓這台裝置有雲端存檔。
3. 選單 → 個人資料 → 「SnowRealm Games 帳號」那一塊：
   - **連結**：「把這份存檔連結到 SnowRealm Games 帳號」（intent `link`）
   - **找回**：「用 SnowRealm Games 帳號找回存檔」（intent `recover`）
   - **恢復**：「恢復帳號上等待刪除的存檔」（intent `restore`，只有存檔在 30 天刪除等待期時才會出現）
4. 會被導到 identity-staging 登入。用測試帳號登入、同意之後，會回到 `https://brickduel-staging.snowrealm.pet/?auth=<結果>`。
5. **每一項請記下**：
   - UTC 時間（到秒）
   - 用哪個測試帳號（寫「帳號 1」或「帳號 2」就好，不用寫 email）
   - 最後網址上 `auth=` 的值
   - 頁面上顯示的那句話

不要記錄密碼、token、code、cookie，也不要截有網址參數的圖。

## 每一項要做什麼、預期結果

| # | 做法 | 預期 `auth=` | cube2 會再核對 |
|---|---|---|---|
| B1 | 瀏覽器 X（新設定檔）有一份存檔 → 連結 → 帳號 1 | `linked`；頁面說「已連結」 | `zz.identity` 多一筆，指向這份存檔；`zz.idjti` 記下這張 token 的 jti；裝置金鑰換新 |
| B2 | 瀏覽器 Y（另一個乾淨的設定檔）→ 找回 → 帳號 1 | `recovered` | Y 拿到的是 B1 那份存檔（同一個 pub），金幣、進度相同 |
| B3 | 瀏覽器 Z 另開一份新存檔 → 連結 → **帳號 2**，然後在 Z 再試一次連結 → **帳號 1** | 第一次 `linked`；第二次 `conflict` | 第二次之後兩份存檔與金幣都沒變，帳號 1 仍只綁 B1 那份 |
| B4 | cube1 用隔離 harness 簽一張**沒有 nonce** 的有效 token，讓 `/oauth/token` 回它（只在這一次） | `token` | 伺服器日誌：`[zz] auth token (nonce)` |
| B5 | harness 簽一張 nonce **不同**的 token | `token` | 日誌：`(nonce)` |
| B6 | 做一次正常連結；成功後把瀏覽器歷史裡的 callback 網址（`/api/auth/callback?code=…&state=…`）再開一次 | 第二次是 `replay` | 沒有多綁、沒有多發金鑰 |
| B7 | 按連結後停在登入頁超過 10 分鐘，再登入同意 | `expired` | — |
| B8 | 在瀏覽器 X 按連結，把導去登入頁的網址複製到瀏覽器 Y 完成登入同意 | `session` 或 `state` | 沒有綁到任何存檔 |
| B9 | cube1 在換 token 之後、cube2 查 status 之前撤銷該 token（或讓 `/v1/token/status` 對它回 `active:false`） | `revoked` | 沒有綁定；日誌：`(status 200)` 或 `(status 401)` |
| B10 | cube1 讓 `/v1/token/status` 暫時回 503 或逾時，再做一次連結 | `unavailable` | 沒有綁定；日誌：`(status 503)` 或 `(status fetch failed)` |
| B11 | 在登入頁／同意頁按「取消」（cube1 應帶 `error=access_denied` 回 callback） | `denied` | — |
| B12 | 用 B1 那份存檔在 cube2 個人資料 →「刪除存檔」→ 在 30 天內用帳號 1 →「恢復帳號上等待刪除的存檔」 | `recovered`，刪除取消 | 那份存檔的 `gone` 清掉、`restored` 有時間 |

## 做完交給 cube2 的東西

- 一張表，每列一項：B 編號、UTC 時間、帳號 1／2、最後的 `auth=` 值、頁面那句話。
- cube1 Actions 或 Issue 連結（如果有）。
- B4、B5、B9、B10 用了哪個 harness 或開關，什麼時候開、什麼時候關。

cube2 收到之後，會用 staging 資料庫唯讀查詢和 Vercel 伺服器日誌逐項核對，再在 `docs/JOINT_ACCEPTANCE.md` 標 PASS／FAIL／BLOCKED。只看瀏覽器結果、沒有伺服器證據的項目不會標 PASS。
