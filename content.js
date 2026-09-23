/**
 * Swagger Preview - Content Script for GitHub
 * 提供原生按鈕注入、抗改版懸浮按鈕、直覺尺寸調整與 Shadow DOM 側邊抽屜（Slide-over Drawer）
 */

(function () {
    // 避免重複執行
    if (window.__SWAGGER_PREVIEW_LOADED__) return;
    window.__SWAGGER_PREVIEW_LOADED__ = true;

    const SWAGGER_EXT_REGEX = /\.(ya?ml|json)($|\?|#)/i;
    let drawerHost = null;
    let shadowRoot = null;
    let currentLang = 'zh';
    let drawerState = {
        isOpen: false,
        currentUrl: '',
        currentSpec: null,
        iframeReady: false,
        widthPercent: 50
    };
    const specCache = new Map();

    function getTexts() {
        return (typeof SWAGGER_I18N !== 'undefined' && SWAGGER_I18N[currentLang]) ? SWAGGER_I18N[currentLang] : SWAGGER_I18N.zh;
    }

    /**
     * 判定當前頁面是否為可能的 OpenAPI / Swagger 檔案
     */
    function isSwaggerFilePage() {
        const path = window.location.pathname;
        if (!path.includes('/blob/')) return false;
        return SWAGGER_EXT_REGEX.test(path);
    }

    /**
     * 尋找 GitHub Raw 按鈕錨點（使用抗改版的語意化屬性搜尋）
     */
    function findRawAnchor() {
        return document.querySelector('a[href*="/raw/"][data-testid="raw-button"]') ||
               document.querySelector('a[href*="/raw/"]') ||
               document.querySelector('[data-testid="raw-button"]') ||
               document.querySelector('#raw-url');
    }

    /**
     * 計算 Raw 檔案真實網址
     */
    function getRawUrl() {
        const rawAnchor = findRawAnchor();
        if (rawAnchor && rawAnchor.href && rawAnchor.href.includes('/raw/')) {
            return rawAnchor.href;
        }
        return window.location.href.replace('/blob/', '/raw/');
    }

    /**
     * 取得當前檔案名稱
     */
    function getCurrentFileName() {
        const parts = window.location.pathname.split('/');
        return decodeURIComponent(parts[parts.length - 1] || 'openapi.yaml');
    }

    /**
     * 確保全域注入原生風格按鈕樣式（完全繼承 GitHub Primer 變數與 Raw 配色）
     */
    function ensureButtonStyles() {
        if (document.getElementById('sp-btn-styles')) return;
        const style = document.createElement('style');
        style.id = 'sp-btn-styles';
        style.textContent = `
            #sp-github-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 3px 10px;
                font-size: 12px;
                font-weight: 500;
                line-height: 20px;
                font-family: inherit;
                cursor: pointer;
                user-select: none;
                margin-right: 6px;
                border-radius: 6px;
                vertical-align: middle;
                box-sizing: border-box;
                text-decoration: none;
                transition: 80ms cubic-bezier(0.33, 1, 0.68, 1);
                
                /* 優先採用 GitHub Primer 設計系統變數，次之使用自 rawAnchor 動態萃取之配色，最後提供安全備援 */
                color: var(--button-default-fgColor-rest, var(--control-fgColor-rest, var(--sp-btn-raw-color, inherit)));
                background-color: var(--button-default-bgColor-rest, var(--control-bgColor-rest, var(--sp-btn-raw-bg, #212830)));
                border: 1px solid var(--button-default-borderColor-rest, var(--control-borderColor-rest, var(--sp-btn-raw-border, rgba(240, 246, 252, 0.1))));
                box-shadow: var(--button-default-shadow-resting, 0 1px 0 rgba(31, 35, 40, 0.04));
            }

            #sp-github-btn:hover {
                color: var(--button-default-fgColor-hover, var(--control-fgColor-hover, var(--button-default-fgColor-rest, var(--control-fgColor-rest, inherit))));
                background-color: var(--button-default-bgColor-hover, var(--control-bgColor-hover, var(--sp-btn-raw-hover-bg, rgba(255, 255, 255, 0.08))));
                border-color: var(--button-default-borderColor-hover, var(--control-borderColor-hover, var(--sp-btn-raw-hover-border, rgba(255, 255, 255, 0.2))));
                text-decoration: none;
            }

            #sp-github-btn:active {
                background-color: var(--button-default-bgColor-active, var(--control-bgColor-active, rgba(255, 255, 255, 0.12)));
            }

            #sp-github-btn:focus-visible {
                outline: 2px solid var(--focus-outlineColor, #0969da);
                outline-offset: -2px;
            }
        `;
        document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);
    }

    /**
     * 動態自 Raw 按鈕提取色彩與文字規格，確保深淺色與各類主題 100% 契合
     */
    function syncWithRawAnchor(btn, rawAnchor) {
        if (!rawAnchor || !btn) return;
        try {
            const rawStyle = window.getComputedStyle(rawAnchor);
            if (!rawStyle) return;

            const bg = rawStyle.backgroundColor;
            const color = rawStyle.color;
            const borderColor = rawStyle.borderTopColor || rawStyle.borderColor;

            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                btn.style.setProperty('--sp-btn-raw-bg', bg);
                // 自動計算明度以設定備援 hover 效果
                const rgb = bg.match(/\d+/g);
                if (rgb && rgb.length >= 3) {
                    const brightness = (Number(rgb[0]) * 299 + Number(rgb[1]) * 587 + Number(rgb[2]) * 114) / 1000;
                    if (brightness > 128) {
                        btn.style.setProperty('--sp-btn-raw-hover-bg', '#f3f4f6');
                        btn.style.setProperty('--sp-btn-raw-hover-border', 'rgba(31, 35, 40, 0.2)');
                    } else {
                        btn.style.setProperty('--sp-btn-raw-hover-bg', '#262c36');
                        btn.style.setProperty('--sp-btn-raw-hover-border', '#8b949e');
                    }
                }
            }
            if (color && color !== 'transparent') {
                btn.style.setProperty('--sp-btn-raw-color', color);
            }
            if (borderColor && borderColor !== 'transparent' && borderColor !== 'rgba(0, 0, 0, 0)') {
                btn.style.setProperty('--sp-btn-raw-border', borderColor);
            }
            if (rawStyle.fontSize) btn.style.fontSize = rawStyle.fontSize;
            if (rawStyle.lineHeight) btn.style.lineHeight = rawStyle.lineHeight;
        } catch (e) {
            // safe fallback to CSS variables
        }
    }

    /**
     * 注入 GitHub 原生風格按鈕
     */
    function injectButton() {
        if (!isSwaggerFilePage()) {
            removeInjectedElements();
            return;
        }

        const rawAnchor = findRawAnchor();
        const texts = getTexts();

        if (rawAnchor) {
            ensureButtonStyles();
            let btn = document.getElementById('sp-github-btn');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'sp-github-btn';
                btn.type = 'button';
                btn.title = texts.swaggerBtnTooltip;
                
                const iconUrl = chrome.runtime.getURL('swaggerIcon.png');
                btn.innerHTML = `
                    <span style="display: inline-flex; align-items: center; gap: 5px;">
                        <img src="${iconUrl}" style="width: 14px; height: 14px; vertical-align: middle; flex-shrink: 0;" alt="Swagger" />
                        <span id="sp-btn-label">${texts.swaggerBtnText}</span>
                    </span>
                `;

                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleDrawer();
                });

                // 若 rawAnchor 隸屬於按鈕群組，將 Swagger 按鈕插在群組前，保持群組圓角完整
                const btnGroup = rawAnchor.closest('[data-component="ButtonGroup"], .BtnGroup');
                const targetElement = btnGroup || rawAnchor;
                const parent = targetElement.parentElement;
                if (parent) {
                    parent.insertBefore(btn, targetElement);
                }
            } else {
                btn.title = texts.swaggerBtnTooltip;
                const label = btn.querySelector('#sp-btn-label');
                if (label) label.textContent = texts.swaggerBtnText;
            }

            syncWithRawAnchor(btn, rawAnchor);
            removeFloatingButton();
        } else {
            injectFloatingButton();
        }
    }

    /**
     * 降級備用懸浮按鈕（掛在 document.body，100% 抗改版）
     */
    function injectFloatingButton() {
        const texts = getTexts();
        let fab = document.getElementById('sp-floating-btn');
        if (fab) {
            const label = fab.querySelector('span');
            if (label) label.textContent = texts.floatingBtnText;
            return;
        }

        fab = document.createElement('div');
        fab.id = 'sp-floating-btn';
        const iconUrl = chrome.runtime.getURL('swaggerIcon.png');
        fab.innerHTML = `
            <img src="${iconUrl}" style="width: 16px; height: 16px;" alt="Swagger" />
            <span>${texts.floatingBtnText}</span>
        `;

        Object.assign(fab.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: '2147483630',
            backgroundColor: '#1f2328',
            color: '#ffffff',
            padding: '8px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
            userSelect: 'none'
        });

        fab.addEventListener('mouseenter', () => {
            fab.style.transform = 'translateY(-2px) scale(1.02)';
            fab.style.backgroundColor = '#2d333b';
        });
        fab.addEventListener('mouseleave', () => {
            fab.style.transform = 'translateY(0) scale(1)';
            fab.style.backgroundColor = '#1f2328';
        });
        fab.addEventListener('click', () => toggleDrawer());

        document.body.appendChild(fab);
    }

    function removeFloatingButton() {
        const fab = document.getElementById('sp-floating-btn');
        if (fab) fab.remove();
    }

    function removeInjectedElements() {
        const btn = document.getElementById('sp-github-btn');
        if (btn) btn.remove();
        const style = document.getElementById('sp-btn-styles');
        if (style) style.remove();
        removeFloatingButton();
    }

    /**
     * 建立 Shadow DOM 隔離的側邊抽屜
     */
    function ensureDrawer() {
        if (drawerHost && shadowRoot) return;

        drawerHost = document.createElement('div');
        drawerHost.id = 'swagger-preview-drawer-host';
        shadowRoot = drawerHost.attachShadow({ mode: 'open' });

        const texts = getTexts();
        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; margin: 0; padding: 0; }
            .sp-backdrop {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.35);
                backdrop-filter: blur(1.5px);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
                z-index: 2147483640;
            }
            .sp-backdrop.active {
                opacity: 1;
                pointer-events: auto;
            }
            .sp-drawer {
                position: fixed;
                top: 0; right: 0; bottom: 0;
                width: 50vw;
                min-width: 400px;
                max-width: 96vw;
                background: #ffffff;
                box-shadow: -8px 0 32px rgba(0, 0, 0, 0.2);
                transform: translateX(100%);
                transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.22s ease;
                z-index: 2147483641;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .sp-drawer.active {
                transform: translateX(0);
            }
            .sp-resizer {
                position: absolute;
                left: 0; top: 0; bottom: 0;
                width: 6px;
                cursor: col-resize;
                background: transparent;
                transition: background 0.15s ease;
                z-index: 10;
            }
            .sp-resizer:hover, .sp-resizer.dragging {
                background: #49cc90;
            }
            .sp-header {
                height: 52px;
                padding: 0 16px 0 20px;
                background: #1f2328;
                color: #f0f6fc;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid #30363d;
                user-select: none;
            }
            .sp-header-left {
                display: flex;
                align-items: center;
                gap: 10px;
                overflow: hidden;
            }
            .sp-title {
                font-size: 14px;
                font-weight: 600;
                color: #ffffff;
                white-space: nowrap;
            }
            .sp-chip {
                background: rgba(255, 255, 255, 0.12);
                color: #e6edf3;
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 12px;
                max-width: 240px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .sp-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            /* 直覺的分段寬度選擇器 */
            .sp-width-group {
                display: inline-flex;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 6px;
                padding: 2px;
                gap: 2px;
                align-items: center;
            }
            .sp-width-item {
                background: transparent;
                border: none;
                color: #8b949e;
                font-size: 11px;
                font-weight: 500;
                padding: 3px 8px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 3px;
                transition: all 0.15s ease;
                line-height: 14px;
                user-select: none;
            }
            .sp-width-item:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.14);
            }
            .sp-width-item.active {
                background: #49cc90;
                color: #ffffff;
                font-weight: 600;
            }
            .sp-btn {
                background: rgba(255, 255, 255, 0.08);
                color: #e6edf3;
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }
            .sp-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.3);
                color: #ffffff;
            }
            .sp-close-btn {
                background: transparent;
                border: none;
                color: #8b949e;
                font-size: 18px;
                cursor: pointer;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.15s ease;
            }
            .sp-close-btn:hover {
                background: rgba(255, 255, 255, 0.15);
                color: #ffffff;
            }
            .sp-body {
                flex: 1;
                position: relative;
                overflow: hidden;
                background: #fafafa;
            }
            .sp-iframe {
                width: 100%;
                height: 100%;
                border: none;
                display: block;
            }
            .sp-loading {
                position: absolute;
                inset: 0;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 16px;
                color: #57606a;
                font-size: 13px;
                z-index: 5;
                transition: opacity 0.2s ease;
            }
            .sp-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid #e1e4e8;
                border-top-color: #49cc90;
                border-radius: 50%;
                animation: sp-spin 0.7s linear infinite;
            }
            .sp-error {
                position: absolute;
                inset: 20px;
                background: #fff;
                padding: 24px;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.08);
                display: none;
                flex-direction: column;
                gap: 12px;
                z-index: 6;
            }
            .sp-error h4 { color: #cf222e; font-size: 16px; }
            .sp-error p { color: #57606a; font-size: 13px; line-height: 1.5; }
            @keyframes sp-spin {
                to { transform: rotate(360deg); }
            }
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="sp-backdrop" id="sp-backdrop"></div>
            <div class="sp-drawer" id="sp-drawer">
                <div class="sp-resizer" id="sp-resizer" title="${texts.resizerTitle}"></div>
                <div class="sp-header">
                    <div class="sp-header-left">
                        <img src="${chrome.runtime.getURL('swaggerIcon.png')}" style="width: 18px; height: 18px;" />
                        <span class="sp-title">${texts.title}</span>
                        <span class="sp-chip" id="sp-file-chip"></span>
                    </div>
                    <div class="sp-actions">
                        <!-- 直觀分段寬度按鈕組 -->
                        <div class="sp-width-group" id="sp-width-group" role="group" aria-label="Width selection">
                            <button class="sp-width-item active" data-width="50" id="sp-w-50" title="${texts.width50Title}">50%</button>
                            <button class="sp-width-item" data-width="75" id="sp-w-75" title="${texts.width75Title}">75%</button>
                            <button class="sp-width-item" data-width="96" id="sp-w-100" title="${texts.width100Title}">
                                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 1 0V2h3.5a.5.5 0 0 0 0-1h-4zm13 0a.5.5 0 0 0-.5.5V5a.5.5 0 0 0 1 0V2h-3.5a.5.5 0 0 0 0-1h4a.5.5 0 0 0 .5-.5zm0 14a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-1 0v3.5h-3.5a.5.5 0 0 0 0 1h4zm-13 0a.5.5 0 0 0 .5-.5v-3.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 0-1H2z"/>
                                </svg>
                                <span>100%</span>
                            </button>
                        </div>
                        <button class="sp-btn" id="sp-newtab-btn" title="${texts.openNewTabTitle}">${texts.openNewTab}</button>
                        <button class="sp-close-btn" id="sp-close-btn" title="${texts.closeTitle}">✕</button>
                    </div>
                </div>
                <div class="sp-body">
                    <div class="sp-loading" id="sp-loading">
                        <div class="sp-spinner"></div>
                        <div id="sp-loading-text">${texts.loading}</div>
                    </div>
                    <div class="sp-error" id="sp-error">
                        <h4 id="sp-error-title">${texts.errorTitle}</h4>
                        <p id="sp-error-desc"></p>
                        <div>
                            <button class="sp-btn" id="sp-retry-btn" style="color: #24292f; border-color: #d0d7de; background: #f6f8fa;">${texts.retry}</button>
                        </div>
                    </div>
                    <iframe class="sp-iframe" id="sp-iframe" src="${chrome.runtime.getURL('swagger-ui.html?mode=drawer')}"></iframe>
                </div>
            </div>
        `;

        shadowRoot.appendChild(style);
        shadowRoot.appendChild(wrapper);
        document.body.appendChild(drawerHost);

        bindDrawerEvents();
        applyDrawerWidth(drawerState.widthPercent);
    }

    /**
     * 更新抽屜內各按鈕與標籤的多語系字串
     */
    function updateI18nLabels() {
        const texts = getTexts();
        
        // 更新頂部注入按鈕
        const injectedBtn = document.getElementById('sp-github-btn');
        if (injectedBtn) {
            injectedBtn.title = texts.swaggerBtnTooltip;
            const label = injectedBtn.querySelector('#sp-btn-label');
            if (label) label.textContent = texts.swaggerBtnText;
        }

        // 更新懸浮按鈕
        const fab = document.getElementById('sp-floating-btn');
        if (fab) {
            const label = fab.querySelector('span');
            if (label) label.textContent = texts.floatingBtnText;
        }

        if (!shadowRoot) return;

        // 更新抽屜內標籤與提示
        const resizer = shadowRoot.getElementById('sp-resizer');
        const w50 = shadowRoot.getElementById('sp-w-50');
        const w75 = shadowRoot.getElementById('sp-w-75');
        const w100 = shadowRoot.getElementById('sp-w-100');
        const newTabBtn = shadowRoot.getElementById('sp-newtab-btn');
        const closeBtn = shadowRoot.getElementById('sp-close-btn');
        const loadingText = shadowRoot.getElementById('sp-loading-text');
        const errorTitle = shadowRoot.getElementById('sp-error-title');
        const retryBtn = shadowRoot.getElementById('sp-retry-btn');

        if (resizer) resizer.title = texts.resizerTitle;
        if (w50) w50.title = texts.width50Title;
        if (w75) w75.title = texts.width75Title;
        if (w100) w100.title = texts.width100Title;
        if (newTabBtn) {
            newTabBtn.title = texts.openNewTabTitle;
            newTabBtn.textContent = texts.openNewTab;
        }
        if (closeBtn) closeBtn.title = texts.closeTitle;
        if (loadingText) loadingText.textContent = texts.loading;
        if (errorTitle) errorTitle.textContent = texts.errorTitle;
        if (retryBtn) retryBtn.textContent = texts.retry;
    }

    /**
     * 套用並更新抽屜寬度與按鈕狀態
     */
    function applyDrawerWidth(percent) {
        const clamped = Math.max(20, Math.min(96, parseInt(percent, 10) || 50));
        drawerState.widthPercent = clamped;
        if (!shadowRoot) return;
        const drawer = shadowRoot.getElementById('sp-drawer');
        if (drawer) {
            drawer.style.width = clamped + 'vw';
        }
        updateActiveWidthButton(clamped);
    }

    /**
     * 儲存使用者的百分比設定至 storage
     */
    function saveDrawerWidth(percent) {
        const clamped = Math.max(20, Math.min(96, parseInt(percent, 10) || 50));
        drawerState.widthPercent = clamped;
        try {
            chrome.storage.sync.set({ drawerWidthPercent: clamped }, () => {
                if (chrome.runtime.lastError) {
                    chrome.storage.local.set({ drawerWidthPercent: clamped });
                }
            });
        } catch (e) {
            try {
                chrome.storage.local.set({ drawerWidthPercent: clamped });
            } catch (_) {}
        }
    }

    /**
     * 從 storage 讀取已儲存的寬度百分比
     */
    function loadSavedDrawerWidth(callback) {
        try {
            chrome.storage.sync.get(['drawerWidthPercent'], (result) => {
                if (!chrome.runtime.lastError && result && result.drawerWidthPercent) {
                    applyDrawerWidth(result.drawerWidthPercent);
                    if (callback) callback(result.drawerWidthPercent);
                } else {
                    chrome.storage.local.get(['drawerWidthPercent'], (resLocal) => {
                        const val = resLocal?.drawerWidthPercent || drawerState.widthPercent || 50;
                        applyDrawerWidth(val);
                        if (callback) callback(val);
                    });
                }
            });
        } catch (e) {
            if (callback) callback(drawerState.widthPercent);
        }
    }

    /**
     * 直觀分段寬度切換按鈕高亮同步
     */
    function updateActiveWidthButton(currentPercent) {
        if (!shadowRoot) return;
        const widthItems = shadowRoot.querySelectorAll('.sp-width-item');
        widthItems.forEach(btn => {
            const target = parseInt(btn.dataset.width, 10);
            if (Math.abs(target - currentPercent) <= 4 || (target === 96 && currentPercent >= 92)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * 綁定抽屜互動事件（關閉、寬度切換、拖曳調整、Esc鍵）
     */
    function bindDrawerEvents() {
        const backdrop = shadowRoot.getElementById('sp-backdrop');
        const closeBtn = shadowRoot.getElementById('sp-close-btn');
        const newTabBtn = shadowRoot.getElementById('sp-newtab-btn');
        const retryBtn = shadowRoot.getElementById('sp-retry-btn');
        const resizer = shadowRoot.getElementById('sp-resizer');
        const drawer = shadowRoot.getElementById('sp-drawer');
        const iframe = shadowRoot.getElementById('sp-iframe');
        const widthItems = shadowRoot.querySelectorAll('.sp-width-item');

        backdrop.addEventListener('click', closeDrawer);
        closeBtn.addEventListener('click', closeDrawer);

        // 新分頁開啟
        newTabBtn.addEventListener('click', () => {
            if (!drawerState.currentSpec) return;
            chrome.runtime.sendMessage({
                type: 'saveSwaggerSpec',
                content: drawerState.currentSpec,
                url: drawerState.currentUrl
            }, (res) => {
                if (res?.ok && res.key) {
                    const newTabUrl = chrome.runtime.getURL('swagger-ui.html?key=' + res.key);
                    window.open(newTabUrl, '_blank');
                }
            });
        });

        // 點擊預設比例（50%、75%、100%）並記住設定
        widthItems.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetWidth = parseInt(btn.dataset.width, 10);
                applyDrawerWidth(targetWidth);
                saveDrawerWidth(targetWidth);
            });
        });

        // 重新嘗試
        retryBtn.addEventListener('click', () => {
            loadSpecIntoDrawer(drawerState.currentUrl, true);
        });

        // 拖曳調整寬度
        let isDragging = false;
        resizer.addEventListener('mousedown', () => {
            isDragging = true;
            resizer.classList.add('dragging');
            drawer.style.transition = 'none'; // 拖曳時關閉 transition，確保零延遲跟手
            iframe.style.pointerEvents = 'none'; // 避免被 iframe 吞掉滑鼠事件
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newWidth = Math.max(380, Math.min(window.innerWidth * 0.96, window.innerWidth - e.clientX));
            drawer.style.width = newWidth + 'px';
            const percent = Math.round((newWidth / window.innerWidth) * 100);
            drawerState.widthPercent = percent;
            updateActiveWidthButton(percent);
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            resizer.classList.remove('dragging');
            drawer.style.transition = '';
            iframe.style.pointerEvents = 'auto';
            document.body.style.userSelect = '';
            if (drawerState.widthPercent) {
                // 將拖曳出的寬度百分比標準化並持久化記住
                drawer.style.width = drawerState.widthPercent + 'vw';
                saveDrawerWidth(drawerState.widthPercent);
            }
        });

        // 監聽 iframe ready postMessage
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'SWAGGER_IFRAME_READY') {
                drawerState.iframeReady = true;
                if (drawerState.currentSpec) {
                    sendSpecToIframe(drawerState.currentSpec, drawerState.currentUrl);
                }
            }
        });

        // ESC 快捷鍵關閉抽屜
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && drawerState.isOpen) {
                closeDrawer();
            }
        });
    }

    /**
     * 開啟側邊抽屜
     */
    function openDrawer(targetUrl) {
        ensureDrawer();
        drawerState.isOpen = true;
        const backdrop = shadowRoot.getElementById('sp-backdrop');
        const drawer = shadowRoot.getElementById('sp-drawer');
        const fileChip = shadowRoot.getElementById('sp-file-chip');

        backdrop.classList.add('active');
        drawer.classList.add('active');
        fileChip.textContent = getCurrentFileName();

        const url = targetUrl || getRawUrl();
        loadSpecIntoDrawer(url);
    }

    /**
     * 關閉側邊抽屜
     */
    function closeDrawer() {
        if (!drawerHost || !shadowRoot) return;
        drawerState.isOpen = false;
        const backdrop = shadowRoot.getElementById('sp-backdrop');
        const drawer = shadowRoot.getElementById('sp-drawer');
        if (backdrop) backdrop.classList.remove('active');
        if (drawer) drawer.classList.remove('active');
    }

    /**
     * 切換抽屜顯示狀態
     */
    function toggleDrawer(targetUrl) {
        if (drawerState.isOpen) {
            closeDrawer();
        } else {
            openDrawer(targetUrl);
        }
    }

    /**
     * 下載並載入 Spec 至抽屜
     */
    function loadSpecIntoDrawer(rawUrl, forceRefresh = false) {
        drawerState.currentUrl = rawUrl;
        const loading = shadowRoot.getElementById('sp-loading');
        const errorView = shadowRoot.getElementById('sp-error');

        errorView.style.display = 'none';

        // 快取命中：若同一頁面未重新整理，直接以記憶體快速顯示
        if (!forceRefresh && specCache.has(rawUrl)) {
            const cached = specCache.get(rawUrl);
            drawerState.currentSpec = cached;
            sendSpecToIframe(cached, rawUrl);
            loading.style.opacity = '0';
            setTimeout(() => { loading.style.display = 'none'; }, 200);
            return;
        }

        loading.style.display = 'flex';
        loading.style.opacity = '1';

        // 透過 Background Service Worker 快速抓取並清理（純記憶體，零磁碟 I/O）
        chrome.runtime.sendMessage({
            type: 'fetchSwaggerContent',
            url: rawUrl
        }, (res) => {
            if (chrome.runtime.lastError || !res || !res.ok) {
                const errMsg = res?.message || chrome.runtime.lastError?.message || '無法下載或解析規範';
                showDrawerError(getTexts().errorTitle, errMsg);
                loading.style.display = 'none';
                return;
            }

            drawerState.currentSpec = res.content;
            specCache.set(rawUrl, res.content);

            sendSpecToIframe(res.content, rawUrl);
            loading.style.opacity = '0';
            setTimeout(() => { loading.style.display = 'none'; }, 200);
        });
    }

    /**
     * 透過 postMessage 將 Spec 傳入 iframe
     */
    function sendSpecToIframe(content, url) {
        const iframe = shadowRoot.getElementById('sp-iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'LOAD_SPEC',
                content: content,
                url: url
            }, '*');
        }
    }

    function showDrawerError(title, desc) {
        const errorView = shadowRoot.getElementById('sp-error');
        const errorTitle = shadowRoot.getElementById('sp-error-title');
        const errorDesc = shadowRoot.getElementById('sp-error-desc');
        if (errorView) {
            errorTitle.textContent = title;
            errorDesc.textContent = desc;
            errorView.style.display = 'flex';
        }
    }

    // 監聽來自 background 的訊息（如 Context Menu 右鍵預覽）
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === 'TOGGLE_SWAGGER_DRAWER') {
            toggleDrawer(message.targetUrl);
            sendResponse({ ok: true });
        }
    });

    // 監聽語言與抽屜寬度設定變更，即時跨分頁同步
    chrome.storage.onChanged.addListener((changes, area) => {
        if (changes.language) {
            currentLang = changes.language.newValue;
            updateI18nLabels();
        }
        if (changes.drawerWidthPercent) {
            applyDrawerWidth(changes.drawerWidthPercent.newValue);
        }
    });

    /**
     * 支援 GitHub Turbo (Hotwire) / PJAX 的單頁軟路由檢測
     */
    let navDebounce = null;
    function handleNavigation() {
        if (navDebounce) clearTimeout(navDebounce);
        navDebounce = setTimeout(() => {
            injectButton();
        }, 120);
    }

    // 註冊 GitHub SPA 生命週期事件
    document.addEventListener('turbo:render', handleNavigation);
    document.addEventListener('turbo:load', handleNavigation);
    document.addEventListener('pjax:end', handleNavigation);
    window.addEventListener('popstate', handleNavigation);

    // 搭配輕量 MutationObserver，確保在 React 動態渲染完畢後按鈕順利掛載
    const observer = new MutationObserver(() => {
        if (isSwaggerFilePage() && !document.getElementById('sp-github-btn') && !document.getElementById('sp-floating-btn')) {
            handleNavigation();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 預先載入已記憶之抽屜寬度設定
    loadSavedDrawerWidth();

    // 初始化語言並執行導航偵測
    if (typeof getSwaggerLocale === 'function') {
        getSwaggerLocale((lang) => {
            currentLang = lang;
            handleNavigation();
        });
    } else {
        handleNavigation();
    }
})();
