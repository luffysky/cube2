# 出處與授權

## 音樂
Juhani Junkala，《5 Chiptunes (Action)》，CC0 1.0。
`audio/` 裡的五首循環音樂取自這個合輯，做過音量調整並轉成 ogg 與 mp3。

## 音效
Kenney（kenney.nl），《Interface Sounds》與《UI Audio》，CC0 1.0。
挑出 25 個音效內嵌在 `src/sfxdata.js`。

勝利時的群眾歡呼（`cheer`）：專案擁有者提供的音檔，下載自愛給網（aigei.com），檔案內的說明是 "crowd cheer with claps, woo, a little talk at the end"。取前 3.7 秒、淡出、轉成單聲道後內嵌。
**這一個音效的原始作者和授權條款還沒有確認。** 愛給網上的素材有的是 CC0，有的要標示作者，有的商用要另外授權；收費或上架之前，請回到下載頁確認，必要時換掉（`python3 -I tools/add_clip.py cheer <新的音檔> 3.7 1.1` 就能換）。

## 程式
- PeerJS（`vendor/peerjs.min.js`），MIT 授權，授權全文在 `vendor/peerjs.LICENSE`。連線對戰用。
- `src/hans-map.js` 的繁簡對照表由 OpenCC 的字典資料產生（Apache License 2.0），產生方式見 `tools/make_hans.js`。
- `@neondatabase/serverless`（MIT 授權）：後端連 Neon 資料庫用，由 npm 安裝，沒有放進這個專案。
- `@electric-sql/pglite`（Apache License 2.0）：只在本機開發和測試時用的記憶體版 Postgres，正式環境不會載入。

## 字型
執行時從 Google Fonts 載入，沒有放進這個專案：Chiron GoRound TC、Barlow Semi Condensed、Noto Sans SC、Noto Sans KR、Zen Maru Gothic（皆為 SIL Open Font License）。

## 圖示與預覽圖
`icons/` 裡的圖示是本專案原創（`tools/make_icons.py` 畫的）。分享預覽圖和安裝畫面的截圖是遊戲自己的畫面，用上面兩套字型排版（`tools/shots.js`，字型來自 npm 的 `@fontsource/chiron-goround-tc` 與 `@fontsource/barlow-semi-condensed`，SIL Open Font License）。

## 其他
遊戲的名稱、美術、介面、文字與程式為本專案原創。
