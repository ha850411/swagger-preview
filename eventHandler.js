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
        var currentTab = tabs[0];
        let url = currentTab.url;
        if(url.match(/^https?:\/\/raw\.githubusercontent\.com/gi) !== null) {
            chrome.tabs.update({
                url: "https://petstore.swagger.io/?url=" + encodeURIComponent(url)
            });
        }
    });
}