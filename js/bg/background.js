///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var PAGETREE_NODE_TYPES = {
    'window': WindowNode,
    'page': PageNode,
    'folder': FolderNode,
    'header': HeaderNode
};

var GHOSTTREE_NODE_TYPES = {
    'ghost': GhostNode
};

var PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS = 1000;
var GROUPING_ROW_COUNT_THRESHOLD = 3;
var GROUPING_ROW_COUNT_WAIT_THRESHOLD = 4;
var GROUPING_ROW_COUNT_WAIT_ITERATIONS = 4;

///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var tree;
var recentlyClosedTree;
var recentlyClosedGroupList = [];
var recentlyClosedGroupListLastCount = 0;
var recentlyClosedGroupWaitIteration = 0;
var ghostTree;
var sidebarHandler;
var paneCatalog;
var focusTracker;
var monitorInfo;
var settings;
var browserIsClosed = false;
var firstTimeInstallTabId;

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
        tree = new PageTree(PageTreeCallbackProxy, function() {
            savePageTreeToLocalStorage(tree, 'pageTree', true);
        });

        recentlyClosedTree = new UiDataTree(
            RecentlyClosedTreeCallbackProxy,
            undefined,
            function() {
                var nodes = recentlyClosedTree.filter(function(e) { return !(e instanceof HeaderNode); });
                var max = settings.get('closed_maxPagesRemembered');
                if (nodes.length > max) {
                    for (var i = nodes.length - 1; i >= max; i--) {
                        recentlyClosedTree.removeNode(nodes[i]);
                    };
                    recentlyClosedTree.removeZeroChildTopNodes();
                }
                savePageTreeToLocalStorage(recentlyClosedTree, 'recentlyClosedTree', true);
            },
            config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS,
            config.TREE_ONMODIFIED_STARTUP_DURATION_MS,
            config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS
        );

        ghostTree = new DataTree();

        tree.name = 'pageTree';
        recentlyClosedTree.name = 'recentlyClosedTree';
        ghostTree.name = 'ghostTree';

        sidebarHandler = new SidebarHandler();

        // Call postLoad() after focusTracker initializes to do remaining initialization
        focusTracker = new ChromeWindowFocusTracker(postLoad);
    });
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

    loadTreeFromLocalStorage(recentlyClosedTree, 'recentlyClosedTree', PAGETREE_NODE_TYPES);
    recentlyClosedTree.removeZeroChildTopNodes();
    var first = recentlyClosedTree.root.children[0];
    if (first && first.collecting) {
        first.collecting = false;
    }
    var fixIds = recentlyClosedTree.filter(function(e) { return e instanceof PageNode && e.id[0] == 'p'; });
    fixIds.forEach(function(e) { recentlyClosedTree.updateNode(e, { id: 'R' + e.UUID }); });

    loadTreeFromLocalStorage(ghostTree, 'ghostTree', GHOSTTREE_NODE_TYPES);

    if (ghostTree.length == 0) {
        // initial population of ghost tree
        // tree.mapTree(function(e) { return new GhostNode(e.id, e.elemType); })
        // etc
    }

    var storedPageTree = settings.get('pageTree', []);
    if (storedPageTree.length == 0) {
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
    if (!tree.lastModified || !tree.lastSaved || tree.lastModified != tree.lastSaved) {
        log('--- saving ' + settingName + ' to local storage ---');
        var saveTree = clone(tree.tree, ['parent', 'root', 'hostTree', 'chromeId']);
        if (excludeIncognitoNodes) {
            saveTree = saveTree.filter(function(e) { return !e.incognito; });
        }
        settings.set(settingName, saveTree);
        tree.lastSaved = tree.lastModified;
    }
}

function loadTreeFromLocalStorage(tree, settingKey, casts) {
    tree.loadTree(settings.get(settingKey), casts);
}

