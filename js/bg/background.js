///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var DENIED_SAVE_TREE_RETRY_MS = 2000;           // how soon to retry saving the page tree when it is temporariliy disallowed
var SAVE_TREE_BACKUP_EVERY_MS = 1000 * 60 * 15; // how often to save a backup of the page tree (15 minutes)
var MIN_NODES_TO_BACKUP_TREE = 6;               // skip backups when we have fewer than this many nodes in the tree

///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var tree;
var sidebarHandler;
var paneCatalog;
var focusTracker;
var monitorInfo;
var settings;
var browserIsClosed = false;
var firstTimeInstallTabId;
var allowSavingPageTree = true;
var denyingSavingPageTreeForMs;

///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

window.onload = onLoad;

function onLoad()
{
    // this functions like a bit like an onready event for Chrome
    chrome.tabs.getCurrent(function() {
        // Early initialization
        settings = new Settings();
        tree = new PageTree(PageTreeCallbackProxy, onPageTreeModifiedDelayed);
        sidebarHandler = new SidebarHandler();

        // Call postLoad() after focusTracker initializes to do remaining initialization
        focusTracker = new ChromeWindowFocusTracker(postLoad);
    });
}

function onPageTreeModifiedDelayed() {
    if (browserIsClosed) {
        log('Browser is closed, will not save page tree!');
        return;
    }
    if (!allowSavingPageTree) {
        // log('Page tree saving currently not allowed, retry in ' + DENIED_SAVE_TREE_RETRY_MS + 'ms');
        TimeoutManager.reset('retryOnPageTreeModifiedDelayed', onPageTreeModifiedDelayed, DENIED_SAVE_TREE_RETRY_MS);
        return;
    }
    if (tree.lastModified != tree.lastSaved) {
        savePageTreeToLocalStorage(tree, 'pageTree', true);
        tree.lastSaved = tree.lastModified;
    }
}


// IDEA for warmup executescript association fails:
// - use c.ext.onConnect to establish a port first?
//   - keep retrying on chrome.ext.lastError, esp. if lastError is something meaningful that can distinguish this case?

