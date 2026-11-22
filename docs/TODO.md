# 轉磚 待辦清單

每做完一項就打勾，並寫上 commit。最後更新：2026-11-23 02:40（Asia/Taipei）

## Claude 這一輪在做

- [x] 遊戲載入的 Loading 動畫（主遊戲＋九款小遊戲）

- [x] 排行榜加關卡（星星總數、無限挑戰最佳關數）

- [x] 貪吃蛇加可以補愛心的道具
- [x] 隨機配對前先選模式，選好才開始配對
- [x] 暫存有時按了沒換（規則：每塊只能暫存一次；現在按了沒反應會晃一下並說明）

- [x] 背包（道具數量、點一下帶進下一場；可用的外觀直接換上；最近一次開箱）
- [x] 被擊倒時原本排好的方塊有時直接消失（只清水泥行；太高只從上面削，底下保留）
- [x] 商店加「落點方塊」樣式 30 款（3 免費、23 金幣、4 會員；背包可換；寶箱也開得到）
- [x] 每場開始前跳出操作方式，玩家自己關（電腦版特別說明怎麼用道具）
- [x] 隨機配對：電腦配電腦、手機配手機，等不到才混配（開房間不限）
- [x] 玩家旁邊標示用什麼玩：電腦／手機／平板
- [x] 拉霸、轉盤、廣告獎勵：拿到東西的特效做明顯（金箱、寶石箱也有）

- [x] 查 T 轉和其他旋轉有時失靈的原因（觸控：按在按鍵間的縫或邊緣沒反應，已改成算到最近的鍵；旋轉規則本身正確）

- [x] 上傳選擇與本機提示（圖片、音樂）：玩家可選「只存這台裝置／也上傳到雲端」，雲端選項等 R2 接上才開；不上傳時說明只存本機、什麼情況會不見；向瀏覽器申請長期保存
- [x] 手機橫放也能玩（拿掉「請轉直」，橫放時按鍵分在牆的左右兩邊）
- [x] 單手模式（左手／右手，所有按鍵集中在一側）
- [x] 簽到表（整個月的日曆、打勾、連續天數、月累積獎勵）
- [x] 暱稱不雅字過濾（前端和伺服器都擋）
- [x] 真人排位由伺服器判定勝負（新的「真人排位」：雙方紀錄都到、都有落子紀錄佐證、結果一致才算）
- [x] 線上房間加「40 行競速」
- [x] 九款小遊戲排行榜
- [x] 瀏覽器測試放進 GitHub Actions
- [x] 連線對戰加 WebRTC 直連（中繼當備援；只用在好友房，隨機配對不直連以免陌生人看到 IP）
- [x] 接 R2 雲端上傳的程式（圖片、音樂；伺服器有 R2 金鑰才會打開，步驟見 `docs/R2_SETUP.md`）

## 要 Owner 處理

- [x] GitHub 加 `GEMINI_API_KEY` secret（已確認可用：gemini-3.6-flash）
- [ ] 律師看地區法律文件草稿的【待確認】項目
- [ ] 工作室登記後提供統一編號，補進條款
- [ ] 刪掉 GitHub 的 `cloud` 分支
- [ ] 確認勝利歡呼音效的授權
- [ ] 決定春節等節日造型何時開放（現在只開聖誕）
- [x] 開 Cloudflare R2（照 `docs/R2_SETUP.md` 四步）
- [x] 決定雲端檔案要不要真的刪 → 藏 30 天可復原，沒後悔才刪（C-034，已做）
- [ ] 正式站實際上傳一次，確認 bucket CORS 與金鑰（雲端瀏覽器選不了檔案，請 Owner 自己試）
- [ ] 批准清理方案 `docs/RETENTION_PROPOSAL.md`（`zz.admin_log` 180 天、`zz.authsess` 過期；目前只監控不刪）
- [x] 同意畫面與隱私權政策改成「會用一個必要 cookie」並說明用途
- [ ] （可選）Vercel 加 `CRON_SECRET` 環境變數，讓每日清理只接受 Vercel 自己的呼叫

- [ ] Owner：開 Resend 帳號（免費方案）、驗證 snowrealm.pet 寄件網域、在 Vercel Production 設 `RESEND_API_KEY`、`MAIL_FROM`、`ESCROW_KEY` → 打開救援碼信箱代管

## 等 GPT

- [x] 唯讀後台 API 七支（C-035，未設定前 503）
- [x] OAuth BFF callback（C-035，開關關著）
- [x] BFF：`nonce` 改成必填（契約補充 2026-11-21）
- [x] 管理 API：`sub` 限定 `svc:snowrealm-games-admin`
- [x] Staging callback（只在 Preview 生效、正式站忽略）、staging 不讀正式資料庫
- [x] Owner：Cloudflare 加 CNAME（staging 網域 TLS 已生效）
- [x] Owner：Neon `staging` 分支（只有結構）＋ Vercel Preview 設 `STAGING_DATABASE_URL`、`IDENTITY_STAGING`
- [x] Owner：Vercel 部署保護的 bypass 密碼，已交給 cube1
- [ ] Owner：拿到 cube1 的 staging Identity 值後，設在 Preview（staging 分支）（管理信任已設；還缺 `IDENTITY_AUTHORIZE_URL`、`IDENTITY_STAGING_CLIENT_SECRET`）
- [x] cube1 提供受控 staging signer → 跑有效、錯 audience／issuer／scope／sub、換鑰、缺 key 的實測（A0–A14 全 PASS，2026-11-23）
- [ ] 機器簽發端與 `admin-jwks.json` 上線 → Owner 在 Vercel 設 `BRICKDUEL_ADMIN_SUBJECTS`
- [ ] Identity `/oauth/authorize`、`/oauth/token` 上線、給 `IDENTITY_BRICKDUEL_CLIENT_SECRET` → 兩帳號 E2E 驗收後才開 `IDENTITY_LINK_ENABLED`

- [ ] SnowRealm Identity 上線並通過兩帳號驗收 → 才打開「註冊／登入」綁定
- [ ] Suno 音樂庫 → Claude 挑歌換背景音樂
- [ ] 後台管理 API（規格已寫，雙方確認阻塞項目後才實作）

## 收錢前必做

- [ ] 接一家網頁金流（綠界、TapPay 等）
- [ ] 會員改成付款後才開通（現在誰都能開）
- [ ] Steam 版登入與購買
- [ ] 廣告 SDK 與同意流程（等廣告帳號核准）

## 已知限制

- 中國大陸版號、ICP、實名、防沉迷要當地持證營運方（暖寶）

## 已完成（近期）

- [x] 挑戰大自然：洪水、龍捲風、地震（`c8e5644`）
- [x] 音樂播放器、會員本機上傳（`c8e5644`）
- [x] 開房間可選模式：普通對戰／挑戰大自然／關卡地形（`c8e5644`）
- [x] 沙塵暴、極光、日蝕、冰雹、火山、雷擊（`85166a9`）

## 新需求（2026-11-23）

- [x] 各模式歷史對戰紀錄：K／D、攻擊、行數、T 轉等細項，日期時間，全部紀錄，一頁 20 筆分頁（助攻還沒有資料來源，見 DEVLOG）
- [ ] 新對線模式與 RPG 化：提案給 Owner
