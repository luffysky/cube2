# 出處與授權

## 音樂
Juhani Junkala，《5 Chiptunes (Action)》，CC0 1.0。
`audio/` 裡的五首循環音樂取自這個合輯，做過音量調整並轉成 ogg 與 mp3。

## 音效
Kenney（kenney.nl），《Interface Sounds》與《UI Audio》，CC0 1.0。
挑出 25 個音效內嵌在 `src/sfxdata.js`。

## 程式
- PeerJS（`vendor/peerjs.min.js`），MIT 授權，授權全文在 `vendor/peerjs.LICENSE`。連線對戰用。
- `src/hans-map.js` 的繁簡對照表由 OpenCC 的字典資料產生（Apache License 2.0），產生方式見 `tools/make_hans.js`。
- `@neondatabase/serverless`（MIT 授權）：後端連 Neon 資料庫用，由 npm 安裝，沒有放進這個專案。
- `@electric-sql/pglite`（Apache License 2.0）：只在本機開發和測試時用的記憶體版 Postgres，正式環境不會載入。

## 字型
執行時從 Google Fonts 載入，沒有放進這個專案：Chiron GoRound TC、Barlow Semi Condensed、Noto Sans SC、Noto Sans KR、Zen Maru Gothic（皆為 SIL Open Font License）。

## 其他
遊戲的名稱、美術、介面、文字與程式為本專案原創。
