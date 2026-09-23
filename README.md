# Swagger Preview

透過 Swagger 預覽 GitHub 上的 API 規範文件（支援格式：`.json`, `.yaml`, `.yml`）。

## 特色功能

- **🚀 原生側邊抽屜預覽 (Slide-over Drawer)**：瀏覽 GitHub 時直接在檔案工具列點擊 **`Swagger`** 按鈕，右側立即滑出 Swagger 預覽，不需跳出或刷新 GitHub 頁面。
- **📐 自由調整寬度與全螢幕**：抽屜左側邊緣支援滑鼠自由拖曳調整寬度，亦有一鍵切換寬度與新分頁展開按鈕。
- **🛡️ 雙重抗改版防禦**：
  - 語意化錨點自動掛載原生按鈕。
  - 若遇改版自動降級為右下角懸浮按鈕。
  - 同時提供瀏覽器右鍵選單「使用 Swagger 預覽此文件」，100% 不受 DOM 變動影響。
- **⚡ 極致效能優化**：
  - 採用記憶體快取傳輸（postMessage），抽屜預覽達成零磁碟 I/O。
  - 快篩 YAML/JSON 結構特徵，大幅降低大檔案解析與渲染延遲。
  - 內建 LRU 儲存管理，避免垃圾資料累積膨脹。

## 安裝與使用

### Step 1: 載入擴充套件
1. 下載或 clone 本專案至本機。
2. 開啟 Chrome 瀏覽器進入 `chrome://extensions/`。
3. 開啟右上角「開發人員模式」，點擊「載入未封裝項目」並選取本專案目錄。

### Step 2: 預覽 API 文件
- **方式 A（推薦 - 側邊抽屜）**：在 GitHub 上打開任何 `.yaml` 或 `.json` API 檔案，直接點擊 Raw 旁邊的 **`Swagger`** 按鈕（或右下角懸浮按鈕），右側即刻滑出預覽抽屜。
- **方式 B（右鍵選單）**：在檔案頁或任何 raw 連結上按右鍵，選擇「**使用 Swagger 預覽此文件**」。
- **方式 C（Raw 自動偵測）**：在套件選單中勾選「Raw 自動轉向預覽 (Auto Mode)」，點擊 Raw 按鈕時會自動轉向 Swagger UI 獨立預覽分頁。

## 授權條款 / License

本專案採用 MIT License。中文翻譯僅供參考；如與英文原文有歧義，以英文原文為準。

This project is licensed under the MIT License. The Traditional Chinese translation is provided for reference only; the English original prevails in case of discrepancies.

- [English — MIT License](LICENSE)
- [繁體中文 — MIT 授權條款參考譯文](LICENSE.zh-TW.md)
