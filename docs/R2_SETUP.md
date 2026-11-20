# 開啟會員雲端上傳（Cloudflare R2）

程式已經寫好（`server/files.js`），現在是關著的。下面四步做完、重新部署，會員畫面和音樂播放器的「也上傳到雲端」就會打開。金鑰只放 Vercel 環境變數，不要貼到聊天或 GitHub。

## 1. 開一個 R2 bucket

Cloudflare 後台 → R2 → Create bucket，名字例如 `brickduel-files`，位置選 Automatic。

> R2 有免費額度（以 Cloudflare 當下公告為準），但開通 R2 時 Cloudflare 可能要求先綁付款方式。這屬於付費方案相關，請 Owner 自己確認後再開。

## 2. 建一把只管這個 bucket 的 API 金鑰

R2 → Manage R2 API Tokens → Create API token：

- 權限：**Object Read & Write**
- 範圍：**只限上面那個 bucket**
- 建好後會顯示 Access Key ID、Secret Access Key（只顯示一次）和 Account ID。

## 3. bucket 的 CORS 設定

bucket → Settings → CORS policy，貼上：

```json
[
  {
    "AllowedOrigins": ["https://brickduel.snowrealm.pet"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

## 4. Vercel 環境變數（Production）

| 名稱 | 值 |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare 的 Account ID |
| `R2_ACCESS_KEY_ID` | 第 2 步的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 第 2 步的 Secret Access Key |
| `R2_BUCKET` | 第 1 步的 bucket 名字 |

設好後重新部署一次。`https://brickduel.snowrealm.pet/api/health` 回應裡出現 `"files":true` 就是開了。

## 怎麼運作、有什麼限制

- 檔案不經過我們的伺服器：伺服器發一個 10 分鐘有效的簽名網址，瀏覽器直接把檔案放進 bucket（`u/<玩家 id>/<種類>/<檔案 id>`）；讀取用 1 小時有效的簽名網址。只有自己的帳號拿得到自己檔案的網址。
- 只有會員能上傳。音樂每首 15 MB、最多 30 首、共 200 MB；圖片每張 5 MB、最多 10 張、共 20 MB；只收音樂檔和一般圖片（不收 SVG）。
- 每個檔案在 `zz.files` 有一筆紀錄。玩家把檔案從清單拿掉只是隱藏，**bucket 裡的檔案不會刪**；要不要真的刪（例如隱藏 30 天後自動刪、或會員到期多久後刪）請 Owner 決定，決定後再加。
- 測試：`test/api.test.js`（簽名和 AWS 官方程式庫算出來的一模一樣、會員限制、大小與種類限制、別人碰不到）、`test/r2.js`（瀏覽器實際上傳、換裝置取回）。
