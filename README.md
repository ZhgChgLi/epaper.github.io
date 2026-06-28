# Kobo Photo-Frame（GitHub Actions 算圖 + GitHub Pages 提供）

完全免費、不需要伺服器：**GitHub Actions** 每 12 小時用 Node（satori + resvg）把照片算成一張
**1072×1448 PNG**（疊上 iOS 鎖屏風的日期/星期），**GitHub Pages** 提供靜態 `frame.png`，Kobo 直接抓。

![預覽](../docs/preview.png)

## 檔案
```
pages/                       ← 把這個資料夾的「內容」當作新 repo 的根目錄 push
  render.mjs                 算圖主程式（satori → SVG → resvg → PNG）
  photos.json               照片 URL 清單（每 12h 輪一張）
  index.html                Pages 首頁（顯示 frame.png）
  package.json / lock
  .github/workflows/render.yml   每 12h cron + 手動 + push 觸發 → 算圖 → 發布 gh-pages
```

## 設定步驟
1. **建立一個新的（公開）GitHub repo**，例如 `kobo-photoframe`。
2. 把本 `pages/` 資料夾的內容（含 `.github/`）放到 repo 根目錄，push 到 `main`。
3. 編輯 `photos.json`：放你的照片 URL（目前已填你給的兩張 zhgchg.li 圖；要加就往陣列加）。
4. 第一次 push 後，到 repo 的 **Actions** 頁確認 workflow 有跑（或按 **Run workflow** 手動觸發）。
   - 它會把 `frame.png` 發布到 `gh-pages` 分支。
5. **啟用 Pages**：Settings → Pages → Source 選 **Deploy from a branch** → 分支 **gh-pages** / 根目錄 → Save。
6. 等 1～2 分鐘，你的圖就在：
   ```
   https://<你的GitHub帳號>.github.io/kobo-photoframe/frame.png
   ```
   把這個網址填進 `kobo/photoframe-sleep.sh` 的 `URL`（或 trmnl-kobo 設定）。

## 換照片 / 改頻率
- **換照片**：編輯 `photos.json` push 上去即可（會自動重算）。
- **換圖頻率**：改 `render.mjs` 的 `TWELVE_HOURS_MS`、`.github/workflows/render.yml` 的 cron，以及 Kobo 端的 `SLEEP`，三者保持一致。
- **版面/文字**：改 `render.mjs` 的 `buildHtml()`。

## 本機測試
```bash
cd pages
npm install
node render.mjs        # 產生 frame.png，可直接開來看
```

## 注意
- 照片用 **.jpg / .png**（satori 不吃 webp/gif）；建議先縮到接近 1072×1448，算圖快、檔案小。
- workflow 用 `force_orphan: true` 發布，`gh-pages` 只保留最新一版，PNG 不會撐爆 git 歷史。
- Actions cron 為 UTC 且可能延遲幾分鐘；日期文字以 Asia/Taipei 計算，永遠正確。
- 公開 Pages 網址任何人知道就看得到（個人相框通常無妨）；要更私密可改回 Cloudflare Worker 付費版方案。
- GitHub Actions 對公開 repo 免費；排程 workflow 若 repo 連續 60 天無活動會被自動停用，屆時進 Actions 頁點一下重新啟用即可。
