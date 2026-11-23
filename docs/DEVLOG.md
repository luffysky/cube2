# 轉磚開發日誌

這是《轉磚》（BRICKDUEL）這幾天開發的筆記：碰到哪些問題、怎麼解決、做的時候在想什麼。寫給一般人看，所以盡量不用術語；非用不可的地方會順便解釋。

---

## 2026 年 11 月 19–20 日

### 先講結論

這兩天加了很多東西：連線房間從 2 人擴到 8 人、道具從 7 種變 200 種、商店外觀翻了好幾倍、多了寶箱、轉盤、拉霸、每日任務、隱私政策和同意畫面。

但也有一件事要老實講：**原本排好的「關卡模式」和第二款遊戲「磚蛇」都還沒開始做。** 新點子一直插隊，它們就一直被往後推。接下來會先把關卡模式做完，再接新的。

---

### 1. 「玩家說他贏了」不能直接相信

轉磚不用註冊。第一次打完一場，會自動建一份匿名的雲端存檔，換手機也不會不見。

問題來了：分數是在玩家自己的瀏覽器算的，懂一點技術的人改個數字，就能說自己拿了一百萬分。

我們的做法是：瀏覽器只回報「我做了什麼」，例如「這場放了哪些方塊、按了哪些鍵」。伺服器拿同一套遊戲規則重新跑一遍，跑出來的分數對得上才算數。排位和 40 行競速一定要附這份「操作錄影」，對不上就不給分。

這招有效，但有代價：每次改遊戲規則，前端和伺服器都要一起改，不然就會互相不承認。

### 2. 寶箱可以無限開（大 bug）

寶箱一天只能開 5 次，伺服器也有擋。結果林董一試就發現可以一直開。

原因藏得很深：玩家還沒有雲端存檔時，進度存在手機裡。等第一次建雲端存檔，伺服器會把手機裡的進度「搬」上去。搬的時候，金幣、道具都有搬，**唯獨「今天開過幾次寶箱」沒搬**，所以伺服器以為你今天一次都沒開。

更糟的是，玩家可以「刪除雲端資料」再重建，每重建一次就多 5 次。

修法很簡單，搬家時把今天的次數一起帶上。但這件事提醒我：**最容易出問題的不是主要功能，而是兩個系統交接的地方。** 後來做每日任務時，第一件事就是檢查同樣的漏洞，確定「重建存檔不能重刷任務」。

### 3. 字型會洩漏玩家的網路位址

做隱私政策時才注意到：遊戲的字型是從 Google 下載的。也就是說，玩家一打開遊戲，瀏覽器就會連到 Google，Google 也就看得到這個人的網路位址。玩家沒同意過這件事。

現在改成：第一次進來先問，同意了才去 Google 下載字型；不同意就用手機內建的字型，遊戲一樣能玩。

畫面上原本做的是一個預先打好勾的「使用 Google 字型」。後來想到歐盟的規定，**預先打勾不算同意**，就改成兩顆一樣大的按鈕：「開始玩（用 Google 字型）」和「開始玩（不用）」，說不跟說好一樣容易。

### 4. 中國大陸的年齡規定，我們能做的很有限

林董問到大陸的年齡規定。查了之後，結論有點殘酷：在大陸營運網路遊戲，要有版號、ICP 備案，還要接公安的實名認證和防沉迷系統（未成年只能在週五、六、日和假日的晚上 8 點到 9 點玩）。這些都**只有當地持證公司才辦得到**。

我們能做的只有：簡體中文介面標出「适龄提示 8+」和健康游戏忠告，條款裡寫清楚「沒有在大陸營運」。真的要上大陸，要靠大陸的合作夥伴用當地公司去辦。

### 5. 地區和年齡：寧可讓玩家自己選

一開始的設計是「註冊時用網路位址判斷國家」。後來跟 GPT 那邊的《旋界》對齊，改成：先選語言，再**自己選**住哪裡（臺灣、香港、澳門、中國大陸、日本、韓國⋯共 12 個），最後選年齡區間。

原因：網路位址會猜錯（出國、用 VPN），而且「偷偷用位址推測你住哪」本身就讓人不舒服。自己選的答案只存在手機上，畫面上也直接寫明：「這不是身分驗證，也不代表家長已經同意。」

未滿 13 歲：不能連線對戰、不能隨機配對、不能設定公開名字，也看不到轉盤和拉霸。

### 6. 8 人房：藏在角落的「4」

把房間上限從 4 人改成 8 人，伺服器改了，畫面也改了。一測試，8 個人進房，每個人卻只看得到 4、5 個人。

找了一陣子才發現，負責「幫大家轉送訊息」那段程式裡，有好幾個地方偷偷寫死了 `4`：只記 4 個座位的訊息編號、只收座位 0 到 3 的訊息。改上限時一個 `SEATS = 4` 改得到，但這種散落各處的 4 就很容易漏。

**教訓：數字要有名字。** 寫成「座位上限」，以後改一個地方就好；直接寫 4，就只能靠測試抓。這次是 8 個瀏覽器同時開的自動測試抓到的。

### 7. 200 種道具：不是畫 200 張圖

林董要道具 200 種。我一開始是反對的：每種道具都要寫規則、調平衡，200 種玩家根本記不住。林董堅持要做，那就想辦法把它做得合理。

做法是**拆成「效果」再組合**。12 種基本效果，例如拆掉自己底下幾排、灌水泥給對手、對手幾秒不能動、對手看不到下一塊。每種效果有不同強度，再把「自己用的」和「打對手的」兩兩配對。這樣：
- 200 種道具，但玩家只要懂 12 種效果。
- 名稱、說明、圖示都能從效果自動產生，四種語言一次搞定。
- 前 7 種保持原樣，舊存檔和對戰錄影都不受影響。

順手抓到一個小 bug：有人送「買第 201 號道具」這種不存在的編號，系統會把它「修正」成第 200 號，然後真的賣給他。**不合法的輸入應該拒絕，而不是幫他修成合法的。**

### 8. 拉霸機和轉盤：好玩，但要誠實

林董想加拉霸機。我先提醒了風險：很多地方把「模擬賭博」列為限制級，例如澳洲 2024 年起最低是 R18+。最後的做法：
- **只能用遊戲金幣，不能用真錢**，獎品也沒有現金價值。
- 每種結果的機率都公布在畫面上，由伺服器抽，每一次都有紀錄。
- 拉霸一次 50 金幣，平均拿回大約 88%。它是用來消耗多出來的金幣，不是給人致富的；一天最多 20 次。
- 未滿 13 歲看不到。

機率寫在畫面上之外，我們也用程式模擬抽了 4 萬次，確認實際開出來的比例真的跟公布的一樣。

### 9. 看廣告領獎勵：絕不相信瀏覽器說「我看完了」

看廣告領金幣最怕的就是有人寫程式假裝看完、一直刷。

所以規則是：**瀏覽器說了不算，要廣告公司直接通知我們的伺服器，而且通知上要有它的數位簽章**。伺服器驗過簽章才發幣，同一則通知只發一次，一天最多 30 次。

目前還沒申請廣告帳號，所以這個按鈕是關著的。功能做好了，開關先不打開，這比「先開了再說」安全得多。

### 10. 外觀：數量好做，好看難

商店外觀從十幾個擴到每類 30 個，後來又加了 30 個節日。全部用程式畫，沒有用外面的圖，也就沒有授權問題。

真正花時間的是「看起來對不對」：
- 「玉石」和「冰塊」方塊一開始幾乎是黑色的，因為半透明的玻璃效果貼在深色背景上就看不見了。
- 粉紅系三套一開始偏灰：原本的方塊有藍有綠，硬混粉紅就變成灰粉色。後來改成直接換一整組粉紅色，才有櫻花和少女感。
- 「粉紅公主」的方塊太淡，貼在很淡的蕾絲牆上幾乎看不見。好看是一回事，打的時候看得清楚更重要。
- 節日牆一開始雪花太大太顯眼，會干擾判斷方塊位置，最後縮小並調淡。

節日也依地區顯示：選臺灣看得到春節、中秋，選美國看得到感恩節。現在只開了聖誕節，其他標「活動未開放」，下一個開春節。

### 11. 一些小事，但玩家會在意

- **對戰結算沒算分數**：原本只比擊倒數和送出的行數。林董說「不然幹嘛算分數」，有道理，現在分數是第三順位。
- **連線時對手的數據顯示「—」**：結束時只交換了擊倒、送出行數和分數，其他沒傳。補上之後，對手的整欄都有數字了。
- **T 轉其實一直有加分**，只是畫面上看不出來。現在每次消行都會跳出「+600 分」這種小字。
- **輸掉的音效**：先用程式合成了一段卡通哭聲，後來換成林董找的音檔。歡呼聲也換了。

---

## 開發中的想法

- **新點子要先記下來，不要馬上插隊。** 這兩天最大的問題不是技術，而是排程。每個新點子都很好，但一直插隊的結果，是最早答應的關卡模式到現在還沒動。
- **每個功能都先寫測試。** 我們現在有幾百條自動測試，包含 8 個瀏覽器同時連線打一場 4 對 4。很多 bug（像那些藏起來的 4）都是測試抓到的，不是人眼。
- **跟錢、機率、年齡有關的東西，寧可先關著。** 廣告獎勵、節日活動都是「功能做好了、開關先關」，確定沒問題再打開。
- **跟《旋界》（GPT 做的版本）分工但不混在一起。** 兩款遊戲以後會共用 SnowRealm 帳號，但金幣、排行榜、資料庫各自獨立。我不改他的程式，他也不碰我的，只透過講好的介面溝通。

---

## 接下來

1. 關卡模式：1000 關加無限隨機，以及可以分享給朋友的自訂關卡
2. 「挑戰大自然」：風、雨、雪、雷雨、霧會影響方塊落下的新模式，可以連線、也有排位
3. 遊戲目錄頁和第二款遊戲「磚蛇」

---

# 結構化變更紀錄

從 2026-11-20 起，依 cube1〈SNOWREALM_GAMES_DEVELOPMENT_GOVERNANCE_AND_CHANGELOG_zh-TW.md〉的固定格式記錄。Owner 指令另列在 [OWNER_DECISIONS.md](./OWNER_DECISIONS.md)。

## 2026-11-20 08:52–17:05（Asia/Taipei）｜補記：治理制度建立前、今天已上線的變更

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-007～C-014
- 原因與目標：治理文件要求每次變更留紀錄；以下是文件交付前今天已經上線的內容，補在這裡。
- 實際變更與 commit（全部在 `main`，Vercel 自動部署到 https://cube2-xi.vercel.app ）：
  - `2feddd4` 關卡模式：1000 關、無限挑戰、自訂關卡
  - `1e58798` 挑戰大自然（單人）；`f80f5ed` 天氣對戰、天氣排位、手機暫存鍵、年齡頁「不再顯示」；`e46b153` 拉霸機圖案
  - `af4a917` /games 目錄＋磚蛇；`23ea18d` 磚蛇難度／5 命／陷阱；`9ea6f78` 打磚塊；`2cea131` 疊磚塔；`f0ef3f0` 推磚倉庫；`65f84f1` 磚塊合成；`05f0277` 分磚；`b51297c` 磚畫謎；`c428fd0` 磚道；`2a46118` 掃磚
  - `d1af8b4` 小遊戲接轉磚金幣與存檔；登入／註冊引導到 SnowRealm Games
- 資料庫：非破壞性新增 — `zz.queue` 加欄位 `pool`（`ALTER TABLE … ADD COLUMN IF NOT EXISTS`，預設 `''`）；玩家存檔 JSON 新增 `lv.wx`／`lv.wxs`／`lv.wxr`、`mini`、`daily.mini` 欄位（舊存檔自動補預設值，不覆蓋既有資料）。
- 刪除操作：無新增的刪除。
- 測試：`node test/run.js` 全過；`test/api.test.js` 300、`test/weather.test.js`、`test/minis.test.js` 等單元測試；瀏覽器測試 `stages` 12、`skies` 23、`wxnet` 17、`bricks` 73、`minipay` 10、`flow` 60、`rwd` 232、`consent` 31、`cloudui` 39、`pwa` 47。手機實機未驗。
- 部署：正式（Vercel production），每個 commit 都確認 READY；`/api/health` 200、`/api/board?b=wxr` 200，近 1 小時無 runtime error（17:07 查）。
- 未完成：小遊戲排行榜；春節活動未開。

## 2026-11-20 18:20（Asia/Taipei）｜SnowRealm Identity 綁定與找回（伺服器端，開關關閉）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-001、C-014、C-015；cube1 D-005、D-007、D-008
- 原因與目標：依 Owner 核准書階段 A／B，先把驗證器、綁定、找回與資料表做好並測試，Identity 正式服務上線前一律關閉。
- 實際變更：
  - 新增 `server/identity.js`：SnowRealm Identity JWT 驗證（只收 EdDSA／Ed25519、kid、iss、aud、sub=UUID、jti、iat 誤差 60 秒、壽命 ≤ 600 秒、nbf、scope `brickduel:account:link`；JWKS 快取 10 分鐘、取不到就拒絕）。
  - `server/core.js` 新增 `idStatus`、`idLink`（一對一、不合併、409 衝突、同 token 不能重用、成功後換掉這台裝置的憑證並作廢引繼碼）、`idRecover`（另一台用平台身分取回同一份存檔）。
  - `server/app.js`：`/api/rpc` 新增動作 `idStatus`、`idLink`、`idRecover`；未啟用回 503 `off`。
  - 文件：`docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md` 第二版（**更正 `pid` 型別為 uuid**）、新增 `docs/BRICKDUEL_IDENTITY_MIGRATION.md`、`docs/OWNER_DECISIONS.md`。
