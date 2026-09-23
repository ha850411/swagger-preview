// 匯入 i18n 與 eventHandler
importScripts('i18n.js', 'eventHandler.js');

// 快取 autoDetectFlag，避免每次 webRequest 都做非同步 Storage 讀取
let cachedAutoDetectFlag = false;

chrome.storage.sync.get(["autoDetectFlag"], (result) => {
    cachedAutoDetectFlag = Boolean(result?.autoDetectFlag);
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.autoDetectFlag) {
            cachedAutoDetectFlag = Boolean(changes.autoDetectFlag.newValue);
        }
        if (changes.language) {
            const lang = changes.language.newValue;
            const texts = SWAGGER_I18N[lang] || SWAGGER_I18N.zh;
            try {
                chrome.contextMenus.update('open-swagger-preview', {
                    title: texts.contextMenuTitle
                });
            } catch (e) {}
        }
    }
});

// 監聽 Raw 網址跳轉
chrome.webRequest.onCompleted.addListener(
    function(details) {
        if (cachedAutoDetectFlag && RAW_SWAGGER_REGEX.test(details.url)) {
            const loadingUrl = chrome.runtime.getURL('loading.html') +
                '?source=' + encodeURIComponent(details.url);
            chrome.tabs.update(details.tabId, { url: loadingUrl, active: true });
        }
    },
    {
        types: ["main_frame"],
        urls: ["*://raw.githubusercontent.com/*"]
    }
);

// 同一 URL 的進行中請求共用一次下載，完成或失敗後立即釋放。
const pendingSwaggerFetches = new Map();
function fetchSwaggerContent(yamlUrl) {
    if (pendingSwaggerFetches.has(yamlUrl)) return pendingSwaggerFetches.get(yamlUrl);
    const request = downloadSwaggerContent(yamlUrl).finally(() => pendingSwaggerFetches.delete(yamlUrl));
    pendingSwaggerFetches.set(yamlUrl, request);
    return request;
}

// 從 raw URL 下載、清理並驗證內容（不寫入 storage，供記憶體傳輸）
async function downloadSwaggerContent(yamlUrl) {
    const res = await fetch(yamlUrl);
    if (!res.ok) {
        throw new Error('下載失敗，HTTP ' + res.status);
    }
    const raw = await res.text();
    const cleaned = cleanSwaggerContent(raw);
    if (!isSwaggerContent(cleaned)) {
        throw new Error('內容不是有效的 OpenAPI/Swagger 規範');
    }
    return cleaned;
}

// 從 raw URL 下載、清理、驗證並透過 LRU 寫入 storage，回傳 key
async function fetchAndStoreSwagger(yamlUrl) {
    const cleaned = await fetchSwaggerContent(yamlUrl);
    return new Promise((resolve) => {
        saveSwaggerSpec(cleaned, yamlUrl, (storageKey) => {
            resolve(storageKey);
        });
    });
}

// 註冊右鍵選單（支援所有來源檔案）
chrome.runtime.onInstalled.addListener(() => {
    getSwaggerLocale((lang, texts) => {
        chrome.contextMenus.create({
            id: 'open-swagger-preview',
            title: texts.contextMenuTitle,
            contexts: ['page', 'link']
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'open-swagger-preview') {
        const targetUrl = info.linkUrl || info.pageUrl || tab?.url;
        if (!targetUrl) return;

        // 如果是 raw 網址或支援的檔案格式
        if (RAW_SWAGGER_REGEX.test(targetUrl)) {
            const loadingUrl = chrome.runtime.getURL('loading.html') + '?source=' + encodeURIComponent(targetUrl);
            chrome.tabs.create({ url: loadingUrl, active: true });
        } else if (tab?.id) {
            // 發送訊息給 content script 開啟抽屜，若失敗則退回原方式
            chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SWAGGER_DRAWER', targetUrl }, (response) => {
                if (chrome.runtime.lastError || !response?.ok) {
                    copyPageContentAndRender(targetUrl, tab.id, false);
                }
            });
        }
    }
});

// 訊息監聽器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 供 loading 頁面呼叫
    if (message?.type === 'loadSwaggerFromUrl' && message.url) {
        (async () => {
            try {
                const key = await fetchAndStoreSwagger(message.url);
                sendResponse({ ok: true, key });
            } catch (error) {
                sendResponse({ ok: false, message: error?.message || '未知錯誤' });
            }
        })();
        return true;
    }

    // 供側邊抽屜（Content Script）快速抓取 Spec 內容（純記憶體，零磁碟 I/O）
    if (message?.type === 'fetchSwaggerContent' && message.url) {
        (async () => {
            try {
                const content = await fetchSwaggerContent(message.url);
                sendResponse({ ok: true, content, url: message.url });
            } catch (error) {
                sendResponse({ ok: false, message: error?.message || '無法解析或下載規範' });
            }
        })();
        return true;
    }

    // 供抽屜轉新分頁時將內容寫入 storage
    if (message?.type === 'saveSwaggerSpec' && message.content) {
        saveSwaggerSpec(message.content, message.url || '', (key) => {
            sendResponse({ ok: true, key });
        });
        return true;
    }
});
