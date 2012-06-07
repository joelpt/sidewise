if (!document.sidewiseContentScriptApplied) {
    // Since we manually inject the content script when the extension is installed or reloaded,
    // we do this to make sure we don't perform the content script's actions more than once per tab
    document.sidewiseContentScriptApplied = true;

    chrome.extension.sendRequest({ op: 'getPageDetails', action: 'store', referrer: document.referrer, historylength: history.length });

    // window.addEventListener('resize', function(evt) {
    //     chrome.extension.sendRequest({ op: 'windowResized', left: window.screenLeft, top: window.screenTop,
    //         width: window.outerWidth, height: window.outerHeight });
    // });
}