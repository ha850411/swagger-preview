let swaggerI18nTexts = (typeof SWAGGER_I18N !== 'undefined') ? SWAGGER_I18N.zh : {};
let renderSequence = 0;

window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const storageKey = urlParams.get('key');
    const mode = urlParams.get('mode');
    const isDrawer = (mode === 'drawer');

    // 載入語系
    if (typeof getSwaggerLocale === 'function') {
        getSwaggerLocale((lang, texts) => {
            swaggerI18nTexts = texts;
            initLoader(storageKey, isDrawer);
        });
    } else {
        initLoader(storageKey, isDrawer);
    }
};

function initLoader(storageKey, isDrawer) {
    // 抽屜模式：通知父層容器 iframe 已就緒，透過 postMessage 接收 spec
    if (isDrawer) {
        let latestLoadId = 0;
        window.addEventListener('message', function(event) {
            if (event.source !== window.parent || !/^https?:\/\/github\.com$/.test(event.origin)) return;
            const data = event.data;
            if (data?.type !== 'LOAD_SPEC' || typeof data.content !== 'string' ||
                !Number.isSafeInteger(data.loadId) || data.loadId <= latestLoadId) return;
            latestLoadId = data.loadId;
            const notify = (type, message) => {
                if (data.loadId !== latestLoadId) return;
                window.parent.postMessage({ type, loadId: data.loadId, message }, event.origin);
            };
            renderSpec(data.content, data.url || 'Unknown', true, {
                onComplete: () => notify('SWAGGER_SPEC_RENDERED'),
                onError: (message) => notify('SWAGGER_SPEC_ERROR', message)
            });
        });

        // 告知父層 Content Script 可以發送資料
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'SWAGGER_IFRAME_READY' }, '*');
        }
        return;
    }

    // 獨立分頁模式：從 Storage 讀取
    if (!storageKey) {
        showError(swaggerI18nTexts.errorNoKey || '沒有提供內容鍵值', swaggerI18nTexts.errorNoKeyDesc || '缺少有效的 key 參數');
        return;
    }

    chrome.storage.local.get([storageKey], function(result) {
        const data = result[storageKey];
        if (!data || !data.content) {
            showError(swaggerI18nTexts.errorLoadFailed || '無法從儲存中讀取內容', swaggerI18nTexts.errorLoadFailedDesc || '指定的內容鍵值不存在或已過期');
            return;
        }
        renderSpec(data.content, data.url || 'Unknown', false);
    });
}

/**
 * 解析並渲染 OpenAPI / Swagger 規範
 */
function renderSpec(content, originalUrl, isDrawer, callbacks = {}) {
    const sequence = ++renderSequence;
    if (!content || !content.trim()) {
        showError(swaggerI18nTexts.errorEmpty || '內容為空', swaggerI18nTexts.errorEmptyDesc || '載入的檔案內容為空字串');
        callbacks.onError?.(swaggerI18nTexts.errorEmpty || '內容為空');
        return;
    }

    try {
        let spec;
        const trimmedHead = content.slice(0, 100).trimStart();

        // 快速路徑：若非 { 開頭，直接以 YAML 解析，避免 JSON.parse 拋出異常的效能消耗
        if (trimmedHead.startsWith('{')) {
            try {
                spec = JSON.parse(content);
            } catch (jsonErr) {
                spec = jsyaml.load(content);
            }
        } else {
            spec = jsyaml.load(content);
        }

        if (!spec || typeof spec !== 'object') {
            throw new Error(swaggerI18nTexts.errorInvalidObject || '解析結果不是有效的 OpenAPI 物件');
        }

        if (!spec.openapi && !spec.swagger && !spec.info && !spec.paths) {
            throw new Error(swaggerI18nTexts.errorMissingFields || '內容缺少 OpenAPI/Swagger 必要欄位 (openapi, swagger, info, paths)');
        }

        // 大文件先收合，使用者展開時再顯示內容；一般文件保留原有顯示方式。
        const isLargeSpec = content.length >= 1024 * 1024 || Object.keys(spec.paths || {}).length >= 500;
        SwaggerUIBundle({
            spec: spec,
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
                SwaggerUIBundle.presets.apis
            ],
            plugins: [
                SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "BaseLayout",
            docExpansion: isLargeSpec ? 'none' : 'list',
            defaultModelsExpandDepth: isLargeSpec ? 0 : 1,
            syntaxHighlight: { activated: !isLargeSpec },
            onComplete: () => {
                if (sequence === renderSequence) callbacks.onComplete?.();
            }
        });

        // 如果是獨立分頁，顯示頂部返回與導覽工具列
        if (!isDrawer && originalUrl && originalUrl !== 'Unknown') {
            setupTopNav(originalUrl);
        }

    } catch (error) {
        console.error('Swagger UI 渲染錯誤:', error);
        showError((swaggerI18nTexts.errorTitle || '載入錯誤') + ': ' + error.message, error.stack, content, originalUrl);
        callbacks.onError?.(error.message);
    }
}

