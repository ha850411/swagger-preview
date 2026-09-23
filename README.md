# Swagger Preview

透過 Swagger 預覽 GitHub 上的 API 規範文件（支援格式：`.json`, `.yaml`, `.yml`）。

## 特色功能

- **🚀 原生側邊抽屜預覽 (Slide-over Drawer)**：瀏覽 GitHub 時直接在檔案工具列點擊 **`Swagger`** 按鈕，右側立即滑出 Swagger 預覽，不需跳出或刷新 GitHub 頁面。
- **📐 自由調整寬度與全螢幕**：抽屜左側邊緣支援滑鼠自由拖曳調整寬度，亦有一鍵切換寬度與新分頁展開按鈕。
- **🛡️ 雙重抗改版防禦**：
  - 語意化錨點自動掛載原生按鈕。
  - 若遇改版自動降級為右下角懸浮按鈕。
  - 同時提供瀏覽器右鍵選單「使用 Swagger 預覽此文件」，100% 不受 DOM 變動影響。
- **⚡ 效能優化**：
  - Swagger 按鈕提早掛載，語言設定讀取不阻擋顯示；工具列晚到或動態替換時自動補上，無關 DOM 更新不觸發全頁搜尋。
  - 同一文件關閉再開啟時沿用既有畫面，保留展開狀態，省下重新解析與渲染。
  - 抽屜文件透過記憶體與 postMessage 傳輸；同一 URL 的進行中下載共用請求，切換文件後忽略舊回應。
  - 每個 GitHub 分頁的 LRU 文件快取最多保留 5 份，字串容量估算上限為 16 MiB；目前顯示的文件另外保留，超出快取上限仍可預覽。此限制不包含 Swagger UI 的解析物件與 DOM 記憶體。
  - 大型文件預設收合 API 分組與模型，並停用語法上色；仍可手動展開所有 API。
  - 拖曳寬度每個動畫幀最多更新一次，放開滑鼠時儲存最後位置，支援跨分頁同步。

## 安裝與使用

### Step 1: 載入擴充套件
1. 下載或 clone 本專案至本機。
2. 開啟 Chrome 瀏覽器進入 `chrome://extensions/`。
3. 開啟右上角「開發人員模式」，點擊「載入未封裝項目」並選取本專案目錄。

### Step 2: 預覽 API 文件
- **方式 A（推薦 - 側邊抽屜）**：在 GitHub 上打開任何 `.yaml` 或 `.json` API 檔案，直接點擊 Raw 旁邊的 **`Swagger`** 按鈕（或右下角懸浮按鈕），右側即刻滑出預覽抽屜。
- **方式 B（右鍵選單）**：在檔案頁或任何 raw 連結上按右鍵，選擇「**使用 Swagger 預覽此文件**」。
- **方式 C（Raw 自動偵測）**：在套件選單中勾選「Raw 自動轉向預覽 (Auto Mode)」，點擊 Raw 按鈕時會自動轉向 Swagger UI 獨立預覽分頁。

## 開發與測試

需要 Node.js 20 以上版本。擴充套件本身不需建置；以下依賴僅供回歸測試使用：

```sh
npm ci
npx playwright install chromium
npm test
```

測試會以獨立 Chromium 設定檔實際載入擴充套件，使用本機文件伺服器與模擬 GitHub 檔案頁，檢查按鈕提早掛載、工具列動態替換、無關 DOM 更新的查詢成本、抽屜重開、請求競態、錯誤重試、LRU 數量及容量限制、寬度記憶與獨立分頁預覽。

大型文件的判定門檻位於 `swagger-loader.js`：內容長度達 1,048,576 個 UTF-16 code units，或 `paths` 至少 500 筆。YAML/JSON 仍在預覽 iframe 內解析，尚未移至 Web Worker。

## 授權條款 / License

本專案採用 MIT License。中文翻譯僅供參考；如與英文原文有歧義，以英文原文為準。

This project is licensed under the MIT License. The Traditional Chinese translation is provided for reference only; the English original prevails in case of discrepancies.

- [English — MIT License](LICENSE)
- [繁體中文 — MIT 授權條款參考譯文](LICENSE.zh-TW.md)
