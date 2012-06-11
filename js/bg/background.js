var tree;
var sidebarHandler;
var focusTracker;
var monitorInfo;

window.onload = onLoad;

function onLoad()
{
    // this functions like a bit like an onready event for Chrome
    chrome.tabs.getCurrent(function() {
        // Early initialization
        tree = new PageTree(PageTreeCallbackProxy, savePageTreeToLocalStorage);
        // loadPageTreeFromLocalStorage();
        sidebarHandler = new SidebarHandler();

        // Call postLoad() after focusTracker initializes to do remaining initialization
        focusTracker = new ChromeWindowFocusTracker(postLoad);
    });
}

function postLoad() {
    initializeDefaultSettings();
    updateStateFromSettings();

    // load page tree from settings
    // hibernate all pages and windows
    // correlate existing pages:
    //      existence == url && referrer && historylength matchup
    //      if page exists in tree:
    //          awaken its hibernated entry, set new tabId
    //          if tab's windowId exists in tree as non hibernated window:
    //              transfer tab to the existing windowId
    //          else:
    //              wake hibernated window, set new windowId
    //          if parent hibernated window has no children left remove it
    //      if page does not exist in tree:
    //          add an entry for it
    //          put in existing window if found matching windowId, else create new windowId for it
    //          utilize the existing logic for guessing parent/child relations

    registerRequestEvents();

    injectContentScriptInExistingTabs('content_script.js');
    populatePages();

    registerWindowEvents();
    registerTabEvents();
    registerWebNavigationEvents();
    registerBrowserActionEvents();
    registerSnapInEvents();
    registerOmniboxEvents();

    monitorInfo = new MonitorInfo();

    if (monitorInfo.isKnown()) {
        createSidebarOnStartup();
    }
    else {
        // We don't know monitor metrics, so obtain them, save them, then create sidebar on startup
        monitorInfo.retrieveMonitorMetrics(function(monitors, maxOffset) {
            monitorInfo.saveToSettings();
            createSidebarOnStartup();
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

function savePageTreeToLocalStorage() {
    if (tree.lastModified != tree.lastSaved) {
        saveSetting('pageTree', tree.tree);
        tree.lastSaved = tree.lastModified;
    }
}

function loadPageTreeFromLocalStorage() {
    tree.tree = loadSetting('pageTree', []);
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

            if (win.type != 'normal') {
                continue; // only want actual tab-windows
            }

            tree.addNode(new WindowNode(win));

            // log(tabs);
            // tabs = win.tabs.sort(function(a, b) { return (a.id > b.id) - (a.id < b.id); });
            // log(tabs);

            for (var j = 0; j < numTabs; j++) {
                var tab = tabs[j];
                var page = new PageNode(tab);
                tree.addNode(page, 'w' + win.id, 'complete');
            }
            for (var j = 0; j < numTabs; j++) {
                // try to guess child/parent tab relationships by asking each page for its referrer
                getPageDetails(tabs[j], 'find_parent');
            }
        }
    });
}
