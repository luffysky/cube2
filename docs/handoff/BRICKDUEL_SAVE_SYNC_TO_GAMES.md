# 轉磚存檔同步到 SnowRealm Games（草案 v0.1，2026-11-23）

給 cube1 Work。cube2（轉磚）這邊的提案。兩邊對好之後才實作，在那之前正式站不會送出任何資料。

## Owner 的決定（C-042，2026-11-23）

- 綁定之後，**整份轉磚存檔交給 Games 保管一份**。
- **單向、持續**：轉磚 → Games，每次存檔有變動就更新。Games 不會回寫轉磚。
- 轉磚仍然是這份存檔的權威來源：遊戲規則、金幣、排位都只在轉磚判定。Games 上的副本是「保管和顯示」用的。

## 範圍

- 只有**已綁定**的存檔會送。沒有綁定的匿名玩家，一筆都不送。
- 未滿 13 歲的存檔不能綁定，所以也不會送。
- 送的是存檔內容 `state`：金幣、經驗、排位、道具、外觀、小遊戲成績、磚之冒險進度、統計等，共 30 個欄位，格式見下方 `brickduel.save.v1`。
- **不送**：裝置鑰匙、轉移碼、伺服器內部紀錄（`srv`）、網路位址、信箱、雲端檔案內容。

## 介面（cube2 提案，cube1 可以改路徑）

```
PUT https://identity.snowrealm.pet/v1/games/brickduel/saves/{platformId}
Authorization: Bearer <cube2 簽的服務 JWT>
Content-Type: application/json

{
  "schema": "brickduel.save.v1",
  "platformId": "<綁定時 token 的 sub>",
  "gameUserId": "<轉磚存檔 id>",
  "publicTag": "<8 碼公開代號>",
  "ver": 128,
  "at": "2026-11-23T15:00:00Z",
  "state": { ... },
  "deleted": false
}
```

- **身分驗證**：cube2 用自己的 Ed25519 金鑰簽短效 JWT，公鑰公開在 `https://brickduel.snowrealm.pet/.well-known/sync-jwks.json`。JWT 內容：`iss=https://brickduel.snowrealm.pet`、`aud=snowrealm:games:save-sync`、`sub=svc:brickduel`、`scope=save:write`，有效 5 分鐘，帶 `jti`。這樣兩邊不必共用任何秘密。
- **順序**：`ver` 只會變大。Games 只保留收過最大的 `ver`；收到比較舊的就回 200 但不覆蓋，所以重送不會出事。
- **刪除**：玩家刪除存檔時，送一筆 `deleted: true`，Games 隱藏副本。30 天內玩家把存檔救回來，會再送一次完整的；30 天後轉磚真的刪掉，Games 也刪掉副本。
- **回應**：200 或 204 代表收到；409 代表 `ver` 比較舊、已忽略；401、403 是驗證錯誤；5xx 會重送。

## cube2 會怎麼做（對好之後）

1. 新增送件佇列：每次存檔成功、而且這份存檔已經綁定，就把「要送的版本」記下來；同一份存檔只留最新一筆。
2. 存檔後馬上試送一次；失敗的由排程補送，間隔逐次拉長，最多重試 24 小時，超過就記到日誌給後台看。
3. 綁定成功的那一刻送第一份完整存檔，也就是「原本的資料」。
4. 開關 `SAVE_SYNC_ENABLED`，正式站等兩邊實測過、Owner 核准後才打開。

## 要 cube1 決定或提供的

- 確認路徑、`aud`、回應碼。
- Games 存放副本的地方，以及在後台和玩家個人頁怎麼顯示。
- 隱私權政策要加一段「綁定後，轉磚存檔會同步給 SnowRealm Games 保管」。這也需要 Owner 確認。

## 驗收（兩邊都做完之後）

- 綁定後一分鐘內，Games 收到 `ver` 跟轉磚一樣的副本。
- 在轉磚玩一場、金幣有變動，Games 的副本跟著更新。
- 重送舊版本，Games 不會被蓋掉。
- 刪除存檔後 Games 隱藏副本；救回後再出現。
- 沒有綁定的存檔，Games 一筆都沒有收到。