// loads saved tree data from local storage and populates the tree with it
function loadPageTreeFromLocalStorage(storedPageTree) {
    var rememberOpenPagesBetweenSessions = settings.get('rememberOpenPagesBetweenSessions');

    tree.loadTree(storedPageTree, PAGETREE_NODE_TYPES);

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

    switch (methodName) {
        case 'add':
            var ghost = new GhostNode(node.id, node.elemType);
            // var ghostParent = args.parentId ? ghostTree.getNode(args.parentId) : undefined;
            // var ghostBefore = args.beforeSiblingId ? ghostTree.getNode(args.beforeSiblingId) : undefined;
            // log("wtf", ghost, ghostParent, ghostBefore);
            ghostTree.addNode(ghost, ghostParentId, ghostBeforeSiblingId);
            break;
        // case 'move':
        //     ghostTree.moveNode(node.id, args.newParentId, args.beforeSiblingId, args.keepChildren);
        //     break;
        // case 'merge':
        //     ghostTree.mergeNodes(args.fromId, args.toId);
        //     break;
    }

    if (methodName == 'remove' && !(args.element instanceof WindowNode)) {
        addNodeToRecentlyClosedTree(node);
    }

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
    if (pagesWindow) {
        pagesWindow.PageTreeCallbackProxyListener.call(pagesWindow, methodName, args);

    }

    if (node instanceof PageNode && node.isTab() && (methodName == 'move' || methodName == 'add')) {
        fixPinnedUnpinnedTabOrder(node);
    }

}

function RecentlyClosedTreeCallbackProxy(methodName, args) {
    log(methodName, args);

    if (args.element.incognito) {
        return;
    }

    if (methodName == 'add' && args.element instanceof PageNode) {
        args.element.status = 'complete';
        args.element.unread = false;
    }

    var closedWindow = sidebarHandler.sidebarPanes['closed'];
    if (closedWindow) {
        closedWindow.PageTreeCallbackProxyListener.call(closedWindow, methodName, args);
    }

    setTimeout(function() {
        deduplicateRecentlyClosedPageNode(args.element);
    }, 1000);


}

function deduplicateRecentlyClosedPageNode(node) {
    var deduplicate = false;
    if (!deduplicate) return;

    var count = 0;
    var dupes = recentlyClosedTree.filter(function(e) {
        return e.url == node.url && count++ > 0;
    });
    dupes.forEach(function(e) {
        var parent = e.parent;
        recentlyClosedTree.removeNode(e);
        if (parent.children.length == 0) {
            recentlyClosedTree.removeNode(parent);
        }
    });
}

function addNodeToRecentlyClosedTree(node) {
    if (node.removedFromParentId) {
        var beforeSibling = recentlyClosedTree.getNode(function(e) {
            return node.removedBeforeSiblingId == e.id;
        });
        if (beforeSibling && beforeSibling.removedFromParentId == node.removedFromParentId) {
            log('put after previous before-sibling with common parent', node.id, node, beforeSibling.id, beforeSibling);
            recentlyClosedTree.addNodeRel(node, 'after', beforeSibling);
            requestAutoGroupingForNode(node);
            return;
        }

        var afterSibling = recentlyClosedTree.getNode(function(e) {
            return node.removedAfterSiblingId == e.id;
        });
        if (afterSibling && afterSibling.removedFromParentId == node.removedFromParentId) {
            log('put before previous after-sibling with common parent', node.id, node, afterSibling.id, afterSibling);
            recentlyClosedTree.addNodeRel(node, 'before', afterSibling);
            requestAutoGroupingForNode(node);
            return;
        }
    }

    if (node.removedPreviousParentId) {
        var prevParent = recentlyClosedTree.getNode(node.removedPreviousParentId);
        // Nest node under previous parent if previous parent is found AND was either
        // closed in the last minute or is a descendant of the topmost HeaderNode in rctree
        if (prevParent
            && (node.removedAt - prevParent.removedAt < MINUTE_MS
                || prevParent.topParent() === recentlyClosedTree.root.children[0]
                ))
        {
            var beforeSibling = recentlyClosedTree.getNode(function(e) {
                return node.removedBeforeSiblingId == e.id;
            });
            if (beforeSibling && beforeSibling.removedPreviousParentId == node.removedPreviousParentId) {
                log('put after previous before-sibling with previous parent', node.id, node, beforeSibling.id, beforeSibling);
                recentlyClosedTree.addNodeRel(node, 'after', beforeSibling);
                requestAutoGroupingForNode(node);
                return;
            }

            var afterSibling = recentlyClosedTree.getNode(function(e) {
                return node.removedAfterSiblingId == e.id;
            });
            if (afterSibling && afterSibling.removedPreviousParentId == node.removedPreviousParentId) {
                log('put before previous after-sibling with previous parent', node.id, node, afterSibling.id, afterSibling);
                recentlyClosedTree.addNodeRel(node, 'before', afterSibling);
                requestAutoGroupingForNode(node);
                return;
            }

            log('prepend to previous parent', node.id, node, prevParent.id, prevParent);
            recentlyClosedTree.addNodeRel(node, 'prepend', prevParent);
            requestAutoGroupingForNode(node);
            return;
        }
    }

    // prepend our node to the top existing .collecting=true HeaderNode, or create such a HeaderNode if
    // we don't find one
    var header = recentlyClosedTree.root.children[0];
    if (!header || !header.collecting) {
        header = new HeaderNode();
        header.collecting = true;
        recentlyClosedTree.addNodeRel(header, 'prepend');
        log('created collecting HeaderNode', header.id);
    }
    recentlyClosedTree.addNodeRel(node, 'prepend', header);
    requestAutoGroupingForNode(node);
    log('prepended node to header', node.id, node, header.id);

    // check for any node in rctree whose .removedFromParentId refers to our node (ex-children of our node)
    // TODO implement multiple non-unique indexes on DataTree and accept ('key', 'value', inArray) args
    var prevChildren = recentlyClosedTree.filter(function(e) {
        return e.removedFromParentId == node.id
            && (node.removedAt - e.removedAt < MINUTE_MS
                || e.topParent() === recentlyClosedTree.root.children[0]);
    });

    // nest all ex-children of our node under it
    prevChildren.forEach(function(child) {
        var beforeSibling = firstElem(node.children, function(e) {
            return child.removedBeforeSiblingId == e.id;
        });
        if (beforeSibling) {
            log('move ex-child after previous before-sibling', child.id, child, beforeSibling.id, beforeSibling);
            recentlyClosedTree.moveNodeRel(child, 'after', beforeSibling);
            return;
        }

        var afterSibling = firstElem(node.children, function(e) {
            return child.removedAfterSiblingId == e.id;
        });
        if (afterSibling) {
            log('move ex-child before previous after-sibling', child.id, child, afterSibling.id, afterSibling);
            recentlyClosedTree.moveNodeRel(child, 'before', afterSibling);
            return;
        }

        log('append ex-child under previous parent', child.id, 'parent', node.id);
        recentlyClosedTree.moveNodeRel(child, 'append', node);
    });
}

