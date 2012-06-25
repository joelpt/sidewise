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

function postLoad() {
    initializeDefaultSettings();
    updateStateFromSettings();
    registerEventHandlers();
    injectContentScriptInExistingTabs('content_script.js');

    var storedPageTree = loadSetting('pageTree', []);
    if (storedPageTree.length == 0) {
        // first time population of page tree
        populatePages();
    }
    else {
        // load stored page tree and associate tabs to existing page nodes
        loadPageTreeFromLocalStorage(storedPageTree);
        setTimeout(startAssociationRun, 2000); // wait a couple seconds for content scripts to get going
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
        });
    }
}

function registerEventHandlers() {
    registerRequestEvents();
    registerWindowEvents();
    registerTabEvents();
    registerWebNavigationEvents();
    registerBrowserActionEvents();
    registerSnapInEvents();
    registerOmniboxEvents();
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

    chrome.tabs.query({ }, function(tabs) {
        var urlAndTitles = tabs.map(function(e) { return e.url + '\n' + e.title });
        var lastSessionWindowNumber = 1;

        // set hibernated+restorable flags on all non-hibernated nodes
        tree.forEach(function(node, depth, containingArray, parentNode) {
            // remove nonexisting, nonhibernated chrome-*://* tabs from the tree because
            // Chrome will often not reopen these types of tabs during a session restore
            if (node instanceof PageNode
                && !node.hibernated
                && node.url.match(/^chrome-/)
                && urlAndTitles.indexOf(node.url + '\n' + node.title) == -1) {

                var nodeDetail = tree.getNodeEx(node);

                // remove the dead node
                tree.removeNode(node);

                return;
            }

            node.restored = false;

            if (node instanceof WindowNode) {
                // retitle restorable window titles
                node.title = getMessage('text_LastSession') + ' - ' + lastSessionWindowNumber;
                lastSessionWindowNumber++;
                node.restorable = true;
                node.hibernated = true;
                node.collapsed = true;
                node.id = node.id[0] + 'R' + generateGuid();
            }
            else if (node instanceof PageNode) {
                // allow restoration of pages which either failed to restore in a previous
                // session, or were not manually hibernated by the user
                if (node.restorable || !node.hibernated) {
                    node.hibernated = true;
                    node.restorable = true;
                    node.status = 'complete';
                    node.id = node.id[0] + 'R' + generateGuid();

                    // TODO this seems to be the wrong place to do this because it looks like
                    // Chrome only blanks this referrer out sometimes *sigh*
                    // Proper fix is to add code into the assocate routines - if referrer
                    // matches this noise, then match a referrer of either that value or ''
                    // Best approach is probably to refactor the findPageNodeForAssociation
                    // routine, stop taking a dumb list of deets to match and instead
                    // accept the specifics that we'll be looking for and do custom
                    // processing for .referrer in particular; this should also be taking
                    // a notMatchingNode param
                    if (node.referrer.match(/^http.+google.+\/search\?.*sugexp=chrome,mod=\d+\&sourceid=chrome/)) {
                        // Chrome seems to blank out these referrers on session restore, so
                        // mimic its behavior
                        node.referrer = '';
                    }
                }
            }

            if (sidebarHandler.sidebarExists()) {
                tree.callbackProxyFn('add', { element: node, parentId: parentNode ? parentNode.id : undefined });
            }
        });


        // remove any WindowNodes that now have no children
        var toRemove = [];
        tree.tree.forEach(function(e) {
            if (e instanceof WindowNode && e.children.length == 0) {
                toRemove.push(e); // don't remove immediately as it would mess up our containing .forEach indexes
            }
        });
        toRemove.forEach(function(e) {
            tree.removeNode(e);
        });

        // rebuild the id index
        tree.rebuildIdIndex();

        // set modified state
        tree.updateLastModified();
    });
}

function PageTreeCallbackProxy(methodName, args) {
    // log(methodName, args);

    var pagesWindow = sidebarHandler.sidebarPanes['pages'];

    if (!pagesWindow) {
        log('proxy target does not yet exist', methodName, args);
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
        var s = '';
        var tabsToQuery = [];

        for (var i = 0; i < numWindows; i++) {
            var win = windows[i];
            var tabs = win.tabs;
            var numTabs = tabs.length;
            log('Populating tabs from window', 'windowId', win.id, 'number of tabs', numTabs);

            if (win.id == sidebarHandler.windowId) {
                // ignore sidebar
                continue;
            }

            tree.addNode(new WindowNode(win));

            for (var j = 0; j < numTabs; j++) {
                var tab = tabs[j];
                log('Populating', tab.id, tab.title, tab.url, tab);
                var page = new PageNode(tab);
                tree.addNode(page, 'w' + win.id);
                tabsToQuery.push(tab);
            }

        }
        setTimeout(function() { findTabParents(tabsToQuery); }, 1500); // give content scripts a moment to get going

    });
}

function findTabParents(tabs) {
    console.log('entering findTabParents', tabs.length);
    var tabsToRequery = [];
    for (var i in tabs) {
        var tab = tabs[i];

        if (tab.id == sidebarHandler.tabId) {
            // ignore the sidebar
            continue;
        }

        if (!tab.url) {
            // can't do anything useful for tabs lacking a url
            continue;
        }

        if (!isScriptableUrl(tab.url)) {
            // will never be able to obtain details from this page so just call it done
            var page = tree.getNode('p' + tab.id);
            if (page) {
                log('Populating non scriptable page without asking for page details', page.id, page);
                tree.updateNode(page, { placed: true });
            }
            continue;
        }
        // try to guess child/parent tab relationships by getting details from page
        try {
            log('Asking for page details to find best-matching parent page', 'tabId', tab.id, 'tab', tab);
            getPageDetails(tab.id, { action: 'find_parent' });
        }
        catch(ex) {
            if (ex.message == 'Port not found') {
                // Port isn't available yet; try again in a bit
                // TODO implement intervals in TimeoutManager and let an interval-called function
                // clear its own hosting interval when it wants to; might be nice if we can
                // wrap the interval-function such that it gets passed an argument 'hostingIntervalLabel'
                // which it can optionally use to do so without having to know anything more about
                // who set what interval
                // TODO make this here an interval which tries several times before giving up, right now
                // we are just hoping that it's "enough" of a delay to not miss the port twice
                log('Port not found, will try calling getPageDetails again later', 'tabId', tab.id);
                tabsToRequery.push(tab);
                continue;
            }
            throw ex;
        }
    }

    if (tabsToRequery.length > 0) {

        var laterFn = function() {
            log('will requery these tabs', tabsToRequery);
            for (var i in tabsToRequery) {
                var tab = tabsToRequery[i];
                var page = tree.getPage(tab.id);
                if (page && page.placed) {
                    // page has already been placed
                    log('Skipping already-placed page', 'tabId', tab.id);
                    continue;
                }
                log('late getPageDetails running', 'tabId', tab.id, 'tab', tab);
                getPageDetails(tab.id, { action: 'find_parent' });
            }
        };

        // this is usually overkill, but some browsers will be quite slow; since this only happens
        // when the extension is first initializing it is acceptable overkill
        setTimeout(laterFn, 2000);
        setTimeout(laterFn, 6000);
        setTimeout(laterFn, 10000);
        setTimeout(laterFn, 16000);
    }

}