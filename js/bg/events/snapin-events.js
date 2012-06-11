function registerSnapInEvents() {
    // chrome.extension.onConnectExternal.addListener(function(port) {
    //     console.log(port);
    // });

    // chrome.extension.onRequestExternal.addListener(function(request, sender, sendResponse) {
    //     console.log(request, sender, sendResponse);
    // });

    // For simple requests:
    chrome.extension.onRequestExternal.addListener(onRequestExternal);
}


function onRequestExternal(request, sender, sendResponse) {
    // debugger;
    sidebarHandler.sidebarPanes['sidebarHost'].manager
        .addSidebarPane(sender.id, request.label, request.icon, request.url);
    // alert(request.message);
    // if (sender.id == blacklistedExtension)
    //     return;  // don't allow this extension access
    // else if (request.getTargetData)
    //     sendResponse({targetData: targetData});
    // else if (request.activateLasers) {
    //     var success = activateLasers();
    //     sendResponse({activateLasers: success});
    // }
}

