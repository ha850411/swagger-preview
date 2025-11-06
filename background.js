// 匯入 eventHandler 的函數
importScripts('eventHandler.js');

// 自動監聽 main_frame 的網址並轉址
chrome.webRequest.onSendHeaders.addListener(
    function(detail){
        chrome.storage.sync.get(["autoDetectFlag"], async function(result) {
            let autoDetectFlag = result?.["autoDetectFlag"] || false;
            if(
                autoDetectFlag && 
                detail.url.match(/^https?:\/\/raw\.githubusercontent\.com.*\.(yaml|yml|json)/gi) !== null
            ) {
                copyPageContentAndRender(detail.url, detail.tabId, true);
            }
        });
    },
    {
        types: ["main_frame"],
        urls: ["*://raw.githubusercontent.com/*"]
    },
    ['requestHeaders']
);
