// Constants used by the get*() scripts in this file
var GET_PAGE_DETAILS_SCRIPT = "chrome.extension.sendRequest( { op: 'getPageDetails', referrer: document.referrer, historylength: history.length, action: '<ACTION>' } );";
var GET_IS_FULL_SCREEN_SCRIPT = "chrome.extension.sendRequest({ op: 'getIsFullScreen', isFullScreen: document.webkitIsFullScreen });";


// Registers request event handlers
function registerRequestEvents()
{
    chrome.extension.onRequest.addListener(onRequest);
}


/* Functions that inject a script into a tab which in turn fire sendRequest back to us */

function getPageDetails(tab, action)
{
    executeContentScript(tab.url, tab.id, GET_PAGE_DETAILS_SCRIPT.replace('<ACTION>', action));
}

function getIsFullScreen(tab)
{
    executeContentScript(tab.url, tab.id, GET_IS_FULL_SCREEN_SCRIPT);
}


/* onRequest event handler and specific-event handling methods */

function onRequest(request, sender, sendResponse)
{
    log(request, sender);

    switch (request.op)
    {
        case 'getPageDetails':
            onGetPageDetailsMessage(sender.tab, request);
            break;
        case 'getScreen':
            onGetScreenMessage(sender.tab, request);
            break;
        case 'windowResized':
            onWindowResizedMessage(sender.tab, request);
            break;
        case 'detectMonitorMetrics':
            console.log(sender.tab, request);
            break;
        case 'getIsFullScreen':
            onGetIsFullScreenMessage(sender.tab, request);
            break;
        default:
            throw new Error('Unrecognized onRequest op ' + request.op);
    }
}

function onGetIsFullScreenMessage(tab, request) {
    // onGetIsFullScreenMessage is currently used to focus the sidebar (put it on top) then refocus
    // the "actually" focused Chrome window. We need to do it this way because we need to know
    // if the window is in HTML5 fullscreen mode; if it is we do not want to bring the sidebar to top.

    if (request.isFullScreen) {
        log('Denying auto-raise of sidebar because current window\'s tab is in fullscreen mode');
        return;
    }

    if (!sidebarHandler.sidebarExists()) {
        // sidebar must have gotten closed in the meantime somehow
        log('Denying auto-raise of sidebar because it has ceased to exist');
        return;
    }

    // focus the sidebar window ...
    log('Auto-raising sidebar because current window\'s tab is NOT in fullscreen mode');
    chrome.windows.update(sidebarHandler.windowId, { focused: true }, function() {
        // ... then focus the window that the user really focused.
        chrome.windows.update(focusTracker.getFocused(), { focused: true });
    });
}


function onGetPageDetailsMessage(tab, msg)
{
    log(tab, msg);
    var tabId = tab.id;
    var page = tree.getPage(tabId);

    if (page === undefined) {
        log('Page not in tree, probably because Chrome is just preloading it');
        return;
    }

    switch (msg.action) {
        case 'store':
            tree.updatePage(page, { referrer: msg.referrer, historylength: msg.historylength });
            break;

        case 'find_parent':
            // look for an existing tab whose url matches our tab's referrer
            chrome.tabs.query({ 'windowId': tab.windowId, 'url': dropUrlHash(msg.referrer) }, function(tabs) {
                tree.updatePage(page, { placed: true });  // tab's proper tree location is now 'known'
                // exclude potential parent candidates which are the same tab
                tabs = tabs.filter(function(t) { return t.id != tabId; });
                if (tabs.length == 0) {
                    return;  // no apparent parent tab, so it belongs where it is under a window
                }
                // TODO handle these cases:
                //      parent tab is already a descendant of the tab with tabId
                log('making ' + tabId + ' a child of ' + tabs[0].id);
                tree.moveNode(page, 'p' + tabs[0].id);
                tree.updatePage(page, { placed: true });
            });
            break;

        default:
            throw new Error('Unknown msg.action');
    }

}

function onWindowResizedMessage(tab, request)
{
    log(tab.id, request);

    // if (tab.id == sidebarHandler.tabId) {
    //     sidebarHandler.onResize();
    // }
}