// 匯入 eventHandler 的函數
importScripts('eventHandler.js');

// 自動監聽 main_frame 的網址並轉址
chrome.webRequest.onCompleted.addListener(
    function(details){
        chrome.storage.sync.get(["autoDetectFlag"], async function(result) {
            let autoDetectFlag = result?.["autoDetectFlag"] || false;
            if(
                autoDetectFlag && 
                details.url.match(/^https?:\/\/raw\.githubusercontent\.com.*\.(yaml|yml|json)/gi) !== null
            ) {
                // 等待頁面完全載入後再執行
                chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
                    if (tabId === details.tabId && changeInfo.status === 'complete') {
                        // 移除監聽器避免重複觸發
                        chrome.tabs.onUpdated.removeListener(listener);
                        
                        // 再延遲一點確保 DOM 完全渲染
                        setTimeout(() => {
                            copyPageContentAndRender(details.url, details.tabId, true);
                        }, 500);
                    }
                });
            }
        });
    },
    {
        types: ["main_frame"],
        urls: ["*://raw.githubusercontent.com/*"]
    }
);
