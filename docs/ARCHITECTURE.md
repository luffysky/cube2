# 架構與交接說明

給接手的人（或另一個 AI）看的：東西在哪、怎麼改、怎麼驗證。

## 怎麼跑

```
node build.js                      # 把 src/ 組成根目錄的 index.html
python3 -m http.server 8765        # 在專案根目錄開一個本機伺服器（音樂要走 http 才載得到）
```

打開 `http://127.0.0.1:8765/`。沒有打包工具、沒有相依套件，`build.js` 只是把檔案內容貼進 `src/index.template.html` 的記號位置。

## 檔案

| 檔案 | 做什麼 | 能不能在 Node 跑 |
|---|---|---|
| `src/engine.js` | 規則：場地、方塊、旋轉踢牆、各種轉的判定、攻擊與水泥、得分、道具對牆面的效果 | 可以 |
| `src/bot.js` | 電腦對手：可到達落點搜尋、評分、兩步前瞻、五個等級；旋轉雷達；道場解題 | 可以 |
| `src/meta.js` | 金幣、段位、每日任務、簽到、商店目錄、擁有與穿戴、會員、每場結算 | 可以 |
| `src/replay.js` | 錄下一場對戰；分身（照錄影重放的對手） | 可以 |
| `src/i18n.js` | 所有文字，每個 key 是 `[繁中, 英, 日, 韓]`；簡中由繁中即時轉換 | 可以 |
| `src/hans-map.js` | 繁轉簡的單字對照表（由 `tools/make_hans.js` 產生，不要手改） | 可以 |
| `src/drills.js`、`src/openers.js` | 道場關卡、開局課的資料 | 可以 |
| `src/view.js` | 畫面：磚的畫法、牆面、特效、棋盤繪製、音效與音樂 | 瀏覽器 |
| `src/ui.js` | 主程式：畫面切換、輸入、對戰迴圈、HUD、內建面板。對外開放 `ZZ.App` | 瀏覽器 |
| `src/net.js` | 連線對戰：開房、加入、同步 | 瀏覽器 |
| `src/modes.js` | 排位、分身、開局課、連線大廳的面板與流程 | 瀏覽器 |
| `src/shop.js` | 商店、會員、自訂圖片、每日任務、個人檔案 | 瀏覽器 |
| `src/sfxdata.js` | 內嵌的音效（base64），由 `tools/build_audio.py` 產生 | — |
| `audio/` | 五首循環音樂（ogg 和 mp3 各一份） | — |
| `vendor/peerjs.min.js` | 連線用的函式庫，進入連線大廳時才載入 | — |

全部掛在一個全域物件 `ZZ` 底下，載入順序見 `src/index.template.html` 最下面。

## 外掛介面 `ZZ.App`

`ui.js` 只管核心，其他功能用下面這些掛進去（`modes.js`、`shop.js` 就是這樣寫的）：

| 掛點 | 用途 |
|---|---|
| `App.sheets[name] = () => html` | 新增一個面板 |
| `App.opened[name]`、`App.closed[name]` | 面板打開後、關掉後要做的事 |
| `App.acts[name] = (button) => …` | 處理 `data-do="name"` 的按鈕 |
| `App.clicks.push((dataset, button) => true/false)` | 處理其他 `data-*` 按鈕，處理了就回傳 true |
| `App.inputs.push((element) => true/false)` | 處理面板裡的輸入欄位 |
| `App.go[name]` | 主選單 `data-go="name"` 的按鈕 |
| `App.kinds[name]` | 新增一種玩法（開局課就是 `lesson`） |
| `App.taps.push((game, event) => …)` | 收到玩家自己那面牆的每個事件（連線同步靠這個） |
| `App.again[mode]` | 「再來一場」在各模式下怎麼重開 |
| `App.boot.push(fn)` | 啟動時要做的事 |

對戰只有一種 `kind: 'battle'`，用 `mode` 區分：`ai`（挑電腦）、`rank`（排位）、`ghost`（分身）、`net`（連線）。

## 常見修改

**加一句文字或一種語言**：改 `src/i18n.js`（或 `modes.js`、`shop.js` 開頭的 `L.add`）。每個 key 四個字串，順序是繁中、英、日、韓。簡中不用寫；如果兩岸用詞不同，在 `i18n.js` 的 `WORDS` 加一組對照。跑 `node test/i18n.test.js` 會檢查有沒有漏。

