document.addEventListener("DOMContentLoaded", function () {
    const autoDetectButton = document.getElementById("autoDetect");
    const swaggerBtn = document.getElementById("swaggerBtn");
    const btnText = document.getElementById("btn-text");
    const labelAutoDetect = document.getElementById("label-autodetect");
    const tipsBox = document.getElementById("tips-box");
    const langZh = document.getElementById("lang-zh");
    const langEn = document.getElementById("lang-en");

    function applyLocale(lang, texts) {
        if (lang === 'en') {
            langEn.classList.add('active');
            langZh.classList.remove('active');
        } else {
            langZh.classList.add('active');
            langEn.classList.remove('active');
        }
        btnText.textContent = texts.previewCurrentTab;
        labelAutoDetect.textContent = texts.autoMode;
        tipsBox.innerHTML = texts.tip;
    }

    // 初始化語系
    getSwaggerLocale((lang, texts) => {
        applyLocale(lang, texts);
    });

    // 語言切換事件
    langZh.addEventListener("click", () => {
        setSwaggerLocale('zh', (lang, texts) => {
            applyLocale(lang, texts);
        });
    });

    langEn.addEventListener("click", () => {
        setSwaggerLocale('en', (lang, texts) => {
            applyLocale(lang, texts);
        });
    });

    // 自動偵測開關狀態
    chrome.storage.sync.get(["autoDetectFlag"], function(result) {
        autoDetectButton.checked = Boolean(result?.["autoDetectFlag"]);
    });
    
    autoDetectButton.addEventListener("change", function() {
        handleButtonChange(autoDetectButton.checked);
    });

    // 預覽按鈕
    swaggerBtn.addEventListener("click", swaggerBtnHandler);
});