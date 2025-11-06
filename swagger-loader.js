window.onload = function() {
    // 從 URL 參數獲取 storage key
    const urlParams = new URLSearchParams(window.location.search);
    const storageKey = urlParams.get('key');
    
    if (!storageKey) {
        document.getElementById('swagger-ui').innerHTML = 
            '<div class="error-message"><h3>錯誤</h3><p>沒有提供內容鍵值</p></div>';
        return;
    }
    
    // 從 chrome.storage.local 讀取內容
    chrome.storage.local.get([storageKey], function(result) {
        const data = result[storageKey];
        
        if (!data || !data.content) {
            document.getElementById('swagger-ui').innerHTML = 
                '<div class="error-message"><h3>錯誤</h3><p>無法從儲存中讀取內容</p></div>';
            return;
        }
        
        const content = data.content;
        const originalUrl = data.url || 'Unknown';
        
        try {
            let spec;
            
            if (!content || content.trim() === '') {
                throw new Error('內容為空');
            }
            
            console.log('原始內容長度:', content.length);
            console.log('內容前100字符:', content.substring(0, 100));
            
            // 嘗試解析為 JSON
            try {
                spec = JSON.parse(content);
                console.log('成功解析為 JSON');
            } catch (jsonError) {
                console.log('JSON 解析失敗:', jsonError.message);
                // 如果 JSON 解析失敗，嘗試解析為 YAML
                try {
                    spec = jsyaml.load(content);
                    console.log('成功解析為 YAML');
                } catch (yamlError) {
                    console.log('YAML 解析失敗:', yamlError.message);
                    throw new Error('無法解析內容為有效的 JSON 或 YAML 格式。\n\nJSON錯誤: ' + jsonError.message + '\n\nYAML錯誤: ' + yamlError.message);
                }
            }
            
            // 檢查解析結果是否為有效的 OpenAPI 規範
            if (!spec || typeof spec !== 'object') {
                throw new Error('解析結果不是有效的物件');
            }
            
            if (!spec.openapi && !spec.swagger && !spec.info && !spec.paths) {
                throw new Error('內容不包含 OpenAPI/Swagger 必要欄位 (openapi, swagger, info, paths)');
            }
            
            // 初始化 Swagger UI
            const ui = SwaggerUIBundle({
                spec: spec,
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.presets.standalone
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "BaseLayout"
            });
            
            console.log('Swagger UI 初始化成功');
            
            // 清理舊的 storage 資料 (保留最近的 5 個)
            chrome.storage.local.get(null, function(items) {
                const keys = Object.keys(items).filter(k => k.startsWith('swagger_content_'));
                if (keys.length > 5) {
                    // 按時間戳排序
                    keys.sort((a, b) => {
                        const aTime = items[a].timestamp || 0;
                        const bTime = items[b].timestamp || 0;
                        return aTime - bTime;
                    });
                    // 刪除最舊的項目
                    const toRemove = keys.slice(0, keys.length - 5);
                    chrome.storage.local.remove(toRemove);
                }
            });
            
        } catch (error) {
            console.error('Swagger UI 初始化錯誤:', error);
            
            const errorHtml = 
                '<div class="error-message">' +
                    '<h3>載入錯誤</h3>' +
                    '<p>無法載入 Swagger 規範</p>' +
                    '<p><strong>錯誤訊息:</strong></p>' +
                    '<pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto;">' + 
                        escapeHtml(error.message) + 
                    '</pre>' +
                '</div>' +
                '<div class="debug-info">' +
                    '<h4>除錯資訊</h4>' +
                    '<p><strong>內容長度:</strong> ' + content.length + ' 字符</p>' +
                    '<p><strong>原始 URL:</strong> ' + escapeHtml(originalUrl) + '</p>' +
                '</div>' +
                '<details>' +
                    '<summary>完整原始內容 (點擊展開)</summary>' +
                    '<pre>' + escapeHtml(content) + '</pre>' +
                '</details>';
                
            document.getElementById('swagger-ui').innerHTML = errorHtml;
        }
    });
};

// 輔助函數：轉義 HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}