const RAW_SWAGGER_REGEX = /^https?:\/\/raw\.githubusercontent\.com.*\.(yaml|yml|json)/i;

/**
 * 設定自動偵測的值
 */
function handleButtonChange(btnValue)
{
    chrome.storage.sync.set({ autoDetectFlag: btnValue });
}

/**
 * 點擊 swagger 按鈕事件
 */
function swaggerBtnHandler()
{
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0];
        if (!currentTab) return;
        const url = currentTab.url || '';
        if (RAW_SWAGGER_REGEX.test(url)) {
            const loadingUrl = chrome.runtime.getURL('loading.html') +
                '?source=' + encodeURIComponent(url);
            chrome.tabs.update(currentTab.id, { url: loadingUrl, active: true });
            return;
        }
        copyPageContentAndRender(url, currentTab.id);
    });
}

/**
 * 複製當前頁面內容並渲染 Swagger UI
 */
function copyPageContentAndRender(yamlUrl, tabId, background = false) {
    if (chrome.scripting && chrome.scripting.executeScript) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: getPageContent
        }, (results) => {
            handleScriptResults(results, yamlUrl, tabId, background);
        });
    }
}

/**
 * 帶有 LRU 快取的儲存管理，避免讀取全部 Storage
 */
function saveSwaggerSpec(cleanedContent, yamlUrl, callback) {
    const storageKey = 'swagger_content_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    chrome.storage.local.get(['swagger_key_index'], (result) => {
        let index = Array.isArray(result?.swagger_key_index) ? result.swagger_key_index : [];
        index.push(storageKey);
        
        let keysToRemove = [];
        if (index.length > 5) {
            keysToRemove = index.splice(0, index.length - 5);
        }
        
        const data = {
            [storageKey]: {
                content: cleanedContent,
                url: yamlUrl,
                timestamp: Date.now()
            },
            swagger_key_index: index
        };
        
        chrome.storage.local.set(data, () => {
            if (keysToRemove.length > 0) {
                chrome.storage.local.remove(keysToRemove);
            }
            if (callback) callback(storageKey);
        });
    });
}

/**
 * 處理腳本執行結果
 */
function handleScriptResults(results, yamlUrl, tabId, background) {
    if (!results || !results[0]) {
        console.error('Script execution failed or returned no results:', results);
        return;
    }

    const yamlContent = results[0].result;
    if (typeof yamlContent !== 'string' || !yamlContent.trim()) {
        console.error('無法取得有效的頁面內容。Page content is empty.');
        return;
    }
    
    // 清理和預處理內容
    const cleanedContent = cleanSwaggerContent(yamlContent);
    
    // 檢查內容是否看起來像 OpenAPI/Swagger 規範
    if (!isSwaggerContent(cleanedContent)) {
        console.error('檢測到的內容不是 OpenAPI/Swagger 規範。\nYour content does not appear to be a valid Swagger/OpenAPI specification.');
        return;
    }

    saveSwaggerSpec(cleanedContent, yamlUrl, (storageKey) => {
        const swaggerPageUrl = chrome.runtime.getURL('swagger-ui.html') + '?key=' + storageKey;
        
        if (background === true) {
            chrome.tabs.get(tabId, (tab) => {
                chrome.tabs.create({
                    url: swaggerPageUrl,
                    index: tab.index,
                    active: true
                }, () => {
                    chrome.tabs.remove(tabId);
                });
            });
        } else {
            chrome.tabs.create({
                url: swaggerPageUrl,
                active: true
            });
        }
    });
}

/**
 * 高效清理 Swagger 內容
 * 避免無謂的大字串分配與連續多重 regex 掃描
 */
function cleanSwaggerContent(content) {
    if (!content || typeof content !== 'string') {
        return '';
    }
    
    let cleaned = content;
    
    // 只有包含標籤符號時才進行 HTML 標籤替換
    if (cleaned.includes('<')) {
        cleaned = cleaned.replace(/<[^>]*>/g, '');
    }
    
    // 移除無效控制字符（保留換行符 \n, \r 與 tab \t）
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 修復常見的編碼問題（包含 non-breaking space 與全形引號）
    if (/[\u00A0\u2028\u2029\u201C\u201D\u2018\u2019]/.test(cleaned)) {
        cleaned = cleaned
            .replace(/\u00A0/g, ' ')
            .replace(/[\u2028\u2029]/g, '\n')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'");
    }
    
    // 移除多餘的連續換行
    if (cleaned.includes('\n\n\n')) {
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    }
    
    return cleaned.trim();
}

/**
 * 高效檢查內容是否為 Swagger/OpenAPI 規範
 * 支援 OpenAPI 2.0 (Swagger), 3.0, 3.1 規範
 * 兼顧 YAML, YML, JSON 格式與開頭長註解邊界情境
 */
function isSwaggerContent(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    
    // 快速路徑：取前 4KB 做樣本判定（涵蓋 99% 的情況）
    const sample = content.slice(0, 4096);
    const trimmedHead = sample.trimStart();
    
    // 快速 YAML/JSON 欄位特徵檢測
    if (/["']?(openapi|swagger)["']?\s*:/i.test(sample)) {
        return true;
    }
    
    // 檢查 JSON 格式特徵
    if (trimmedHead.startsWith('{')) {
        if (/["'](openapi|swagger|paths|info)["']\s*:/i.test(sample)) {
            return true;
        }
        // 若頭部不明顯且檔案小於 1MB 才嘗試完整 JSON.parse
        if (content.length < 1000000) {
            try {
                const json = JSON.parse(content);
                return Boolean(json.openapi || json.swagger || (json.info && json.paths));
            } catch (e) {
                // 若 JSON parse 失敗，可能為 flow-style YAML，往下走關鍵字快篩
            }
        }
    }
    
    // 全文快速關鍵字搜尋（防止頂部有超長 License/註解，耗時 < 1ms）
    return content.includes('openapi:') || 
           content.includes('swagger:') || 
           content.includes('"openapi"') || 
           content.includes('"swagger"');
}

/**
 * 在頁面中執行的函數，用來獲取內容
 * 使用 textContent 優先，避免 innerText 引發的同步 Layout Reflow
 */
function getPageContent() {
    const selectors = [
        'pre', 'code', '.highlight', '.code-block', 
        '[data-language="yaml"]', '[data-language="json"]',
        '.language-yaml', '.language-json', '.yaml', '.json'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            const text = element.textContent || '';
            if (text && (text.includes('openapi:') || text.includes('swagger:') || 
                         text.includes('"openapi"') || text.includes('"swagger"'))) {
                return text;
            }
        }
    }
    
    return document.body.textContent || '';
}