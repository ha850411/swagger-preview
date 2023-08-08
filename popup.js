// 自動監聽 main_frame 的網址並轉址
chrome.webRequest.onSendHeaders.addListener(function(detail){
    console.log(detail);
    if(detail.url.match(/^https?:\/\/raw\.githubusercontent\.com.*\.(yaml|json)/gi) !== null) {
        chrome.tabs.update( detail.tabId,{
            url: "https://petstore.swagger.io/?url=" + encodeURIComponent(detail.url)
        });
    }
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

