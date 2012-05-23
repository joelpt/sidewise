// Constants used by the get*() scripts in this file
var GET_PAGE_DETAILS_SCRIPT = "chrome.extension.sendRequest( { op: 'getPageDetails', referrer: document.referrer } );";
var GET_IS_FULL_SCREEN_SCRIPT = "chrome.extension.sendRequest({ op: 'getIsFullScreen', isFullScreen: document.webkitIsFullScreen });";


// Registers request event handlers
function registerRequestEvents()
{
    chrome.extension.onRequest.addListener(onRequest);
}


/* Functions that inject a script into a tab which in turn fire sendRequest back to us */

function getPageDetails(tab)
{
    executeContentScript(tab.url, tab.id, getPageDetailsScriptBody);
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
            throw 'Unrecognized onRequest op ' + request.op;
    }
}

function onGetIsFullScreenMessage(tab, request) {
    // onGetIsFullScreenMessage is currently used to focus the sidebar (put it on top) then refocus
    // the "actually" focused Chrome window. We need to do it this way because we need to know
    // if the window is in HTML5 fullscreen mode; if it is we do not want to bring the sidebar to top.

    if (request.isFullScreen) {
        return;
    }

    if (!sidebarHandler.sidebarExists()) {
        // sidebar must have gotten closed in the meantime somehow
        return;
    }

    // focus the sidebar window ...
    chrome.windows.update(sidebarHandler.windowId, { focused: true }, function() {
        // ... then focus the window that should have focus.
        chrome.windows.update(getFocusedChromeWindowId(), { focused: true });
    });
}


function onGetPageDetailsMessage(tab, msg)
{
    var tabId = tab.id;
    var windowId = tab.windowId;
    var page = tree.getPage(tabId);
    log(tabId, msg.referrer, page);
    if (page === undefined)
    {
        // page entry doesn't exist anymore
        throw 'pagedetails could not find page ' + tab.id + ' in the tree?!';
    }
    // look for an existing tab whose url matches our tab's referrer
    chrome.tabs.query({ 'windowId': windowId, 'url': dropUrlHash(msg.referrer) }, function(tabs) {
        tree.updatePage(tabId, { placed: true });  // tab's proper tree location is now 'known'
        if (tabs.length == 0)
            return;  // no apparent parent tab, so it belongs where it is under a window
        // TODO handle these cases:
        //      parent tab == child tab
        //      parent tab is already a descendant of the tab with tabId
        log('making ' + tabId + ' a child of ' + tabs[0].id);
        tree.move('p' + tabId, 'p' + tabs[0].id);
        tree.updatePage(tabId, { placed: true });
    });
}

function onWindowResizedMessage(tab, request)
{
    log(tab.id, request);
}