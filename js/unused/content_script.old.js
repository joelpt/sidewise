// function postPageLoading(op, windowId, tabId)
// {
//     console.log('content_script: postPageLoading ' + op + ' ' + windowId + ' ' + tabId);
//     var port = chrome.extension.connect({name: "pageLoading"});
//     port.postMessage({op: op, windowId: windowId, tabId: tabId, url: document.location.href, referrer: document.referrer, historylength: window.history.length });
// }
// // chrome.extension.sendRequest({request: {op: "pageLoad"}});
// var port = chrome.extension.connect({name: "pageLoad"});
// port.postMessage({ url: document.location.href, referrer: document.referrer, historylength: window.history.length });

// chrome.extension.sendRequest({
//     op: 'pageLoadStarted',
//     referrer: document.referrer,
//     historylength: window.history.length
// });

if (!document.sidewiseContentScriptApplied) {
    document.sidewiseContentScriptApplied = true;

    window.onresize = function(evt) {
        chrome.extension.sendRequest({
            op: 'windowResized'
        });
    }

    console.log('applied the content script');
}