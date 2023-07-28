chrome.browserAction.onClicked.addListener((tab) => {
    chrome.tabs.getSelected(null, function(tab) {
        let url = tab.url;
        if(url.match(/^https?:\/\/raw\.githubusercontent\.com/gi) !== null) {
            chrome.tabs.update({
                url: "https://petstore.swagger.io/?url=" + encodeURIComponent(tab.url)
            });
        }
    });
});

