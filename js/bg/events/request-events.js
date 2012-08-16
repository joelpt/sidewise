///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var GET_PAGE_DETAILS_SCRIPT = "chrome.extension.sendRequest( { op: 'getPageDetails', referrer: document.referrer, historylength: history.length, title: document.title, action: '<ACTION>' }, function() { console.log('++++++++++++++++++++++'); } );";
var GET_IS_FULL_SCREEN_SCRIPT = "chrome.extension.sendRequest({ op: 'getIsFullScreen', isFullScreen: document.webkitIsFullScreen });";


///////////////////////////////////////////////////////////
// Global
///////////////////////////////////////////////////////////

var connectedTabs = {};

///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

// Registers request event handlers
function registerRequestEvents() {
    chrome.extension.onRequest.addListener(onRequest);
    chrome.extension.onConnect.addListener(onConnectPort);
}


function onConnectPort(port) {
    log('onConnect', port);
    // add port to list of known tab ports
    connectedTabs[port.sender.tab.id] = port;

    // wire up port event listeners
    port.onMessage.addListener(function(msg) { onPortMessage(port, msg); });
    port.onDisconnect.addListener(function() { onPortDisconnect(port); });
}

function onPortMessage(port, msg) {
    log('onPortMessage', msg, port);
    // port.postMessage({ action: 'wassup' });
    switch (msg.op) {
        case 'getPageDetails':
            log('gotPageDetails', msg.action);
            onGetPageDetailsMessage(port.sender.tab, msg);
            break;
    }
}

function onPortDisconnect(port) {
    log('onPortDisconnect', port);

    // delete entry from known tab ports list
    if (connectedTabs[port.sender.tab.id]) {
        delete connectedTabs[port.sender.tab.id];
    }

    // If we are expecting a navigation tab-id-swap due to
    // Chrome preloading of tabs, and one of the possible
    // preloading tabs fires onPortDisconnect, we know
    // it has been destroyed and should not expect it as
    // a possible tab id swap target anymore

    if (expectingNavigationTabIdSwap) {
        var index = expectingNavigationPossibleNewTabIds.indexOf(port.sender.tab.id);
        if (index >= 0) {
            // remove it from the list
            log('Removed preloading tab from expected nav swap list', port.sender.tab.id);
            expectingNavigationPossibleNewTabIds.splice(index, 1);
            log('Remaining list', expectingNavigationPossibleNewTabIds);
        }
        if (expectingNavigationPossibleNewTabIds.length == 0) {
            // no more tab ids left on the preloading tabs list;
            // cancel our expectations
            log('No more preloading tabs on the expected list, cancelling expectation');
            resetExpectingNavigation();
        }
    }
}

function getPort(tabId) {
    var port = connectedTabs[tabId];
    if (!port) {
        throw new Error('Port not found');
    }
    return port;
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

function getPageDetails(tabId, params) {
    params.op = 'getPageDetails';
    getPort(tabId).postMessage(params);
}

// function getPageDetails(tab, action) {
//     log_brief(tab.id);
//     var scriptBody = GET_PAGE_DETAILS_SCRIPT.replace('<ACTION>', action);
//     chrome.tabs.executeScript(tab.id, { code: scriptBody }, function() {
//         onGetPageDetailsScriptExecuted(tab, action);
//     });
// }

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
            var details = { referrer: msg.referrer, historylength: msg.historylength, sessionGuid: msg.sessionGuid };
            if (msg.title) {
                details.title = msg.title;
            }
            tree.updatePage(page, details);
            break;

        // TODO add incognito match
        case 'associate':
            // clear stubborn tabs list whenever any tab responds to a getPageDetails() request
            associationStubbornTabIds = {};

            // look for an existing restorable page with a matching url+referrer+historylength
            associateTabToPageNode(msg.runId, tab, msg.referrer, msg.historylength);
            break;

        case 'associate_existing':
            associateExistingToRestorablePageNode(tab, msg.referrer, msg.historylength);
            break;

        case 'find_parent':
            // look for an existing parent page node whose url matches our tab's referrer
            var parent = tree.getNode(function(e) {
                return e.elemType == 'page' && e.id != 'p' + tabId && dropUrlHash(e.url) == msg.referrer
            });

            log('find_parent', 'page.id', page.id, 'msg.referrer', msg.referrer, 'msg.historylength', msg.historylength,
                'parent found', parent);

            if (parent) {
                log('making ' + tabId + ' a child of ' + parent.id);
                tree.moveNode(page, parent);
            }

            var details = { placed: true, referrer: msg.referrer, historylength: msg.historylength, sessionGuid: msg.sessionGuid };
            if (msg.title) {
                details.title = msg.title;
            }
            log('find_parent updating page node', page.id, 'page', page, 'new details', details);
            tree.updateNode(page, details);
            break;

        default:
            throw new Error('Unknown msg.action');
    }
    return true;
}
