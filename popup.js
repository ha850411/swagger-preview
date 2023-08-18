document.addEventListener("DOMContentLoaded", function () {

    var autoDetectButton = document.getElementById("autoDetect");

    chrome.storage.sync.get(["autoDetectFlag"], async function(result) {
        autoDetectButton.checked = result?.["autoDetectFlag"];
    });
    
    autoDetectButton.addEventListener("change", function() {
        handleButtonChange(autoDetectButton.checked);
    });

    var swaggerBtn = document.getElementById("swaggerBtn");
    swaggerBtn.addEventListener("click", swaggerBtnHandler);
});