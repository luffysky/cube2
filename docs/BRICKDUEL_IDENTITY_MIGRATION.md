# 轉磚 × SnowRealm Identity：資料表變更單

日期：2026-11-20｜執行者：Claude（cube2）｜依據：Owner 核准書（cube1 `docs/BRICKDUEL_ACCOUNT_INTEGRATION_APPROVAL_zh-TW.md`）第 2、3、7 節；Owner 決策 D-007（非刪除性新增／更新免逐次核准）

## 變更內容（只有新增，沒有刪除、沒有改舊欄位）

```sql
CREATE TABLE IF NOT EXISTS zz.identity (
  platform_id uuid PRIMARY KEY,                                    -- SnowRealm 平台玩家 UUID（Identity JWT 的 sub）
  pid uuid NOT NULL UNIQUE REFERENCES zz.players(id) ON DELETE CASCADE,   -- 轉磚自己的玩家 ID（zz.players.id 是 uuid）
  linked_at double precision NOT NULL,                             -- 綁定時間（毫秒）
  provider_hint text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS zz.idjti (
  jti text PRIMARY KEY,                                            -- 用過的平台 token 編號，防重用
  exp double precision NOT NULL
);
```

- 寫在 `server/db.js` 的建表清單裡，跟其他表一樣在 API 第一次建表檢查時自動建立；重複執行不會出錯。
- `ON DELETE CASCADE`：玩家自己按「刪除雲端資料」（既有功能）時，綁定紀錄跟著存檔一起消失，不留下指向不存在存檔的綁定。
- 兩張表在 `IDENTITY_LINK_ENABLED` 沒開之前**不會寫入任何一列**。

## 狀態

| 項目 | 狀態 |
|---|---|
| 程式提交 | 見 DEVLOG 本次條目的 commit |
| 本機／測試資料庫（PGlite） | 已建立並測試：`node test/identity.test.js` 49 通過、`node test/api.test.js` 300 通過（表數 13 → 15） |
| 正式資料庫（Neon） | 部署後第一次 API 建表檢查時建立；屬非破壞性新增，依 D-007 不需逐次核准 |
| 備份 | 只新增空表，不動既有資料；Neon 本身有時間點還原 |

## 回滾

- **不需要刪表也能回滾**：把 `IDENTITY_LINK_ENABLED` 留空或關掉，所有綁定、找回端點立即回 503，遊戲照常。
- 真的要移除這兩張表（`DROP TABLE`）屬於刪除，**必須先取得 Owner 明確核准**，本變更單不包含這個動作。

## 權限

- 沿用 cube2 既有的資料庫連線（只在 Vercel 環境變數，名稱 `DATABASE_URL` 等），沒有申請新權限。
- 不讀、不寫 cube1 的任何資料表。