function postLoad(focusedWin) {
    if (!focusedWin) {
        // If no focused win yet then there are no actual Chrome windows
        // open yet; wait for one to be created then reload the background
        // page to re-init everything cleanly
        chrome.windows.onCreated.addListener(function(win) { restartSidewise(); });
        return;
    }

    var updatedSidewise = settings.initializeDefaults();
    settings.updateStateFromSettings();

    paneCatalog = new SidebarPaneCatalog();
    paneCatalog.loadState();

    registerEventHandlers();
    injectContentScriptInExistingTabs('content_script.js');

    var backup = settings.get('backupPageTree', []);
    if (backup.length > 0 && localStorage['backupPageTreeLastSession'] != localStorage['backupPageTree']) {
        // don't use settings.set() so we don't have to JSON parse and restringify
        // the copied value
        localStorage['backupPageTreeLastSession'] = localStorage['backupPageTree'];
        settings.cache['backupPageTreeLastSession'] = backup;
    }

    var storedPageTree = settings.get('pageTree', []);
    var loadIt = false;
    if (storedPageTree.length > 0) {
        log('Have stored tree data');
        loadIt = true;
    }
    else {
        log('Missing stored tree data');
        // recover from backup if possible
        if (backup.length > 0) {
            log('Backup exists of tree data, restoring');
            storedPageTree = backup;
            loadIt = true;
        }
    }

    if (!loadIt) {
        // first time population of page tree
        log('--- first time population of page tree ---');
        populatePages();
    }
    else {
        // load stored page tree and associate tabs to existing page nodes
        log('--- loading page tree from storage ---');
        loadPageTreeFromLocalStorage(storedPageTree);

        if (settings.get('rememberOpenPagesBetweenSessions')) {
            setTimeout(startAssociationRun, 2000); // wait a couple seconds for content scripts to get going
            populatePages(true);
        }
        else {
            populatePages();
        }

        if (updatedSidewise) {
            showWhatsNewPane();
        }
        showPromoPageAnnually();
    }

    // save a backup of pageTree periodically
    setInterval(backupPageTree, SAVE_TREE_BACKUP_EVERY_MS);

    reportEvent('sidewise', 'loaded');

    monitorInfo = new MonitorInfo();

    if (monitorInfo.isKnown()) {
        createSidebarOnStartup();
    }
    else {
        // We don't know monitor metrics, so obtain them, save them, then create sidebar on startup
        monitorInfo.retrieveMonitorMetrics(function() {
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
    registerRuntimeEvents();
}

function createSidebarOnStartup() {
    if (!settings.get('openSidebarOnStartup')) {
        return;
    }
    sidebarHandler.monitorMetrics = monitorInfo.detectedMonitors;
    sidebarHandler.maximizedOffset = monitorInfo.detectedMaxMonitorOffset;
    sidebarHandler.createWithDockState(settings.get('dockState', 'right'));

    if (!settings.get('firstTimeInstallShown')) {
        settings.set('firstTimeInstallShown', true);
        setTimeout(function() {
            chrome.tabs.create({ 'url': '/options_install.html', active: true }, function(tab) {
                setTimeout(function() {
                    tree.updatePage(tab.id, { status: 'loaded' });
                    firstTimeInstallTabId = tab.id;
                }, 500);
            });
        }, 1500);
    }
}


///////////////////////////////////////////////////////////
// PageTree related
///////////////////////////////////////////////////////////

function savePageTreeToLocalStorage(tree, settingName, excludeIncognitoNodes) {
    log('--- saving tree to ' + settingName + ' ---');
    var saveTree = clone(tree.tree, ['parent', 'root', 'hostTree']);
    if (excludeIncognitoNodes) {
        saveTree = saveTree.filter(function(e) { return !e.incognito; });
    }
    if (saveTree.length == 0) {
        console.error('Did not save tree because it is empty!');
        return;
    }
    settings.set(settingName, saveTree);
}

function backupPageTree() {
    if (browserIsClosed) {
        log('Skipped saving backup of tree because browser is closed');
        return;
    }
    var count = tree.reduce(function(last, e) { return last + 1; }, 0);
    if (count < MIN_NODES_TO_BACKUP_TREE) {
        log('Skipped saving backup of tree due to too few nodes (' + count + ')');
        return;
    }
    savePageTreeToLocalStorage(tree, 'backupPageTree', true);
}

function disallowSavingTreeForDuration(ms) {
    if (!allowSavingPageTree && denyingSavingPageTreeForMs > ms) {
        log('Already disallowing tree saving for ' + denyingSavingPageTreeForMs + ' (vs. ' + ms + ')');
        return;
    }

    log('Disallowing tree saving for ' + ms);
    allowSavingPageTree = false;
    denyingSavingPageTreeForMs = ms;
    TimeoutManager.reset('allowSavingPageTree', function() {
        log('Reallowing tree saving');
        allowSavingPageTree = true;
    }, ms);
}


// loads saved tree data from local storage and populates the tree with it
function loadPageTreeFromLocalStorage(storedPageTree) {
    var rememberOpenPagesBetweenSessions = settings.get('rememberOpenPagesBetweenSessions');
    var casts = {
        'window': WindowNode,
        'page': PageNode,
        'folder': FolderNode
    };

    tree.loadTree(storedPageTree, casts);

    if (!rememberOpenPagesBetweenSessions) {
        tree.tree.forEach(function(node) {
            // clear media values on every page node we load
            if (node instanceof PageNode) {
                node.mediaState = null;
                node.mediaTime = null;
            }


            if (!(node instanceof WindowNode)) {
                return;
            }

            // set any non-hibernated window nodes which contain at least one
            // hibernated child node to hibernated
            var hibernatedChild = tree.getNodeEx(function(e) { return e.hibernated }, node.children);

            if (hibernatedChild) {
                node.hibernated = true;
                node.id = 'wH' + node.UUID;
                node.title = getMessage('text_hibernatedWindow');
            }
        });
    }

    chrome.tabs.query({ }, function(tabs) {
        var urlAndTitles = tabs.map(function(e) { return e.url + '\n' + e.title });
        var lastSessionWindowNumber = 1;

        // set hibernated+restorable flags on all non-hibernated nodes
        tree.forEach(function(node, index, depth, containingArray, parentNode) {

            if (!rememberOpenPagesBetweenSessions
                && (node instanceof PageNode || node instanceof WindowNode)
                && !node.hibernated) {
                // forget non hibernated nodes between sessions
                containingArray.splice(index, 1);
                return;
            }

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

            if (node instanceof WindowNode && !node.hibernated) {
                // retitle restorable window titles

                node.title = getMessage('text_LastSession') + ' - ' + lastSessionWindowNumber;
                lastSessionWindowNumber++;
                node.restorable = true;
                node.hibernated = true;
                node.id = node.id[0] + 'R' + node.UUID;

                if (settings.get('autoCollapseLastSessionWindows')) {
                    node.collapsed = true;
                }
            }
            else if (node instanceof PageNode) {
                // allow restoration of pages which either failed to restore in a previous
                // session, or were not manually hibernated by the user
                if (node.restorable || !node.hibernated) {
                    node.hibernated = true;
                    node.restorable = true;
                    node.status = 'complete';
                    node.id = node.id[0] + 'R' + node.UUID;
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
            try {
                tree.removeNode(e);
            } catch(ex) { }
        });

        // rebuild the indexes
        tree.rebuildIdIndex();
        tree.rebuildTabIndex();
        tree.rebuildParents();

        // set modified state
        tree.updateLastModified();
    });
}

function PageTreeCallbackProxy(methodName, args) {
    // log(methodName, args);

    var node = args.element;

    if (node instanceof WindowNode && !node.hibernated && methodName == 'remove') {
        // when removing window nodes ensure they are also removed from focusTracker
        var winId = getNumericId(node.id);
        focusTracker.remove(winId);

        // if dock window has been destroyed, perform an automatic redock
        if (sidebarHandler.dockWindowId == winId) {
            log('Dock window has been destroyed; choose new dock window');
            sidebarHandler.redock(focusTracker.getFocused());
        }
    }
    else if ((methodName == 'remove' || methodName == 'move')
        && node.parent instanceof WindowNode
        && !node.parent.hibernated
        && node.parent.children.length == 0)
    {
        // proactively remove window nodes that would have no children after tab removal;
        // under certain circumstances Chrome does not fire onWindowRemoved() so we need
        // a back-up plan
        TimeoutManager.reset('removeChildlessWindowNode_' + node.parent.id, function() {
            if (node.parent instanceof WindowNode && !node.parent.hibernated && node.parent.children.length == 0) {
                // verify the parent node is still present in the tree
                var toRemove = tree.getNode(node.parent.id);
                if (toRemove && toRemove.children.length == 0) {
                    log('Removing stale window ' + toRemove.id);
                    tree.removeNode(toRemove, true);
                    return;
                }
                log('Stale window ' + node.parent.id + ' is already removed or now has children');
            }
        }, 1500);
    }

    var pagesWindow = sidebarHandler.sidebarPanes['pages'];

    if (!pagesWindow) {
        log('proxy target does not yet exist', methodName, args);
        return;
    }

    pagesWindow.PageTreeCallbackProxyListener.call(pagesWindow, methodName, args);

    if (node instanceof PageNode && node.isTab() && (methodName == 'move' || methodName == 'add')) {
        fixPinnedUnpinnedTabOrder(node);
    }
}

// TODO move this to a new file
// TODO probably wanna sort by tabs.index
// TODO find out if we need concern ourselves with the possibility that on session restore
//      chrome might restore tabs in an order which would have us trying to add children
//      to parents that aren't yet in the tree. this should NOT be an issue though because
//      all we do is add the tabs in one loop, THEN do parent-child relating in a second loop
//      after all pages are in the tree. so NO this will be a non issue !
function populatePages(incognito)
{
    chrome.windows.getAll({ populate: true }, function(windows) {
        var numWindows = windows.length;
        var s = '';
        var tabsToQuery = [];

        for (var i = 0; i < numWindows; i++) {
            var win = windows[i];

            // Obey incognito condition, if present
            if (incognito == true && !win.incognito) continue;
            if (incognito == false && win.incognito) continue;

            var tabs = win.tabs;
            var numTabs = tabs.length;
            log('Populating tabs from window', 'windowId', win.id, 'number of tabs', numTabs);

            if (win.id == sidebarHandler.windowId) {
                // ignore sidebar
                continue;
            }

            var winNode = tree.getNode('w' + win.id);
            if (!winNode) {
                winNode = new WindowNode(win);
                tree.addNode(winNode);
            }

            for (var j = 0; j < numTabs; j++) {
                var tab = tabs[j];
                log('Populating', tab.id, tab.title, tab.url, tab);
                var pageNode = tree.getNode('p' + tab.id);
                if (!pageNode) {
                    tree.addNode(new PageNode(tab), winNode);
                }
                tabsToQuery.push(tab);
            }

        }
        setTimeout(function() { findTabParents(tabsToQuery); }, 1500); // give content scripts a moment to get going
    });
}

function findTabParents(tabs) {
    log('entering findTabParents', tabs.length);
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
        log('Asking for page details to find best-matching parent page', 'tabId', tab.id, 'tab', tab);
        if (!getPageDetails(tab.id, { action: 'find_parent' })) {
            log('Port not found, will try calling getPageDetails again later', 'tabId', tab.id);
            tabsToRequery.push(tab);
            continue;
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

// Perform 'Chrome is shutting down' tasks.
function shutdownSidewise() {
    browserIsClosed = true;

    // Prevent page tree from being saved from this point forward
    TimeoutManager.clear('onPageTreeModified');
    TimeoutManager.clear('retryOnPageTreeModifiedDelayed');
    tree.onModifiedDelayed = function() {};

    // Prevent further UI updates
    tree.callbackProxyFn = function() {};

    // Prevent onWindowUpdateCheckInterval from firing again
    try {
        clearInterval(windowUpdateCheckInterval);
    } catch(err) { }

    // Close any remaining (popup) windows
    try {
        sidebarHandler.remove();
    } catch(err) { }

    chrome.windows.getAll(function(wins) {
        for (var i in wins) {
            chrome.windows.remove(wins[i].id);
        }
    });
}

// Restart the extension completely.
function restartSidewise() {
    // Close any existing 'sidebar.html' popup windows
    try { sidebarHandler.remove(); } catch(err) { }

    chrome.tabs.query({ windowType: 'popup', url: chrome.extension.getURL('/sidebar.html') }, function(tabs) {
        tabs.forEach(function(tab) {
            try { chrome.windows.remove(tab.windowId); } catch(err) { }
        });
        document.location.reload();
    });

}

// Show What's New pane after Sidewise is updated
function showWhatsNewPane() {
    var newsPane = paneCatalog.getPane('whatsnew');
    if (!newsPane) {
        if (!newsPane && settings.get('showWhatsNewPane') ) {
            paneCatalog.addPane('whatsnew', true, '/sidebars/whatsnew.html', 'What\'s New', '/images/nav/whatsnew.gif');
        }
    }
}

// Show promo page once a year in late December
function showPromoPageAnnually() {
    var now = new Date();
    var nowMonth = now.getMonth();
    var nowDay = now.getDate();
    if (nowMonth == 11 && nowDay >= 15) {
        var promoDateStr = settings.get('lastPromoPageShownDate');
        var showPromo = false;
        if (!promoDateStr) {
            showPromo = true;
        }
        else {
            var promoDate = new Date(promoDateStr);
            if (daysBetween(promoDate, now) > 60) {
                showPromo = true;
            }
        }

        if (showPromo) {
            settings.set('lastPromoPageShownDate', now);
            setTimeout(function() {
                chrome.tabs.create({ 'url': 'http://www.sidewise.info/pay/?which=365', active: true }, function(tab) {
                    setTimeout(function() {
                        tree.updatePage(tab.id, { status: 'loaded' });
                    }, 500);
                });
            }, 5000);
        }
    }
}

