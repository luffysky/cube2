# 轉磚 × SnowRealm 中央付款與會員權益（cube2 草案 v0.1，2026-11-24）

給 cube1 Work。cube2 這邊**已實作接收端**（`server/entitle.js`），開關 `ENTITLE_ENABLED` 關著。路徑、欄位、`aud` 都可以由 cube1 改，cube2 照著調。

## 分工

- **cube1**：商品結帳、訂單、會員方案（Free／Plus／Pro）、續訂、取消、退款、平台收據（Web 金流、Steam Microtransaction、Google Play、App Store）。轉磚頁面不放任何結帳畫面。
- **cube2**：只收「結果」。會員資格和付費商品由轉磚伺服器自己發到存檔；頁面送什麼都不算數。遊戲金幣和道具帳本（`zz.ledger`）仍由轉磚自己管，和付款服務分開。

## 通知（cube1 → cube2）

```
POST https://brickduel.snowrealm.pet/internal/entitlements/v1/events
Authorization: Bearer <cube1 付款服務的 Ed25519 JWT>
```

- JWT：`iss=https://identity.snowrealm.pet`、`aud=snowrealm:brickduel:entitlements`、`sub=svc:snowrealm-commerce`、`scope` 含 `entitlements:write`、有 `kid`、`iat`、`exp`、`jti`，`exp - iat` 不超過 300 秒，每個 `jti` 只能用一次。公鑰：`https://identity.snowrealm.pet/.well-known/commerce-jwks.json`（請 cube1 提供，或改成其他網址）。不可帶 `Origin`。
- 內容：

```json
{
  "schema": "snowrealm.entitlement.v1",
  "eventId": "<UUID，每筆通知唯一>",
  "platformId": "<玩家的平台 UUID>",
  "game": "brickduel",
  "kind": "membership",
  "version": 7,
  "at": "2026-11-24T04:00:00Z",
  "membership": { "tier": "plus", "status": "active", "periodEnd": "2026-12-24T04:00:00Z" }
}
```

```json
{ "...": "同上", "kind": "order",
  "order": { "orderId": "ord_123456", "sku": "brickduel.look.xxx", "status": "succeeded", "platform": "web" } }
```

- `membership.tier`：`free`／`plus`／`pro`；`status`：`active`／`canceled`（關掉續訂、本期仍有效）／`expired`／`refunded`／`revoked`；`periodEnd`：本期結束時間或 `null`。
- `order.status`：`pending`／`succeeded`／`failed`／`refunded`／`revoked`；`platform`：`web`／`steam`／`android`／`ios`。
- `version`：同一個會員資格、同一張訂單的狀態每變一次就加大。
- 回應：`200 {"result":"applied"|"duplicate"|"stale"}`、`400` 格式錯、`401/403` 驗證、`409` 同一個訂單號換了帳號或商品、`503` 未開。5xx 和連不上請重送；同一個 `eventId` 重送只回 `duplicate`。

## cube2 怎麼處理

- **會員**：`active`，或 `canceled` 但本期還沒結束，就是會員，到 `periodEnd` 為止；`expired`、`refunded`、`revoked` 立即結束。存檔的會員欄位由伺服器寫入（`state.sub = { until, tier, demo: false }`），所以每日寶箱、轉盤、獎勵加成、會員造型、自己的圖片、雲端檔案、免看廣告領獎都跟著它走；資格結束時，穿著的會員造型自動換回預設。頁面不能開通，也不能取消付費會員（伺服器回 `pay`）。
- **還沒綁定的帳號**：通知照收；玩家之後在轉磚登入綁定，資格自動帶上存檔。
- **訂單**：每張訂單只發一次貨，`succeeded` 發，`refunded`／`revoked` 收回並換下，`pending`／`failed` 不發；同一則通知重送、較舊的 `version` 晚到都不會重複發或把退款蓋回去。轉磚目前**沒有任何用真錢賣的商品**（`Meta.PAID` 是空的），所以訂單只記錄、不發貨，等 Owner 定商品後再加。
- **商品類型**：金幣造型（遊戲金幣買，永久，不退金幣）、會員造型（會員期間可用，到期換回）、付費限定商品（真錢買，永久；退款或撤銷就收回）。

## 要 cube1 決定或提供的

1. 確認路徑、`aud`、欄位，或給 cube1 的版本。
2. `commerce-jwks.json` 公鑰，以及正式、staging 各自的 issuer。
3. 補送機制：通知送失敗時 cube1 怎麼重送，cube2 是否也要能主動查詢（`GET` 權益）。
4. Plus 和 Pro 在轉磚各自有哪些福利（目前 Plus、Pro 都用同一組會員福利）。
5. Steam、手機商店的收據由 cube1 驗證後一樣用這個通知送來。

## 驗收

staging 兩邊都開之後，一起跑：買 Plus、升 Pro、取消續訂、到期、退款、撤銷、通知重送、版本倒序、未綁定帳號之後綁定、付費商品發貨與退款收回。
