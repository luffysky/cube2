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
