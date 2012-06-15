///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var GET_PAGE_DETAILS_SCRIPT = "chrome.extension.sendRequest( { op: 'getPageDetails', referrer: document.referrer, historylength: history.length, title: document.title, action: '<ACTION>' }, function() { console.log('++++++++++++++++++++++'); } );";
var GET_IS_FULL_SCREEN_SCRIPT = "chrome.extension.sendRequest({ op: 'getIsFullScreen', isFullScreen: document.webkitIsFullScreen });";


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

// Registers request event handlers
function registerRequestEvents() {
    chrome.extension.onRequest.addListener(onRequest);
}


///////////////////////////////////////////////////////////
// onRequest event listener
///////////////////////////////////////////////////////////

function onRequest(request, sender, sendResponse) {
    log(request, sender);

    switch (request.op)
    {
        case 'getPageDetails':
            onGetPageDetailsMessage(sender.tab, request);
            break;
        case 'getIsFullScreen':
            onGetIsFullScreenMessage(sender.tab, request);
            break;
        default:
            throw new Error('Unrecognized onRequest op ' + request.op);
    }
}


///////////////////////////////////////////////////////////
// getIsFullScreen
///////////////////////////////////////////////////////////

function getIsFullScreen(tab) {
    executeContentScript(tab.url, tab.id, GET_IS_FULL_SCREEN_SCRIPT);
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


///////////////////////////////////////////////////////////
// getPageDetails and tab-association routines
///////////////////////////////////////////////////////////

function getPageDetails(tab, action) {
    log_brief(tab.id);
    var scriptBody = GET_PAGE_DETAILS_SCRIPT.replace('<ACTION>', action);
    chrome.tabs.executeScript(tab.id, { code: scriptBody }, function() {
        onGetPageDetailsScriptExecuted(tab, action);
    });
}

function onGetPageDetailsMessage(tab, msg) {
    log(tab, msg);
    var tabId = tab.id;

    var page = tree.getPage(tabId);

    switch (msg.action) {
        case 'store':
            if (page === undefined) {
                log('Page not in tree, probably because Chrome is just preloading it');
                return;
            }
            var details = { referrer: msg.referrer, historylength: msg.historylength };
            if (msg.title) {
                details.title = msg.title;
            }
            tree.updatePage(page, details);
            break;

        case 'associate':
            // look for an existing restorable page with a matching url+referrer+historylength
            // TODO add incognito match
            associateTabToPageNode(tab, msg.referrer, msg.historylength);
            break;

        case 'find_parent':
            // look for an existing parent page node whose url matches our tab's referrer
            var parent = tree.getNode(function(e) {
                return e.elemType == 'page' && e.id != tabId && e.url == msg.referrer
            });
            log('find_parent', page.id, 'parent', parent, 'msg', msg);
            if (parent) {
                log('making ' + tabId + ' a child of ' + parent.id);
                tree.moveNode(page, parent);
            }

            var details = { placed: true, referrer: msg.referrer, historylength: msg.historylength };
            if (msg.title) {
                details.title = msg.title;
            }
            log('find_parent updating page node', page.id, 'page', page, 'msg', msg);
            tree.updateNode(page, details);
            log('find_parent post update', page.id, 'page', tree.getNode(page.id));
            // chrome.tabs.query({ 'windowId': tab.windowId, 'url': dropUrlHash(msg.referrer) }, function(tabs) {

            //     // exclude potential parent candidates which are the same tab
            //     tabs = tabs.filter(function(t) { return t.id != tabId; });
            //     if (tabs.length > 0) {
            //         log('making ' + tabId + ' a child of ' + tabs[0].id);
            //         tree.moveNode(page, 'p' + tabs[0].id);
            //     }

            //     var details = { placed: true, referrer: msg.referrer, historylength: msg.historylength };
            //     if (msg.title) {
            //         details.title = msg.title;
            //     }
            //     tree.updatePage(page, details);

            //     // TODO handle these cases:
            //     //      parent tab is already a descendant of the tab with tabId
            // });
            break;

        default:
            throw new Error('Unknown msg.action');
    }
    return true;
}

function onGetPageDetailsScriptExecuted(tab, action) {
    log(':::::: CALLED', action);
    if (action != 'associate') {
        return;
    }

    log('>>>>>> ADD 1 TO', associatingTabCount, associatingTabTotal);
    associatingTabCount++;

    if (chrome.extension.lastError) {
        // an error means the target tab was unscriptable, so just do
        // association without the benefit of referrer and historylength
        log('Associating without getPageDetails values', 'Error was:', chrome.extension.lastError.message);
        associateTabToPageNode(tab);
    }

    if (!associatingTabs) {
        return;
    }

    if (associatingTabCount == associatingTabTotal) {
        log('All tabs associated, deducing window associations next');
        associatingTabs = false;
        associateWindowstoWindowNodes();
    }
}
