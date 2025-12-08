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
        const url = currentTab.url;
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
    // 檢查是否支援 chrome.scripting API
    if (chrome.scripting && chrome.scripting.executeScript) {
        // 使用新的 chrome.scripting API (Manifest V3)
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: getPageContent
        }, (results) => {
            handleScriptResults(results, yamlUrl, tabId, background);
        });
    }
}

/**
 * 處理腳本執行結果
 */
function handleScriptResults(results, yamlUrl, tabId, background) {
    if (results && results[0]) {
        // 修正：正確獲取結果值
        let yamlContent = results[0].result;
        
        // 確保 yamlContent 是字串類型
        if (typeof yamlContent !== 'string') {
            return;
        }
        
        if (yamlContent && yamlContent.trim()) {
            // 清理和預處理內容
            const cleanedContent = cleanSwaggerContent(yamlContent);
            
            // 檢查內容是否看起來像 OpenAPI/Swagger 規範
            if (isSwaggerContent(cleanedContent)) {
                // 生成唯一的 key
                const storageKey = 'swagger_content_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                
                // 將內容存入 chrome.storage.local
                chrome.storage.local.set({ 
                    [storageKey]: {
                        content: cleanedContent,
                        url: yamlUrl,
                        timestamp: Date.now()
                    }
                }, () => {
                    // 使用本地 HTML 頁面並透過 URL 參數傳遞 storage key
                    const swaggerPageUrl = chrome.runtime.getURL('swagger-ui.html') + 
                        '?key=' + storageKey;
                    
                    // 先關閉原分頁,再在相同位置創建新分頁
                    if (background === true) {
                        chrome.tabs.get(tabId, (tab) => {
                            chrome.tabs.create({
                                url: swaggerPageUrl,
                                index: tab.index,
                                active: true
                            }, (newTab) => {
                                // 創建新分頁後關閉原分頁
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
            } else {
                console.error('檢測到的內容不是 OpenAPI/Swagger 規範。\n\nYour content does not appear to be a valid Swagger/OpenAPI specification.');
            }
        } else {
            console.error('無法取得有效的頁面內容。\n\nPage content is empty.');
        }
    } else {
        console.error('Script execution failed or returned no results:', results);
    }
}

/**
 * 清理 Swagger 內容
 */
function cleanSwaggerContent(content) {
    if (!content || typeof content !== 'string') {
        return '';
    }
    
    // 移除HTML標籤
    let cleaned = content.replace(/<[^>]*>/g, '');
    
    // 移除控制字符（保留換行符和tab）
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 修復常見的編碼問題
    cleaned = cleaned.replace(/\u00A0/g, ' '); // 替換非斷行空格
    cleaned = cleaned.replace(/\u2028/g, '\n'); // 替換行分隔符
    cleaned = cleaned.replace(/\u2029/g, '\n'); // 替換段落分隔符
    
    // 移除多餘的空白行（超過兩個連續換行）
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // 修復可能的引號問題
    cleaned = cleaned.replace(/[""]/g, '"'); // 統一雙引號
    cleaned = cleaned.replace(/['']/g, "'"); // 統一單引號
    
    return cleaned.trim();
}

/**
 * 檢查內容是否為 Swagger/OpenAPI 規範
 */
function isSwaggerContent(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    
    const trimmedContent = content.trim();
    
    // 檢查 YAML 格式的 OpenAPI/Swagger 關鍵字
    const yamlKeywords = [
        'openapi:', 'swagger:'
    ];
    
    // 檢查 JSON 格式
    if (trimmedContent.startsWith('{')) {
        try {
            const json = JSON.parse(trimmedContent);
            return json.openapi || json.swagger || json.info || json.paths;
        } catch (e) {
            return false;
        }
    }
    
    // 檢查 YAML 格式
    return yamlKeywords.some(keyword => trimmedContent.includes(keyword));
}

/**
 * 在頁面中執行的函數，用來獲取內容
 */
function getPageContent() {
    let content = '';
    
    // 優先嘗試從特定元素獲取內容
    const selectors = [
        'pre', 'code', '.highlight', '.code-block', 
        '[data-language="yaml"]', '[data-language="json"]',
        '.language-yaml', '.language-json', '.yaml', '.json'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            content = element.innerText || element.textContent || '';
            if (content && content.trim() && 
                (content.includes('openapi:') || content.includes('swagger:') || 
                 content.includes('info:') || content.includes('paths:') ||
                 content.trim().startsWith('{'))) {
                return content;
            }
        }
    }
    
    // 如果沒有找到特定元素，使用整個body
    content = document.body.innerText || document.body.textContent || '';
    
    // 確保總是返回字串
    return content || '';
}