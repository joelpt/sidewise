var DEBUGIT = true;

///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var tree;
var sidebarHandler;
var focusTracker;
var monitorInfo;


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

window.onload = onLoad;

function onLoad()
{
    // this functions like a bit like an onready event for Chrome
    chrome.tabs.getCurrent(function() {
        // Early initialization
        tree = new PageTree(PageTreeCallbackProxy, savePageTreeToLocalStorage);
        sidebarHandler = new SidebarHandler();

        // Call postLoad() after focusTracker initializes to do remaining initialization
        focusTracker = new ChromeWindowFocusTracker(postLoad);
    });
}

// IDEA for warmup executescript association fails:
// - use c.ext.onConnect to establish a port first?
//   - keep retrying on chrome.ext.lastError, esp. if lastError is something meaningful that can distinguish this case?

var connectedTabs = {};

function postLoad() {
    initializeDefaultSettings();
    updateStateFromSettings();

    chrome.extension.onConnect.addListener(function(port) {
        console.log('onConnect', port);
        connectedTabs[port.tab.id] = port;
        port.onMessage.addListener(function(msg) {
            console.log('onMessage', msg, port);
            port.postMessage({ action: 'wassup' });
        });

        port.onDisconnect.addListener(function() {
            console.log('onDisconnect', port);
            if (connectedTabs[port.tab.id]) {
                delete connectedTabs[port.tab.id];
            }
        });
    });

    registerRequestEvents();
    registerWindowEvents();
    registerTabEvents();
    registerWebNavigationEvents();
    registerBrowserActionEvents();
    registerSnapInEvents();
    registerOmniboxEvents();

    var storedPageTree = loadSetting('pageTree', []);
    if (storedPageTree.length == 0) {
        // first time population of page tree
        populatePages();
        injectContentScriptInExistingTabs('content_script.js');
    }
    else {
        // load stored page tree and associate tabs to existing page nodes
        loadPageTreeFromLocalStorage(storedPageTree);
        injectContentScriptInExistingTabs('content_script.js');
        associatePages();
    }


    monitorInfo = new MonitorInfo();

    if (monitorInfo.isKnown()) {
        createSidebarOnStartup();
    }
    else {
        // We don't know monitor metrics, so obtain them, save them, then create sidebar on startup
        monitorInfo.retrieveMonitorMetrics(function(monitors, maxOffset) {
            monitorInfo.saveToSettings();
            createSidebarOnStartup();

            // if (DEBUGIT) {
            //     setTimeout(function() {
            //         loadPageTreeFromLocalStorage();
            //         associatePages();
            //     }, 1000);
            // }

        });
    }
}

function createSidebarOnStartup() {
    if (!loadSetting('openSidebarOnStartup')) {
        return;
    }
    sidebarHandler.monitorMetrics = monitorInfo.detectedMonitors;
    sidebarHandler.maximizedOffset = monitorInfo.detectedMaxMonitorOffset;
    sidebarHandler.createWithDockState(loadSetting('dockState', 'right'));
}


///////////////////////////////////////////////////////////
// PageTree related
///////////////////////////////////////////////////////////

function savePageTreeToLocalStorage() {
    // if (DEBUGIT) {
    //     return;
    // }

    if (tree.lastModified != tree.lastSaved) {
        saveSetting('pageTree', tree.tree);
        tree.lastSaved = tree.lastModified;
    }
}

function loadPageTreeFromLocalStorage(storedPageTree) {
    // load the tree data
    var casts = {
        'window': WindowNode,
        'page': PageNode
    };

    tree.loadTree(storedPageTree, casts);

    // set hibernated+restorable flags on all non-hibernated nodes
    tree.forEach(function(node, depth, containingArray, parentNode) {
        if (!node.hibernated) {
            node.hibernated = true;
            node.restorable = true;
            node.id = node.id[0] + 'R' + generateGuid();
            if (loggingEnabled) {
                node.label = 'R';
            }
        }
        tree.callbackProxyFn('add', { element: node, parentId: parentNode ? parentNode.id : undefined });
    });

    // rebuild the id index
    tree.rebuildIdIndex();

}

function PageTreeCallbackProxy(methodName, args) {
    log(methodName, args);

    var pagesWindow = sidebarHandler.sidebarPanes['pages'];

    if (!pagesWindow) {
        log('proxy target does not yet exist');
        return;
    }

    pagesWindow.PageTreeCallbackProxyListener(methodName, args);

    // args.target = 'pages';
    // args.op = methodName;
    // chrome.extension.sendRequest(args);
}

// TODO move this to a new file
// TODO probably wanna sort by tabs.index
// TODO find out if we need concern ourselves with the possibility that on session restore
//      chrome might restore tabs in an order which would have us trying to add children
//      to parents that aren't yet in the tree. this should NOT be an issue though because
//      all we do is add the tabs in one loop, THEN do parent-child relating in a second loop
//      after all pages are in the tree. so NO this will be a non issue !
function populatePages()
{
    chrome.windows.getAll({ populate: true }, function(windows) {
        var numWindows = windows.length;
        s = '';

        for (var i = 0; i < numWindows; i++) {
            var win = windows[i];
            var tabs = win.tabs;
            var numTabs = tabs.length;
            console.log('### maxtabs', numTabs);

            if (win.type != 'normal') {
                continue; // only want actual tab-windows
            }

            tree.addNode(new WindowNode(win));

            // log(tabs);
            // tabs = win.tabs.sort(function(a, b) { return (a.id > b.id) - (a.id < b.id); });
            // log(tabs);

            for (var j = 0; j < numTabs; j++) {
                var tab = tabs[j];
                log('Populating', tab.id, tab.title, tab.url, tab);
                var page = new PageNode(tab);
                tree.addNode(page, 'w' + win.id);
            }
            for (var j = 0; j < numTabs; j++) {
                // try to guess child/parent tab relationships by asking each page for its referrer
                getPageDetails(tabs[j], 'find_parent');
            }
        }
    });
}
