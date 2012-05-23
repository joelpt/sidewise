/* Functions relating to Chrome specific functionality and interfacing with the background page's
   architecture */

// Used to track the current or last focused Chrome window, and whether any Chrome window
// currently has focus
var lastFocusedChromeWindowId = null;
var focusedChromeWindowId = null;
var chromeWindowIsFocused = false;


function setChromeWindowIsFocused(isFocused) {
    chromeWindowIsFocused = isFocused;
}

function setFocusedChromeWindowId(windowId) {
    if (windowId == focusedChromeWindowId) {
        // only want to record changes to focused win id's
        return;
    }
    lastFocusedChromeWindowId = focusedChromeWindowId;
    focusedChromeWindowId = windowId;
    log(windowId);
}

// function setFocusedChromeWindowId(windowId, callback) {
//     if (windowId == focusedChromeWindowId) {
//         // only want to record changes to focused win id's
//         callback(false);
//         return;
//     }
//     chrome.tabs.query({ active: true, windowId: windowId}, function(tabs) {
//         if (isExtensionUrl(tabs[0].url)) {
//             // don't record our own extension's tabs
//             callback(false);
//             return;
//         }

//     lastFocusedChromeWindowId = focusedChromeWindowId;
//     focusedChromeWindowId = windowId;
// }

function isChromeWindowFocused() {
    return chromeWindowIsFocused;
}

function getFocusedChromeWindowId() {
    return focusedChromeWindowId;
}

function getLastFocusedChromeWindowId() {
    return lastFocusedChromeWindowId;
}

/* Focus current window's tab in the page tree.
 * If focusLast is true, focus the *previously focused* window's tab instead.
 */
function focusCurrentTabInPageTree(focusLast) {
    var windowId = (focusLast ? getLastFocusedChromeWindowId() : getFocusedChromeWindowId());
    chrome.tabs.query({ active: true, windowId: windowId }, function(tabs) {
        var activeTab = tabs[0];
        tree.focusPage(activeTab.id);
    });
}

function initializeFocusedChromeWindow(callback) {
    chrome.windows.getLastFocused(null, function(win) {
        setFocusedChromeWindowId(win.id);
        setChromeWindowIsFocused(true);
        callback(win);
    });
}