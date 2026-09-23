/**
 * Swagger Preview - 雙語國際化設定模組 (i18n)
 * 支援 繁體中文 (zh) 與 英文 (en)
 */

const SWAGGER_I18N = {
    zh: {
        title: "Swagger Preview",
        previewCurrentTab: "在目前分頁預覽",
        autoMode: "Raw 自動轉向預覽 (Auto Mode)",
        tip: "💡 小提示：在 GitHub 檔案頁可直接使用 Swagger 按鈕或右鍵開啟側邊抽屜，免跳轉！",
        swaggerBtnTooltip: "使用 Swagger 側邊抽屜預覽 API",
        swaggerBtnText: "Swagger",
        floatingBtnText: "Swagger 預覽",
        width50Title: "50% 寬度 (預設)",
        width75Title: "75% 寬度 (寬版)",
        width100Title: "全螢幕 (最大化)",
        openNewTab: "↗ 新分頁",
        openNewTabTitle: "在新分頁中完整開啟",
        closeTitle: "關閉 (Esc)",
        resizerTitle: "拖曳以調整寬度",
        loading: "載入與解析 OpenAPI 規範中...",
        errorTitle: "載入失敗",
        retry: "重新嘗試",
        backToGitHub: "← 返回 GitHub 原始頁面",
        backToSource: "← 返回來源頁面",
        viewRaw: "檢視 Raw 內容",
        sourcePrefix: "來源：",
        contextMenuTitle: "使用 Swagger 預覽此文件",
        errorNoKey: "沒有提供內容鍵值",
        errorNoKeyDesc: "缺少有效的 key 參數",
        errorLoadFailed: "無法從儲存中讀取內容",
        errorLoadFailedDesc: "指定的內容鍵值不存在或已過期",
        errorEmpty: "內容為空",
        errorEmptyDesc: "載入的檔案內容為空字串",
        errorInvalidObject: "解析結果不是有效的 OpenAPI 物件",
        errorMissingFields: "內容缺少 OpenAPI/Swagger 必要欄位 (openapi, swagger, info, paths)",
        viewOriginalContent: "檢視原始內容"
    },
    en: {
        title: "Swagger Preview",
        previewCurrentTab: "Preview Current Tab",
        autoMode: "Auto-redirect on Raw (Auto Mode)",
        tip: "💡 Tip: Click Swagger button on GitHub or right-click to open drawer without leaving!",
        swaggerBtnTooltip: "Preview API in Swagger Drawer",
        swaggerBtnText: "Swagger",
        floatingBtnText: "Swagger Preview",
        width50Title: "50% Width (Default)",
        width75Title: "75% Width (Wide)",
        width100Title: "Full Screen (Max)",
        openNewTab: "↗ New Tab",
        openNewTabTitle: "Open in full new tab",
        closeTitle: "Close (Esc)",
        resizerTitle: "Drag to resize width",
        loading: "Loading and parsing OpenAPI spec...",
        errorTitle: "Loading Failed",
        retry: "Retry",
        backToGitHub: "← Back to GitHub file",
        backToSource: "← Back to Source",
        viewRaw: "View Raw content",
        sourcePrefix: "Source: ",
        contextMenuTitle: "Preview with Swagger",
        errorNoKey: "Missing Content Key",
        errorNoKeyDesc: "Missing valid key parameter",
        errorLoadFailed: "Failed to read content from storage",
        errorLoadFailedDesc: "The specified content key does not exist or has expired",
        errorEmpty: "Content is empty",
        errorEmptyDesc: "The loaded file content is empty",
        errorInvalidObject: "Parsed result is not a valid OpenAPI object",
        errorMissingFields: "Missing required OpenAPI/Swagger fields (openapi, swagger, info, paths)",
        viewOriginalContent: "View original raw content"
    }
};

/**
 * 取得當前語言設定（預設繁中，若無則依瀏覽器判斷）
 */
function getSwaggerLocale(callback) {
    chrome.storage.sync.get(['language'], (result) => {
        let lang = result?.language;
        if (!lang) {
            const browserLang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh';
            lang = browserLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        }
        if (callback) {
            callback(lang, SWAGGER_I18N[lang] || SWAGGER_I18N.zh);
        }
    });
}

/**
 * 設定語言並同步到 storage
 */
function setSwaggerLocale(lang, callback) {
    const validLang = (lang === 'en') ? 'en' : 'zh';
    chrome.storage.sync.set({ language: validLang }, () => {
        if (callback) {
            callback(validLang, SWAGGER_I18N[validLang]);
        }
    });
}