- 檔案／API／資料表：上列檔案；`/api/rpc` 三個動作；新表 `zz.identity`、`zz.idjti`。
- 資料庫：`CREATE TABLE IF NOT EXISTS`（非破壞性，D-007 範圍內），正式資料庫在部署後第一次建表檢查時建立；開關關閉時不寫入。備份：只新增空表。驗證：PGlite 測試資料庫建表成功（13 → 15 張）。
- 刪除操作：無新增刪除動作。綁定成功時刪除「這台裝置的舊憑證」與「這份存檔的引繼碼」、找回時只保留最近 5 台裝置的憑證——屬於核准書第 4 節要求的憑證輪替，且只在開關打開後才會發生。
- Git commit：[`ba249d1`](https://github.com/luffysky/cube2/commit/ba249d1dee97cf423d067e6de611691fe46b9dcf)。
- 測試：`node test/identity.test.js` 49 通過；`node test/api.test.js` 300 通過；`node test/run.js` 全過。
- 部署：正式（Vercel deployment `dpl_EZt2QKdgKBd2vJmWFHJtNPvMLxsS`，READY）。18:00 查 `/api/health?deep=1` 200、資料庫可用；`IDENTITY_*` 環境變數未設定 → 功能關閉。新資料表是否已在 Neon 建立：Claude 不直接連正式資料庫，未驗證；會在第一次 API 建表檢查時建立。沒有真實 Identity 服務，**沒有做跨站端到端驗收，不可宣稱已能綁定**。
- 風險、回滾：關閉 `IDENTITY_LINK_ENABLED` 即全部停用；移除資料表屬刪除，需 Owner 核准。
- 未完成／阻塞：BFF（授權碼 + PKCE、callback、HttpOnly 工作階段）等 GPT 提供授權端點與 client 註冊；登入後的「綁定／找回」畫面；排位與開房的登入閘門。
- 交接對方的事項（GPT）：Identity 正式 issuer／JWKS／audience、授權與 token 端點、允許的 callback（預定 `https://cube2-xi.vercel.app/api/auth/callback`，TBD）、停權查詢方式；平台首頁若能提供直達註冊的網址，轉磚會改連過去。

## 2026-11-20 18:40（Asia/Taipei）｜側邊選單：轉磚與磚塊小遊戲

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-018（功能太發散，做側邊欄集中管理；原本的留著、複製到側邊欄；加登入、登出、個人資料）
- 原因與目標：主選單入口太多、分散在頁面各處；集中到一個側邊選單，頁面原本的按鈕全部保留。
- 實際變更：
  - 轉磚主選單左上加「☰」，打開側邊選單：頭像、名字、等級段位、金幣、帳號狀態；分組「我的帳號（個人資料、登入／註冊、雲端存檔、登出）／對戰／練功／金幣與獎勵／磚塊遊戲／其他」。
  - 「登出」：目前存檔跟著裝置、沒有帳號密碼，登出會讓這台找不回存檔，所以畫面說明要等綁定 SnowRealm 帳號後才能登出，並導到雲端存檔（引繼碼）。
  - 九款小遊戲與遊戲目錄也加同款側邊選單（`games/nav.js`）：轉磚、全部遊戲、九款遊戲（標示目前這款）、個人資料／登入註冊（連回轉磚 `?go=profile`、`?go=signin`）、待入帳金幣；打開時遊戲自動暫停。
  - 小遊戲頂部返回鍵文字縮成「← 遊戲」，讓小手機放得下。
- 檔案／API／UI：`src/index.template.html`、`src/drawer.js`（新）、`src/style.css`、`build.js`、`games/nav.js`（新）、`games/games.css`、`games/*/index.html`、`test/drawer.js`（新）、`test/i18n.test.js`。
- 資料庫：未異動。｜刪除操作：無。
- 測試：`node test/run.js` 全過；瀏覽器 `drawer` 28、`flow` 60、`rwd` 232、`consent` 31、`cloudui` 39、`minipay` 10、`bricks` 73、`pwa` 47。手機實機未驗。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 未完成：登出要等 SnowRealm 帳號綁定開放。
- 補記：上一條側邊選單的 commit 為 [`8a5a4b1`](https://github.com/luffysky/cube2/commit/8a5a4b1)。

## 2026-11-20 18:35（Asia/Taipei）｜網站主題（整個網站換色）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-019（整個網站的主題，不只遊戲畫面；預設＝現在的樣子，加黑、白；免費簡單色調 3、金幣 5、訂閱 4、Steam 限定 2 並標「Steam 限定」）
- 原因與目標：讓玩家換整站的顏色（選單、側邊欄、視窗、磚塊小遊戲頁面），遊戲牆面仍由原本商店的「主題」決定。
- 實際變更：
  - `Meta.SITE` 17 款：基本 3（預設、黑、白）、免費 3（灰藍、淺綠、米杏）、金幣 5（晨霧 800、楓紅 1000、海鹽 1000、琥珀 1500、星夜 1500）、會員 4（極光、雪境、霓虹、金箔）、Steam 限定 2（鍋爐、夜港）。
  - 新增存檔欄位 `owned.site`、`equip.site`（預設 `default`）、`steam`（只有伺服器能設定；目前沒有 Steam 版，一律 false，Steam 款維持鎖定並寫「Steam 版推出後開放」）。會員也能用金幣款（跟商店其他東西一致）；會員到期自動換回預設。
  - 新操作 `sbuy`、`swear`，伺服器重算；匯入只帶已購買的金幣款，`steam` 一律歸零。
  - `src/site-themes.css`：用 `:root[data-site]` 覆蓋頁面配色變數，打包進 `index.html`，同時輸出 `games/site-themes.css` 給小遊戲頁；`games/theme.js` 在 `<head>` 讀轉磚存檔套用。
  - 商店新分頁「網站主題」（依等級分組、卡片是頁面縮圖）；側邊選單與設定頁都有入口。
- 檔案／API／UI：`src/meta.js`、`server/rules.js`、`src/site-themes.css`（新）、`src/shop.js`、`src/ui.js`、`src/style.css`、`src/index.template.html`、`build.js`、`games/theme.js`（新）、`games/site-themes.css`（建置產生）、`games/index.html`、`games/*/index.html`、`test/meta.test.js`、`test/api.test.js`、`test/sites.js`（新）。
- 資料庫：未異動（存檔 JSON 多欄位，舊存檔自動補預設）。｜刪除操作：無。
- 測試：`node test/run.js` 全過（meta 166）；瀏覽器 `sites` 25、`drawer` 28、`rwd` 232、`flow`、`consent` 31、`cloudui` 39、`minipay` 10、`bricks` 73、`pwa` 47。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 風險、回滾：換回「預設」即恢復原樣；回滾 commit 即移除功能，已購買紀錄留在存檔不受影響。
- 未完成／待確認：Owner 說總數 18，依各級數量相加為 17（3+3+5+4+2），待 Owner 指定第 18 款放在哪一級。Steam 解鎖要等 Steam 版與伺服器驗證。
- 補記：上一條網站主題的 commit 為 [`ca50cd1`](https://github.com/luffysky/cube2/commit/ca50cd1)，Vercel `dpl_TNhF7JLDZsC6dLn5jt5iXhCwt8e4` READY。

## 2026-11-20 18:40（Asia/Taipei）｜SnowRealm 帳號入口改「註冊／登入」；綁定開關維持關閉

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-020
- 原因與目標：Owner 已有 SnowRealm Games 帳號，入口只寫「註冊」不對；要求打開綁定開關、已登入就能直接連結。
- 實際變更：入口按鈕改「到 SnowRealm Games 註冊／登入」，說明改成「已有帳號按右上角登入，沒有再選註冊」（四語）。
- 未變更（原因）：`IDENTITY_LINK_ENABLED` 未設定。依 cube1 `docs/BRICKDUEL_PLAYER_IDENTITY_HANDOFF.md`（cube1 `bde359b`）：Identity 簽發、JWKS、正式登入網址尚未部署，`identity.snowrealm.pet` 無法解析，並要求 cube2 開關維持關閉至兩端測試帳號驗收。即使打開，伺服器取不到 JWKS 會拒絕所有綁定，玩家只會看到錯誤。現有 SnowRealm Games 登入使用 Neon Auth，依核准書不得當作跨站登入。
- 檔案：`src/cloud.js`、`test/minipay.js`、`docs/OWNER_DECISIONS.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除操作：無。
- 測試：`node test/run.js` 全過；瀏覽器 `minipay` 10、`cloudui` 39。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 交接 GPT：Identity 上線後提供授權端點、token 交換端點、登記 callback `https://cube2-xi.vercel.app/api/auth/callback`、client 註冊與測試帳號；轉磚即做「已登入→一鍵連結」並跑驗收。
- 補記：上一條的 commit 為 [`89dce94`](https://github.com/luffysky/cube2/commit/89dce94)，Vercel `dpl_496V5uF1V2fjDDi1nyKuwnYHpZua` READY。

## 2026-11-20 18:50（Asia/Taipei）｜網站主題：免費加「淺粉」，共 18 款

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-019（Owner 指定第 18 款：免費淺粉色）
- 實際變更：`Meta.SITE` 新增 `blush` 淺粉（免費）；`src/site-themes.css` 加配色；免費 4 款，總數 18。
- 檔案：`src/meta.js`、`src/site-themes.css`、`games/site-themes.css`（建置產生）、`index.html`、`test/meta.test.js`、`test/sites.js`、`docs/OWNER_DECISIONS.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除操作：無。
- 測試：`node test/run.js` 全過（meta 166）；瀏覽器 `sites` 25。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`856f5d2`](https://github.com/luffysky/cube2/commit/856f5d2)，Vercel `dpl_ENzMF3bGTt87ph3PJbzF1KCmg8kb` READY。

## 2026-11-20 19:00（Asia/Taipei）｜修正：手機上小遊戲側邊選單沒有樣式

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：Owner 回報手機截圖（遊戲目錄頁底部出現一串沒有樣式的選單連結）
- 原因：手機瀏覽器拿了舊版 `games.css`（沒有側邊選單樣式）配新版 `nav.js`，選單被當成一般文字排到頁尾。本機與測試用新檔都正常。
- 實際變更：`build.js` 建置時幫所有磚塊遊戲頁引用的 CSS／JS 加上內容雜湊 `?v=`，檔案一改網址就變，手機不會再用舊檔；遊戲目錄頁尾改成「SnowRealm Games 註冊／登入」。
- 檔案：`build.js`、`games/index.html`、`games/*/index.html`。｜資料庫：未異動。｜刪除操作：無。
- 測試：`node test/run.js` 全過；瀏覽器 `sites` 25、`drawer` 28、`bricks` 73、`minipay` 10、`pwa` 47。手機實機待 Owner 重新整理確認。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`568ae38`](https://github.com/luffysky/cube2/commit/568ae38)，Vercel `dpl_7oqxYi7rZhWUbxhRpmM1yHhoif3W` READY。

## 2026-11-20 19:15（Asia/Taipei）｜側邊選單重新設計＋SnowRealm Games 主頁入口

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-018 追加（側邊欄項目設計太敷衍；加到 SnowRealm Games 主頁的功能）
- 實際變更：
  - 每個分組變成一張卡片、各有代表色（帳號藍、對戰紅、練功綠、獎勵金、遊戲紫、其他灰）；每一項有線條圖示方塊、名稱、箭頭，項目間細分隔線；目前所在的小遊戲有色條與底色標示；待領的寶箱／任務紅點放在箭頭前。
  - 最上方新增「SnowRealm Games」主頁卡片（新分頁開啟 `https://games.snowrealm.pet/`），轉磚與九款小遊戲的側邊選單都有。
  - 圖示集中在 `games/drawer-icons.js`（轉磚建置時一起打包）；樣式集中在 `src/drawer-items.css`（轉磚打包、小遊戲用 `games/drawer-items.css`），兩邊一致，跟著網站主題變色。
- 檔案：`games/drawer-icons.js`（新）、`src/drawer-items.css`（新）、`games/drawer-items.css`（建置產生）、`src/index.template.html`、`src/drawer.js`、`src/style.css`、`games/nav.js`、`games/games.css`、`games/*/index.html`、`build.js`。｜資料庫：未異動。｜刪除操作：無（只移除被新樣式取代的舊 CSS 規則）。
- 測試：`node test/run.js` 全過；瀏覽器 `drawer` 28、`sites` 25、`bricks` 73、`minipay` 10、`pwa` 47；手機深淺色截圖目視檢查。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`3d6fbcc`](https://github.com/luffysky/cube2/commit/3d6fbcc)，Vercel `dpl_GqbU4vgQgn6Z89VJKLfN4F4LM5Rm` READY。

## 2026-11-20 19:25（Asia/Taipei）｜整套風格：方塊與牆面對比修正

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：整套主題有些背景跟方塊同色、材質跟背景太像，要注意對比
- 檢查方法：在瀏覽器把 50 套（20 套一般＋30 套節慶）逐一套上，量七種方塊顏色與牆面平均色的色差（CIE ΔE）和亮度比。修正前 24 套有方塊幾乎融進牆面（最低 ΔE 3、亮度比 1.0）。
- 實際變更：
  - 牆面改深、保留原本色系與圖案：櫻花雨、粉紅愛心、蕾絲、薰衣草、薄荷、方格紙、沙丘、木地板、森林、極光；圖案透明度一併調低，避免跟方塊材質混在一起。
  - 銀河方塊的深紫覆蓋從 0.55 降到 0.25，讓方塊本色透出來。
  - 節慶套：情人節、白色情人節、復活節、賞櫻、女兒節、兒童節、母親節、感恩節、潑水節、聖派翠克節、雪祭、豐收祭、地球日、開學季、生日派對改深色牆面；春節、父親節、畢業季、端午、聖誕節、感恩節、聖派翠克節、豐收祭、地球日、母親節、情人節、潑水節、開學季把跟牆面撞色的方塊顏色換掉。
  - 新增 `test/contrast.js`：每一套的七種方塊都要 ΔE ≥ 25、亮度比 ≥ 1.8，之後新增或調整主題會自動擋下低對比。修正後全部 50 套通過（最低：極光之夜 ΔE 27）。
- 檔案：`src/view.js`、`src/meta.js`、`index.html`、`test/contrast.js`（新）。｜資料庫：未異動。｜刪除操作：無。
- 測試：`node test/run.js` 全過；瀏覽器 `contrast` 50、`sites` 25、`drawer` 28、`bricks` 73。
- 影響：已購買的牆面／整套名稱與擁有狀態不變，只改顏色。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`a149b8b`](https://github.com/luffysky/cube2/commit/a149b8b)（時間更正 `6e23408`），Vercel `dpl_Dhq6EwcR7KvuRPXG4vBCzvv19sPN` READY。

## 2026-11-20 19:40（Asia/Taipei）｜記錄 cube1 Issue #4 與兩項待 Owner 決定

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-021（cube1 Issue #4、`SNOWREALM_IDENTITY_LAUNCH_GATE_zh-TW.md`，cube1 `94dbd92`）
- 實際變更：只更新文件。`IDENTITY_LINK_ENABLED` 維持未設定（關閉）。
- 待 Owner 決定：正式回呼網域（`brickduel.snowrealm.pet` 或 `cube2-xi.vercel.app`）；玩家自刪雲端資料時綁定紀錄是否一併刪除。後者若要改成不連帶刪除，需要改資料表約束（屬刪除類變更），未經核准不動。
- 檔案：`docs/OWNER_DECISIONS.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除操作：無。｜測試：不適用（僅文件）。
- 補記：上一條的 commit 為 [`ef6a9c2`](https://github.com/luffysky/cube2/commit/ef6a9c2)。

## 2026-11-20 19:51（Asia/Taipei）｜刪除雲端資料改為保留 30 天；正式網址改 brickduel.snowrealm.pet

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-022（玩家按刪除那刻保留 30 天、30 天後刪除；用 snowrealm 網址；所有網址都綁自己的網域 snowrealm.pet）
- 實際變更：
  - `zz.players` 新增欄位 `gone`（非破壞性 `ADD COLUMN IF NOT EXISTS`）＋索引 `players_gone`。
  - 「刪除雲端資料」由 `DELETE` 改成記下 `gone` 時間：立刻斷開所有裝置、引繼碼失效、從所有排行榜消失、SnowRealm 綁定查不到；換裝置後沒人能打開的舊存檔也一樣先保留。
  - 例行清理（新帳號建立時順帶執行）刪除 `gone` 超過 30 天的存檔，密鑰、成績、綁定紀錄跟著刪。**此自動刪除經 Owner C-022 明確核准。**
  - 已刪存檔的平台帳號重新綁定時，綁定紀錄改指向新存檔（舊存檔仍保留到期滿）。
  - 畫面與隱私政策改寫：刪除後「立即停用、保留 30 天、期間可聯絡復原、之後永久刪除」。
  - 正式網址（canonical、sitemap、robots、分享圖）改為 `https://brickduel.snowrealm.pet`（Vercel 專案已綁定且驗證）；Identity 回呼定為 `https://brickduel.snowrealm.pet/api/auth/callback`。`cube2-xi.vercel.app` 保留可用。
- 檔案：`server/db.js`、`server/core.js`、`server/app.js`、`src/cloud.js`、`privacy.html`、`build.js`、`index.html`、`sitemap.xml`、`robots.txt`、`README.md`、`docs/ARCHITECTURE.md`、`docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`、`docs/OWNER_DECISIONS.md`、`test/api.test.js`、`test/cloud.test.js`、`test/tabs.test.js`。
- 資料庫：新增欄位與索引（非破壞性），部署後第一次建表檢查時套用。刪除：玩家觸發後 30 天的自動刪除（Owner 核准）；本次部署本身不刪任何資料。
- 測試：`node test/api.test.js` 305（含：刪除後裝置與排行榜都看不到、資料保留、30 天前一刻還在、過了 30 天全部清掉）；`node test/run.js` 全過；瀏覽器 `cloudui` 39、`pwa` 47。
- 風險、回滾：回滾 commit 會恢復立即刪除；`gone` 欄位留著無害。注意：瀏覽器本機進度按網址分開，舊網址玩家要換到新網址請用「雲端存檔 → 引繼碼」搬。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`1a38b3b`](https://github.com/luffysky/cube2/commit/1a38b3b)，Vercel `dpl_62998ut8rg2JudfnMMBdUBFyg1sp` READY。

## 2026-11-20 20:48（Asia/Taipei）｜照 cube1 刪除政策補齊 30 天狀態機（可恢復、期內封鎖、綁定保留）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-022、C-023（cube1 `docs/BRICKDUEL_ACCOUNT_LINK_AND_DELETION_POLICY_zh-TW.md`，cube1 `effca49`）
- 與上一版差異（上一版只做到「停用＋30 天後刪」，不符規格的部分）：
  - **期內可恢復**：新 API `restore`（同一份存檔任一裝置的密鑰）；`idRecover` 加 `back: true` 可用已綁定的 SnowRealm 帳號取消刪除。公開代碼與引繼碼都不能取回。期滿回 410。
  - **期內封鎖**：`sync`、引繼碼、`idStatus`、`idLink` 對等待刪除的存檔回 409 `pending`（附截止時間），不再當作「不存在」。
  - **綁定期內保留**：撤掉上一版「綁定改指向新存檔」的做法；等待期間該平台帳號不能綁別份存檔（回 409 `pending`），避免誤綁。
  - **冪等**：重複申請刪除以第一次時間為準；清理是單一 SQL，與取消刪除以列鎖互斥，可重複執行。
  - **不具名稽核**：新表 `zz.purges(at, n)`，每次清理有刪到東西才記「時間、份數」。
  - 新欄位 `zz.players.restored`（取消刪除時間）。
  - 用戶端：申請刪除前顯示確切截止時間（玩家時區）與後果；申請後顯示「等待刪除中」、「取消刪除，恢復雲端存檔」、「不恢復，改開新的雲端存檔」；另一台裝置同步時也會轉成這個狀態並提示可恢復。四語字串＋簡中自動轉換＝五語。
  - 隱私政策補上：伺服器時間計算、期內不能改動、可自行恢復、期滿連綁定一起刪、只留不具名紀錄、不影響 SnowRealm 帳號與其他遊戲。
- 檔案：`server/db.js`、`server/core.js`、`server/app.js`、`src/cloud.js`、`privacy.html`、`index.html`、`docs/ARCHITECTURE.md`、`docs/OWNER_DECISIONS.md`、`test/api.test.js`、`test/identity.test.js`、`test/cloud.test.js`、`test/tabs.test.js`、`test/cloudui.js`。
- 資料庫：新增欄位 `restored`、新表 `zz.purges`（非破壞性，16 張表）。刪除：只有 Owner 核准的「玩家本人申請＋滿 30 天」自動清理；本次部署不刪任何資料。
- 測試（測試資料庫＋注入時鐘，不碰正式資料）：`api` 320（申請後資料仍在、期內封鎖、重複申請以第一次為準、別人的密鑰或沒密鑰不能恢復、第 29 天恢復且之後不會被清、再刪一次從新時間起算、到期前 1 秒還在、到期後 410 且全部表清空、清理紀錄只有時間與份數、沒東西可清不留紀錄）；`identity` 55（等待期間綁定保留、另一份存檔不能搶綁、用 SnowRealm 登入可取消刪除）；`cloud` 92、`tabs` 40、瀏覽器 `cloudui` 41（申請、另一台得知、恢復、放棄後開新存檔）；`node test/run.js` 全過。
- 未完成：隱私政策目前只有繁中版（原本就是），規格要求五語，待 Owner 決定是否翻譯；清理沒有用定時服務（依賴新帳號建立或刪除申請時順帶執行），流量低時可能晚於 30 天才真的刪除，要準時可加 Vercel Cron（需 Owner 確認方案費用）；正式雙帳號驗收要等 SnowRealm Identity 上線。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`b258459`](https://github.com/luffysky/cube2/commit/b258459)，Vercel `dpl_6jAGBm5FUzuYf7fmKkRdvV8vccaM` READY，2 小時內無執行錯誤。

## 2026-11-20 21:15（Asia/Taipei）｜自動翻譯模組（Argos Translate＋GitHub Actions＋資料庫）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-024
- 實際變更：見 `docs/ARCHITECTURE.md`「自動翻譯」。新增 `tools/dict.js`、`tools/i18n-scan.js`、`tools/i18n-auto.py`、`tools/i18n-requirements.txt`、`i18n/auto.json`、`i18n/todo.json`、`.github/workflows/i18n.yml`、`server/words.js`、`server/i18n-data.json`（建置產生）、`test/autoi18n.test.js`；修改 `build.js`、`src/i18n.js`、`src/ui.js`、`server/app.js`、`server/db.js`、`test/i18n.test.js`、`test/api.test.js`、`test/run.js`、`.vercelignore`。
- 第一條只寫中文的字：設定頁的「有些文字是機器自動翻譯的…」（`s.mt`），用來驗證整條流程。
- 資料庫：新表 `zz.i18n`、`zz.i18nmeta`（非破壞性，18 張表）。刪除：無。
- 費用：Argos Translate 免費開源；翻譯在 GitHub Actions 上執行（使用 repo 的 Actions 額度），不呼叫付費 API、不需要新金鑰。
- 測試：`autoi18n` 24（缺欄判斷、中文改過重翻、人工優先、空格與標籤保留、只補缺的欄、寫進資料庫、後台人工改的不覆蓋、同版本不重寫）；`api` 320（18 張表）；`i18n` 2043；`node test/run.js` 全過；瀏覽器 `drawer` 28、`sites` 25。
- 限制：本機環境連不到 Argos 模型下載站，真正的翻譯在 GitHub Actions 第一次執行時才會跑；翻譯品質是機器翻譯等級（日、韓經英文轉譯），已標記機翻。
- 部署：隨本次 commit 部署正式環境（SHA 與 Actions 結果見下一條紀錄）。
- 補記：上一條的 commit 為 [`85ec6a7`](https://github.com/luffysky/cube2/commit/85ec6a7)；workflow 修正 [`702910f`](https://github.com/luffysky/cube2/commit/702910f)（第一次執行翻譯成功、回寫失敗：待翻清單沒一起加入）；手動觸發後 Actions run `44742010359` 成功，機器人自動提交 [`8766d88`](https://github.com/luffysky/cube2/commit/8766d88)（翻了 `s.mt` 一條）。

## 2026-11-20 21:20（Asia/Taipei）｜`s.mt` 改人工翻譯

- 專案：cube2｜執行者：Claude
- 原因：自動翻譯的流程已在 GitHub Actions 端到端驗證成功，但 Argos 把「人工翻譯」翻成「adult translation」，品質不能上線。這條改成人寫的四語，`i18n/auto.json` 對應的機器翻譯自動作廢（人寫優先）。
- 結論：Argos 只適合當備援；新增文字時 Claude 會照舊直接寫好四種語言，只有漏掉的才交給自動翻譯。
- 檔案：`src/i18n.js`、`i18n/auto.json`、`i18n/todo.json`、`index.html`、`server/i18n-data.json`。｜資料庫：未異動（部署後由 `server/words.js` 同步）。｜刪除：無。
- 測試：`node test/run.js` 全過。
- 補記：上一條的 commit 為 [`94c8914`](https://github.com/luffysky/cube2/commit/94c8914)，Vercel `dpl_ERnKUB1GWFA5VTh7czLLGEazravo` READY，1 小時內無執行錯誤。

## 2026-11-20 22:08（Asia/Taipei）｜九款小遊戲接上字典（五語）；翻譯引擎改 Gemini、停用 Argos

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-025、C-026（音樂，僅記錄）
- 實際變更：
  - 新增 `src/games-dict.js`（約 230 條，Claude 親自寫英、日、韓）、`games/i18n.js`；建置產生 `games/words.js`。九款遊戲、遊戲目錄、側邊選單、金幣提示全部改用字典；遊戲頁標題與描述跟著語言換；語言依 `?lang=`、轉磚設定、瀏覽器語言。
  - `tools/i18n-auto.py` 加 Gemini 引擎（自動挑金鑰可用的最新 flash 模型、40 條一批、空格與標籤不符就不收）；workflow 只在 repo 有 `GEMINI_API_KEY` secret 時翻譯，沒有就只列清單；不再安裝或使用 Argos（移除 `tools/i18n-requirements.txt`）。
- 檔案：`src/games-dict.js`、`games/i18n.js`、`games/words.js`、`games/*/index.html`、`games/*/*.js`、`games/index.html`、`games/nav.js`、`games/dir.js`、`games/rewards.js`、`build.js`、`tools/dict.js`、`tools/i18n-auto.py`、`.github/workflows/i18n.yml`、`test/gameslang.js`（新）、`test/bricks.js`、`test/minipay.js`、`test/drawer.js`、`docs/ARCHITECTURE.md`、`docs/OWNER_DECISIONS.md`。
- 資料庫：未改結構；小遊戲文字也會隨 `server/i18n-data.json` 同步進 `zz.i18n`。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `gameslang` 113（十頁 × 英日韓簡，每個 key 都存在、英韓頁面沒有殘留中文、簡體已轉換、側邊選單英文、沿用轉磚的語言設定）、`bricks` 73、`minipay` 10、`drawer` 28。（瀏覽器測試改用 zh-TW 語系開啟，原本的中文斷言不變。）
- Gemini 尚未實測：要等 Owner 在 GitHub 加 `GEMINI_API_KEY` secret 後，下一次有待翻文字時才會跑。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`3b129e6`](https://github.com/luffysky/cube2/commit/3b129e6)。

## 2026-11-20 22:35（Asia/Taipei）｜地區法律文件草稿、每種語言一個網址（SEO meta 翻譯）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-025（法律文件依地區各寫一版初稿先推上，之後請律師審）、C-027（SEO meta 也翻）、C-026（音樂，僅記錄）
- 實際變更：
  - 法律：新增 `legal/src/`（日文、韓文隱私政策與條款依 APPI／電氣通信事業法外部送信、PIPA 處理方針作成指針撰寫；12 個地區的補充：香港 PDPO、澳門第 8/2005 號法律、中國大陸 PIPL、美國 COPPA／州法、英國 UK GDPR、澳洲 Privacy Act、新加坡 PDPA、馬來西亞 PDPA 2024 修正＋馬來文通知、歐盟 GDPR）；`tools/legal.js` 產生 24 頁，全部標示草稿與【待確認】項目、`noindex`；根目錄 `privacy.html`、`terms.html` 由同一份文字重建，更新 30 天刪除與「一個帳號一份存檔、不合併不覆蓋」的說明，並列出其他地區。
  - 遊戲內的法律連結依玩家選的地區導向對應版本（`src/consent.js`、`games/nav.js`）。
  - SEO：主頁五語各自一個網址與檔案（`/`、`/zh-Hans`、`/en`、`/ja`、`/ko`，`vercel.json` rewrites），翻好 title、description、OG、Twitter、og:locale、canonical、JSON-LD；新增字典 `seo.og`、`seo.ogDesc`、`seo.ogAlt`；sitemap 改成路徑網址；小遊戲頁加 canonical 與五語 hreflang。
- 檔案：`legal/`（新）、`tools/legal.js`（新）、`privacy.html`、`terms.html`、`src/index.template.html`、`src/i18n.js`、`src/ui.js`、`src/consent.js`、`games/nav.js`、`games/i18n.js`、`games/*/index.html`、`build.js`、`index*.html`、`vercel.json`、`sitemap.xml`、`.vercelignore`、`test/legal.js`（新）、`test/pwa.js`、`docs/ARCHITECTURE.md`、`docs/OWNER_DECISIONS.md`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `legal` 439（24 頁語言、草稿標示、noindex、地區清單、所有站內連結可開、簡體版、選日本的玩家連到日文版）、`pwa` 52（五語頁面各自的 meta、canonical、結構化資料、rewrites）、`gameslang` 113、`rwd` 232、`flow` 60、`cloudui` 41、`consent` 31、`drawer` 28、`sites` 25、`bricks` 73、`minipay` 10。
- 待律師：所有【待確認】項目（各地代表人、跨境傳輸條件、韓國遊戲分級、中國大陸是否關閉服務、準據法等）。法律文件內容是草稿，不是法律意見。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`15e991d`](https://github.com/luffysky/cube2/commit/15e991d)，Vercel `dpl_Vr8QEaoJnt8GgJrzzYp55wbo7ffV` READY，無執行錯誤。

## 2026-11-20 22:58（Asia/Taipei）｜挑戰大自然加洪水／龍捲風／地震；音樂播放器；開房間可選模式

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-028
- 實際變更：
  - 災害：`src/weather.js` 新增 flood、tornado、quake（另一顆種子 RNG，兩邊同一片天仍一致；預警 2 秒；洪水把排好的行上下沖、落下中的方塊也被推；龍捲風捲起經過的格子後全部落回場上；地震震垮懸空的方塊，震出的整行照樣消、計分）；可在對戰中丟給對手；`src/wxmode.js` 畫浪、漏斗、裂縫與搖晃，練習清單可單練災害；`src/view.js` 新音效 wave、twister、quake、siren。
  - 音樂播放器：新增 `src/music.js`（側邊選單「更多」與設定裡的入口）：自動（跟著畫面換）或播放列表（順序、隨機、單曲），上一首／下一首／暫停；訂閱會員可加入自己的音樂檔（單檔 15 MB、30 首、共 200 MB，瀏覽器解碼不了的不收），只存在本機 IndexedDB `zhuanzhuan-music`，不上傳、不進雲端存檔；會員到期後自己的歌鎖住但不刪。
  - 連線房間：房主選「普通對戰／挑戰大自然／關卡地形」，訊息帶 `mode`（保留 `wx` 讓舊版頁面相容）；挑戰大自然限兩人；關卡地形開打時從 1000 關抽一關，所有人（含三到四人房）同一面地形開始，不留重播。
  - 隱私政策四語的本機儲存清單加上音樂播放器。
- 檔案：`src/weather.js`、`src/wxmode.js`、`src/view.js`、`src/music.js`（新）、`src/net.js`、`src/modes.js`、`src/ui.js`、`src/index.template.html`、`src/style.css`、`games/drawer-icons.js`、`build.js`、`tools/dict.js`、`legal/src/privacy.*.html`、`privacy.html`、`legal/`（重建）、`test/weather.test.js`、`test/i18n.test.js`、`test/skies.js`、`test/wxnet.js`、`test/music.js`（新）。
- 資料庫：未異動。｜刪除：無（玩家自己刪本機音樂檔是本機操作，不碰伺服器）。
- 測試：`node test/run.js` 全過（weather 52）；瀏覽器 `wxnet` 19（三種房間模式、房客看到模式、同一片天、關卡地形兩邊同一關）、`music` 9（非會員沒有上傳、壞檔不收、只存 IndexedDB、沒有任何上傳請求、播放列表、重開還在）、`skies` 23、`rwd` 232、`flow` 60、`cloudui` 41、`gameslang` 113、`legal` 439、`pwa` 52、`drawer` 28。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`c8e5644`](https://github.com/luffysky/cube2/commit/c8e5644)，Vercel `dpl_BFq7gxUkJWgBCv7cpc4maZKTMgxX` READY。

## 2026-11-20 23:50（Asia/Taipei）｜挑戰大自然再加三種天氣、三種災害

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-029
- 實際變更：
  - 天氣（`src/weather.js`）：沙塵暴（像強風一樣推方塊，下一個方塊被遮住）、極光（期間得分 ×2；`Weather.GOOD`，不會被丟給對手，`hit('aurora')` 拒收）、日蝕（只看得到落下方塊周圍）。
  - 災害：冰雹（落在幾欄頂上的冰塊，第一次被消只會裂開、回到該欄頂上，第二次才消失；`src/engine.js` 新格子 ICE 10、CRACK 11）、火山（底下噴出一排有缺口的岩漿 LAVA 12，壓在上面的磚一格一格燒掉、上方往下補，結束時冷卻成水泥）、雷擊（劈掉一整列，3 級找最高的那列）。
  - 畫面與聲音（`src/wxmode.js`、`src/view.js`）：沙塵黃霧與飛沙、極光彩帶、日蝕遮罩、冰雹落下、火山紅光與火星、雷擊閃電；冰、裂冰、岩漿的磚面；新音效 hail、lava、sizzle、chime。連線鏡像接受 9–12 號格子（之前雪在對手畫面上看不到，一起修好）。
  - 說明文字四語更新；練習清單變成 8 種天氣、6 種災害。
- 檔案：`src/engine.js`、`src/weather.js`、`src/wxmode.js`、`src/view.js`、`src/net.js`、`src/style.css`、`test/weather.test.js`、`test/skies.js`、`index*.html`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（weather 62）；瀏覽器 `skies` 46（每種天氣與災害都實際跑一次、截圖）、`wxnet` 19、`rwd` 232、`flow` 60、`music` 9。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`85166a9`](https://github.com/luffysky/cube2/commit/85166a9)，Vercel `dpl_Dt2Bj7KwAkstdYuoz695FqzNPGmk` READY。

## 2026-11-21 00:10（Asia/Taipei）｜單手模式、手機橫放可玩、自己檔案的存放選擇、待辦清單

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030
- 實際變更：
  - 單手模式：設定 → 觸控按鍵 → 按鍵配置（雙手／單手右手／單手左手）。六個鍵集中在拇指那一側（3×2），暫存、半圈、道具鍵也移到同一側；選單手時不顯示「移動鍵放右手邊」。
  - 手機橫放：不再暫停並要求轉直；橫放時按鍵分在牆的左右兩邊（單手時全部在同一邊），牆用滿整個高度。`#play.land`、`--mid`、`--padH`。
  - 自己的圖片與音樂：新增 `src/devstore.js`，會員畫面顯示「存在哪裡：只存這台裝置／也上傳到雲端」，雲端在 R2 接好前停用；說明關掉瀏覽器、重開機都還在，清除網站資料、無痕視窗、換裝置、iPhone Safari 7 天沒開會不見；加入檔案時向瀏覽器申請長期保存（`navigator.storage.persist`），結果顯示在說明裡。
  - 新增 `docs/TODO.md` 待辦清單，做完打勾。
- 檔案：`src/ui.js`、`src/style.css`、`src/i18n.js`、`src/devstore.js`（新）、`src/shop.js`、`src/music.js`、`src/index.template.html`、`build.js`、`tools/dict.js`、`test/i18n.test.js`、`test/rwd.js`、`test/music.js`、`test/onehand.js`（新）、`docs/TODO.md`（新）。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `rwd` 258（新增 667×375 橫放、按鍵不蓋到牆）、`onehand` 15、`music` 10、`flow` 60、`drawer` 28。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`2a0fcb6`](https://github.com/luffysky/cube2/commit/2a0fcb6)。

## 2026-11-21 00:35（Asia/Taipei）｜簽到表

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（做簽到表）
- 實際變更：
  - 新的「簽到表」畫面（主選單連結、側邊選單「金幣」組、每日任務的簽到列都能開）：整個月的日曆，簽過的打勾、今天圈起來、錯過的變淡；顯示這個月幾天、連續幾天；按「簽到」領當天金幣。
  - 月累積獎勵：這個月簽滿 7 天 150、14 天 250、21 天 350、全勤 600 金幣，達成那次簽到直接一起發；每月 1 日重新開始。原本的連續簽到金幣（20→120，會員加倍）不變。
  - 記帳走原本的 `login` 操作，伺服器用同一份 `meta.js` 重做，所以金幣由伺服器算；存檔多了 `sign: { m, days, paid }`。建立雲端存檔時只帶這個月、不晚於今天的日子，帶進來已經達成的目標視為已領，不會重複發。
  - 簽到的紅點從「每日任務」移到「簽到表」。
- 檔案：`src/meta.js`、`server/rules.js`、`src/shop.js`、`src/ui.js`、`src/drawer.js`、`src/index.template.html`、`src/style.css`、`games/drawer-icons.js`、`test/meta.test.js`、`test/cloud.test.js`。
- 資料庫：未改結構（存檔 JSON 多一個欄位）。｜刪除：無。
- 測試：`node test/run.js` 全過（meta 173：連簽、7 天目標、整月四個目標、跨月重來、星期幾；cloud：匯入只帶本月、已達成視為已領）；瀏覽器 `drawer` 28、`flow` 60、`rwd` 258。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`6473415`](https://github.com/luffysky/cube2/commit/6473415)。

## 2026-11-21 00:50（Asia/Taipei）｜暱稱過濾補強

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 16）
- 實際變更：
  - 原本就有關鍵字過濾，這次補洞：名字裡的「8」以前會被換成文字 undefined（對照表少了 8），修好；連線房間收到的對手名字以前只去掉標籤字元，現在也走同一個過濾；名字被擋時清空輸入框並提示「這個暱稱不能用」。
  - 字表加了中英日韓常見髒話、歧視字眼（台灣用語、簡體、日韓），刻意不收太短、容易誤擋的片段（單一「幹」、cock、rape、kys、spic、しね、ちょん）。
  - ARCHITECTURE「還沒做」移除這一條，改寫成過濾的做法與限制。
- 檔案：`src/meta.js`、`src/net.js`、`src/shop.js`、`test/meta.test.js`、`docs/ARCHITECTURE.md`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（meta 194：新擋 9 個、不該擋的 11 個如 Luffysky、Spicy、Peacock、幹部、ちょんまげ）；瀏覽器 `wxnet` 19。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`c1bc752`](https://github.com/luffysky/cube2/commit/c1bc752)。

## 2026-11-21 01:10（Asia/Taipei）｜房間加 40 行競速

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 17）
- 實際變更：開房間的模式多一個「40 行競速」（只限兩人）：不互相送水泥、不能用道具；先消完 40 行的人贏，時間到還沒人完成就比誰消得多；畫面上方顯示雙方「幾 / 40 行」，結算顯示各自完成的時間或停在幾行。`end` 訊息多帶 `race`、`lines`（舊版頁面不帶也能結算）。
- 檔案：`src/net.js`、`src/modes.js`、`src/ui.js`、`test/wxnet.js`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `wxnet` 22（四種房間模式、競速雙方都開始、不送水泥、先到 40 行的贏）、`flow` 60。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`e71a657`](https://github.com/luffysky/cube2/commit/e71a657)。

## 2026-11-21 01:30（Asia/Taipei）｜旋轉失靈：觸控按在縫上沒反應

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「T轉還有其他轉有時候會失靈 幫我看一下原因」
- 調查：
  - 旋轉與踢牆表、T 轉判定（三角、正面兩角、第 5 個踢牆算完整 T 轉）、其他方塊的轉（轉完動不了）都和標準 SRS 一致，原有引擎測試全過。
  - 找到的問題在觸控：按鍵之間有 8 px 的縫，加上按鍵邊緣，手指快速點到縫上或邊緣外時完全沒反應，看起來就像轉不動。
  - 規則上本來就會讓「轉」不算數的情況（不是故障）：轉完之後方塊又往下掉一格或被左右移動（包括一直按住左右鍵、天氣模式的風和雨推動），最後一個動作就不是旋轉，T 轉就不算。
- 實際變更：點在縫上或按鍵邊緣 22 px 內，算到最近的那個鍵。
- 檔案：`src/ui.js`、`test/onehand.js`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `onehand` 18（點在兩個旋轉鍵中間的縫也會轉）、`rwd` 258。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`84c921a`](https://github.com/luffysky/cube2/commit/84c921a)。

## 2026-11-21 01:50（Asia/Taipei）｜背包

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「做了寶箱但是忘了做背包 這個補一下」
- 實際變更：新的「背包」畫面（主選單、側邊選單「金幣」組）。三個分頁：
  - 道具：擁有的每種道具和數量、效果說明；點一下帶進下一場對戰（最多 2 個，再點取消），開打時才扣。沒有道具時說明怎麼拿，連到商店。
  - 外觀：所有現在能用的方塊、牆面、主題、消行特效（買的、開箱拿的、免費的、會員的），直接換上；網站主題連到商店的網站主題分頁。
  - 開箱紀錄：最近一次開箱拿到什麼、今天還能開幾次、去開寶箱。
  - 帶道具、換外觀走原本的 `bring`、`equip` 操作，伺服器照舊記帳。
- 檔案：`src/shop.js`、`src/index.template.html`、`src/style.css`、`games/drawer-icons.js`、`test/bag.js`（新）。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `bag` 7、`drawer` 28、`rwd` 258。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`3cd9d25`](https://github.com/luffysky/cube2/commit/3cd9d25)。

## 2026-11-21 02:05（Asia/Taipei）｜被擊倒後自己排好的牆不再消失

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「被擊倒原本排列好的應該要還在 有時候就直接消失了」
- 原因（`Game.prototype.revive`）：被擊倒時，只要一行裡有任何一格水泥（例如雷雨或道具把一格變成水泥）整行就被拿掉；拿掉之後如果還超過 9 行高，整面牆直接清空。
- 實際變更：只拿掉真的水泥行（一行至少一半是水泥）；剩下的牆超過 12 行時，只從最上面削掉多出來的行（造成擊倒的那些），底下排好的保留。
- 注意：舊的對戰錄影裡如果有擊倒，重播到擊倒之後可能和當時不同（錄影只存操作，牆由現在的規則重算）。
- 檔案：`src/engine.js`、`test/engine.test.js`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（engine 83：自己的行留著、混了一格水泥的自己的行也留著、18 行高削成 12 行且最底下不動）；瀏覽器 `flow` 60。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`c2bf001`](https://github.com/luffysky/cube2/commit/c2bf001)。

## 2026-11-21 02:30（Asia/Taipei）｜商店加落點方塊樣式 30 款

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-031
- 實際變更：
  - 新的外觀種類「落點方塊」（`CATALOG.ghost`、`equip.ghost`，預設「描邊」＝原本的樣子）：30 款，3 款免費（描邊、淡影、虛線）、23 款金幣（300–800）、4 款會員（彩虹、極光、光環、深影）。畫法有外框、填色、虛線、圓點、四角、叉叉、底線、外輪廓、發光、呼吸、格紋、泡泡、星星、愛心、彩虹變色，顏色有方塊本色、白、金、青、粉、綠、橘紅、紫、冰藍、墨黑。
  - 商店多一個「落點方塊」分頁，卡片預覽是一個 T 和它落在牆上的位置；背包「外觀」也能換；寶箱的外觀獎品也會開到。
  - 整套風格只換自己有的那幾種（方塊、牆面、主題、特效），不會動到落點方塊。
- 檔案：`src/meta.js`、`src/shop.js`、`src/view.js`、`src/ui.js`、`test/meta.test.js`、`test/api.test.js`。
- 資料庫：未改結構（存檔 JSON 的 owned、equip 多一個 ghost）。｜刪除：無。
- 測試：`node test/run.js` 全過（meta：30 款、免費與會員數量、買了能換、套裝不動它）；瀏覽器 `bag` 7、實際對局截圖確認金光款。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`57cdfca`](https://github.com/luffysky/cube2/commit/57cdfca)。

## 2026-11-21 02:50（Asia/Taipei）｜每場開始前的操作方式

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-031
- 實際變更：
  - 每場（教學與練功房除外）開始前跳出「操作方式」，倒數會等玩家按「知道了，開始」才開始。
  - 鍵盤：列出每個動作目前綁定的所有按鍵（照玩家自己改過的設定）；觸控：說明每個鍵和手勢、可以換單手。
  - 有道具的場次多一段「道具怎麼用」：道具格在哪、按哪個鍵用、攻擊與防守各給誰、帶進來的道具開打就在裡面。
  - 「以後不要每場都顯示」勾選後就不再跳，設定的畫面區塊可以再打開。
  - 連線對戰不能等，倒數時照樣顯示，開打那一刻自己關掉。
  - 自動測試預設略過（和同意畫面一樣），`window.__zzHowto` 才顯示。
- 檔案：`src/ui.js`、`src/i18n.js`、`src/style.css`、`test/howto.js`（新）。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `howto` 11（鍵盤與手機各自的內容、倒數等它關、不再顯示會記住）、`flow` 60、`rwd` 258。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`9507794`](https://github.com/luffysky/cube2/commit/9507794)。

## 2026-11-21 03:15（Asia/Taipei）｜隨機配對依裝置、標示電腦／手機／平板

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-031
- 實際變更：
  - 隨機配對：鍵盤（電腦）配鍵盤、觸控（手機、平板）配觸控。等了 8 秒還沒有同類的人，才會跟另一類配：新來的人會接受已經等超過 8 秒的另一類；兩個不同類的人都在等時，先說「還在」（每 3 秒一次）且等超過 8 秒的那個，會直接搬進另一個人的房間。搬家時先把自己從佇列拿掉，兩個人同時搬也不會互相搬進對方房間。開房間、用代碼加入都不受限制。
  - 佇列多一欄 `dev`（`ALTER TABLE zz.queue ADD COLUMN IF NOT EXISTS dev`，新增欄位，不刪任何東西）。搬走後原本那個空房間不再排隊，照一般房間的時間到期。
  - 標示：打招呼訊息帶自己的裝置（電腦、手機、平板：觸控且螢幕短邊 600 以上算平板）。房間名單每個人旁邊、「找到對手」「已連上」那行、對戰中對手名字旁都顯示 💻 電腦／📱 手機／📱 平板；舊版頁面沒帶就不顯示。
- 檔案：`server/core.js`、`server/db.js`、`src/net.js`、`src/modes.js`、`src/ui.js`、`src/style.css`、`test/api.test.js`、`test/wxnet.js`。
- 資料庫：`zz.queue` 新增 `dev` 欄位（第一次 API 呼叫時自動加上）。｜刪除：無。
- 測試：`node test/run.js` 全過（api 329：同類先配、剛開始等時不混配、等 8 秒後混配、兩邊都在等時其中一個搬家、搬完兩邊都離開佇列且對方看到客人）；瀏覽器 `wxnet` 24（房間名單與對戰中都看得到裝置）、`rwd` 258。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`bc36f54`](https://github.com/luffysky/cube2/commit/bc36f54)。

## 2026-11-21 03:40（Asia/Taipei）｜拿到獎品的特效

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-031
- 實際變更：新的全螢幕「拿到了！」畫面（`App.celebrate`）：背後放射光旋轉、彩帶噴出、獎品卡片彈出、金幣數字從 0 跑到實際數字、一顆顆金幣飛進右上角的錢包（錢包跳一下、叮一聲）、震動。分三級：
  - 一般（拿到了！）、大獎（大獎！：轉盤 300、拉霸三個一樣或兩個金幣）、頭獎（頭獎！！：轉盤 1000、拉霸三個金幣：金色卡片、更多彩帶、標題晃動）。
  - 用在轉盤、拉霸（沒中不跳）、會員領廣告獎勵、看廣告的獎勵（伺服器發完金幣後），以及開到金箱、寶石箱。
  - 點一下關閉，幾秒後也會自己關；系統設定「減少動態」時只顯示卡片，不噴彩帶、不飛金幣。
- 檔案：`src/bonus.js`、`src/shop.js`、`src/style.css`、`test/cele.js`（新）。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `cele` 8（轉盤、拉霸中與沒中、會員廣告獎勵、點一下關、減少動態）、`flow` 60。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`74d20b6`](https://github.com/luffysky/cube2/commit/74d20b6)，Vercel `dpl_5oDwrk4uMNzuTonf8CXbx6911x3L`；之前幾次部署都 READY，3 小時內沒有執行錯誤。

## 2026-11-21 04:10（Asia/Taipei）｜瀏覽器測試放進 GitHub Actions

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 18）
- 實際變更：
  - 新增 `test/browser-run.js`：沒人在聽就自己開 8790、8765 兩個靜態伺服器，依序跑 18 個瀏覽器測試（flow、rwd、drawer、onehand、howto、bag、cele、music、skies、wxnet、legal、pwa、gameslang、cloudui、consent、sites、bricks、minipay），每個最多 8 分鐘，最後列出哪些沒過。
  - `.github/workflows/test.yml` 多一個 `browser` 工作：安裝 Playwright 到 `/opt/npm-tools`（不下載瀏覽器，用執行環境內建的 Chrome），然後跑上面那支。
- 檔案：`test/browser-run.js`（新）、`.github/workflows/test.yml`、`docs/ARCHITECTURE.md`。
- 資料庫：未異動。｜刪除：無。
- 測試：本機 `node test/browser-run.js` 18 個全過（約 10 分鐘）。GitHub 上第一次執行結果要等這次推上去才知道。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`b9fbf5a`](https://github.com/luffysky/cube2/commit/b9fbf5a)。

## 2026-11-21 04:30（Asia/Taipei）｜磚蛇加補命的愛心

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「貪吃蛇加上可以補愛心的」
- 實際變更：少了命的時候，每吃 5 塊磚有機會在場上出現一顆愛心（同時只有一顆，不會出現在蛇身、食物、水泥或陷阱上），停留 60 步，快消失前閃爍；吃到補回一條命（最多 5 條）、加 20 分，上方的愛心跳一下、有提示音和「+♥」。滿命時不會出現。說明文字四語更新。
- 檔案：`games/snake/snake.js`、`games/games.css`、`src/games-dict.js`、`games/words.js`、`test/snake.test.js`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（snake 41：滿命不出現、少命會出現、不壓在蛇或食物上、吃到補一條加 20 分、不超過 5 條、沒吃到會消失）；瀏覽器 `bricks` 全過，截圖確認愛心畫面。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`83710e7`](https://github.com/luffysky/cube2/commit/83710e7)。

## 2026-11-21 04:55（Asia/Taipei）｜隨機配對先選模式；暫存按了沒反應時說明原因

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「連線對戰隨機配對進去要先可以選模式 選好才開始配對 然後暫存為什麼有時候都失靈 按了沒換？」
- 實際變更：
  - 隨機配對：連線對戰畫面先選「普通對戰／挑戰大自然／關卡地形／40 行競速」，再按「開始配對」；只會配到選同一個模式的人（伺服器的配對池從 `''`、`wx` 擴充成 `''`、`wx`、`lv`、`race`）。配到後照選的模式開打；等不到人改打電腦時，關卡地形也會用抽到的關卡牆。從主畫面捷徑（`?go=quick`）進來的仍是普通對戰。
  - 暫存：查過程式，暫存本身沒有壞；規則是每一塊只能暫存一次，要等它放下去才能再用（暫存格會變淡）。之前在這段時間按暫存完全沒有反應，看起來像失靈。現在按了會讓暫存格晃一下、輕響一聲，每次開遊戲前三次還會說明「每塊只能暫存一次，放下去之後才能再暫存」。練功房那幾關本來就不用暫存，也會說明。
- 檔案：`src/modes.js`、`src/net.js`、`server/core.js`、`src/ui.js`、`src/i18n.js`、`src/style.css`、`test/quick.js`、`test/browser-run.js`。
- 資料庫：未改結構（`zz.queue.pool` 多兩種值）。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `quick` 12（先選模式、兩個選競速的人配在一起並打競速）、`wxnet` 24；暫存用腳本確認第二次按會晃一下並出現說明、放下後可以再暫存。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`d5d8b42`](https://github.com/luffysky/cube2/commit/d5d8b42)。

## 2026-11-21 05:25（Asia/Taipei）｜九款小遊戲排行榜

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 14）
- 實際變更：
  - 伺服器：重做小遊戲的 `mini` 操作時寫進排行榜（`zz.scores`，本季與歷來各一筆，跟其他榜一樣只留最好的）：磚蛇、打磚塊、疊磚塔、磚塊合成每個難度一個分數榜；磚道、掃磚每個難度一個時間榜（存負數，越快越前面）；推磚倉庫、分磚、磚畫謎比星星總數。分數超過「遊玩秒數 × 1500 + 500」的不上榜（防亂報），時間少於 1 秒或比遊玩時間還長的也不上榜。`/api/board` 接受 `m_…` 這些榜名，其他名字回 400。
  - 轉磚的排行榜多一個「小遊戲」分頁：選遊戲、選難度（關卡遊戲沒有難度），分本季、歷來，顯示自己的名次。
- 檔案：`server/rules.js`、`server/core.js`、`src/meta.js`、`src/cloud.js`、`src/style.css`、`test/api.test.js`、`docs/ARCHITECTURE.md`。
- 資料庫：未改結構（`zz.scores` 多了新的榜名）。｜刪除：無。
- 測試：`node test/run.js` 全過（api 335：磚蛇分數上榜、時間顯示成時間、星星總數、太誇張的分數不上榜、不存在的榜回 400）；瀏覽器 `cloudui` 41，並用本機伺服器實際玩一筆磚蛇分數、在「小遊戲」分頁看到自己第 1 名。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`d9ed94b`](https://github.com/luffysky/cube2/commit/d9ed94b)。

## 2026-11-21 05:35（Asia/Taipei）｜GitHub 上的瀏覽器測試修正

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 18）
- 第一次在 GitHub 上跑：18 個裡 16 個過。`flow` 因為 GitHub 的機器上沒有 `shots/` 資料夾（截圖用，不在 git 裡）存不了圖；`onehand` 的「點在縫上也會轉」偶爾遇到目前方塊是 O（O 不會轉）。
- 實際變更：`test/browser-run.js` 先建 `shots/`；`test/onehand.js` 遇到 O 時換成 T 再測。
- 檔案：`test/browser-run.js`、`test/onehand.js`。｜資料庫：未異動。｜刪除：無。
- 測試：本機 `onehand` 18；`node test/run.js` 全過。
- 補記：上一條的 commit 為 [`425f945`](https://github.com/luffysky/cube2/commit/425f945)。

## 2026-11-21 06:00（Asia/Taipei）｜真人排位：伺服器判定勝負

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 15）
- 背景：原本只有「對電腦的排位」，連線對戰不影響任何分數，勝負只靠各自前端回報。
- 實際變更：
  - 隨機配對多一個模式「真人排位」：兩分鐘、不帶道具、只配到也選真人排位的人（配對池 `pr`），需要雲端存檔。
  - 伺服器裁判：每個人照舊回報自己這一場（附落子紀錄，伺服器重走一遍驗證），回報多標 `pr`。第二份回報進來時，伺服器在同一個房間、15 分鐘內找另一個人尚未配對的回報，配成一對寫進新表 `zz.pvp`（每份回報只能配一次，兩人同時送也只會配一次）。兩份都被落子紀錄佐證、勝負剛好相反、雙方數的擊倒次數對得上，才由伺服器用只有它能下的 `pvp` 操作同時改兩人的真人排位分（`state.pvp`：分數、場數、勝場；加減分和電腦排位同一套規則）。對不上就記下 `ok = false`，誰都不加減；只有一邊回報也不算。
  - 新排行榜「真人排位」；個人資料和配對畫面顯示自己的真人排位；結算畫面說明「等伺服器確認雙方紀錄後更新分數」。
- 檔案：`server/core.js`、`server/db.js`、`server/rules.js`、`src/meta.js`、`src/net.js`、`src/ui.js`、`src/modes.js`、`src/cloud.js`、`src/shop.js`、`test/api.test.js`、`test/meta.test.js`、`docs/ARCHITECTURE.md`。
- 資料庫：新表 `zz.pvp`（`CREATE TABLE IF NOT EXISTS`，第一次 API 呼叫時建立）；`zz.matches.data` 多一個 `pr`。｜刪除：無。
- 測試：`node test/run.js` 全過（api 344：一份回報不加減、兩份一致雙方都動且只算一次、重送不再算、兩邊都說自己贏誰都不動並留紀錄、前端送不了伺服器專用操作、勝者上榜）；瀏覽器 `quick`、`wxnet`、`cloudui` 全過。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`bb7e4bd`](https://github.com/luffysky/cube2/commit/bb7e4bd)，Vercel `dpl_8kCHnDFbuVHNXL7jpPXUKDpZYd52` READY，2 小時內無執行錯誤。

## 2026-11-21 06:15（Asia/Taipei）｜排行榜加關卡

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「排行榜 關卡排行怎麼沒在裡面」
- 實際變更：排行榜多一個「關卡」分頁，分「星星總數」（1000 關拿到的星星加總，伺服器重做每次過關時記）和「無限挑戰」（跑到第幾關；每關至少要有 15 秒的遊玩時間才上榜，防亂報）。本季、歷來都有。
- 檔案：`server/rules.js`、`server/core.js`、`src/cloud.js`、`test/api.test.js`。
- 資料庫：未改結構（`zz.scores` 多 `lvs`、`lve` 兩個榜名）。｜刪除：無。
- 測試：`node test/run.js` 全過（api 348：星星加總上榜、無限挑戰上榜、跑太快的關數不上榜）；瀏覽器 `cloudui` 41。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`dd09e64`](https://github.com/luffysky/cube2/commit/dd09e64)。

## 2026-11-21 06:50（Asia/Taipei）｜好友房 WebRTC 直連

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（待辦 19）、「RTC接著」
- 實際變更：
  - 兩人好友房（代碼開的）進房後自動嘗試直連：房主建 WebRTC 資料通道，offer／answer／位址經由原本的房間信件傳遞。通道開了以後每封信同時從通道送出，收的一方依編號只收一次、照順序；中繼繼續慢慢跑當備援（對戰中 1.5 秒一輪），通道斷了或 12 秒內沒開成就全靠中繼，什麼都不會漏。房間畫面顯示「已和對手直接連線」。
  - 隱私：直連時雙方瀏覽器看得到彼此的網路位址（IP），瀏覽器也會向 Cloudflare／Google 的公開 STUN 伺服器問自己的對外位址。所以只在好友房用，隨機配對（陌生人）不直連；四語隱私權政策加上這一條；網址加 `?rtc=off` 可以關掉。
  - 三、四人房不直連。沒有 TURN（行動網路之間常常打不通，就走中繼）。
- 檔案：`src/net.js`、`src/modes.js`、`legal/src/privacy.*.html`、`legal/`（重建）、`privacy.html`、`test/rtc.js`（新）、`test/quick.js`、`test/browser-run.js`、`docs/ARCHITECTURE.md`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `rtc` 11（兩人直連、房間顯示、對戰經通道、伺服器請求每秒不到 2 次、通道斷掉後改走中繼不漏、`?rtc=off` 不直連）、`quick` 13（隨機配對不直連）、`wxnet` 24、`legal` 439。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`ea65651`](https://github.com/luffysky/cube2/commit/ea65651)。

## 2026-11-21 07:00（Asia/Taipei）｜CI：flow 測試不再依賴別的測試留下的截圖

- 專案：cube2｜執行者：Claude
- GitHub 上 `flow` 失敗：它拿 `smoke` 測試留下的 `shots/s_menu.png` 當會員自選圖片，GitHub 上沒跑 smoke 就沒有這張圖。改成 flow 自己先截一張圖再用。其他 18 個在 GitHub 上都過了。
- 檔案：`test/flow.js`。｜資料庫：未異動。｜刪除：無。
- 測試：本機刪掉那張圖後 `flow` 60 全過。
- 補記：上一條的 commit 為 [`9f1ef06`](https://github.com/luffysky/cube2/commit/9f1ef06)。

## 2026-11-21 07:20（Asia/Taipei）｜載入動畫

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「幫我做個遊戲載入的Loading動畫」
- 實際變更：主頁一打開就先顯示載入畫面（在 1 MB 的程式還在下載、解析時就畫得出來）：「轉」「磚」兩塊從上面掉下來彈一下，下面一個小牆三塊方塊依序落下、整行閃白消掉、一直重複，底下「載入中…」三個點輪流亮（五種語言的頁面各用自己的字，建置時填入）。遊戲啟動完成就淡出移除；萬一程式出錯沒啟動，15 秒後也會自己淡掉，不會擋住畫面。系統設定「減少動態」時只顯示靜態畫面。純 CSS，不多載任何檔案。
- 檔案：`src/index.template.html`、`src/style.css`、`src/ui.js`、`build.js`、`index*.html`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `pwa` 52、`rwd` 258、`consent` 31、`howto` 11、`flow` 60；關掉 JavaScript 截圖確認動畫畫面、正常開啟時啟動後消失。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`e95a57c`](https://github.com/luffysky/cube2/commit/e95a57c)。

## 2026-11-21 07:40（Asia/Taipei）｜九款小遊戲也有載入動畫

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「繼續後面的」（接上一則：小遊戲也加載入畫面）
- 實際變更：每款小遊戲頁面一開就顯示四塊磚依序掉下來排成一排（顏色跟著那款遊戲），下面「載入中…」（五語，字典 `g.loading`）。頁面全部載好就淡出（至少停 0.45 秒，避免一閃而過）；萬一出錯 10 秒後自己淡掉。減少動態時不動。
- 檔案：`games/*/index.html`（9 款）、`games/games.css`、`games/nav.js`、`src/games-dict.js`、`games/words.js`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `bricks` 73、`gameslang` 113、`minipay` 10、`drawer` 28；截圖確認畫面、日文頁載好後消失。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`58cf9a9`](https://github.com/luffysky/cube2/commit/58cf9a9)。

## 2026-11-21 08:20（Asia/Taipei）｜會員雲端上傳（R2）的程式，等金鑰就開

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：C-030（之後接 R2）、「繼續後面的」
- 實際變更：
  - 伺服器 `server/files.js`：會員要上傳時，伺服器檢查會員身分、大小、種類、總量後，發一個 10 分鐘有效的簽名網址，瀏覽器直接把檔案放進 R2；做完回報 `fileOk` 才列入清單；`fileList` 給 1 小時有效的讀取網址；`fileHide` 只是從清單拿掉。簽名用標準 AWS SigV4（自己寫、不加套件），和 AWS 官方 boto3 對同一組輸入算出的簽名逐字相同。
  - 新表 `zz.files`；`/api/health` 多一個 `files`（有沒有設好 R2 金鑰）；CSP 的 `connect-src` 加上 `https://*.r2.cloudflarestorage.com`。
  - 頁面：伺服器說可以上傳、而且有雲端存檔時，「也上傳到雲端」才會打開；選了以後新加的音樂和圖片會在存到本機之後另外上傳（音樂旁邊顯示 ☁），失敗會說檔案還在本機；另一台裝置按「從雲端取回」把雲端的檔案拿回來（音樂照樣先檢查能不能播，圖片取最新的牆面和方塊圖）。
  - 隱私權政策四語加上「選擇上傳時」這一條。給 Owner 的開啟步驟：`docs/R2_SETUP.md`（開 bucket、建只限這個 bucket 的金鑰、CORS、四個 Vercel 環境變數）。
  - 沒有刪除：從清單拿掉只隱藏，bucket 裡的檔案不刪，要不要刪請 Owner 決定。
- 檔案：`server/files.js`（新）、`server/app.js`、`server/core.js`、`server/db.js`、`src/cloud.js`、`src/devstore.js`、`src/music.js`、`src/shop.js`、`build.js`、`vercel.json`、`legal/`、`privacy.html`、`test/api.test.js`、`test/r2.js`（新）、`test/browser-run.js`、`docs/R2_SETUP.md`（新）。
- 資料庫：新表 `zz.files`（`CREATE TABLE IF NOT EXISTS`）。｜刪除：無。
- 測試：`node test/run.js` 全過（api 363：沒金鑰時關著、簽名和 boto3 相同、非會員不能傳、超過 15 MB／非音樂檔／SVG 都擋、別人碰不到、拿掉後紀錄還在）；瀏覽器 `r2` 9（真的上傳到模擬的 bucket、清空本機後從雲端取回、圖片也上傳、沒金鑰時選項關著）、`music` 10、`pwa` 52、`legal` 439、`flow` 60。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。正式站目前沒有 R2 金鑰，所以上傳選項仍是關著的。
- 補記：上一條的 commit 為 [`d8413b8`](https://github.com/luffysky/cube2/commit/d8413b8)，Vercel `dpl_F12iMLqrhSWKP5X5hsbiWTjKVcsC` READY。

## 2026-11-21 03:50（Asia/Taipei）｜Gemini 金鑰接上，自動翻譯確認可用

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「GEMINI_API_KEY加好了」
- 過程：手動觸發自動翻譯：目前 1485 條全部已有人工翻譯，沒有待翻的，所以第一次沒有呼叫 Gemini。加一個「只檢查金鑰」的選項（手動執行時勾 `check`，翻一句測試、不提交任何東西）。檢查發現：金鑰有效（拿得到模型清單），但最新的 `gemini-3.8-flash`、`gemini-3.7-flash` 一直逾時（第一次用的是 503），改成「忙碌、逾時或不可用就換下一個模型」，並在紀錄裡列出嘗試順序；結果由 `gemini-3.6-flash` 成功翻出。
- 另外：翻譯指示原本要求保留「轉磚」不翻，但英日韓介面上遊戲名稱是「Zhuan Zhuan」，改成照介面的名稱翻。
- 檔案：`tools/i18n-auto.py`、`.github/workflows/i18n.yml`。｜資料庫：未異動。｜刪除：無。
- 測試：`test/autoi18n.test.js` 24 全過；GitHub Actions 手動檢查成功（run 44803575885）。

## 2026-11-21 04:35（Asia/Taipei）｜R2 金鑰設好，重新部署打開雲端上傳

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「好了」（R2 bucket、金鑰、CORS、Vercel 環境變數）
- 確認 Vercel Production 有 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET` 四個變數（只看名稱，沒有解密值）；變數在上次部署之後才加，用這次 commit 觸發重新部署。
- 檔案：`docs/DEVLOG.md`、`docs/TODO.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`6199b73`](https://github.com/luffysky/cube2/commit/6199b73)，Vercel `dpl_AhvGuHADugLAvmsCYHJxmaH4kitU` READY，`/api/health` 回 `files: true`。

## 2026-11-21 04:55（Asia/Taipei）｜雲端檔案：藏 30 天可復原，沒後悔才真的刪

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「先不刪 就藏 藏30天如果他們沒後悔才真正刪」（C-034）
- 之前的問題：伺服器有「藏起來」的功能，但頁面上沒有任何地方會用到，玩家刪掉本機的歌，雲端那份還一直佔著他的空間。
- 現在：
  - 刪掉有上傳過的歌，會先問一句，說明這台裝置上的馬上刪、雲端那份放「最近移除」30 天。移除牆面／方塊圖也一樣。換一張新圖時，舊的自動進「最近移除」。
  - 「也上傳到雲端」底下多一個「最近移除」，列出 30 天內移除的檔案和剩幾天，可以按「復原」，復原後馬上取回這台裝置。圖片復原後會換掉現在用的那張，現在那張進「最近移除」。
  - 每天台灣時間凌晨 3:07 跑一次排程 `/api/cron`，把移除滿 30 天的檔案從 R2 刪掉；R2 回覆刪掉了，才刪 `zz.files` 那一筆，沒刪成功的隔天再試。一次最多 200 個。以前就藏起來、沒有時間的，從今天開始算 30 天。
  - 有設 `CRON_SECRET` 就只接受 Vercel 的呼叫（可選，沒設也只會刪已經到期的）。
  - 隱私權政策四語加上「最近移除 30 天」，並修掉幾句「音樂、圖片絕不上傳」的舊說法（現在選了上傳就會上傳）。
- 正式站實測：雲端瀏覽器沒辦法選檔案，所以沒有在正式站真的傳一次；也沒有用 Owner 自己的 Chrome，因為那裡有 Owner 真正的遊戲存檔，不想動到。CORS 和金鑰要等第一次真的上傳成功才算驗證過。
- 檔案：`server/files.js`、`server/app.js`、`server/db.js`、`api/cron.js`（新）、`vercel.json`、`src/devstore.js`、`src/music.js`、`src/shop.js`、`legal/src/privacy.*.html`、`test/api.test.js`、`test/r2.js`、`docs/R2_SETUP.md`、`docs/OWNER_DECISIONS.md`、`docs/TODO.md`。
- 資料庫：`zz.files` 加欄位 `hidden_at`（`ADD COLUMN IF NOT EXISTS`）。｜刪除：排程會刪隱藏滿 30 天的 R2 物件和對應的 `zz.files` 紀錄（Owner 核准 C-034）；這次部署本身沒有刪任何東西。
- 測試：`node test/run.js` 全過（api 380：「最近移除」列出、剩 30 天、別人不能復原、復原回清單、新圖取代舊圖、按名稱移除、未滿 30 天不刪、R2 沒刪成功就不刪紀錄、隔天補刪、`CRON_SECRET`）；瀏覽器 `r2` 13（刪歌時的提示、最近移除、復原後回到這台裝置）、`music` 10、`cloudui` 41、`legal` 439。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`5324f3a`](https://github.com/luffysky/cube2/commit/5324f3a)，Vercel `dpl_FsWNmAHutku7jvSbt186NWAMpYuz` READY；`/api/cron` 手動跑一次回 `{"ok":true,"due":0,"gone":0,"kept":0}`。

## 2026-11-21 08:10（Asia/Taipei）｜唯讀營運 API 七支＋「連結 SnowRealm Games」BFF（兩者都先關著）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的 GPT 交辦「cube2《轉磚》唯讀營運 API ＋ OAuth BFF Callback」（C-035）；對照 cube1 main `12e85da` 的 `SNOWREALM_GAMES_ADMIN_API_BRICKDUEL_HANDOFF.md` v0.2、`IDENTITY_P0_PRODUCTION_VERIFICATION_zh-TW.md`、`dist/sso-flow.mjs`（只讀，沒有改 cube1）。
- **A. 唯讀營運 API**：`/internal/admin/v1/` 下的 `overview`、`players`、`players/{id}`、`draws`、`matches`、`metrics`、`metrics/daily`。
  - 只認 SnowRealm 機器簽發端用「管理專用 JWKS」簽的 Ed25519 短效 token，`iss`、`aud`、`scope`、`sub` 白名單、`kid/iat/nbf/exp/jti` 全部嚴格檢查；玩家 token、來源網址、IP 都不算數。
  - 沒設白名單 503、token 不對 401、權限不夠 403、沒這條路 404、不是 GET 405、參數錯 400、每分鐘超過 60 次 429、JWKS 抓不到 503（不會假裝成 0）。
  - 只回營運需要的欄位，沒有裝置金鑰、引繼碼、原始存檔、IP；量不到的數字回 `null`。等待刪除的存檔不出現。
  - 每次驗過的呼叫寫進新表 `zz.admin_log`（不含 token）。
- **B. OAuth BFF**：`/api/auth/start`、`/api/auth/callback`、`/api/auth/result`。
  - PKCE S256、state、nonce 都在伺服器產生，加密存在新表 `zz.authsess`；瀏覽器只拿到一個 `__Host-` cookie（Secure、HttpOnly、Lax、10 分鐘）。
  - callback 一進來就把工作階段用掉；驗 state、換 token（client secret 只在伺服器）、驗簽、再查即時撤銷，只有 `active: true` 才往下走；出任何差錯都拒絕。
  - 綁定和找回用原本的 `idLink`／`idRecover`：一對一、jti 一次、409 不合併；匿名模式和 30 天恢復規則不變。
  - 頁面：只有伺服器說「開了」才出現「連結」「找回」按鈕。回來的網址只帶一個結果字，頁面馬上清掉。
  - 隱私權政策四語先寫明連結時會用的那一個必要 cookie（功能尚未開放）。
- **沒做到、不能說通過的**：
  - 正式 E2E：cube1 的 `/oauth/authorize`、`/oauth/token` 還是 503，`identity.snowrealm.pet` 沒有正式部署。
  - 正式站管理 API 成功讀取：機器簽發端與 `admin-jwks.json` 沒上線，也還沒設 `BRICKDUEL_ADMIN_SUBJECTS`。
  - `IDENTITY_LINK_ENABLED` 維持關閉。
- 待 Owner：稽核紀錄 180 天後要不要清、過期登入暫存怎麼清（都是刪除，沒有自己加）；開綁定前要改同意畫面的「不用 cookie」。
- 檔案：`server/admin.js`（新）、`server/bff.js`（新）、`server/app.js`、`server/db.js`、`api/admin.js`（新）、`api/auth/{start,callback,result}.js`（新）、`vercel.json`、`tools/dev-server.js`、`src/cloud.js`、`src/sw.template.js`、`legal/src/privacy.*.html`、`test/admin.test.js`（新）、`test/bff.test.js`（新）、`test/authui.js`（新）、`test/fixtures/cube1-brickduel-admin-jwt.json`（新，cube1 公開的測試 fixture）、`test/run.js`、`test/browser-run.js`、`test/api.test.js`、`docs/BRICKDUEL_ADMIN_API_ADAPTER_SPEC.md`、`docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`、`docs/ARCHITECTURE.md`、`docs/OWNER_DECISIONS.md`、`docs/TODO.md`。
- 資料庫：新表 `zz.admin_log`、`zz.authsess`（`CREATE TABLE IF NOT EXISTS`）。｜刪除：無。
- 測試：`node test/run.js` 全過（新增 admin 98、bff 66；api 380）；瀏覽器 `authui` 9、`cloudui` 41、`pwa` 52、`flow` 60、`consent` 31、`r2` 13、`legal` 439。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`0ff7364`](https://github.com/luffysky/cube2/commit/0ff7364)，Vercel `dpl_2LzfqAfQNy5RqVHFGHc2jnKEhiz6` READY，CI run 44835328522 成功。正式站實測：`/internal/admin/v1/overview` 與 `/internal/admin/v1/metrics/daily` 回 503 `disabled`、`GET /api/auth/start` 回 405、`/api/auth/callback` 回 303 到 `/?auth=off`、`/api/health` 的 `link: false`；部署後 30 分鐘沒有 runtime error。給 cube1 Issue #2、#4 的回覆整理在 `docs/CUBE1_REPLY_20261121.md`。

## 2026-11-21 07:40（Asia/Taipei）｜同意畫面與隱私權政策：改成「會用一個必要 cookie」並說明用途

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「改成會需要cookie還有說明用途」
- 同意畫面（四語）不再寫「不用 cookie」，改成：會用一個必要的 cookie，只在連結或用帳號找回存檔時設定，用來確認登入後回來的是同一個瀏覽器，最長 10 分鐘、用完失效、不做追蹤。
- 隱私權政策第 4 節（四語、各地區版本）列出這個 cookie 的名稱 `__Host-zzauth`、用途、內容（只是隨機編號）、期限、HttpOnly／Secure、不分享不追蹤、為什麼不另外詢問、不想要就不按連結。
- 檔案：`src/consent.js`、`legal/src/privacy.*.html`、`docs/TODO.md`、`docs/CUBE1_REPLY_20261121.md`、`docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`。｜資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `consent` 31、`pwa` 52、`authui` 9、`legal` 439。
- 補記：上一條的 commit 為 [`853b5e9`](https://github.com/luffysky/cube2/commit/853b5e9)。

## 2026-11-21 08:15（Asia/Taipei）｜契約補充：nonce 必填、管理 sub 限定、清理方案與監控

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的 GPT「cube2 2026-11-21 後續契約補充」（C-036）；不重做已完成的路由。
- **nonce 必填**：BFF 原本是「token 有帶 nonce 才比」，改成「缺少、空字串、不是字串、或跟伺服器存的不同，一律拒絕」。測試用的假 Identity 改成照 cube1 的新規則，每張 token 都帶 nonce。新增的測試：正常、缺少、不同、空字串、型別錯、重放、過期但 nonce 對。這些都是模擬，不是正式 E2E。
- **管理 API 的 sub**：測試以外只接受 `svc:snowrealm-games-admin`。名單裡填了別的值會被忽略；如果只有別的值，就當作沒設定、回 503。新增的 403 測試：玩家 scope、沒有 scope、玩家 UUID 當 sub。新增的 401 測試：玩家 audience 寫成陣列。cube1 的 fixture 在正式設定下不能被列進名單，用正式設定時也會被拒絕。
- **清理**：沒有刪任何東西。`/api/cron` 多了只讀的 `watch`，報告 `zz.admin_log` 超過 180 天的筆數、`zz.authsess` 過期的筆數，超過門檻時記一行日誌。分批刪除、先彙總、開關、還原演練的方案寫在 `docs/RETENTION_PROPOSAL.md`，等 Owner 批准。
- R2 正式上傳測試、cookie 的法律審查另外追蹤，不影響這次的程式。
- 檔案：`server/bff.js`、`server/admin.js`、`server/retention.js`（新）、`server/app.js`、`test/bff.test.js`、`test/admin.test.js`、`test/api.test.js`、`docs/RETENTION_PROPOSAL.md`（新）、`docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`、`docs/BRICKDUEL_ADMIN_API_ADAPTER_SPEC.md`、`docs/OWNER_DECISIONS.md`、`docs/TODO.md`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（bff 72、admin 105、api 382）。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）。
- 補記：上一條的 commit 為 [`b20f521`](https://github.com/luffysky/cube2/commit/b20f521)，Vercel `dpl_9UgAhTLySqWXqmi8Q58DscPmGNgX` READY，CI run 44840380067 **兩個 job 都成功**（rules／server／sync、Chrome 頁面）。正式站 `/api/cron` 回 `watch: {adminLog: {rows: 0, pastKeep: 0}, authSessions: {rows: 0, expired: 0}}`，沒有刪任何東西。

## 2026-11-21 08:25（Asia/Taipei）｜聯合驗收清單（staged，非正式 E2E）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的 GPT「PR #17 契約已對齊，現況核對與剩餘驗收」：確認 CI 結果，然後只跟 Work 對齊 staged Admin JWT／JWKS 和 staged player nonce 簽章的聯合驗收。
- 新增 `docs/JOINT_ACCEPTANCE.md`：Admin 14 項（A1–A14）、登入 13 項（B1–B13），寫明每項的預期結果、cube1 要提供什麼，以及 cube2 怎麼只在 Preview 接 staging。
- 待決：callback 寫死是正式網址，Preview 收不到。兩條路二選一：staging 專用 callback（要改 cube2 程式），或在 production 短暫打開驗收、驗完就關（要 Owner 同意）。
- 沒有動 `IDENTITY_LINK_ENABLED`、`BRICKDUEL_ADMIN_SUBJECTS`，也沒有新增刪除。
- 檔案：`docs/JOINT_ACCEPTANCE.md`（新）、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`07767a1`](https://github.com/luffysky/cube2/commit/07767a1)。

## 2026-11-21 17:50（Asia/Taipei）｜Staging 回呼（只在 Preview）、staging 不讀正式資料庫

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的 GPT「Staging Callback 與 A1–A14／B1–B13 對接補充」（C-037）
- **staging 回呼**：
  - 只有 Vercel Preview 加上 `IDENTITY_STAGING=1` 時才生效。只接受 `IDENTITY_STAGING_REDIRECT` 這一個精確的 https 回呼：不能有萬用字元、port、query，不能是正式站的 host。
  - client 預設 `brickduel-bff-staging`，不能用正式的 client。secret 是獨立的一組，不能跟正式相同。issuer、token、status 也都不能用正式的值，入口網址必須另外給。
  - production 上一律忽略這些 staging 設定。
  - 開始登入和 callback 都必須在回呼的 host 上；在別的 host（例如 `cube2-xi.vercel.app`）一律拒絕，所以 cookie 只會落在正確的 host。
- **安全發現與處理**：Preview 拿到的 `DATABASE_URL` 跟 production 是同一個。改成只要開了 staging（`IDENTITY_STAGING=1` 或 `BRICKDUEL_ADMIN_TEST_TRUST=1`），就只用 `STAGING_DATABASE_URL`，沒設就沒有資料庫，不會讀到正式玩家資料。另外，一般 Preview 部署本來就連著正式資料庫，這次沒有改；建議 Owner 讓 Neon 整合幫 Preview 建分支。
- **網域**：`brickduel-staging.snowrealm.pet` 已在 Vercel 綁到 `staging` 分支。DNS 在 Cloudflare，要 Owner 加 CNAME；**還沒生效**，不能宣稱已經存在。
- `docs/JOINT_ACCEPTANCE.md` 加了 staging 說明和實測報告表：A、B 目前都是 BLOCKED。給 cube1 的補充寫在 `docs/CUBE1_REPLY_20261121.md`。
- 正式站的 `IDENTITY_LINK_ENABLED`、回呼、cookie、存檔、金幣、匿名遊戲都沒動；沒有刪任何東西。
- 檔案：`server/bff.js`、`server/app.js`、`server/db.js`、`test/bff.test.js`、`test/authui.js`、`test/staging.test.js`（新）、`test/run.js`、`docs/JOINT_ACCEPTANCE.md`、`docs/CUBE1_REPLY_20261121.md`、`docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md`、`docs/OWNER_DECISIONS.md`、`docs/TODO.md`。
- 資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（bff 99：staging 設定 15 種拒絕、production 忽略、staging 整輪、錯 host、重放、換瀏覽器；staging 5）。瀏覽器：`authui` 9、`cloudui` 41。
- 部署：隨本次 commit 部署正式環境（SHA 見下一條紀錄）；另開 `staging` 分支給 Preview 用。
- 補記：上一條的 commit 為 [`7ea477f`](https://github.com/luffysky/cube2/commit/7ea477f)，Vercel production `dpl_7QMamS2yuvU4G7c2Lx4uAPvRsgm8` READY，CI run 44890326000 兩個 job 都成功；正式站 `/api/health` 仍是 `link: false`。`brickduel-staging.snowrealm.pet` 已加到 Vercel 專案、綁 `staging` 分支；同一個 commit 推到 `staging` 時 Vercel 沒有另外建 Preview，這次補記會再推一次 `staging` 讓它建出來。
- 補記：上一條的 commit 為 [`3493e89`](https://github.com/luffysky/cube2/commit/3493e89)；`staging` 分支 Preview `dpl_7xCFuT43TP5iZhNhp5kVMX4AQSJ8` READY。Owner 加好 Cloudflare CNAME 後，Vercel 顯示 `misconfigured: false`，`https://brickduel-staging.snowrealm.pet` 的 TLS 已生效；打開會被導到 Vercel 登入頁，原因是 Preview 有部署保護。

## 2026-11-21 18:25（Asia/Taipei）｜音樂播放器：本來就在這台的歌也能上傳到雲端

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「音樂播放器那裡已經有的檔案要可以上傳雲端 不是只有新加入的才能」
- 選了「也上傳到雲端」以後，還沒有雲端副本的歌，每首旁邊會出現「上傳到雲端」，清單上方也有「把這台已有的 N 首也上傳到雲端」可以一次全傳。傳好的歌會標 ☁，按鈕跟著消失。
- 加歌時沒有存檔案類型，所以從檔案開頭判斷是 WAV、OGG、FLAC、MP4、WebM 還是 MP3。
- 說明文字（四語）加上「原本就有的可以補傳」。
- 檔案：`src/music.js`、`src/devstore.js`、`test/r2.js`。｜資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `r2` 18（先存本機、再切到雲端、一次補傳、在 bucket 裡是 WAV、按鈕消失）、`music`、`cloudui`。
- 補記：上一條的 commit 為 [`b15ec62`](https://github.com/luffysky/cube2/commit/b15ec62)。

## 2026-11-21 18:50（Asia/Taipei）｜雲端檔案先加密再上傳（兩種方式）＋救援碼＋給玩家的說明

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「上傳到雲端有辦法加密嗎 先加密再上傳？」→ 選「兩種都做」；「忘記密碼解不開？沒辦法用驗證碼之類的嗎」；「跟玩家說我們技術跟怎麼加密讓他們可以放心」
- **共通做法**：每個檔案都在玩家的瀏覽器裡，用自己一把隨機的 AES-256-GCM 金鑰先加密才上傳，R2 上只存加密後的資料。檔案開頭有 `ZZE1` 標記；以前沒加密就上傳的舊檔，照原樣讀。
- **預設：金鑰由轉磚保管**：每位玩家一把金鑰，存在新表 `zz.filekeys`，不放 R2。bucket 或下載網址外流也打不開；換裝置照常取回。
- **自己的密碼**：
  - 玩家自己的主金鑰只在瀏覽器裡解開過。伺服器存的是它被鎖兩次的版本：一次用密碼、一次用救援碼，兩把都用 PBKDF2-SHA-256 跑 60 萬次。伺服器打不開。
  - 救援碼是 20 碼、約 100 位元，設定時只顯示一次。忘記密碼就用救援碼重設新密碼；換密碼要先輸入舊密碼。
  - 不用寄信驗證碼：那樣金鑰就得放在伺服器，跟預設方式一樣，不是真的只有玩家能開。
- **給玩家的說明**：雲端設定裡加了「我們怎麼保護你的檔案」五點，四種語言；隱私權政策四語也補上加密的說明。
- 修正：密碼畫面送出時，原本會先重畫畫面才讀欄位，救援碼和舊密碼因此讀到空值；改成先讀欄位再重畫。
- 檔案：`src/cloud.js`、`src/devstore.js`、`src/music.js`、`src/shop.js`、`src/style.css`、`server/files.js`、`server/app.js`、`server/db.js`、`legal/src/privacy.*.html`、`test/api.test.js`、`test/r2.js`。
- 資料庫：新表 `zz.filekeys`、`zz.files` 加欄位 `enc`（都是只新增，不動既有資料）。｜刪除：無。
- 測試：`node test/run.js` 全過（api 394：伺服器金鑰、vault 格式、不會意外覆蓋、`enc`）。瀏覽器 `r2` 30：bucket 裡看不到 WAV、設密碼、救援碼只顯示一次、密碼和救援碼不在伺服器、錯的密碼打不開、救援碼可以隨意大小寫和空格、重設後取回、換密碼要舊密碼。另外 `music`、`cloudui`、`pwa`、`flow`、`consent`、`authui`、`legal` 都通過。
- 補記：上一條的 commit 為 [`7e38f9d`](https://github.com/luffysky/cube2/commit/7e38f9d)。

## 2026-11-22 01:30（Asia/Taipei）｜救援碼：可以重新產生，也可以選擇留信箱代管

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「救援碼如果一開始沒記 給個機會用信箱方式取得吧 然後每個人的救援碼記各自db」；以及「信箱 SnowRealm Games註冊的時候填 到時候會綁一起 但如果沒綁的就只能問了 你給信箱輸入欄再說明用途然後看玩家自己要不要綁」。
- **重新產生**：記得密碼時，可以隨時按「產生新的救援碼」，舊的那組就失效。一開始沒抄到救援碼的人，也有辦法補救。
- **選填的信箱代管**：
  - 救援碼畫面下方多一個信箱欄位，先說明用途：只用來寄回救援碼，不寄廣告、不給別人。也清楚寫出代價：留了信箱，轉磚技術上就拿得到救援碼；不留，就只有你自己能開。
  - 送出前要先輸入寄到信箱的 6 位數驗證碼。驗證碼 15 分鐘失效，最多試 5 次，伺服器只存它的雜湊。
  - 驗證通過後，救援碼才會存進新表 `zz.mailbox`。存的時候用 `ESCROW_KEY` 加密，這把金鑰放在伺服器設定，不在資料庫裡。
  - 救援碼弄丟時，可以按「把救援碼寄到我的信箱」，只會寄到已驗證的那個信箱，而且要用同一份存檔的裝置才能按。
  - 寄信次數限制：每份存檔每小時 3 封、每天 6 封。信箱在畫面上只顯示成 a***@example.com 這樣。
  - 產生新的救援碼時，代管的那份會跟著換成新的。
  - 13 歲以下不提供信箱代管。之後綁定 SnowRealm Games 帳號時，改用帳號的信箱。
- **寄信服務**：用 Resend。要設 `RESEND_API_KEY`、`MAIL_FROM`、`ESCROW_KEY` 三個環境變數才會打開；沒設時一律回 503，畫面顯示「寄信服務準備中」，`/api/health` 的 `mail` 為 false。
- 隱私權政策（四語）補上這一段：信箱是唯一的例外、用途、驗證方式、由轉磚代管、透過 Resend（美國）寄信、保存到你換信箱或刪除存檔為止。給玩家看的保護說明也同步更新。
- 檔案：`server/mail.js`（新）、`server/app.js`、`server/core.js`、`server/db.js`、`src/cloud.js`、`src/devstore.js`、`legal/src/privacy.*.html`、`test/mail.test.js`（新）、`test/r2.js`、`test/run.js`、`test/api.test.js`。
- 資料庫：新表 `zz.mailbox`（`CREATE TABLE IF NOT EXISTS`）。｜刪除：無（刪除雲端存檔時，跟著存檔一起移除）。
- 測試：`node test/run.js` 全過（新增 mail 27 項）。瀏覽器 `r2` 37：說明先出現、驗證碼、寄回救援碼、新救援碼取代舊的、代管的也跟著換。另外 `cloudui`、`pwa`、`consent`、`music`、`authui`、`legal` 都通過。
- 部署：正式站還沒設寄信的那三個環境變數，所以信箱代管目前顯示「寄信服務準備中」。
- 補記：上一條的 commit 為 [`7182f42`](https://github.com/luffysky/cube2/commit/7182f42)，CI run 44926836806 兩個 job 都成功。

## 2026-11-22 19:05（Asia/Taipei）｜staging 接上自己的 Neon 分支

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「好了」（Neon 開好 `staging` 分支，選 schema only、從 main 分出、不自動刪除；Vercel Preview 的 `staging` 分支設好 `STAGING_DATABASE_URL`、`IDENTITY_STAGING`）
- 我只確認了這兩個變數的名稱和範圍：只在 Preview、只給 `staging` 分支，沒有解密值。這次推一個 commit 到 `staging`，讓它用新設定重新部署。
- 檔案：`docs/DEVLOG.md`。｜資料庫：未異動（新分支是 Owner 在 Neon 後台建的）。｜刪除：無。
- 補記：上一條的 commit 為 [`f831e8b`](https://github.com/luffysky/cube2/commit/f831e8b)。staging Preview `dpl_3GZ6yWe2aqDQpedwHSCuQ1j9Vxav` READY；`https://brickduel-staging.snowrealm.pet/api/health?deep=1` 回 `db: true`、`ready: true`（空的資料庫已自動建表）。staging 的排行榜是空的，正式站有玩家，確認兩邊是不同的資料庫。

## 2026-11-22 20:15（Asia/Taipei）｜staging 的部署保護 bypass 已建立

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「好了」（在 Vercel → Deployment Protection 建了 Protection Bypass for Automation，交給 cube1）
- 密碼沒有經過 Claude，也沒有寫進 repo。其他預覽一樣保留 Vercel Authentication；管理 API 照樣要驗 staging 的 admin token。
- `docs/JOINT_ACCEPTANCE.md` 的實測表更新：cube2 端已就緒，A、B 兩組仍是 BLOCKED，等 cube1 的 staging signer 和 Identity。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`b61d9a8`](https://github.com/luffysky/cube2/commit/b61d9a8)。它的 CI run 45020952901：Chrome 那個 job 成功，**`rules, server and sync` 失敗**（`test/bff.test.js` 出現 TypeError），原因和修正見下一條。

## 2026-11-22 20:45（Asia/Taipei）｜修 BFF 測試的偶發失敗；staging 資料庫防呆；A 組驗收工具

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的「繼續 cube2／BRICKDUEL Staging 聯合驗收準備」（先修 CI、確認 staging 管理 API 的啟用條件與資料庫隔離、27 項照實記錄）
- **CI 失敗的原因**：
  - `test/bff.test.js` 每個請求的來源 IP 是在 `203.0.113.1–250` 裡**隨機**挑的。
  - 「限流」那段測試會用 `203.0.113.99` 連續開始 12 次，把這個位址 10 分鐘內的額度用完。
  - 之後的測試（換 host、staging 那一輪）只要隨機剛好挑到 99，開始登入就會回 429。`round()` 拿不到回呼的回應，接著讀 `headers` 就當掉。
  - 本機重現方式：用 `b61d9a8` 的測試檔，把 `Math.random` 固定成會產生 99 的值，就出現同一個 `TypeError: Cannot read properties of undefined (reading 'headers')`。
- **修正**：
  - 每個請求改用依序產生、不會重複的位址（`10.x.y.z`），限流測試另外用一個專用位址 `192.0.2.1`。這樣限流只會在想測它的地方被碰到。
  - 開始登入如果失敗，`round()` 會記成一個失敗的測試項目，附上狀態碼，不再讓後面當掉。
  - 沒有跳過任何測試、沒有吞掉錯誤，也沒有放寬伺服器的檢查。修正後本機連跑 10 次，99 項全過。
- **staging 資料庫防呆（`server/db.js`）**：
  - 如果 `STAGING_DATABASE_URL` 跟正式的資料庫網址相同，或是指向同一個 Neon endpoint（含經過 pooler 的寫法），staging 就當作沒有資料庫，不會連到正式庫。
  - `/api/health` 新增三個欄位：`dbSource`（`main`／`staging`／`staging-missing`／`staging-same-as-main`）、`admin`（管理 API 有沒有啟用）、`build`（部署的 commit）。都不含網址或名稱。
- **A 組驗收工具**：`tools/joint-admin-check.js`。由持有 staging signer 的 cube1 執行，私鑰不離開他們那邊。能自動跑的 A1–A6、A10–A13 都會跑，A7–A9、A14 列出要手動做的步驟，輸出 JSON 報告，不含任何 token 或密碼。在本機 dev-server 用測試金鑰演練過一次，結果都符合預期；這只是演練，不是 staging 實測。
- **staging 管理 API 的啟用條件**寫進 `docs/JOINT_ACCEPTANCE.md`：Preview（`staging` 分支）要設 `BRICKDUEL_ADMIN_TEST_TRUST=1`、`BRICKDUEL_ADMIN_ISSUER`、`BRICKDUEL_ADMIN_JWKS_URL`（後兩個由 cube1 提供），以及 `BRICKDUEL_ADMIN_SUBJECTS=svc:snowrealm-games-admin`。這次沒有設：cube1 還沒有 staging signer，先設只會讓它去抓不存在的 JWKS。
- **27 項聯合驗收**：全部照實記成 BLOCKED，每一項寫明在等 cube1 的什麼（cube1 main `9e9bb50` 的交辦文件也說 staging signer、Identity、測試帳號都還沒部署）。cube2 這邊能確認的另外列一張表。
- 正式站的 `IDENTITY_LINK_ENABLED`、管理 API 白名單都沒動；沒有刪除；日誌不記任何秘密。
- 檔案：`test/bff.test.js`、`server/db.js`、`server/app.js`、`test/staging.test.js`、`tools/joint-admin-check.js`（新）、`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過（bff 99、staging 10、admin 105、api 394）。
- 部署：推到 main 和 `staging`，CI 和部署結果見下一條紀錄。
- 補記：上一條的 commit 為 [`7c2562f`](https://github.com/luffysky/cube2/commit/7c2562f)。CI run 45022748438 **兩個 job 都成功**。
  - 正式站 `/api/health`：`dbSource: "main"`、`build: "7c2562f"`、`admin: false`、`link: false`、`mail: true`（Owner 已設好寄信的三個變數）。
  - staging `/api/health?deep=1`：`dbSource: "staging"`、`db: true`、`ready: true`、`admin: false`、`build: "7c2562f"`。
  - staging `/internal/admin/v1/overview`：503 `{"error":"disabled"}`，`Cache-Control: no-store`。
- 補記：上一條的 commit 為 [`f2af893`](https://github.com/luffysky/cube2/commit/f2af893)，CI run 45023845849 成功。

## 2026-11-22 22:20（Asia/Taipei）｜Staging 聯合驗收：第一階段複查；A 組工具能自己建測試玩家

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的「立即接續 staging 聯合驗收」，對照 cube1 Issue #18
- **第一階段複查**：staging 部署 `dpl_DuPzTTWfaBUD6uL7RkPiv4CwMJiW` 跑的是 `7c2562f`（main `f2af893` 之後只改了文件）。
  - `/api/health`：`db: true`、`dbSource: "staging"`、`admin: false`、`link: false`
  - `GET /api/auth/start` → 405；`/api/auth/callback` → 303 導回首頁並帶 `auth=off`；管理 API → 503 `disabled`
- **cube1 現況**（Issue #18 的留言）：PR #17 到 `898a8b0`，**沒有部署網址、也沒合併**。staging admin 的 issuer 和 JWKS、Identity 的端點、測試帳號都還沒有。所以 Preview 的管理信任這次不設，27 項維持 BLOCKED。
- **`tools/joint-admin-check.js` 加 `SEED=1`**：在 staging 建一個合成測試玩家，再開一次免費寶箱，讓 A1 的 `players/{id}` 和 `draws` 有資料可讀。只允許 staging 或本機，玩家金鑰不印出。在本機演練過，A1 七支全部 200。
- 檔案：`tools/joint-admin-check.js`、`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`2d179b9`](https://github.com/luffysky/cube2/commit/2d179b9)。

## 2026-11-22 22:45（Asia/Taipei）｜修音效、音樂有時沒聲音

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「幫我看一下轉磚 有時候音效音樂會有斷斷續續問題 有時有聲音有時沒有」
- **找到的原因**：
  1. **iPhone、iPad 上的 Safari**：遇到來電、Siri、其他 App 播放聲音、拔掉耳機時，音訊會進入 `interrupted` 狀態。程式原本只在 `suspended` 時重新啟動，所以一進 `interrupted` 就**一直沒聲音**，要重新整理頁面才會恢復。
  2. **瀏覽器把音訊整個關掉**（`closed`，記憶體吃緊或在背景太久時會發生）：程式不會重新建一個，從此都沒聲音。
  3. **手機上的觸控**：瀏覽器只接受「手指離開螢幕」那一下（pointerup、touchend、click）來開啟聲音，按下去那一下（pointerdown）不算。全頁原本只在 pointerdown 時喚醒，所以有時要按到特定按鈕才有聲音。
  4. 切回頁面時，如果音樂在離開期間停掉了，不會自己重新播放。
- **修正（`src/view.js`、`src/ui.js`）**：
  - 只要不是「播放中」就重新啟動，不管是 `suspended` 還是 `interrupted`。
  - 被瀏覽器關掉時，下一次點擊會重建音訊，並重新解碼音效。
  - 音訊狀態一變就馬上試著恢復。
  - 全頁的 pointerdown、pointerup、touchend、click、按鍵都會喚醒聲音；切回頁面（pageshow、focus、visibilitychange）時也會恢復，並把音樂接回來。
- 另外要知道：iPhone 開了靜音鍵時，網頁音效本來就會被系統靜音，這是 iOS 的規則，不是故障。這次沒有改成無視靜音鍵。
- 新增瀏覽器測試 `test/sound.js`（11 項）：第一次點擊就有聲音；被瀏覽器暫停後會自己恢復；觸控點擊會恢復；被關掉後點擊會重建、音效重新解碼；切走再切回有聲音；按鍵會恢復。
- 檔案：`src/view.js`、`src/ui.js`、`test/sound.js`（新）、`test/browser-run.js`。｜資料庫：未異動。｜刪除：無。
- 測試：`node test/run.js` 全過；瀏覽器 `sound` 11、`music` 10、`flow` 60、`pwa` 52、`onehand` 18。
- 補記：上一條的 commit 為 [`805b5c0`](https://github.com/luffysky/cube2/commit/805b5c0)，CI run 45032248909 兩個 job 都成功。

## 2026-11-22 23:05（Asia/Taipei）｜驗收工具加預檢；staging 跟上最新 main；identity-staging 還不存在

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：轉交的「接續 cube2 staging 聯合驗收」（cube1 預定 staging issuer 為 `https://identity-staging.snowrealm.pet`）
- **identity-staging 的實況**：2026-11-22 22:55 查過，這個網域沒有 DNS 紀錄（Vercel 查不到 A 或 CNAME，雲端瀏覽器連線失敗），所以不存在。Preview 的管理信任這次不設，A1–A14 和 B1–B13 維持 BLOCKED。
- **驗收工具加預檢（A0）**：任何寫入（包含 `SEED=1`）或 A 項執行之前，都會先確認：
  - `/api/health?deep=1` 回 `dbSource: "staging"`、`db: true`、`admin: true`
  - 有給 `EXPECT_BUILD` 時，部署版本相符
  - 有給 `ADMIN_JWKS_URL` 時，JWKS 是 https、只有公鑰、全部 Ed25519、而且含 `ADMIN_KID`
  - 不符就停下來，什麼都不做。本機演練了三種情況：沒設管理信任 → 停；版本不符 → 停；全部符合 → 21 項 PASS、4 項列為手動。
- 把 `staging` 分支更新到最新 main，讓 staging 也有這次的音效修正和工具更新。部署結果見下一條紀錄。
- 檔案：`tools/joint-admin-check.js`、`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`fcd6d24`](https://github.com/luffysky/cube2/commit/fcd6d24)，CI run 45035226798 兩個 job 都成功。
  - staging 部署 `dpl_8SyzoRNUnZVkhCKsSq3HgY3Ukbtc`（`fcd6d24`）：`/api/health?deep=1` 回 `db: true`、`ready: true`、`dbSource: "staging"`、`admin: true`、`build: "fcd6d24"`。
  - Owner 在 22:46 已在 Preview（只限 `staging` 分支）設了 `BRICKDUEL_ADMIN_TEST_TRUST`、`BRICKDUEL_ADMIN_ISSUER`、`BRICKDUEL_ADMIN_JWKS_URL`、`BRICKDUEL_ADMIN_SUBJECTS`（只看了名稱和範圍）。正式站仍是 `admin: false`、`dbSource: "main"`。
  - `identity-staging.snowrealm.pet` 還是沒有 DNS，所以 staging 管理 API 遇到帶簽章的呼叫會回 503 `unavailable`，A1–A14 仍是 BLOCKED。
- 補記：上一條的 commit 為 [`caf2071`](https://github.com/luffysky/cube2/commit/caf2071)。

## 2026-11-23 00:05（Asia/Taipei）｜staging 的登入變數（除了 secret 和入口網址）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「這些除了secret跟gpt要給我的其他你幫我設」
- 用 Vercel 設了五個變數，只給 **Preview**、只限 **`staging` 分支**：
  - `IDENTITY_ISSUER` = `https://identity-staging.snowrealm.pet`
  - `IDENTITY_JWKS_URL` = `https://identity-staging.snowrealm.pet/.well-known/jwks.json`
  - `IDENTITY_AUDIENCE` = `snowrealm:brickduel:api`
  - `IDENTITY_STAGING_REDIRECT` = `https://brickduel-staging.snowrealm.pet/api/auth/callback`
  - `IDENTITY_LINK_ENABLED` = `1`
  - 這些都不是秘密。Production 沒有動。
- 還缺兩個要等 GPT：`IDENTITY_STAGING_CLIENT_SECRET`（Owner 自己貼進 Vercel）、`IDENTITY_AUTHORIZE_URL`（staging 登入入口）。少了這兩個，staging 的 BFF 會保持關閉（`/api/health` 的 `link` 是 false，`/api/auth/start` 回 503）。
- 另外 `identity-staging.snowrealm.pet` 目前沒有 DNS，所以就算兩個都補上，驗 token 時也會因為拿不到 JWKS 而拒絕（`unavailable`），不會誤放行。
- 檔案：`docs/DEVLOG.md`、`docs/JOINT_ACCEPTANCE.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`9d76ad2`](https://github.com/luffysky/cube2/commit/9d76ad2)。staging 部署 `dpl_9bCscCvAknLaL1p1yCS8U35pAAuQ`：`dbSource: "staging"`、`admin: true`、`link: false`。

## 2026-11-23 01:25（Asia/Taipei）｜staging 管理信任接上 cube1 真實 admin JWKS

- 專案：cube2｜執行者：Claude
- 關聯指令：cube1 回報 Identity staging 已啟動，請核對 Preview（只限 staging 分支）的管理信任，用真實 Admin JWKS 驗管理 JWT；不建公鑰、不動正式環境。
- 實際打了 cube1 的兩個端點（雲端瀏覽器）：
  - `/.well-known/admin-jwks.json`：一把 Ed25519 公鑰，kid `srstagea_EWW-tM7u8uSnvCwV`，沒有私鑰欄位 `d`。
  - `/.well-known/jwks.json`：玩家用的另一把，kid `srstagep_nmkeJAZFwC5B6-ZJ`。兩把分開，管理 API 不會接受玩家金鑰。
- 發現 `BRICKDUEL_ADMIN_JWKS_URL` 在上次 staging 部署之後被改過，staging 跑的還是舊值。所以把三個管理變數重設為確認過的公開值，並重新部署（push staging）：
  - `BRICKDUEL_ADMIN_JWKS_URL` = `https://identity-staging.snowrealm.pet/.well-known/admin-jwks.json`
  - `BRICKDUEL_ADMIN_ISSUER` = `https://identity-staging.snowrealm.pet`
  - `BRICKDUEL_ADMIN_SUBJECTS` = `svc:snowrealm-games-admin`
  - `BRICKDUEL_ADMIN_TEST_TRUST` 沒動。cube2 沒有存任何公鑰（沒用 `BRICKDUEL_ADMIN_JWKS` 內嵌）。
- A1–A6、A10–A13 改為 PENDING：條件都齊了，但**還沒有任何一次帶 cube1 簽發 JWT 的 staging HTTP 呼叫**，所以一項都不能算 PASS。A7–A9、A14 仍是 BLOCKED（需要 cube1 換鑰、讓 JWKS 暫時失效，以及查 `zz.admin_log`）。
- 正式環境的管理信任、`IDENTITY_LINK_ENABLED`、玩家資料都沒動。
- 檔案：`docs/DEVLOG.md`、`docs/JOINT_ACCEPTANCE.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`1d1e1ca`](https://github.com/luffysky/cube2/commit/1d1e1ca)。staging 部署後 `/api/health`：`build: "1d1e1ca"`、`admin: true`、`dbSource: "staging"`；正式站 `admin: false`、`link: false`、`dbSource: "main"`。

## 2026-11-23 01:45（Asia/Taipei）｜給 cube1 的 A 組執行 workflow

- 專案：cube2｜執行者：Claude
- Owner 轉來 staging 管理私鑰在 cube1 那邊的 secret 名稱：`CUBE2_STAGING_ADMIN_SIGNER_PEM`。
- 私鑰不搬到 cube2（cube2 的 GitHub、Vercel 都不放），改成寫一份 workflow 給 cube1 放進自己的 repo：`docs/handoff/cube1-joint-admin-check.yml`。
  - 手動觸發，checkout 公開的 cube2，把私鑰寫到 runner 暫存檔（權限 600、結束就刪），跑 `tools/joint-admin-check.js`，JSON 報告存成 artifact。
  - kid、issuer、sub、JWKS 網址都填好了；cube1 只要改 Environment 名稱和 bypass secret 名稱。
- 這次只 push main，**沒有**更新 staging，讓 staging 維持 `1d1e1ca`，和 workflow 預設的 `EXPECT_BUILD` 對得上。
- A 組結果不變：還沒有任何實際的 staging 呼叫。
- 檔案：`docs/handoff/cube1-joint-admin-check.yml`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`5d840d1`](https://github.com/luffysky/cube2/commit/5d840d1)（只 push 到 main 時被中斷，本輪一併推上，staging 也更新到它）。

## 2026-11-23 02:40（Asia/Taipei）｜Admin API 聯合驗收 A7–A9、A14 完成，A 組 15 項全 PASS

- 專案：cube2｜執行者：Claude
- 關聯指令：完成 A14 稽核查核，配合 Work 完成 A7–A9 實際 staging HTTP 驗收；不改 cube1 Identity 簽發服務；不動正式站。
- **A14**：在 Neon 主控台的 SQL Editor，只對 `staging` 分支下 SELECT（沒經手資料庫密碼）。64 筆，都是 cube1 那次執行留下的；只有 `at/sub/jti/path/status` 五個欄位；掃描 JWT、私鑰、secret、Authorization 字樣 0 筆。401／405 依規格不寫入資料庫。詳見 `docs/JOINT_ACCEPTANCE.md`。
- **A7–A9**：cube2 用自己兩把測試金鑰，暫時把 staging 的 `BRICKDUEL_ADMIN_JWKS_URL` 指向 `accept-jwks` 分支的 JWKS（一直保留 cube1 的金鑰），分四個階段改 JWKS 內容，從瀏覽器打 staging：
  - A7：新 kid 在 JWKS 生效後 200（扣掉 GitHub CDN 的 5 分鐘快取，cube2 自己 1 分鐘內接受）。
  - A8：移除舊 kid 後，約 10 分鐘快取到期，18:20:32 UTC 起 401。
  - A9：JWKS 檔案刪除後，快取到期，18:35:00 UTC 起連續 503，沒有放行。
- 還原：18:36 UTC 把 `BRICKDUEL_ADMIN_JWKS_URL` 改回 cube1 的 `/.well-known/admin-jwks.json`，並重新部署 staging。
- 已經通過的 A0–A6、A10–A13 改記為 PASS（cube1 Work 17:44 UTC 那次執行，加上稽核表佐證）；GitHub Actions 連結待 cube1 補。
- 正式站的管理信任、帳號綁定、玩家資料都沒動。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：只有 SELECT。｜刪除：無（`accept-jwks` 分支裡的 JWKS 檔案是測試用暫存，刪掉它就是 A9 的故障注入；分支本身留著，要刪等 Owner 同意）。
- 補記：上一條的 commit 為 [`665d983`](https://github.com/luffysky/cube2/commit/665d983)。staging 重新部署後 `build: "665d983"`；用已移除的測試 kid 呼叫得到 401（不是 503），表示已改回讀 cube1 的 JWKS 且讀得到。正式站 `admin: false`、`link: false`、`dbSource: "main"`。測試私鑰已銷毀。

## 2026-11-23 02:55（Asia/Taipei）｜對戰紀錄（各模式、K／D、細項、一頁 20 筆）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「各種模式歷史對戰記錄 包括KDA那些 越詳細越好 可以顯示所有對戰記錄 分頁 一頁20筆 包括日期時間」
- **哪裡看**：選單「對戰」那組多了「對戰紀錄」，個人資料最下面也有按鈕。
- **內容**：
  - 篩選：全部、排位賽、連線對戰、對戰（電腦）、分身對戰、40 行競速。
  - 上方總計：場數、勝／敗／和、勝率、K／D（擊倒／被擊倒）、KD 比、每分鐘攻擊、每秒方塊、最高分、總時間；40 行模式改成完成次數、最佳時間。
  - 每場一列：勝敗、模式、日期時間（玩家所在時區，到秒）、對電腦的難度、連線房間的對手名字、名次（多人房）、組隊、隨機配對、真人排位是否由伺服器核定、K／D。點開看分數、攻擊、每分鐘攻擊、消行、方塊、每秒方塊、T 轉、四行消、最高連擊、道具、時長，以及有沒有落子紀錄佐證。
  - 分頁一頁 20 筆，第一頁／上一頁／下一頁／最後一頁，顯示「第幾頁／共幾頁・共幾場」。
- **伺服器**：新的 `history` 動作，只回自己存檔的場次（保留一年），先算總數再把頁碼限制在範圍內。對手只回顯示名稱，不回任何金鑰或原始紀錄。
- **紀錄變詳細**：每場比賽現在多存 T 轉（mini／特殊）、T 轉三消、四行消、最高連擊和多人房名次（規則前後端一起改，舊的場次這幾欄顯示 0）。
- **還沒有的**：KDA 的 A（助攻）。現在連線時只知道「對手倒了幾次」，不知道是誰送的最後一擊，也不知道誰有幫忙；要加的話，連線訊息要帶上每次攻擊打向誰，屬於下一步。另外，多人房的 K 目前是「所有對手被擊倒的總次數」，不是只算自己打倒的。
- 測試：`test/api.test.js` 加 15 項（權限、只看自己、模式篩選、20 筆分頁與頁碼夾限、勝敗加總、房間對手與名次），410 項全過；新的瀏覽器測試 `test/history.js` 18 項全過（真的打三場、列表、日期時間、展開細項、篩選、三頁分頁、個人資料入口）。
- 檔案：`server/core.js`、`server/app.js`、`server/rules.js`、`src/meta.js`、`src/ui.js`、`src/cloud.js`、`src/shop.js`、`src/style.css`、`src/index.template.html`、`games/drawer-icons.js`、`test/api.test.js`、`test/meta.test.js`、`test/history.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構（只讀既有的 `zz.matches`）。｜刪除：無。
- 補記：上一條的 commit 為 [`eb95050`](https://github.com/luffysky/cube2/commit/eb95050)，CI run 45057008865 兩個 job 都成功。

## 2026-11-23 03:15（Asia/Taipei）｜待辦整理：助攻、四種對線模式、RPG 第一章

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「這些都做」（助攻、新對線模式、RPG 冒險第一章），「現在先寫成一份待辦 commit 所有還沒做的項目」。
- Owner 告知：cube1 已把 Actions #45051087698 補到 Issue #18，A0–A14 共 15 項 PASS，證據來源註明清楚（A0–A6、A10–A13 由 cube1 Actions 驗證；A7–A9、A14 由 Claude 實測）。
- `docs/TODO.md`：新增「接下來要做」三大項的細項；管理 API 改為「staging 已通過、正式站待開」；帳號綁定拆成 staging（B1–B13）與正式兩步；補上 `accept-jwks` 分支待刪。
- 檔案：`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`5df1799`](https://github.com/luffysky/cube2/commit/5df1799)。

## 2026-11-23 03:45（Asia/Taipei）｜帳號綁定 B 組：staging 設定核對、拒絕路徑實測、回呼記錄卡在哪一步

- 專案：cube2｜執行者：Claude
- 關聯指令：立即準備 B1–B13；核對 Preview／staging 的 Identity 設定、找出所有會讓 `link:false` 的缺漏；不依賴登入服務的路徑先實測；正式站 `IDENTITY_LINK_ENABLED`、`admin` 保持關閉。
- 程式：callback 沒成功時，伺服器日誌多記「停在哪一步」（例如 `token 503`、`status 401`、`verify kid`、`nonce`），只有上游的 HTTP 狀態碼或檢查名稱，不含 token 或 secret（新測試 2 項）。
- 詳細核對結果與實測紀錄寫在 `docs/JOINT_ACCEPTANCE.md` 的「B 組準備」。
- 檔案：`server/bff.js`、`server/app.js`、`test/bff.test.js`、`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：staging 建了一個合成測試玩家 `staging-test-b0`；正式站沒動。｜刪除：無。
- 補記：上一條的 commit 為 [`d65c827`](https://github.com/luffysky/cube2/commit/d65c827)。

## 2026-11-23 04:00（Asia/Taipei）｜B1 真實流程：設定生效，停在 cube1 登入頁

- 專案：cube2｜執行者：Claude
- Owner 說已設 `IDENTITY_AUTHORIZE_URL` 與 `IDENTITY_STAGING_CLIENT_SECRET`。核對發現兩個都建在 **Production**（19:51 UTC），staging 讀不到。
  - secret：把 Owner 那筆的範圍改成 Preview／staging（沒有讀值）；我之前的佔位值改停到 `accept-jwks` 分支（那裡不部署，沒人讀），待 Owner 同意再刪。
  - 入口網址：staging 那筆改成 `https://identity-staging.snowrealm.pet/oauth/authorize`（不是秘密）。
  - Production 上還有一筆 Owner 建的 `IDENTITY_AUTHORIZE_URL`，正式站綁定是關的所以沒作用，待 Owner 同意再刪。另外 Production 也有 `BRICKDUEL_ADMIN_*`、`IDENTITY_STAGING`、`STAGING_DATABASE_URL` 的副本，程式在正式站一律不用（`admin: false`、`dbSource: main`），一樣待同意再刪。
- 重新部署 staging `d65c827`：`link: true`、`dbSource: staging`、`ready: true`。假 code 換 token 得到 `token 400`（之前是 401），表示兩邊 secret 一致。
- B1：start（link）200 → cube1 入口頁要 staging 測試帳號登入，帳號密碼不能經過聊天，停在這裡。
- 正式站：`link: false`、`admin: false`，沒有變。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`3eb9ea3`](https://github.com/luffysky/cube2/commit/3eb9ea3)；之後為了讀入 Owner 04:00 更新的變數，只在 staging 重新部署（`e1296ad`，空 commit）。

## 2026-11-23 04:25（Asia/Taipei）｜B1 實測：卡在 cube1 `POST /oauth/authorize`

- 專案：cube2｜執行者：Claude
- staging `e1296ad`：`link: true`、`dbSource: staging`、secret 一致（`token 400`）。
- B1：cube2 start 200 → cube1 登入頁 200 → Owner 用測試帳號 1 送出 → 「授權請求無效」，沒有回到 callback。
- 對照：假帳號送出也是同一句（不是帳密錯誤）；GET 少了 `sso`、`response_type` 就無效，帶齊就顯示登入頁。結論：cube2 的參數被 cube1 GET 接受，失敗在 cube1 的 POST 處理，cube2 不用改。
- cube1 Neon Function 日誌只有 invoke begin／end（20:13:58 那次就是 Owner 的送出），沒有原因；v3 原始碼還沒推到 GitHub，看不到它怎麼判斷。
- B1 記 FAIL（cube1），B2–B12 因 B1 擋住仍是 BLOCKED，B13 維持 PASS。
- 正式站：`link: false`、`admin: false`。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：staging 多了兩個合成測試玩家（`staging-test-b0`、`staging-b1-x`）。｜刪除：無。
- 補記：上一條的 commit 為 [`47d9d29`](https://github.com/luffysky/cube2/commit/47d9d29)。cube1 回報 v4 已修（`Referrer-Policy: no-referrer` 讓 Chrome 送出 `Origin: null`，v4 改成 `same-origin`）；cube2 自己驗過，用不存在的帳號登入，v4 顯示「登入失敗」。

## 2026-11-23 04:40（Asia/Taipei）｜B 組改由 cube1 Work 實際登入

- Owner 指示：測試帳號的密碼在 Work 手上，B1–B12 改由 Work 在瀏覽器實際操作；cube2 負責核對伺服器端證據。
- 新增 `docs/B_GROUP_RUNBOOK_FOR_CUBE1.md`：每一項的操作步驟、預期的 `auth=` 結果、cube2 會核對的伺服器證據，以及交回格式（不含密碼、token、code、cookie）。
- 測試帳號：Work 在 identity-staging 的 Better Auth 建了兩個（03:34，`@example.test`），密碼不在 repo，也沒經過聊天。
- 檔案：`docs/B_GROUP_RUNBOOK_FOR_CUBE1.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`883ffda`](https://github.com/luffysky/cube2/commit/883ffda)。

## 2026-11-23 04:55（Asia/Taipei）｜B 組自動化工具：在 cube1 的 Actions 裡用真瀏覽器跑

- 專案：cube2｜執行者：Claude
- Work 回報 B1–B12 全部 BLOCKED：bypass 只在 cube1 GitHub Actions 的 `staging` Environment，測試帳號的密碼又不在同一個執行環境。
- 新增 `tools/joint-link-check.js`：Playwright Chromium，每個「裝置」是一個獨立的瀏覽器設定檔。實際走 cube1 v4 的登入頁和同意頁，再用 cube2 API 核對結果。
  - 先預檢：staging 資料庫、`link: true`、版本相符；拒絕正式站。
  - 自動跑 B1、B2、B6、B3、B8、B11、B12，B7 要另外開；B4、B5、B9、B10 列為 MANUAL。
  - 報告不含密碼、token、code、cookie、裝置金鑰。
  - 技術細節：Playwright 不會攔截 redirect，所以先不讓同意頁的 POST 自動跟轉，拿到 callback 網址後再自己打開；callback 也不跟轉，直接從 Location 讀出結果字，這樣遊戲頁不會先把一次性的結果讀掉。
- 新增 `test/fixtures/mock-identity-v4.js`：模擬 cube1 v4 的登入、同意（CSRF）、`/oauth/token`（六欄位與 client secret）、帶 nonce 的 Ed25519 token、`/v1/token/status`。
- 新增 `test/linkcheck.js`：用 dev-server 加上這個模擬服務演練工具，19 項全過。包含錯密碼會判 FAIL 而且不印出密碼、拒絕正式站、預檢擋非 staging 資料庫。這是演練，不算 staging 驗收。
- 新增 `docs/handoff/cube1-joint-link-check.yml`，並更新執行手冊。
- 檔案：`tools/joint-link-check.js`、`test/fixtures/mock-identity-v4.js`、`test/linkcheck.js`、`test/browser-run.js`、`docs/handoff/cube1-joint-link-check.yml`、`docs/B_GROUP_RUNBOOK_FOR_CUBE1.md`、`docs/DEVLOG.md`。｜資料庫：未異動。｜刪除：無。
- 補記：上一條的 commit 為 [`8f05d8b`](https://github.com/luffysky/cube2/commit/8f05d8b)。

## 2026-11-23 05:29（Asia/Taipei）｜助攻與個人擊倒（K／D／A）

- 專案：cube2｜執行者：Claude
- 關聯 Owner 指令：「先做我剛剛要你做的那些功能」（助攻、新對線模式、RPG），先做助攻。
- **以前**：多人房的 K 是「所有對手被擊倒的總次數」，分不出是誰打的；沒有助攻。
- **現在**：
  - 每個人收到攻擊時記下「誰、幾行、什麼時候」（原本的攻擊訊息本來就帶發送者座位）。
  - 自己被擊倒時，往前看 15 秒：最後一個送攻擊的人得 K，其他有送的人各得一次 A；都沒人送就沒有人得分。結果用新訊息 `k` 廣播給全房間，舊版頁面收到會直接忽略。
  - 每個人只從這些廣播累計自己的 K 和 A。記錄進對戰紀錄時：`ko` 是自己打倒的、`as` 是助攻、`kr` 是房間裡對手被擊倒的總次數；名次和勝負的算法不變。
  - 1 對 1、對電腦、真人排位：K 仍是對手倒下的次數，助攻是 0，真人排位雙方紀錄核對不受影響。落子證明裡「贏了但 K 比 D 少就不採信」這條，只套用在 1 對 1（多人房看名次）。
  - 對戰紀錄改成顯示 K／D／A 和 KDA（＝（K＋A）÷ D，D 為 0 時算 1），並加說明。舊場次沒有助攻資料，顯示「—」。
- 測試：meta 206 項（含判定 6 項）、API 412 項、三人房真瀏覽器 38 項（A 打的 C 被擊倒 → A 得 K、B 什麼都沒有）、對戰紀錄瀏覽器 18 項。
- 檔案：`src/meta.js`、`src/net.js`、`src/ui.js`、`src/cloud.js`、`server/rules.js`、`server/core.js`、`test/meta.test.js`、`test/api.test.js`、`test/multi.js`、`test/history.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構（`zz.matches.data` 多兩個欄位）。｜刪除：無。
- 補記：上一條的 commit 為 [`eda7967`](https://github.com/luffysky/cube2/commit/eda7967)。

## 2026-11-23 05:33（Asia/Taipei）｜新模式：守塔戰

- 專案：cube2｜執行者：Claude
- 規則（`Meta.TOWER`）：雙方各有一座 100 點的塔。對手每送你 1 行攻擊扣 2 點，你被擊倒一次扣 20 點。塔先倒的人輸；時間到就比塔的高度，一樣高再用原本的規則（擊倒、攻擊、分數）。
  - 兩邊都是用「對方送了幾行」和「自己被擊倒幾次」各自算出同一個數字，所以不用多傳訊息。
- 哪裡玩：
  - 對電腦：對戰設定多一個「守塔戰」開關。
  - 朋友房間：房間模式多一個「守塔戰」，只限兩人房（跟競速一樣）。
  - 隨機配對：多一個「守塔戰」配對池（伺服器也加上），等太久會改成對電腦，一樣是守塔戰。
- 畫面：上方兩邊顯示塔的點數和一條會縮短的血條；結算畫面寫「塔：你 X　對手 Y」；對戰紀錄的標籤顯示「守塔戰」。
- 真人排位不會變成守塔戰（只有普通 2 分鐘、沒道具的對戰才算真人排位）。
- 測試：meta 208 項（塔的算法、哪些模式能開）；新的瀏覽器測試 `test/tower.js` 13 項（對電腦：開關、100／100、被送 10 行剩 80、擊倒電腦它剩 80、它的塔 0 就結束並獲勝、結算顯示塔；兩人房：選模式、對方看到、兩邊開始、送 50 行房主的塔倒，兩邊結果正確）。房間模式從 4 種變 5 種，`test/wxnet.js` 跟著改，24 項全過；`test/quick.js` 13 項全過。
- 檔案：`src/meta.js`、`src/net.js`、`src/ui.js`、`src/modes.js`、`src/cloud.js`、`src/style.css`、`server/rules.js`、`server/core.js`、`test/meta.test.js`、`test/tower.js`、`test/wxnet.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構。｜刪除：無。
- 補記：上一條的 commit 為 [`c663d01`](https://github.com/luffysky/cube2/commit/c663d01)。

## 2026-11-23 05:39（Asia/Taipei）｜新模式：大逃殺

- 專案：cube2｜執行者：Claude
- 規則（`Meta.ROYALE`）：朋友房間 3–8 人，沒有組隊。
  - 被擊倒一次就出局，不會復活。
  - 每 30 秒，每個人底下升起一排消不掉的地板，最多 12 排；牆被推出頂端也算被擊倒。
  - 剩一個人（或沒人）還在時比賽結束。名次：還在的人第一，接著是撐比較久的，中途離開的人最後。
- 幽靈：出局後名牌下方出現「👻 送 1 行」，每 8 秒能送 1 行攻擊給自己選的人。被送的人如果在 15 秒內被擊倒，幽靈可以拿到助攻或擊倒（用前一項的判定）。
- 引擎：新的格子種類 13「地板」（深色石頭加斜紋）。整排都是地板不算消行；`raiseFloor` 會把整面牆往上推，推過頂端就算被擊倒；`floorRows` 回傳目前幾排。連線鏡像也能正確顯示地板。
- 房間：新增模式「大逃殺」，少於 3 人時按鈕變灰並說明原因。選了大逃殺就不分隊。大逃殺沒有重播。
- 對戰紀錄的標籤顯示「大逃殺」。
- 測試：
  - 引擎 89 項，含地板 6 項：會升起、不算消行、推過頂端算擊倒。
  - 新的三人房瀏覽器測試 `test/royale.js` 16 項：兩人時選不了、三人時可選；地板升起；C 出局後不會復活；其他人看到 C 標成「出局」；幽靈送的 1 行送到 C 選的人、按鈕進入 8 秒冷卻；B 出局時 A 在三個畫面上都是贏家；名次是 A、B、C。
  - 房間模式變成 6 種，`test/wxnet.js` 跟著改，24 項全過；`test/multi.js` 38 項全過。
- 檔案：`src/engine.js`、`src/view.js`、`src/net.js`、`src/ui.js`、`src/modes.js`、`src/meta.js`、`src/cloud.js`、`src/style.css`、`server/rules.js`、`server/core.js`、`test/engine.test.js`、`test/meta.test.js`、`test/royale.js`、`test/wxnet.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構。｜刪除：無。
- 補記：上一條的 commit 為 [`452b9fa`](https://github.com/luffysky/cube2/commit/452b9fa)。

## 2026-11-23 05:45（Asia/Taipei）｜新模式：2v2 接力

- 專案：cube2｜執行者：Claude
- 規則（`Meta.RELAY`）：4、6、8 人房，會自動分成兩隊。同一隊共用一面牆輪流放，每人放 8 塊，就把整面牆交給下一位隊友。
- 交接內容：牆、目前的方塊、下一個、暫存、連擊、B2B、統計和還沒落地的攻擊，透過新訊息 `h` 傳給隊友。收到的一方會逐欄檢查（牆的大小、格子值、方塊種類、數字範圍），沒問題才接手。
- 等待的人不能操作，自己的牆會即時顯示正在放的隊友。名牌下方寫「輪到你：還剩 N 塊」或「某某正在放」。
- 送攻擊時，會送給目標那一隊的每個人，但只有正在放的人會真的收下。所以擊倒和助攻判定照常，不會重複扣。
- 被擊倒中不交接，等復活、放下下一塊之後才交出去。接力沒有重播。對戰紀錄的標籤顯示「接力」。
- 測試：新的四人房瀏覽器測試 `test/relay.js` 16 項：3 人時選不了、4 人時可選，分成 2 隊各 2 人，一人放、一人等，等的人按鍵沒反應；放滿 8 塊後隊友接手，接到的牆上正好 8 塊、還能放 8 塊；交出去的人看到是誰在放；攻擊只落在正在放的人身上。房間模式變成 7 種，`test/wxnet.js` 跟著改，24 項全過；`test/multi.js` 38 項、`test/royale.js` 16 項都還是全過。
- 檔案：`src/ui.js`、`src/net.js`、`src/modes.js`、`src/meta.js`、`src/cloud.js`、`src/style.css`、`server/rules.js`、`server/core.js`、`test/relay.js`、`test/meta.test.js`、`test/wxnet.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構。｜刪除：無。
- 補記：上一條的 commit 為 [`e410fab`](https://github.com/luffysky/cube2/commit/e410fab)。

## 2026-11-23 05:51（Asia/Taipei）｜新模式：搶地盤；修一個偶發失敗的測試

- 專案：cube2｜執行者：Claude
- 規則（`Meta.TERR`）：計時器下方有一塊 10 × 6 的共用地盤。
  - 每消 1 行、每送 1 行攻擊，就把 1 格染成自己的顏色：先染空格，空格沒了就搶領先者的（不搶自己的，也不搶隊友的）。
  - 時間到比格數；同格數再用原本的規則。組隊時算全隊的格子，多人房的名次也先比格數。
- 誰說了算：對電腦時由這一頁算（你是 0 號，電腦是 1 號）。連線時由房主保管這塊地盤：其他人消行時送新訊息 `c`（要染幾格）給房主，房主每次改完就用 `T` 把整塊地盤發給所有人，所以每個畫面都一樣。
- 哪裡玩：對戰設定多一個「搶地盤」開關，和守塔戰二選一；朋友房間多一個模式「搶地盤」，2 到 8 人都能選。對戰紀錄的標籤顯示「搶地盤」。
- 修測試：`test/bff.test.js` 檢查 session 表裡「沒有 token」時，原本只找 `eyJ` 三個字，加密後的亂碼偶爾也會剛好出現這三個字，造成偶發失敗。改成找 JWT 的形狀 `eyJ….eyJ`。
- 測試：新的瀏覽器測試 `test/terr.js` 15 項。
  - 對電腦：兩個開關只能開一個；地盤有 60 格；4 行消加送 4 行染 8 格；電腦染它自己的顏色；地盤滿了就搶領先者的；時間到格子多的贏；結算畫面顯示格數。
  - 兩人房：選模式、對方看到；兩邊各自消行之後，兩個畫面的地盤一模一樣；格子多的人在兩邊都是贏家。
  - 房間模式變成 8 種，`test/wxnet.js` 跟著改；多人、大逃殺、接力、守塔戰的測試全都重跑過，全部通過。
- 檔案：`src/modes.js`、`src/ui.js`、`src/net.js`、`src/meta.js`、`src/cloud.js`、`src/style.css`、`server/rules.js`、`server/core.js`、`test/terr.js`、`test/meta.test.js`、`test/wxnet.js`、`test/bff.test.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構。｜刪除：無。

## 2026-11-23 06:10（Asia/Taipei）｜磚之冒險 第一章：窯場（單人 RPG）

- 專案：cube2｜執行者：Claude
- 主選單多一張「磚之冒險」卡，側邊選單也有入口。只能一個人玩，不影響排位，也不影響連線房間。
- 打法：每關一隻怪物。消行和送出的攻擊都會扣怪物血量：消 1／2／3／4 行基本傷害 1／3／5／8，再加上這次送出的攻擊行數。怪物照自己的節奏送水泥過來，畫面上方的長條會顯示血量，還有「幾秒後送幾行」。被擊倒就輸了。
- 職業三種，在冒險地圖上選：
  - 守窯人：怪物每次攻擊少 1 行。技能「窯牆」：8 秒內擋下所有攻擊。
  - 刺客：T 轉傷害加倍。技能「暗刃」：直接造成 12 點傷害，下一次消行傷害也加倍。
  - 法師：技能比較快充滿，6 行就滿，其他職業要 10 行。技能「淨化」：清掉牆底 4 排。
  - 技能靠消行充能，滿了按道具鍵（預設 F）或長條旁的按鈕施放。
- 地圖：10 關，打倒一關才開下一關。怪物血量 16、22、28、36、50、48、56、64、72，首領 140。第 10 關是首領「窯爐之王」，血量 140；血量剩一半時會發怒，攻擊變快，每次也多送 1 行。
- 裝備三件，第一次打倒第 3、6、9 關時各掉一件：
  - 窯火錘：每級傷害 +10%。
  - 釉甲：2 級起怪物攻擊少 1 行，5 級少 2 行。
  - 窯變護符：每級技能少 1 行就充滿，最少 4 行。
  - 每件最高 5 級，強化花 60／120／180／240 金幣。
- 原本待辦寫「把現有道具做成裝備欄位」，實際做成上面這三件專屬裝備，沒有拿現有道具來用。原因：現有道具是對戰用的消耗品，綁進冒險會影響道具經濟，也會讓排位的道具數量被冒險牽動。
- 獎勵：
  - 第一次打倒第 n 關：30 + 10n 金幣；首領 200。整章第一次打完總共 920 金幣，只能拿一次。
  - 已打過的關再打：每次 5 金幣。
  - 排位贏一場大約 60 到 100 金幣，所以冒險不會壓過排位。
- 伺服器怎麼核對：所有規則寫在 `Meta.RPG`，瀏覽器和伺服器跑同一套，存檔只照伺服器算出來的結果。
  - 不能跳關；回報的職業要和存檔裡的一樣；至少要用 3 塊。
  - 每關最少 20 秒，每塊至少 1/3 秒，從「可玩時間額度」扣。回報得比能玩的速度快，就會回 `fast`。
  - 金幣會記進金幣帳。
  - 新建雲端存檔時，裝置上的冒險進度不會帶進來，避免改本機數字直接開到第 10 關或滿級裝備。
- 選單位置：手機上在「練功」標題上方，獨立一張咖啡色卡；電腦和橫拿手機的左右兩欄版面，放在左欄 logo 下方的空位，不會把右欄撐高。
- 順手修好一個舊問題：電腦螢幕比較矮時（例如 1280×720、1366×768），主選單是「上下置中」，內容一超出畫面，頂端的玩家列（名字、金幣、選單鍵）就被切到畫面外，而且捲不上去。之前「一頁放得下」的測試會過，正是因為被切掉的部分沒算進去。現在改成「放得下才置中，放不下就從頂端排」，矮螢幕上的上下留白也收一點，整個選單真的一頁放得下。
- 介面細節：怪物圖示和血條放在牆上方，被打時會跳出傷害數字；首領發怒時圖示會抖動（有開「減少動態」就不抖）。
- 補正：前面五條（助攻、守塔戰、大逃殺、接力、搶地盤）標題時間寫錯了，已改成實際 commit 時間 05:29、05:33、05:39、05:45、05:51。
- 測試：
  - `test/meta.test.js` 加 15 項，全部 227 項通過。內容：不能跳關、職業要一致、首通與重打的金幣、第 3 關掉落、強化的費用和上限、傷害公式、職業和裝備減傷、技能充能、整章 920 金幣、壞掉的存檔會被拉回正常範圍。
  - `test/api.test.js` 加 8 項，全部 420 項通過。內容：裝置上的冒險進度不會被帶進雲端、伺服器擋跳關、擋職業不一致、第 3 關掉錘、沒拿到的裝備不能強化、回報太快會被擋、金幣有記進帳。
  - 新的瀏覽器測試 `test/rpg.js` 20 項。內容：選單入口、地圖只開第 1 關、選法師、4 行造成 12 傷害並充能、怪物定時送 1 行、按 F 施放技能清掉 4 排、打倒後伺服器確認 40 金幣、首領半血發怒、被擊倒算輸而且進度不變、回地圖後第 2 關打開、選單顯示 1/10。
  - 主選單和側邊選單多了一個入口，`test/drawer.js` 的模式數從 10 改成 11，28 項全過；`rwd` 258 項（19 種螢幕大小）、`flow` 60 項、`onehand`、`howto` 和全部單元測試也重跑過，都通過。
- 檔案：`src/rpg.js`（新）、`src/meta.js`、`src/ui.js`、`src/index.template.html`、`src/style.css`（含選單置中的修正）、`games/drawer-icons.js`、`build.js`、`server/rules.js`、`test/rpg.js`（新）、`test/meta.test.js`、`test/api.test.js`、`test/i18n.test.js`、`test/drawer.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構，冒險進度放在原本的存檔欄位裡。｜刪除：無。
- 補記：上一條的 commit 為 [`f3cfe10`](https://github.com/luffysky/cube2/commit/f3cfe10)。

## 2026-11-23 06:57（Asia/Taipei）｜整體升級第一批；磚之冒險改成奇幻主題、各職業有自己的裝備

- 專案：cube2｜執行者：Claude
- 磚之冒險（林董：「不同角色不是應該不同裝備嗎」「為什麼要跟陶瓷有關，感覺怪怪」）：
  - 主題改成一般奇幻。第一章改名「迷霧森林」，怪物依序是史萊姆、哥布林、毒菇怪、吸血蝙蝠、灰狼、樹人、毒蛇、食人花、森林幽靈，首領是黑龍。選單卡改成綠色。
  - 職業改名：守窯人改成騎士。刺客、法師名稱不變。技能充滿所需行數：騎士 10、刺客 8、法師 6。
  - 每個職業有自己的三件裝備：
    - 騎士：騎士長劍（所有傷害每級 +10%）、鐵盾（1 級少 1 行、4 級少 2 行，另外騎士本身每次就少 1 行）、守護項鍊（「鐵壁」每級多 1.5 秒）。
    - 刺客：雙匕首（T 轉每級 +25%，其他 +5%）、皮甲（2 級少 1 行、5 級少 2 行）、影之斗篷（「暗殺」每級多 4 點傷害）。
    - 法師：法杖（四行消每級 +25%，其他 +5%）、法袍（3 級起少 1 行）、魔力寶珠（技能每級少 1 行就滿，最少 3 行）。
  - 解鎖與強化：第一次打倒第 3、6、9 關時，三個職業的那一格會一起解鎖。強化則是各職業分開算，費用不變。
  - 地圖上顯示的是目前所選職業的裝備；換職業，裝備欄就跟著換。
  - 舊存檔：上一版三個職業共用一套裝備，那套等級會複製給每個職業。存檔整理時，還沒打倒的那一關對應的格子會保持鎖住。
  - 怪物血量依序改成 16、22、28、36、50、48、56、64、72，首領 140；前幾關攻擊也放慢一點。
    - 這組數字是用電腦對手當玩家實際模擬出來的：
      - 每秒 0.8 塊的入門程度：第 1 關都打得過，第 3 關大多打得過。
      - 每秒 1 塊、沒有裝備：卡在第 9 關。強化到滿級後，第 9 關大多打得過，黑龍偶爾打得過。
      - 每秒 1.2 塊的熟練程度：連黑龍都穩過。
    - 也就是說，裝備強化確實有用，首領要有點實力才打得贏。
- 整體升級：
  - 修舊問題：寬螢幕主選單最下面，簡介文字跟「隱私政策、服務條款」兩個連結疊在同一格，互相蓋住。現在連結移到簡介的右邊。
  - 隨機配對多了「搶地盤」，兩個都選搶地盤的人會配在一起打。守塔戰原本就有。
  - 最近加的東西掛上紅色「新」標籤：主選單的磚之冒險、對戰（裡面有守塔戰、搶地盤開關）、連線對戰（新的房間模式），還有側邊選單的對戰紀錄。點開一次就消失；12 月 14 日以後全部不再顯示。
  - 「操作與規則」多了一段「玩法一覽」，寫清楚每個新模式在哪裡玩、能不能跟電腦打、要幾個人：守塔戰、搶地盤、大逃殺、2v2 接力、磚之冒險、助攻。這是因為林董以為新模式都是跟電腦打。
- 測試：
  - `test/meta.test.js` 233 項，冒險部分改寫。內容：各職業三件不同、解鎖時三職業一起開、強化只算該職業、三種武器各自的加成、護甲表、技能充能、項鍊和斗篷的效果、存檔整理不會提前開格、舊存檔的裝備會複製到三個職業。
  - `test/api.test.js` 420 項。伺服器端也照新規則：第 3 關三個職業一起開武器格，強化只算那個職業。
  - `test/rpg.js` 22 項。多了兩項：新標籤的出現和消失，地圖顯示所選職業自己的裝備。
  - `test/terr.js` 16 項，多一項：兩人在隨機配對都選搶地盤，會配在一起打。
  - 版面、頁尾、側邊選單的瀏覽器測試都重跑過。
- 檔案：`src/meta.js`、`src/rpg.js`、`src/i18n.js`、`src/ui.js`、`src/modes.js`、`src/net.js`、`src/index.template.html`、`src/style.css`、`server/core.js`、`test/meta.test.js`、`test/api.test.js`、`test/rpg.js`、`test/terr.js`、`docs/DEVLOG.md`。｜資料庫：沒有改結構。｜刪除：無。
- 補記：上一條的 commit 為 [`e271536`](https://github.com/luffysky/cube2/commit/e271536)。

## 2026-11-23 07:14（Asia/Taipei）｜新遊戲：地城小隊（2–4 人合作地城，跟方塊無關）

- 專案：cube2｜執行者：Claude
- 林董要求：「多人遊戲那裡也加點別的遊戲，不用再跟俄羅斯方塊有關，可以試試做個小型 RPG」。
- 林董選定：合作地城、獨立頁面加兩個入口、先不給金幣。
- 在哪裡：
  - 新頁面 `games/dungeon/`。
  - 遊戲總覽頁多一區「多人一起玩」。
  - 磚塊遊戲的側邊選單也有入口。
  - 轉磚的「連線對戰」最下面多了「其他多人遊戲 → 地城小隊（新）」。
- 怎麼玩：
  - 一人開房間，拿到 5 碼代碼（也可以複製邀請連結），朋友輸入代碼加入，最多 4 人。
  - 每人選職業：
    - 戰士：血最厚。「挑釁」：兩回合內怪物只打他。
    - 弓手：最快、攻擊最高。「連射」：射 3 箭。
    - 法師：「火球」：打全部怪物。
    - 牧師：「治療」：補隊友血，也能把倒下的隊友救起來。
  - 每回合大家同時選「攻擊／技能／防禦」，全部選好就一起行動：英雄照速度先動，再輪到怪物。每回合 30 秒，沒選的人自動防禦，所以不會因為有人發呆卡住。
  - 一共 5 層，依序是：史萊姆；哥布林和蝙蝠；骷髏兵和骷髏弓手（會打血最少的人）；魔狼和獸人；第 5 層地城魔王。
    - 魔王每 3 回合對全隊噴黑焰，血剩一半會發怒；4 人隊時每回合行動兩次。
  - 每過一層，每人從 3 個強化裡挑 1 個（血、攻擊、防禦、魔力、全滿）。下一層會回一些血和魔力，倒下的人也會站起來。全員倒下就輸。
  - 也可以「一個人先玩」，不用開房間。
- 人數平衡：隊伍越小，怪物越少越弱，一個人最多同時兩隻。
  - 數值是用電腦隊伍各打 120～200 局調出來的。
  - 職業搭配均衡的 4 人隊勝率約 9 成；只有攻擊型的兩人隊、或四個同職業，大約一半。
  - 這幾個範圍寫進了測試，之後改數值時若跑出範圍外，測試會失敗。
- 連線：
  - 用的是轉磚原本的房間（同一個 `/api/room`，伺服器沒有改）。房主的頁面保存遊戲並跑規則；其他人只送「我選了什麼」，房主每次有變化就把整個狀態發回去。
  - 收到的狀態會逐欄檢查（`DG.clean`），格式不對就丟掉。
  - 別人只看得到你「已選」，看不到你選了什麼。
  - 超過 20 秒沒收到某人的消息，就標成「離線」，他的角色每回合自動防禦。
  - 房主離開，其他人會看到「房主離開了」。
  - 如果輸入的是轉磚的房間代碼，會說明那是轉磚的房間。
- 獎勵：照林董選的，先不給轉磚金幣，不碰存檔或伺服器的帳務。
- 測試：
  - 新的規則測試 `test/dungeon.test.js` 31 項。內容：選擇的檢查、回合結算、各技能（火球、挑釁、救人）、過關與強化、全滅、魔王發怒與噴火、4 人隊時行動兩次、收到的狀態檢查與 10 種壞資料、狀態大小一封信放得下、勝率範圍。
  - 新的瀏覽器測試 `test/dungeon.js` 28 項，三個瀏覽器一起玩：
    - 開房間、用小寫代碼也能加入、大廳看到全隊、只有房主能開始、換職業會同步。
    - 回合會等所有人選好，三個畫面的怪物和血量都一樣。
    - 時間到沒選的人自動防禦。
    - 過關三選一，全員選完進第 2 層。
    - 房主離開時，其他人會被通知。
    - 一個人玩、輸了可以再來。
    - 錯的代碼會提示。
    - 轉磚「連線對戰」和遊戲總覽頁都有入口。
  - `test/bricks.js` 的遊戲數從 10 改成 11；`gameslang`、`drawer`、`cloudui` 和翻譯測試都通過。
- 檔案：`games/dungeon/index.html`、`games/dungeon/rules.js`、`games/dungeon/dungeon.js`、`games/dungeon/dungeon.css`（都是新的）、`games/index.html`、`games/nav.js`、`src/games-dict.js`、`src/modes.js`、`src/style.css`、`build.js`、`test/dungeon.test.js`、`test/dungeon.js`、`test/run.js`、`test/browser-run.js`、`test/bricks.js`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構，也沒有新的資料。｜刪除：無。
- 補記：上一條的 commit 為 [`775619f`](https://github.com/luffysky/cube2/commit/775619f)。

## 2026-11-23 10:08（Asia/Taipei）｜第一次進來就取名字

- 專案：cube2｜執行者：Claude
- 林董：「轉磚一開始進來就給他們取名字好了」。
- 流程：第一次進來先看完「開始之前」（條款、地區、年齡），接著跳出「幫自己取個名字」。
  - 名字欄已經先填好一個隨機名字，按「就用這個」就好；不喜歡可以按「換一個」，或自己打。按 Enter 也能送出。
  - 隨機名字照語言產生，例如「閃電疊疊樂」「SwiftMason42」，最多 12 個字。
- 會擋的情況：空白的名字不收；不能用的名字（例如被過濾的字）會說明原因、讓玩家重取。
- 用其他方式關掉（例如按 Esc）時，會保留當下顯示的那個名字，不會變成沒名字。
- 什麼時候不問：
  - 未滿 13 歲：本來就沒有公開名字，所以不問。
  - 已經有名字的玩家（包括從別的裝置帶過來的）不問。
  - 從邀請連結進來時，先處理房間。
  - 同一台裝置只問一次。
- 已經同意過條款、但還沒取名字的老玩家，下次進來時會問一次。
- 測試：新的瀏覽器測試 `test/naming.js` 15 項，涵蓋上面的流程、擋名字、按 Esc 保留名字、不問的幾種情況，以及英文介面產生英文名字。`consent` 31 項、`flow` 60 項也重跑過，全過。
- 檔案：`src/consent.js`、`test/naming.js`、`test/browser-run.js`、`docs/DEVLOG.md`。｜資料庫：沒有改。｜刪除：無。
- 補記：上一條的 commit 為 [`8b98711`](https://github.com/luffysky/cube2/commit/8b98711)。

## 2026-11-23 10:23（Asia/Taipei）｜好友功能（加好友＋邀請一起玩）；名字擲骰子

- 專案：cube2｜執行者：Claude
- 林董：「再加上新增好友功能」，範圍選的是「加好友＋邀請一起玩」；另外說「名字可以用那種骰子隨機」。

### 好友

- 入口：
  - 主選單下面一排連結多了「好友」，有人申請時旁邊亮紅點。
  - 側邊選單「對戰」區也多了「好友」。
  - 有「新」標籤，點開一次就消失。
- 好友碼：就是排行榜上那組 8 碼公開代碼，在好友頁顯示（大寫）。可以複製「加好友連結」，網址帶 `?friend=代碼`，朋友點開，好友頁就打開並填好代碼。
- 加好友：
  - 輸入朋友的好友碼送出申請（大小寫、空白、連字號都可以），對方在「收到的申請」按同意就成為好友。
  - 兩邊都主動加對方，也算同意。
  - 好友最多 100 位。每小時最多送 30 次申請。
- 結束好友關係：
  - 拒絕、取消自己送出的申請、移除好友，都在同一頁。移除好友會再問一次「確定移除？」。
  - 被移除或被拒絕的一方，一天內不能再送申請，避免一直騷擾。
- 好友名單：
  - 只顯示名字、等級、是否在線上（綠點），不在線上時顯示「幾分鐘／小時／天前」。
  - 「在線上」的意思是：遊戲頁面開著、在最前面，每 30 秒會跟伺服器報到一次。
  - 還沒同意的申請，看不到對方是否在線上。
- 邀請一起玩：
  - 在轉磚開了房間（等人加入，或房間還有空位）時，有「邀請好友」按鈕。好友頁每位好友旁邊會出現「邀請」。
  - 好友的遊戲畫面上方會跳出卡片「某某 邀你一起玩轉磚」，按「加入」直接進房間，「忽略」就不再顯示。
  - 正在打比賽時不跳卡片，打完才出現。
  - 邀請 10 分鐘後失效。每小時最多送 60 次邀請。只有好友之間能互邀。
- 地城小隊：
  - 大廳多一區「邀請好友」，列出在轉磚加的好友（在線上的排前面），一按就送。
  - 好友不論在轉磚或地城小隊的開始畫面都會收到；從轉磚按加入，會開地城小隊頁面並自動進房。
- 未滿 13 歲：沒有好友功能，好友頁只說明原因。和連線對戰同一條規則，避免跟陌生人接觸。
- 伺服器：
  - 新資料表 `zz.friends`：每一對好友一列，記錄狀態是申請中、好友或已結束。
  - 新資料表 `zz.invites`：每一對好友只留最新一筆邀請。
  - `zz.players` 新增 `live` 欄位，記錄最後報到時間。
  - 第一次用到時自動建立，跟其他資料表同一套方式，只新增，不改也不刪舊資料。
  - 新的 RPC：`fr`（名單和邀請）、`frAdd`、`frDrop`、`frInv`。
  - 玩家刪除存檔後，名單裡就看不到他；等存檔真正清除時，好友資料跟著一起清掉（沿用原本的刪除規則）。
- 給 Owner 的說明：結束好友關係時，程式只把那一列標成「已結束」，沒有真的刪掉資料，因為「刪除需事先核准」。要不要定期清掉已結束的好友關係，由 Owner 決定，目前沒有做。

### 名字擲骰子

- 第一次進來的取名畫面、個人資料的名字欄、地城小隊的名字欄，旁邊都有 🎲。按一下就會轉一圈，換一個隨機名字；有開「減少動態」就不轉。
  - 取名畫面原本的「換一個」按鈕，改成這顆骰子。
  - 個人資料擲出來的名字會直接存起來。
- 地城小隊沒有名字的人，一進來就先擲好一個。

### 順手修好的問題

- 地城小隊開房間時，如果伺服器回得比較慢（超過 0.4 秒），房主會被自己的「跟房主斷線」檢查誤判而踢出房間。現在這個檢查只用在已經進房的其他人身上。

### 測試

- `test/api.test.js`：好友 26 項，全部 443 項通過。資料表數從 24 改成 26。內容：
  - 好友碼是公開代碼、不能加自己、找不到的代碼、格式不對。
  - 送出與收到申請（還沒同意時看不到對方是否在線上）、互加成為好友、在線上與「幾分鐘前」。
  - 好友邀請、只能邀那兩款遊戲、陌生人不能邀、邀請 10 分鐘後失效。
  - 移除後兩邊名單都消失、被移除的一方一天內不能再送、一天後可以。
  - 每一對只有一列。沒有存檔不能用。
- 新的瀏覽器測試 `test/friends.js` 24 項，四到六個瀏覽器一起跑：
  - 好友碼顯示、送申請、紅點、同意、兩邊都在線上。
  - 開房間邀請、對方從卡片一鍵進房。
  - 移除要確認、兩邊都消失。
  - 好友連結自動填代碼、未滿 13 歲看不到。
  - 地城小隊大廳邀請、對方從開始畫面一鍵加入。
- 其他：`test/naming.js` 16 項（多了骰子和個人資料的骰子）、`test/dungeon.js` 29 項（多了骰子）；單元測試全部、`rwd`、`drawer`、`multi`、`wxnet`、`quick`、`terr`、`cloudui`、`consent`、`gameslang`、`bricks`、`rpg` 都重跑過。
- 檔案：`src/friends.js`（新）、`src/cloud.js`、`src/consent.js`、`src/shop.js`、`src/modes.js`、`src/ui.js`、`src/i18n.js`、`src/style.css`、`src/index.template.html`、`src/games-dict.js`、`games/drawer-icons.js`、`games/dungeon/index.html`、`games/dungeon/dungeon.js`、`games/dungeon/dungeon.css`、`server/db.js`、`server/core.js`、`server/app.js`、`build.js`、`test/friends.js`（新）、`test/api.test.js`、`test/naming.js`、`test/dungeon.js`、`test/i18n.test.js`、`test/browser-run.js`、`docs/TODO.md`、`docs/DEVLOG.md`。
- 資料庫：新增兩張表和一個欄位（上面說的三項）。沒有刪除任何東西。
- 補記：上一條的 commit 為 [`af77b9e`](https://github.com/luffysky/cube2/commit/af77b9e)。

## 2026-11-23 10:32（Asia/Taipei）｜已結束的好友紀錄改成一天後刪除

- 專案：cube2｜執行者：Claude
- 林董回覆「已結束的好友關係要不要定期清掉」：「好 就刪」（記為 Owner 決定 C-040）。
- 做法：
  - 被拒絕、被取消、被移除的好友紀錄，先保留一天。這一天是用來擋住被拒絕的一方立刻再送申請。
  - 一天後，由每天跑一次的排程（`/api/cron`，原本清理已移除雲端檔案的那支）把它刪掉，兩人之間剩下的邀請也一起刪。
  - 還是好友的、還在等對方同意的申請，都不會被動到。
  - 排程回應多一欄 `friends`，寫這次刪了幾筆好友紀錄和幾筆邀請。
- 範圍：只刪這兩種資料，其他排程原本「只計數不刪」的項目（管理稽核紀錄、登入暫存）維持原樣。
- 順手補記：今天的三項 Owner 決定寫進 `docs/OWNER_DECISIONS.md`：C-038 地城小隊、C-039 取名字＋好友＋骰子、C-040 這一項。
- 測試：`test/api.test.js` 多 2 項，全部 445 項通過。
  - 結束未滿一天：不刪，因為還要擋再次申請。
  - 過一天：那一筆和兩人之間的邀請都刪掉，還在的好友留著。
- 檔案：`server/core.js`、`server/app.js`、`test/api.test.js`、`docs/OWNER_DECISIONS.md`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有改結構；排程每天刪除已結束超過一天的好友紀錄。
- 補記：上一條的 commit 為 [`7a15cd7`](https://github.com/luffysky/cube2/commit/7a15cd7)。

## 2026-11-23 20:01（Asia/Taipei）｜B 組第一次實跑的覆核；修 B7（登入流程的 cookie 太早消失）

- 專案：cube2｜執行者：Claude
- cube1 Work 回報 Actions 45167007292：7 項通過、B7 失敗、B4／B5／B9／B10 未執行。
- 覆核：沒有直接採用報告，而是用三份證據逐項對過。
  - Actions 日誌裡的完整 JSON 報告。artifact 下載不到，因為儲存主機不在本環境的允許清單裡，但內容和日誌相同。
  - Vercel staging 的伺服器日誌。
  - staging 資料庫的一次唯讀 SELECT，透過 Neon 主控台，在 `staging` 分支上執行。
  - 三者一致。B1、B2、B3、B6、B8、B11、B12 標為 PASS，每一項都寫上時間和證據。細節見 `docs/JOINT_ACCEPTANCE.md` 的「B 組第一次實跑」。
- B7 失敗的原因在 cube2：
  - 登入流程的 cookie 只活 10 分鐘，和 session 一樣長。玩家超過 10 分鐘才回來時，瀏覽器已經把 cookie 丟了，伺服器只能回「沒有 session」，認不出「過期」。
  - 安全上沒有問題（沒有綁定，資料庫也確認了），只是提示錯了。
  - 修法：cookie 改成 30 分鐘，session 仍然 10 分鐘就失效。
  - 本機測試之前沒抓到，因為測試是手動把 cookie 帶回去。現在多一項檢查：11 分鐘時 cookie 還在，30 分鐘內消失。
- B4、B5、B9、B10 要靠 cube1 那邊的測試開關，cube2 自己做不到。驗收工具改了兩處：
  - 新增 `SWITCH`：cube1 打開某一項的開關後，只跑那一項，用帳號 2 在新存檔上連結，檢查結果並確認沒有綁定。
  - 新增 `CASES`：只跑指定的幾項，例如重跑 B7。
  - 本機替身 Identity 也加了這四個開關。演練時四項都通過；開關沒開時工具會判 FAIL。
- 給 cube1 的文件：
  - `docs/handoff/cube1-joint-link-check.yml` 多了 `cases`、`switch`、`switch_note` 三個輸入。
  - `docs/B_GROUP_RUNBOOK_FOR_CUBE1.md` 加了第二輪的做法。
- 部署：修好的版本推到 `main`，也推到 `staging` 分支，讓 cube1 用新版本重跑 B7。正式站的 `IDENTITY_LINK_ENABLED` 和 admin 仍是關的。
- 測試：
  - `test/bff.test.js` 102 項，多 1 項 cookie 壽命檢查。兩處預期值從 600 秒改成 1800 秒。
  - `test/linkcheck.js` 25 項，多 5 項：只跑指定項、四個開關各一、開關沒打開時判 FAIL。
- 檔案：`server/bff.js`、`tools/joint-link-check.js`、`test/fixtures/mock-identity-v4.js`、`test/linkcheck.js`、`test/bff.test.js`、`docs/JOINT_ACCEPTANCE.md`、`docs/B_GROUP_RUNBOOK_FOR_CUBE1.md`、`docs/handoff/cube1-joint-link-check.yml`、`docs/DEVLOG.md`。｜資料庫：沒有改，也沒有寫入，只做了一次唯讀查詢。｜刪除：無。
- 補記：上一條的 commit 為 [`a531578`](https://github.com/luffysky/cube2/commit/a531578)。

## 2026-11-23 20:42（Asia/Taipei）｜B7 重跑通過；B4、B5、B9、B10 等 cube1 的故障開關

- 專案：cube2｜執行者：Claude
- cube1 Work 回報：B7 用 `90295f0` 重跑通過（Actions 45171423771）；新版 workflow 已同步到 cube1 的 `main` 和 `staging/cube2-smoke`；B4、B5、B9、B10 沒有跑，因為 Identity staging v5 沒有故障開關。
- 覆核：
  - Actions 日誌裡的報告：B0 通過，build 是 `90295f0`；B7 得到 `expired`，也確認沒有綁定。
  - Vercel staging 日誌：12:19:27 有一筆 `[zz] auth expired`。
  - staging DB：做了一次唯讀查詢，那一次登入流程的結果是 `expired`，合成存檔 `hekzzsc2` 沒有連結。
  - B7 由 FAIL 改為 PASS。
- 標記結果：
  - B 組現在 9 項 PASS：B1、B2、B3、B6、B7、B8、B11、B12、B13。
  - B4、B5、B9、B10 維持 BLOCKED，原因寫清楚了：cube1 沒有開關，所以沒有紀錄，也沒有開關時間。
  - 照規則，沒有真的打過 staging 的項目不標 PASS。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：沒有改，只做唯讀查詢。｜刪除：無。
- 補記：上一條的 commit 為 [`90295f0`](https://github.com/luffysky/cube2/commit/90295f0)。

## 2026-11-23 21:21（Asia/Taipei）｜B4、B5、B9、B10 用隔離測試 Identity 實跑通過

- 專案：cube2｜執行者：Claude｜Owner 指示：「好 做吧」（自建隔離 Identity、自己開關、自己跑）
- 隔離測試 Identity：新 Vercel 專案 `cube2-test-identity`，網址 `https://cube2-test-identity.vercel.app`，程式 `tools/test-identity/`。
  - 回應方式照 cube1 Identity staging v4。自己的 issuer、Ed25519 測試金鑰、測試 client secret、兩個合成帳號（按鈕選，沒有密碼）。
  - 金鑰與 secret 在沙盒新產生，只放進 Vercel sensitive 環境變數；沒有進 repo、聊天或日誌。cube1 的東西都沒用到、沒改到。
  - 開關 `TID_SWITCH`（B4／B5／B9／B10，其他值為關），切換＝改環境變數＋重新部署，以 `/health` 為準。
  - 本機先演練：替身 HTTP 版搭配 dev server 和 `tools/joint-link-check.js`，四個開關都得到預期結果，關掉開關時工具判 FAIL。演練中發現 code 必須是 43 字元（cube2 會擋其他長度），改成用授權內容做 HMAC。
- 隔離的 cube2 部署：分支 `accept-b`（先用不部署的佔位提交建分支，設好環境變數後換成 main 的 `1a12cb8`）。只有這個分支指向測試 Identity。
  - `STAGING_DATABASE_URL` 的分支範圍 20:58:44 暫改為 `accept-b`，21:00:05 改回 `staging`；沒有讀或改它的值。
  - `/api/health`：`dbSource: staging`、`link: true`、`admin: false`、build `1a12cb8`。
- 實跑（在 Owner 的 Chrome，時間 UTC）：
  - 對照組（開關關）13:09:38：`linked`。
  - B4（開 13:11:14，生效 13:11:36）→ `token`，日誌 13:12:02 `[zz] auth token (nonce)`。
  - B5（開 13:12:24，生效 13:12:46）→ `token`，日誌 13:13:11 `token (nonce)`。
  - B9（開 13:13:27，生效 13:13:53）→ `revoked`，日誌 13:14:15 `revoked (status 200)`。
  - B10（開 13:14:27，生效 13:14:53）→ `unavailable`，日誌 13:15:22 `unavailable (status 503)`。
  - 關閉 13:15:36，13:16:05 `/health` 為 `none`。
  - staging DB 唯讀查詢：四份存檔都沒有連結、session 結果與上面一致；兩個測試帳號只有對照組那 1 筆連結。
- 標記：B4、B5、B9、B10 → PASS（隔離環境）。文件寫明對象是 cube2 自建的測試 Identity，不是 cube1 的 Identity staging。
- 測試：新增 `test/tid.test.js` 28 項（流程、拒絕路徑、四個開關），加進 `test/run.js`。
- 檔案：`tools/test-identity/`（3 個檔）、`test/tid.test.js`、`test/run.js`、`docs/JOINT_ACCEPTANCE.md`、`docs/TODO.md`、`docs/DEVLOG.md`。
- 資料庫：沒有改結構；`accept-b` 在 staging DB 留下 5 份合成存檔（`acceptb-*`）、1 筆合成連結和 5 個登入 session，都是測試資料。正式站與正式資料庫沒有碰。
- 刪除：無。待 Owner 同意：`accept-b` 分支、它的 8 個環境變數、`cube2-test-identity` 專案。
- 補記：上一條的 commit 為 [`1a12cb8`](https://github.com/luffysky/cube2/commit/1a12cb8)。

## 2026-11-23 21:32（Asia/Taipei）｜收掉 B4、B5、B9、B10 的隔離環境

- 專案：cube2｜執行者：Claude｜Owner 指示：「好 刪」
- 刪除（都經 Owner 同意）：
  - cube2 專案裡 `accept-b` 分支專用的 8 個環境變數（Vercel 後台逐一確認 Key 與分支後刪除；之後用 API 查 `accept-b` 分支為空，`staging` 分支 13 個變數、正式站變數都還在）。
  - GitHub 分支 `accept-b`（沙盒的 git 代理不允許刪分支，改在 Owner 的 Chrome 用 GitHub 網頁刪；`git ls-remote` 確認已不存在）。
  - Vercel 專案 `cube2-test-identity`，連同它的部署、測試金鑰與 secret（API 查詢回 404）。沙盒裡暫存的測試金鑰檔也刪了。
- 留著的：cube2 專案裡那一個 `accept-b` 部署（受登入保護，它信任的測試 Identity 已不存在）、staging DB 裡 5 份 `acceptb-*` 合成存檔。要不要刪等 Owner。
- 確認：staging `/api/health` 仍是 `link: true`、`admin: true`、`dbSource: staging`；正式站 `link: false`、`admin: false`、`dbSource: main`。
- 正式站的帳號綁定還不能開：
  - cube1 正式 Identity `identity.snowrealm.pet` 目前連不上（Chrome 開 `/.well-known/jwks.json` 是瀏覽器錯誤頁）。
  - cube2 正式站還沒有 `IDENTITY_ISSUER`、`IDENTITY_JWKS_URL`、`IDENTITY_AUDIENCE`、`IDENTITY_BRICKDUEL_CLIENT_SECRET`，`IDENTITY_LINK_ENABLED` 也沒有開。
  - 依規則要先在正式站用兩個帳號跑一次端對端驗收，Owner 核准後才開 `IDENTITY_LINK_ENABLED`。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有動。
- 補記：上一條的 commit 為 [`ab1e3e1`](https://github.com/luffysky/cube2/commit/ab1e3e1)。

## 2026-11-23 21:36（Asia/Taipei）｜刪掉 accept-b 舊部署；記下正式站綁定的授權

- 專案：cube2｜執行者：Claude｜Owner：「我授權給你做」（C-041）
- 刪除：cube2 專案裡的 `accept-b` 部署 `dpl_EddMGiDnxyDLJ26DWKjy5raYvZ8j`（在 Owner 的 Chrome 從 Vercel 後台刪除，先核對是 Preview、`accept-b` 分支、`1a12cb8`；API 查詢回 404；Vercel 1 天內可復原）。
- 正式站綁定：記為 C-041。等 cube1 正式 Identity 上線後由 Claude 做設定和兩帳號驗收，通過才開 `IDENTITY_LINK_ENABLED`；正式 client secret 仍由 Owner 自己貼。現在 `identity.snowrealm.pet` 連不上，所以還不能開始。
- 沒刪：staging DB 的 5 份 `acceptb-*` 合成存檔（不在這次授權內）。
- 檔案：`docs/OWNER_DECISIONS.md`、`docs/TODO.md`、`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：沒有動。
- 補記：上一條的 commit 為 [`5a45d9a`](https://github.com/luffysky/cube2/commit/5a45d9a)。

## 2026-11-23 21:49（Asia/Taipei）｜記下 cube1 對正式 Identity 的回報

- 專案：cube2｜執行者：Claude
- cube1 回報（Owner 轉述）：正式授權入口還沒實作、還沒部署；由 cube1 接手，包含正式網域綁定與實測登入、授權、token 兌換。正式端點驗證通過後，Owner 才把正式 client secret 填進 cube2 的 Vercel；現在不用動。
- cube2 這邊：沒有要改的程式，照 C-041 等。`docs/TODO.md` 記下順序。
- 檔案：`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒有動。｜刪除：無。
- 補記：上一條的 commit 為 [`3ed9916`](https://github.com/luffysky/cube2/commit/3ed9916)。

## 2026-11-23 23:07（Asia/Taipei）｜正式站「只限驗收存檔」的綁定入口

- 專案：cube2｜執行者：Claude｜Owner 指示：正式串接驗收用受限入口，`IDENTITY_LINK_ENABLED` 保持關閉，等 Owner 核准才公開。
- 卡點：原本正式站只要 `IDENTITY_LINK_ENABLED` 沒開，`/api/auth/*` 一律 503，沒辦法在不公開的情況下驗收。
- 新增 `IDENTITY_LINK_ACCEPT_PUBS`（server/bff.js）：
  - `IDENTITY_LINK_ENABLED` 沒開、但列了幾個驗收存檔的公開代號（逗號分隔，最多 8 個）時，登入流程只對這幾個存檔開放。
  - 每一次開始（連結、找回、復原都一樣）都要拿名單內存檔的裝置金鑰當入場券，其他人照舊拿到 503 `off`。
  - callback 不會連結、找回或透露名單外的存檔：平台帳號若已連著名單外的存檔，直接回 `off`，不給名字和金幣。
  - `/api/health` 仍是 `link: false`，畫面上任何人都看不到按鈕；直接用 token 的 `idLink`／`idRecover` 也維持關閉。
  - 名單裡有一個格式不對，整份名單作廢。`IDENTITY_LINK_ENABLED=1` 時名單不再有作用。
- 正式環境變數（Production）：新增 `IDENTITY_ISSUER`、`IDENTITY_JWKS_URL`、`IDENTITY_AUDIENCE`（Owner 給的值）與 `IDENTITY_LINK_ACCEPT_PUBS`（3 份驗收存檔 `accept-A`／`accept-B`／`accept-Y`，各 200 金幣）。`IDENTITY_LINK_ENABLED` 沒設。
- 測試：`test/bff.test.js` 131 項（多 29 項：只限名單、名單格式、首次綁定、換裝置找回、兩種衝突、找不到、金幣不變、名單外存檔不被動到也不被說出、公開後名單失效）。
- 檔案：`server/bff.js`、`server/app.js`、`server/core.js`、`test/bff.test.js`、`docs/DEVLOG.md`。｜資料庫：沒改結構；正式庫多 3 份驗收存檔。｜刪除：無。
- 補記：上一條的 commit 為 [`1621852`](https://github.com/luffysky/cube2/commit/1621852)。

## 2026-11-23 23:40（Asia/Taipei）｜寄信加上網路位址、收件信箱與每日總量上限；深度健康檢查只認 `?deep=1`

- 專案：cube2｜執行者：Claude｜Owner 指示：盤點登入、寄驗證碼、重設密碼、帳號綁定與高成本 API 的防護。
- 寄信（寄驗證碼 `mailStart`、寄回救援碼 `mailRemind`，也就是雲端檔案「用救援碼重設密碼」的那封信）：
  - 原本只有「同一份存檔一小時 3 封、一天 6 封」。一個網路位址一天可開 40 份新存檔，等於一天能寄 240 封到任何信箱。
  - 新增：同一網路位址（雜湊後）一小時 10 封、同一收件信箱一天 3 封（不分大小寫）、全站一天 `MAIL_DAY_CAP`（預設 200）封。學校共用網路一小時仍可寄 10 封。
- `/api/health?deep=1` 會查資料庫，原本加任何參數（`?deep=1&x=亂數`）都能繞過 CDN 快取，每次打一次資料庫。現在只有剛好 `?deep=1` 才查，有快取 15 秒。
- 測試：`test/mail.test.js` 31 項（多 4 項），`test/api.test.js` 446 項（多 1 項）。
- 檔案：`server/mail.js`、`server/app.js`、`test/mail.test.js`、`test/api.test.js`、`docs/DEVLOG.md`。｜資料庫：沒改。｜刪除：無。
- 補記：上一條的 commit 為 [`f3d989e`](https://github.com/luffysky/cube2/commit/f3d989e)。

## 2026-11-23 23:52（Asia/Taipei）｜管理 API 加「各遊戲數據」`/internal/admin/v1/metrics/games`

- 專案：cube2｜執行者：Claude｜Owner 指示：「管理後台那邊要顯示各遊戲數據」
- 新增唯讀端點 `GET /internal/admin/v1/metrics/games`，驗證方式和其他管理 API 一樣（機器 JWT、只讀、每次寫稽核）。每個遊戲一筆，只給伺服器真的有記錄的數字：
  - 主遊戲各模式（對電腦、對戰、排位、線上、挑戰大自然、搶地盤……）：今天場數、7 天場數、7 天玩家數；比賽紀錄保存期間內的總場數與玩家數。
  - 九款磚塊小遊戲：有成績的玩家數、7 天內刷新成績的玩家數；沒人玩過的遊戲顯示 0（真的量過），不會漏掉。
  - 磚之冒險：開始過的玩家數、打通第一章的玩家數、總過關次數（從存檔讀）；7 天活躍沒有來源，給 null。
  - 地城小隊：伺服器沒有紀錄（房主的頁面在跑），給 `source: null`，不放假的 0。
  - 不含任何玩家 id、鑰匙或個資。
- 卡點：cube1 正式站的管理金鑰（`https://identity.snowrealm.pet/.well-known/admin-jwks.json`）回 `admin_jwks_unavailable`，所以正式後台目前呼叫不到 cube2 的管理 API。另外 cube2 正式環境的管理設定還是 staging 的複本，等 cube1 發好正式金鑰再換。
- 測試：`test/admin.test.js` 113 項（多 8 項）。
- 檔案：`server/admin.js`、`test/admin.test.js`、`docs/DEVLOG.md`。｜資料庫：沒改。｜刪除：無。
- 補記：上一條的 commit 為 [`58c7417`](https://github.com/luffysky/cube2/commit/58c7417)。

## 2026-11-23 23:53（Asia/Taipei）｜存檔同步到 Games 的介面草案；記錄 C-042、C-043

- 專案：cube2｜執行者：Claude
- Owner：「轉磚原來資料要同步到games」，選「整個存檔改由 games 保管」＋「綁定後持續單向」。
- 寫了給 cube1 的介面草案 `docs/handoff/BRICKDUEL_SAVE_SYNC_TO_GAMES.md`：只送已綁定存檔、cube2 自己的服務 JWT（不共用秘密）、`ver` 只增、刪除送 `deleted: true`、送件佇列與重試、`SAVE_SYNC_ENABLED` 開關。cube2 這邊等介面對好才實作，正式站目前不送任何資料。
- `docs/OWNER_DECISIONS.md` 新增 C-042（存檔同步）、C-043（各遊戲數據、限流計費、密碼 8 碼）。
- 補記：上一條時間更正為 23:52；commit 為 [`4bd6281`](https://github.com/luffysky/cube2/commit/4bd6281)。

## 2026-11-23 23:59（Asia/Taipei）｜正式串接驗收與流量防護報告

- 專案：cube2｜執行者：Claude
- 正式設定：補上 issuer、JWKS、audience，修正誤指 staging 的授權入口（`IDENTITY_AUTHORIZE_URL` → `https://games.snowrealm.pet/`），都已重新部署。
- 雙帳號驗收：P1 卡在 cube1 同意頁（POST `/oauth/authorize` 400「授權請求無效」，3 次），cube2 沒收到回呼；P2、P3 BLOCKED。已交 Work。驗收存檔改存在瀏覽器 localStorage（`zzaccept.v1`），第一組因分頁關閉遺失。
- 流量防護：Vercel WAF 4 條每 IP 限流已發布（Owner 同意計費）；寄信新增每 IP、每收件者、全站每日上限；深度健康檢查只認 `?deep=1`。`/api/room`、`/api/ws` 刻意不加邊緣限流（理由見 JOINT_ACCEPTANCE）。告警要 Priority 方案。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒改結構；正式庫有 6 份驗收存檔。｜刪除：無。
- 補記：上一條時間更正為 23:53；commit 為 [`ea1b3fa`](https://github.com/luffysky/cube2/commit/ea1b3fa)。

## 2026-11-24 00:03（Asia/Taipei）｜記錄 C-044：正式驗收通過後開綁定、清掉所有測試殘留

- 專案：cube2｜執行者：Claude
- Owner：驗收通過後打開正式站綁定；正式庫 6 份驗收存檔要清；從 staging 複製來的舊設定要清，「測試的等正式過後都不留」。
- 記為 C-044，收尾順序寫進 `docs/TODO.md`。驗收還沒通過（卡在 cube1 同意頁），所以現在什麼都沒動。
- 檔案：`docs/OWNER_DECISIONS.md`、`docs/TODO.md`、`docs/DEVLOG.md`。｜資料庫：沒動。｜刪除：無（已核准，等驗收通過）。
- 補記：上一條的 commit 為 [`0790f7a`](https://github.com/luffysky/cube2/commit/0790f7a)。

## 2026-11-24 00:32（Asia/Taipei）｜正式雙帳號驗收：P1、P2、P3a PASS（cube1 Identity v8）

- 專案：cube2｜執行者：Claude｜依據：Owner 交辦「接手 BrickDuel 正式串接驗收」、cube1 回報 v5～v8 已部署
- cube1 同意頁修正過程（cube2 程式沒改）：v4 以前 400 `consent_cookie_missing`（最後一次 16:05:20Z）；v6 500 `identity_unavailable`（16:12:23.8Z）；v7 同意後跳轉被同意頁自己的 CSP `form-action` 擋下（16:19:00.4Z、16:20:23.06Z，cube1 查到兩筆授權碼有寫入、未兌換）；v8 放行已註冊的 callback 網域。
- v8 實測（正式站 `ff3a55a`，帳號 `+bd1`）：
  - P1 首次綁定存檔 A：callback 到 cube2 → `linked`；新鑰匙 `idStatus` linked、舊鑰匙 401；金幣 200。PASS。
  - P2 用存檔 Y 當入場券找回：`recovered`，拿回的是存檔 A（id、pub 相同）、200 金幣；Y 沒被動。PASS。
  - P3a 同帳號再綁存檔 B：`conflict`（`taken`），B 不變。PASS。
  - P3b、P3c 要第二個帳號（`+bd2`），等 Owner 在遊戲館換登入。BLOCKED。
- 新鑰匙只存在 Chrome 的 `zzaccept.v1`（A、A_recovered），沒有寫進聊天、檔案或日誌。
- `IDENTITY_LINK_ENABLED` 仍關閉、健康檢查 `link: false`。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：只有驗收流程本身的寫入（存檔 A 的 `zz.identity` 連結、新裝置鑰匙）。｜刪除：無。
- 補記：上一條的 commit 為 [`ff3a55a`](https://github.com/luffysky/cube2/commit/ff3a55a)。

## 2026-11-24 00:43（Asia/Taipei）｜雙帳號驗收全部 PASS；依 C-044 開正式綁定、刪 staging 複製來的正式變數

- 專案：cube2｜執行者：Claude｜依據：C-044（Owner：驗收通過後開正式綁定、測試殘留都不留）
- P3b 帳號 2 綁已被帳號 1 綁的存檔 A：`conflict`（`linked`，不透露對方）。P3c 帳號 2 找回：`none`。A/B/Y 金幣一直是 200。P1～P3 全部 PASS。
- 16:41:20Z 正式環境新增 `IDENTITY_LINK_ENABLED=1`。
- 16:42:21Z 刪正式環境變數 7 個（`IDENTITY_LINK_ACCEPT_PUBS`、`IDENTITY_STAGING`、`STAGING_DATABASE_URL`、`BRICKDUEL_ADMIN_TEST_TRUST`、`BRICKDUEL_ADMIN_ISSUER`、`BRICKDUEL_ADMIN_JWKS_URL`、`BRICKDUEL_ADMIN_SUBJECTS`）和 `accept-jwks` 分支的佔位 secret。逐筆比對 id／名稱／環境後才刪。staging 分支的變數保留。
- 這次推送會讓正式站重新部署並載入新設定。
- 檔案：`docs/JOINT_ACCEPTANCE.md`、`docs/DEVLOG.md`。｜資料庫：沒動。｜刪除：上述 Vercel 環境變數（C-044 核准）。
- 補記：上一條的 commit 為 [`8248502`](https://github.com/luffysky/cube2/commit/8248502)。
