// 自動監聽 main_frame 的網址並轉址
chrome.webRequest.onSendHeaders.addListener(
    function(detail){
        chrome.storage.sync.get(["autoDetectFlag"], async function(result) {
            let autoDetectFlag = result?.["autoDetectFlag"] || false;
            if(
                autoDetectFlag && 
                detail.url.match(/^https?:\/\/raw\.githubusercontent\.com.*\.(yaml|yml|json)/gi) !== null
            ) {
                chrome.tabs.update( detail.tabId,{
                    url: "https://petstore.swagger.io/?url=" + encodeURIComponent(detail.url)
                });
            }
        });
    },
    {
        types: ["main_frame"],
        urls: ["*://raw.githubusercontent.com/*"]
    },
    ['requestHeaders']
);

// 點擊該擴充功能 icon 事件
// chrome.browserAction.onClicked.addListener((tab) => {
//     chrome.tabs.getSelected(null, function(tab) {
//         let url = tab.url;
//         if(url.match(/^https?:\/\/raw\.githubusercontent\.com/gi) !== null) {
//             chrome.tabs.update({
//                 url: "https://petstore.swagger.io/?url=" + encodeURIComponent(tab.url)
//             });
//         }
//     });
// });

