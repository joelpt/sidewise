/* Functions relating to Chrome specific functionality */

// Get extension version from manifest.json.
function getVersion() {
    var details = chrome.app.getDetails();
    return details.version;
}

// Update window's position and state.
// Pass null for metrics to leave as-is.
function positionWindow(winId, state, left, top, width, height)
{
    var metrics = {};
    if (state != null)
        metrics.state = state;
    if (left != null)
        metrics.left = left;
    if (top != null)
        metrics.top = top;
    if (width != null)
        metrics.width = width;
    if (height != null)
        metrics.height = height;

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