function requestAutoGroupingForNode(node) {
    recentlyClosedGroupList.push(node);
    scheduleAutoGrouping();
}

function scheduleAutoGrouping() {
   TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
}

function autoGroupRecentlyClosedTreeNodes() {
    if (recentlyClosedGroupList.length == 0) {
        return;
    }

    if (recentlyClosedGroupList.length <= GROUPING_ROW_COUNT_THRESHOLD) {
        recentlyClosedGroupList = [];
        return;
    }

    // Retrigger this function instead of performing a grouping if there are more than GROUPING_ROW_COUNT_WAIT_THRESHOLD
    // tabs in the group list; once the number of tabs in the group list does not change between successive checks here,
    // we'll do the groupification. This helps to prevent unwanted splitting of a large multiple-tab-close operation
    // into multiple groups in the recently closed tree.
    if (recentlyClosedGroupList.length >= GROUPING_ROW_COUNT_WAIT_THRESHOLD) {
        if (recentlyClosedGroupListLastCount != recentlyClosedGroupList.length) {
            recentlyClosedGroupWaitIteration = 0;
            recentlyClosedGroupListLastCount = recentlyClosedGroupList.length;
            TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
            log('Retriggering autoGroupRecentlyClosedTreeNodes()');
            return;
        }
        // Tab count in group list didn't change between successive calls
        if (recentlyClosedGroupWaitIteration < GROUPING_ROW_COUNT_WAIT_ITERATIONS) {
            recentlyClosedGroupWaitIteration++;
            TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
            log('Retriggering autoGroupRecentlyClosedTreeNodes() due to wait iteration');
            return;
        }

        recentlyClosedGroupListLastCount = 0;
        recentlyClosedGroupWaitIteration = 0;
        log('Large group list count has not changed since last check, groupifying now');
    }

    // Create a new non collecting HeaderNode group
    var header = new HeaderNode();
    recentlyClosedTree.addNodeRel(header, 'prepend');

    // Get a rctree-ordered version of recentlyClosedGroupList so that our upcoming move ops
    // don't mess up the preexisting node-ordering
    var orderedList = recentlyClosedTree.filter(function(e) {
        return recentlyClosedGroupList.indexOf(e) > -1 && e.parent instanceof HeaderNode;
    });

    // Move all the nodes from the group list to the new header
    for (var i = orderedList.length - 1; i >= 0; i--) {
        var node = recentlyClosedTree.getNode(orderedList[i].id);
        if (node && node.parent instanceof HeaderNode) {
            recentlyClosedTree.moveNodeRel(node, 'prepend', header, true);
        }
    }

    recentlyClosedGroupList = [];
    recentlyClosedTree.removeZeroChildTopNodes();
    return;
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

