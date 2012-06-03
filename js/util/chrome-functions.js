/* Functions relating to Chrome specific functionality */

// Get extension version from manifest.json.
function getVersion() {
    var details = chrome.app.getDetails();
    return details.version;
}

// Update window's position and state.
function positionWindow(winId, metrics, callback)
{
    if (callback) {
        chrome.windows.update(winId, metrics, callback);
        return;
    }
    chrome.windows.update(winId, metrics);
}

/* Focus the current Chrome window's active tab in the page tree. */
function focusCurrentTabInPageTree() {
    var windowId = focusTracker.getFocused();
    chrome.tabs.query({ active: true, windowId: windowId }, function(tabs) {
        var activeTab = tabs[0];
        tree.focusPage(activeTab.id);
    });
}