**加一種磚樣式**：在 `view.js` 的 `TILE_DRAW` 加一個畫法，在 `meta.js` 的 `CATALOG.tile` 加一筆，在 `shop.js` 加名稱 `c.tile.<id>`。牆面同理（`paintWall`、`CATALOG.bg`、`c.bg.<id>`）。主題是 `style.css` 最後面的 `:root[data-skin="…"]`，加上 `CATALOG.theme`、`shop.js` 的 `SWATCH` 和名稱。

**加一個道具**：`engine.js` 的 `ITEMS`、`view.js` 的 `ITEM_MARK`（圖示）、`ui.js` 的 `useItem` 和 `foeItem`（效果）、`i18n.js` 的 `i<n>` 和 `i<n>t`、`meta.js` 的 `ITEM_PRICE`。

**加一堂開局課**：在 `tools/find_opener.js` 的 `SPECS` 描述目標形狀，跑出結果後用 `tools/make_openers.js` 產生 `src/openers.js`，再到 `modes.js` 加課名 `o.<id>.n` 和說明 `o.<id>.t`。`node test/openers.test.js` 會用引擎把每一步走一遍。

**調數值**：金幣、價格、段位門檻都在 `meta.js`；攻擊表和得分表在 `engine.js` 開頭；電腦等級在 `bot.js` 的 `LEVELS`。

## 幾個設計決定

**分身怎麼對打**：錄影記的是每一塊的最後落點，不是按鍵。重放時玩家送過去的水泥墊在最底下，錄影裡的落點整體往上抬同樣的排數，所以牆面還是對得上。如果分身被打到錄影裡沒有的擊倒，牆面就對不上了，這時改由電腦照錄影的速度接手。細節在 `replay.js` 開頭的註解。

**連線怎麼同步**：兩邊各跑各的遊戲。每次牆面有變化就送一張牆面快照，另外轉送畫面特效需要的事件、攻擊行數、道具、最後的結算。收到的每個欄位都會檢查範圍，不直接信任。沒有裁判伺服器，所以擋不住改程式作弊，真人排位要等後端。

**簡中為什麼用轉的**：少維護一份翻譯，新加的繁中文字自動有簡中。代價是用詞偶爾偏台灣，用 `WORDS` 補。

**為什麼是單一 HTML**：方便丟到任何靜態空間，也方便在預覽環境裡直接跑。

## 測試

```
node test/engine.test.js     # 規則 81 項
node test/score.test.js      # 得分與重放用的引擎功能 17 項
node test/meta.test.js       # 金幣、段位、商店 59 項
node test/replay.test.js     # 錄影與分身 19 項
node test/openers.test.js    # 開局課每一步 135 項
node test/drills.test.js     # 道場每一關都解得出來
node test/i18n.test.js       # 文字有沒有漏、佔位符有沒有對上
```

瀏覽器測試需要 Playwright 和 Chrome（路徑寫在各檔開頭），先開本機伺服器：

```
node test/flow.js            # 排位、帶道具、錄影、分身、開局課、鍵位、語言、商店
node test/net.js             # 兩個分頁打一場連線對戰（用瀏覽器內的測試通道）
ZZ_PEER=127.0.0.1:9000/zz node test/net.js   # 同一套測試改走真的 PeerJS 加 WebRTC（要先自己開一個 PeerServer）
node test/browser3.js        # 道具、音樂、其他方塊的轉
node test/sizes.js           # 各種螢幕尺寸
```

網址參數：`?net=bc` 用瀏覽器內的測試通道代替 WebRTC；`?peer=host:port/path` 指定自己的配對伺服器；`?room=XXXXX` 直接帶入房間代碼。

## 存在玩家瀏覽器裡的資料

| 位置 | 內容 |
|---|---|
| localStorage `zhuanzhuan.v2` | 設定、鍵位、道場進度、最佳時間 |
| localStorage `zhuanzhuan.meta.v1` | 金幣、段位、擁有的外觀、道具庫存、會員、每日任務 |
| localStorage `zhuanzhuan.rep.v1` | 對戰錄影（一般 5 場、會員 30 場） |
| IndexedDB `zhuanzhuan-pics` | 玩家自己的圖片 |

## 還沒做、已知限制

- 金流、帳號、雲端存檔、排行榜、真人配對與真人排位：都需要後端，見 `docs/BUSINESS.md`。
- 會員資格和金幣存在本機，可以被改。收費前要搬到後端。
- 連線對戰的配對和中繼都用 PeerJS 的公用伺服器（含公用 TURN），免費但不保證穩定；嚴格的網路還是可能連不上。正式上線要自己架。
- 音效是照檔名和波形挑的，沒有人實際聽過一輪。
- 手機橫放沒有專屬版面，會請玩家轉直。