/**
 * 設定獨立分頁的頂部導覽列
 * 根據實際來源動態判斷，非 GitHub 來源不顯示 GitHub 相關文字
 */
function setupTopNav(url) {
    const nav = document.getElementById('top-nav');
    if (!nav) return;

    const isRawGithub = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.test(url);
    const isGithub = /^https?:\/\/(github\.com|raw\.githubusercontent\.com)\//i.test(url);

    let actionLinksHtml = '';

    if (isRawGithub) {
        const rawMatch = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
        const [, owner, repo, branch, filePath] = rawMatch;
        const githubFileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
        const backGithubText = swaggerI18nTexts.backToGitHub || '← 返回 GitHub 原始頁面';
        const viewRawText = swaggerI18nTexts.viewRaw || '檢視 Raw 內容';
        actionLinksHtml = `
            <a href="${escapeHtml(githubFileUrl)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(backGithubText)}
            </a>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(viewRawText)}
            </a>
        `;
    } else if (isGithub) {
        const backGithubText = swaggerI18nTexts.backToGitHub || '← 返回 GitHub 原始頁面';
        actionLinksHtml = `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(backGithubText)}
            </a>
        `;
    } else {
        // 非 GitHub 來源（如 Slack、GitLab、本機伺服器、內部 API 等）
        const backSourceText = swaggerI18nTexts.backToSource || '← 返回來源頁面';
        actionLinksHtml = `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(backSourceText)}
            </a>
        `;
    }

    const sourcePrefix = swaggerI18nTexts.sourcePrefix || '來源：';

    nav.innerHTML = `
        <div class="nav-actions">
            ${actionLinksHtml}
        </div>
        <div class="nav-url" title="${escapeHtml(url)}">
            ${escapeHtml(sourcePrefix)}${escapeHtml(url)}
        </div>
    `;
    nav.style.display = 'flex';
}

function showError(title, message, content, originalUrl) {
    const viewOriginalText = swaggerI18nTexts.viewOriginalContent || '檢視原始內容';
    const errorHtml = 
        '<div class="error-message">' +
            '<h3>' + escapeHtml(title) + '</h3>' +
            '<p>' + escapeHtml(message) + '</p>' +
        '</div>' +
        (originalUrl ? '<div class="debug-info"><p><strong>URL:</strong> ' + escapeHtml(originalUrl) + '</p></div>' : '') +
        (content ? '<details><summary>' + escapeHtml(viewOriginalText) + '</summary><pre></pre></details>' : '');
    const container = document.getElementById('swagger-ui');
    container.innerHTML = errorHtml;
    if (content) {
        const details = container.querySelector('details');
        const revealContent = () => {
            if (!details.open) return;
            details.querySelector('pre').textContent = content;
            details.removeEventListener('toggle', revealContent);
        };
        details.addEventListener('toggle', revealContent);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
