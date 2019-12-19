function registerSnapInEvents() {
    chrome.extension.onRequestExternal.addListener(onRequestExternal);
}

function onRequestExternal(request, sender, sendResponse) {
    sidebarHandler.sidebarPanes['sidebarHost'].manager.addSidebarPane(
        sender.id, request.label, request.icon, request.url);
}

