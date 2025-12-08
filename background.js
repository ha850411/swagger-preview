// 匯入 eventHandler 的函數
importScripts('eventHandler.js');

chrome.webRequest.onCompleted.addListener(
    function(details) {
        chrome.storage.sync.get(["autoDetectFlag"], async function(result) {
            const autoDetectFlag = result?.["autoDetectFlag"] || false;
            if (autoDetectFlag && RAW_SWAGGER_REGEX.test(details.url)) {
                const loadingUrl = chrome.runtime.getURL('loading.html') +
                    '?source=' + encodeURIComponent(details.url);
                chrome.tabs.update(details.tabId, { url: loadingUrl, active: true });
            }
        });
    },
    {
        types: ["main_frame"],
        urls: ["*://raw.githubusercontent.com/*"]
    }
);

// 從 raw URL 下載、清理、驗證並寫入 storage，回傳 key
async function fetchAndStoreSwagger(yamlUrl) {
    const res = await fetch(yamlUrl);
    if (!res.ok) {
        throw new Error('下載失敗，HTTP ' + res.status);
    }
    const raw = await res.text();
    const cleaned = cleanSwaggerContent(raw);
    if (!isSwaggerContent(cleaned)) {
        throw new Error('內容不是有效的 OpenAPI/Swagger 規範');
    }
    const storageKey = 'swagger_content_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    await chrome.storage.local.set({
        [storageKey]: {
            content: cleaned,
            url: yamlUrl,
            timestamp: Date.now()
        }
    });
    return storageKey;
}

// 提供 loading 頁面呼叫的訊息介面
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'loadSwaggerFromUrl' && message.url) {
        (async () => {
            try {
                const key = await fetchAndStoreSwagger(message.url);
                sendResponse({ ok: true, key });
            } catch (error) {
                sendResponse({ ok: false, message: error?.message || '未知錯誤' });
            }
        })();
        return true; // 表示將使用非同步回覆
    }
});