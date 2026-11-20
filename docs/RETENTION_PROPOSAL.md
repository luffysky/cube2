# 稽核紀錄與登入暫存的清理方案（提案，**尚未執行**）

**狀態**：只有提案和監控。真正刪除的程式**沒有寫進去**，要等 Owner 明確批准。
**依據**：GPT 2026-11-21 契約補充第 3 點；Owner 保留事項「刪除須事前核准」。

## 1. 現在已經有的（只讀）

每天台灣時間凌晨 3:07 的排程 `/api/cron` 會回報下面這些數字。超過門檻時，伺服器日誌會記一行 `[zz] retention …`。

| 欄位 | 意思 |
|---|---|
| `watch.adminLog.rows` | `zz.admin_log` 總筆數 |
| `watch.adminLog.pastKeep` | 超過 180 天的筆數 |
| `watch.adminLog.oldest` | 最舊一筆的時間 |
| `watch.authSessions.rows` | `zz.authsess` 總筆數 |
| `watch.authSessions.expired` | 過期超過 1 天的筆數 |
| `watch.authSessions.expiredWithData` | 上一項裡還留著加密資料的筆數（沒走完流程、沒用掉的那些） |

程式在 `server/retention.js`，只有 `SELECT`。

## 2. `zz.admin_log`（後台 API 稽核，保存 180 天）

**內容**：時間、服務帳號 `sub`、token 的 `jti`、路徑、狀態碼。沒有玩家資料、token、IP。

**提案做法**：
1. **先彙總、後刪除**：刪之前把要刪的那幾天彙總成每日統計，存進新表 `zz.admin_log_daily(day, sub, path, status, n)`。這樣長期的呼叫量還查得到，只是單筆的 `jti` 不見了。彙總表只增不刪。
2. **分批刪**：每次最多刪 5,000 筆，每次排程最多跑 10 批，依 `id` 由舊到新：
   `DELETE FROM zz.admin_log WHERE id IN (SELECT id FROM zz.admin_log WHERE at < now − 180 天 ORDER BY id LIMIT 5000)`
   沒刪完的隔天繼續，不會一次鎖住整張表。
3. **開關**：要在 Vercel 設 `RETENTION_PURGE=1` 才會刪；沒設就只回報、不動手。
4. **紀錄**：每次真的刪到東西，就在新表 `zz.retention_runs(at, tbl, n, oldest_left)` 留一筆（時間、哪張表、刪了幾筆、剩下最舊的時間）。
5. **可回復**：
   - 刪除前的狀態靠 Neon 的時間點還原（point-in-time restore）找回。還原期限依 Neon 方案而定，**請 Owner 確認目前方案的期限**，開關打開前先做一次還原演練。
   - 第一個月只回報不刪，先確認數字合理再開。

## 3. `zz.authsess`（「連結 SnowRealm Games」的暫存工作階段）

**內容**：
- 工作階段 ID 的雜湊、用途（連結／找回／恢復）
- 用加密方式保存的 PKCE、state、nonce，以及結果
- 用過的那些，加密資料已經清空；只有沒走完流程的才還留著

**提案做法**：
1. **第一步，過期 1 天**：把 `box`、`res` 這兩個加密欄位設成 `NULL`，讓秘密不再留著。這一步是 `UPDATE`，但也屬於清除資料，一樣要 Owner 核准。
2. **第二步，過期 30 天**：分批刪掉整列，每批最多 5,000 筆，同樣受 `RETENTION_PURGE=1` 開關控制，也同樣寫進 `zz.retention_runs`。
3. **可回復**：這張表沒有玩家資產或進度，刪掉不影響任何存檔。真的需要時，同樣可以用 Neon 時間點還原。

## 4. 不會碰的東西

- 玩家存檔、金幣、流水帳、對局、開箱紀錄
- `zz.identity` 綁定
- 雲端檔案：已有 C-034 的規則
- 玩家刪除存檔後的 30 天規則：已有 C-022

## 5. 請 Owner 決定

- [ ] 同意 `zz.admin_log` 保存 180 天、先彙總後分批刪？
- [ ] 同意 `zz.authsess` 過期 1 天清掉加密欄位、30 天刪整列？
- [ ] 第一個月只回報不刪？
- [ ] Neon 目前方案的還原期限是多少？開關打開前要不要先做一次還原演練？

都批准之後，Claude 才會寫刪除程式並附測試，`RETENTION_PURGE` 開關由 Owner 自己在 Vercel 打開。
