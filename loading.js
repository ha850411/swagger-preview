document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(location.search);
    const source = params.get('source');
    const msgEl = document.getElementById('msg');
    const errEl = document.getElementById('error');

    if (!source) {
        msgEl.textContent = '缺少來源網址';
        errEl.style.display = 'block';
        errEl.textContent = '無法取得原始檔 URL。';
        return;
    }

    chrome.runtime.sendMessage({ type: 'loadSwaggerFromUrl', url: source }, (resp) => {
        if (chrome.runtime.lastError) {
            errEl.style.display = 'block';
            errEl.textContent = chrome.runtime.lastError.message;
            msgEl.textContent = '載入失敗';
            return;
        }
        if (!resp || !resp.ok) {
            errEl.style.display = 'block';
            errEl.textContent = resp?.message || '未知錯誤';
            msgEl.textContent = '載入失敗';
            return;
        }
        const swaggerPageUrl = chrome.runtime.getURL('swagger-ui.html') + '?key=' + resp.key;
        window.location.replace(swaggerPageUrl);
    });
});