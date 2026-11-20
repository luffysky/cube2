# 轉磚（BRICKDUEL）× SnowRealm Identity：整合規格與現況

更新：2026-11-20｜負責：Claude（cube2）｜對照文件：GPT〈SnowRealm Identity × 轉磚：整合協定定案 v1.0〉、〈SnowRealm Games × Claude 完整交接包 2026-11-20〉

> 這份文件分清楚「已上線」「已寫碼未上線」「待 GPT」「待雙方」。**SnowRealm Identity 目前沒有正式服務，轉磚沒有、也不會用假 token 接上正式環境。**

## 1. 現況（以 cube2 `main` 為準）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 轉磚自己的雲端存檔 | **已上線** | 不註冊、不存信箱密碼。第一次需要時伺服器發一組裝置憑證（只存在瀏覽器），換裝置用 10 分鐘一次性的引繼碼。資料在 Neon `zz` schema。 |
| 「登入／註冊」入口 | **已上線（引導）** | 主選單「登入／註冊」與個人頁都有「SnowRealm Games 帳號」區塊，按鈕開新分頁到 `https://games.snowrealm.pet/`，說明「右上角『登入』→『註冊』」。13 歲以下不顯示註冊按鈕，只說明不用註冊也能玩。 |
| 轉磚 ↔ SnowRealm 帳號綁定 | **未開放** | 等 Identity 上線並完成雙方驗收。畫面上已告知玩家：轉磚的進度與金幣保留，綁定時再接上。 |
| 驗 Identity JWT 的伺服器端轉接層 | **規格已定，程式未寫入正式路由** | 見第 3 節；在 Identity 給出 issuer／JWKS 前，開關預設關閉。 |
| 磚塊小遊戲（/games）金幣與紀錄 | **已上線** | 小遊戲結果先排在瀏覽器佇列，打開轉磚時由 Meta 入帳；有雲端存檔時伺服器重算（op `mini`，時間額度與每日 300 上限）。紀錄存在轉磚自己的玩家資料，與 cube1 無關。 |

## 2. 身分與資料歸屬（沿用 GPT 定案）

- 平台玩家 ID：Identity JWT 的 `sub`（SnowRealm 平台 UUID）。**不是** SteamID、不是 Neon Auth `sub`、也不是轉磚玩家 ID。
- 轉磚保留自己的玩家 ID（`zz.players.id`）、金幣、道具、段位、排行榜與對戰紀錄。cube1／cube2 不互通遊戲經濟，不共用資料庫或密碼。
- 綁定表（預定，**尚未建表**）：`zz.identity(platform_id uuid PRIMARY KEY, pid bigint UNIQUE REFERENCES zz.players(id), linked_at, provider_hint)`，一對一，交易內寫入。
- 轉磚 API **不處理** Steam Ticket、SteamID、Neon Auth Session；Steam 由 Identity 可信後端換成平台 UUID。

## 3. 伺服器端驗證（預定實作，開關預設關）

只在下列環境變數都設好時啟用（只列名稱）：`IDENTITY_ISSUER`、`IDENTITY_JWKS_URL`、`IDENTITY_AUDIENCE`（預期 `snowrealm:brickduel:api`）、`IDENTITY_LINK_ENABLED`（`1` 才開放綁定）。

驗證規則（照 v1.0）：
- `alg` 只收 EdDSA（Ed25519）；`none`、HS256、其他一律拒絕。header 必須有 `kid`，並在 JWKS 找得到。
- `iss` 完全相等；`aud` 完全相等（陣列時必須包含且只用於轉磚）。
- `iat` 必填、不得晚於伺服器時間 60 秒以上；`exp` 必填、`exp - iat ≤ 600`；`nbf` 有就驗；`jti` 必填（寫入稽核，短期內重複即拒絕）；`sub` 必須是 UUID。
- JWKS：有限時快取（例如 10 分鐘）、逾時重試；拿不到可驗證的金鑰就拒絕，不放行。
- 多 issuer 過渡：每個 issuer 各自的 JWKS、audience、演算法、啟用狀態與淘汰日；不做「issuer 名單一律放行」。

綁定流程（預定）：
1. 玩家在轉磚按「綁定 SnowRealm 帳號」→ 走 Identity 的 OAuth/OIDC 授權碼 + PKCE（由 Identity／BFF 處理，轉磚不碰長期密鑰）。
2. 轉磚後端收到短效 JWT → 驗證 → 顯示「這台裝置的進度」與「平台帳號已綁的轉磚進度（如果有）」→ 玩家確認。
3. 交易內寫 `zz.identity`；平台 UUID 已綁別的轉磚玩家時**不自動合併**，請玩家選擇保留哪一份。
4. 綁定成功：舊裝置憑證與引繼碼作廢、重新發裝置憑證；之後排位、開房、資產操作需要有效 JWT 且 `sub` 與綁定一致。

## 4. 測試清單（Identity 交付後要跑；現在先寫成本機金鑰的單元測試，不碰正式環境）

1. 合法 JWT 通過；過期、未來 `iat`、壽命超過 10 分鐘、錯 audience、錯 issuer、錯簽章、`alg` 不允許、缺 `kid`／`jti`／`sub` 全部拒絕。
2. JWKS 新舊金鑰輪替、舊鑰淘汰、JWKS 暫時連不上時安全拒絕、緊急撤銷。
3. 同一平台 UUID 不會建立兩個轉磚玩家；兩個不同平台 UUID 不會被合併；綁定競態（同時兩台綁）只成功一次。
4. 舊裝置憑證在綁定後不能操作已綁定玩家的排位、房間、資產。
5. 停權：排位入場拒絕；單機、CPU、練習、磚塊小遊戲照常可玩。
6. 開關關閉時，所有現有匿名玩法與既有測試全數通過（目前 `node test/run.js` 與瀏覽器測試）。

## 5. 需要 GPT 交付／確認

- Identity 正式網域、issuer、JWKS URL、轉磚 audience，以及可用的非機密測試金鑰或測試簽發端。
- 平台登入入口能否支援從外部連結直接打開註冊（例如 `https://games.snowrealm.pet/?member=register`）。目前首頁沒有這種連結，轉磚只能帶到首頁並說明「右上角登入 → 註冊」。
- 綁定（link）用的授權流程端點與回呼網址規則（PKCE、state、允許的 redirect URI）。
- 停權／撤銷的查詢或通知方式。
- 不交換真實 JWT、Session Cookie 或 Steam Ticket；只用測試資料對齊。

## 6. 不做的事

- 不改 cube1，不讀 cube1 的資料庫或 Secrets。
- Identity 上線前，不在正式環境開啟綁定，不宣稱「已用 SnowRealm 帳號登入」。
- 不把轉磚金幣、道具、段位帶到其他遊戲，也不收其他遊戲的經濟資料。
