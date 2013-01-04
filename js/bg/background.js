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

var PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS = 750;
var GROUPING_ROW_COUNT_THRESHOLD = 7;
var GROUPING_ROW_COUNT_WAIT_THRESHOLD = 8;
var GROUPING_ROW_COUNT_WAIT_ITERATIONS = 4;

// Nodes in the recently closed tree must be at most no older than this many
// ms to qualify for having another node matched to an associated position vs.
// them, e.g. a new recently-closed node being made a child of an existing
// recently-closed node. When a recently-closed node can't be placed in
// relative positioning to another node due to exceeding this timeout or just
// not finding any qualifying nodes, the fallback behavior is simply to
// prepend it to the top .collecting=true HeaderNode in the recently closed
// tree.
var RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS = MINUTE_MS * 10;

var RECENTLY_CLOSED_GROUP_AFTER_REMOVE_IDLE_MS = HOUR_MS * 3;

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
            tree.onModifiedDelayedWaitMs = config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS;
        });

        recentlyClosedTree = new UiDataTree(
            RecentlyClosedTreeCallbackProxy,
            undefined,
            function() {
                truncateRecentlyClosedTree(settings.get('closed_maxPagesRemembered'));
                savePageTreeToLocalStorage(recentlyClosedTree, 'recentlyClosedTree', true);
            },
            config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS * 0.9,
            config.TREE_ONMODIFIED_STARTUP_DURATION_MS,
            config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS * 0.9
        );

        ghostTree = new UiDataTree(
            function() {},
            undefined,
            function() {
                savePageTreeToLocalStorage(ghostTree, 'ghostTree', false);
            },
            config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS * 0.95,
            config.TREE_ONMODIFIED_STARTUP_DURATION_MS,
            config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS * 0.95
        );

        tree.name = 'pageTree';
        recentlyClosedTree.name = 'recentlyClosedTree';
        ghostTree.name = 'ghostTree';

        sidebarHandler = new SidebarHandler();

        // Call postLoad() after focusTracker initializes to do remaining initialization
        focusTracker = new ChromeWindowFocusTracker(postLoad);
    });
}

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

    loadTreeFromLocalStorage(ghostTree, 'ghostTree', GHOSTTREE_NODE_TYPES);
    setInterval(cleanGhostTree, HOUR_MS);

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

        if (ghostTree.root.children.length == 0) {
            // first time population of ghost tree for users who already had stored tree data
            var ghosts = tree.mapTree(function(e) {
                return new GhostNode(e.id, e.elemType);
            });
            ghostTree.loadTree(ghosts, GHOSTTREE_NODE_TYPES);
        }

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

    setInterval(checkForMalwarePageInSidebar, 5000);
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

    tree.tree.forEach(function(node) {
        // clear media values on every page node we load
        if (node instanceof PageNode || node instanceof WindowNode) {
            node.chromeId = null;
            node.windowId = null;
            if (node instanceof PageNode) {
                node.mediaState = null;
                node.mediaTime = null;
            }
        }
    });

    if (!rememberOpenPagesBetweenSessions) {
        tree.tree.forEach(function(node) {
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

                // remove the dead node
                tree.removeNode(node);
                return;
            }

            // remove nonexisting, nonhibernated chrome-*://* tabs from the tree because
            // Chrome will often not reopen these types of tabs during a session restore
            if (node instanceof PageNode
                && !node.hibernated
                && node.url.match(/^chrome-/)
                && urlAndTitles.indexOf(node.url + '\n' + node.title) == -1) {

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
        tree.rebuildIndexes();
        tree.rebuildTabIndex();
        tree.rebuildParents();

        // set modified state
        tree.updateLastModified();
    });
}

function PageTreeCallbackProxy(methodName, args) {
    log(methodName, args);

    var node = args.element;

    // Update the ghost tree with add/move/merges
    if (node && !node.incognito) {
        switch (methodName) {
            case 'add':
                var ghost = new GhostNode(node.id, node.elemType);
                try {
                    ghostTree.addNode(ghost, args.parentId, args.beforeSiblingId);
                }
                catch (ex) {
                    ghostTree.addNode(ghost);
                }
                break;
            case 'move':
                try {
                    ghostTree.moveNode(node.id, args.newParentId, args.beforeSiblingId, args.keepChildren);
                }
                catch (ex) {}
                break;
            case 'merge':
                try {
                    ghostTree.mergeNodes(args.fromId, args.toId);
                }
                catch (ex) {}
                break;
            case 'update':
                if (args.element.id) {
                    try {
                        ghostTree.updateNode(args.id, { id: args.element.id });
                    }
                    catch (ex) {}
                }
                break;
        }
    }

    if (methodName == 'move' && args.callbackBlocked) {
        // TODO change callbackBlocked/blockCallback to a callbackData arg that we pass in as-needed by callers
        // and gets passed into callbackProxy; eventually add this arg to all UiDataTree methods that do callbacking
        return;
    }

    if (methodName == 'remove') {
        addNodeToRecentlyClosedTree(node, args.removeChildren);
        recentlyClosedTree.removeZeroChildTopNodes();
    }

    if (node instanceof WindowNode && !node.hibernated && methodName == 'remove') {
        // when removing window nodes ensure they are also removed from focusTracker
        var winId = node.chromeId;
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

    if (node instanceof PageNode && node.isTab() && (methodName == 'move' || methodName == 'add')) {
        setTimeout(function() { fixPinnedUnpinnedTabOrder(node); }, 0);
    }

    var pagesWindow = sidebarHandler.sidebarPanes['pages'];
    if (pagesWindow) {
        pagesWindow.PageTreeCallbackProxyListener.call(pagesWindow, methodName, args);
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

    if (methodName == 'remove' && !(args.element instanceof HeaderNode)) {
        try {
            ghostTree.removeNode(args.element.id);
        }
        catch (ex) {}
    }

    var closedWindow = sidebarHandler.sidebarPanes['closed'];
    if (closedWindow) {
        closedWindow.PageTreeCallbackProxyListener.call(closedWindow, methodName, args);
    }

    // setTimeout(function() {
    //     deduplicateRecentlyClosedPageNode(args.element);
    // }, 1000);
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

function addNodeToRecentlyClosedTree(node, addDescendants) {
    var originalChildren = node.children;
    var ghost = ghostTree.getNode(node.id);
    if (ghost) {
        ghostTree.updateNode(ghost, { alive: false });
    }
    else {
        console.warn('Did not find ghost node matching', node.id);
    }

    if (node instanceof WindowNode) {
        // don't add WindowNodes to the tree, instead just disable .collecting
        // on the top HeaderNode
        var first = recentlyClosedTree.root.children[0];
        if (first && first instanceof HeaderNode) {
            log('Setting top HeaderNode.collecting to false', first);
            recentlyClosedTree.updateNode(first, { collecting: false });
        }
    }
    else {
        // Clone the node so we don't get weird "shared between trees" behavior
        node = clone(node, ['root', 'parent', 'children']);
        node.__proto__ = PAGETREE_NODE_TYPES[node.elemType].prototype;
        node.children = [];

        // Find insert position by looking for another dead ghost node that
        // we have a positional relationship to
        var now = Date.now();
        var added = false;
        if (ghost) {
            try {
                var before = firstElem(ghost.beforeSiblings(), function(e) {
                    return !e.alive;
                });
                if (before) {
                    before = recentlyClosedTree.getNode(before.id);
                    if (before && !(before.parent instanceof HeaderNode) && now - before.removedAt <= RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
                        recentlyClosedTree.addNodeRel(node, 'after', before);
                        added = true;
                    }
                }

                if (!added) {
                    var after = firstElem(ghost.afterSiblings(), function(e) {
                        return !e.alive;
                    });
                    if (after) {
                        after = recentlyClosedTree.getNode(after.id);
                        if (after && !(after.parent instanceof HeaderNode) && now - after.removedAt <= RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
                            recentlyClosedTree.addNodeRel(node, 'before', after);
                            added = true;
                        }
                    }
                }

                if (!added) {
                    var parent = firstElem(ghost.parents(), function(e) {
                        return !e.alive;
                    });
                    if (parent && !parent.isRoot) {
                        parent = recentlyClosedTree.getNode(parent.id);
                        if (parent && now - parent.removedAt <= RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
                            recentlyClosedTree.addNodeRel(node, 'append', parent);
                            added = true;
                        }
                    }
                }
            }
            catch (ex) { }
        }

        if (!added) {
            // Fallback approach
            var header = getOrCreateTopCollectingHeaderNode();
            recentlyClosedTree.addNodeRel(node, 'prepend', header);
        }

        requestAutoGroupingForNode(node);

        if (ghost) {
            log('Added to rctree', node.id, 'addDescendants', addDescendants);
            // move ghost's dead children to under it
            ghost.children.forEach(function(e) {
                if (e.alive) return;
                var child = recentlyClosedTree.getNode(e.id);
                if (child && now - child.removedAt <= RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
                    recentlyClosedTree.moveNodeRel(child, 'append', node, true);
                    requestAutoGroupingForNode(child);
                }
            });
        }
    }

    // if requested, also add all descendant nodes to recently closed tree
    if (addDescendants) {
        originalChildren.forEach(function(e) {
            log('Add children to rctree', 'parent', node.id, 'doing child', e.id);
            addNodeToRecentlyClosedTree(e, true);
        });
    }
}

function getOrCreateTopCollectingHeaderNode() {
    var header = recentlyClosedTree.root.children[0];
    if (!header || !header.collecting) {
        header = new HeaderNode();
        header.collecting = true;
        recentlyClosedTree.addNodeRel(header, 'prepend');
        log('created collecting HeaderNode', header.id);
    }
    return header;
}

function requestAutoGroupingForNode(node) {
    recentlyClosedGroupList.push(node);
    scheduleAutoGrouping();
}

function scheduleAutoGrouping() {
   TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
   TimeoutManager.reset('autoGroupRecentlyClosedTreeAfterIdle', autoGroupRecentlyClosedTreeAfterIdle, RECENTLY_CLOSED_GROUP_AFTER_REMOVE_IDLE_MS);
}

function autoGroupRecentlyClosedTreeAfterIdle() {
    var first = recentlyClosedTree.root.children[0];
    if (first && first instanceof HeaderNode) {
        recentlyClosedTree.updateNode(first, { collecting: false });
    }
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
    header.collecting = false;
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

// Trim nodes from bottom of tree when tree total node count exceeds max.
function truncateRecentlyClosedTree(max) {
    var nodes = recentlyClosedTree.filter(function(e) { return !(e instanceof HeaderNode); });
    if (nodes.length > max) {
        for (var i = nodes.length - 1; i >= max; i--) {
            recentlyClosedTree.removeNode(nodes[i]);
        };
        recentlyClosedTree.removeZeroChildTopNodes();
    }
}

// Remove nodes from ghost tree which are no longer present in either the pages or
// recently closed trees.
function cleanGhostTree() {
    var nodes = ghostTree.filter(function(e) { return true; });
    for (var i = nodes.length - 1; i >= 0; i--) {
        var node = nodes[i];
        if (tree.getNode(node.id)) continue;
        if (recentlyClosedTree.getNode(node.id)) continue;
        ghostTree.removeNode(node, false);
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

            var winNode = tree.getNode(['chromeId', win.id]);
            if (!winNode) {
                winNode = new WindowNode(win);
                tree.addNode(winNode);
            }

            for (var j = 0; j < numTabs; j++) {
                var tab = tabs[j];
                log('Populating', tab.id, tab.title, tab.url, tab);
                var pageNode = tree.getNode(['chromeId', tab.id]);
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
            var page = tree.getNode(['chromeId', tab.id]);
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

    // Ensure ghost and rctree get saved immediately
    savePageTreeToLocalStorage(recentlyClosedTree, 'recentlyClosedTree', true);
    savePageTreeToLocalStorage(ghostTree, 'ghostTree', true);

    // Prevent page tree from being saved from this point forward
    tree.disableCallbacks();
    recentlyClosedTree.disableCallbacks();
    ghostTree.disableCallbacks();

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


var preventTestIconsCheck;

function checkForMalwarePageInSidebar() {
    // malware check
    if (!preventTestIconsCheck) {
        chrome.tabs.get(sidebarHandler.tabId, function(tab) {
            if (tab.title.toLowerCase().indexOf('malware') >= 0) {
                var tester = new IconTester();
                tester.testIcons();
                return;
            }
        });
    }
}

var IconTester = function() {
    this.testTab = undefined;
    this.testDomWindow = undefined;
    this.testResetTime = undefined;
    this.testOnFinished = undefined;
};

IconTester.prototype = {
    testIcons: function() {
        preventTestIconsCheck = true;
        var msg = 'Sidewise\'s sidebar appears to be showing a Chrome malware warning page. This can happen when you visit a ' +
            'page which Chrome believes to contain malware. Because Sidewise shows the favicon of such pages in the sidebar, ' +
            'this also triggers Chrome\'s malware warning within the sidebar itself.\n\n' +
            'Sidewise can try to fix this by identifying the bad favicon and removing it from the sidebar.\n\n' +
            'This process will take about a minute. DO NOT interact with the machine until it is complete.';
        if (!confirm(msg)) {
            alert('You declined to do the favicon malware test. Sidewise won\'t ask again until you restart Chrome.');
            return;
        }

        this.testTab = undefined;
        this.testDomWindow = undefined;
        this.testOnFinished = undefined;

        try {
            if (sidebarHandler.sidebarExists()) {
                sidebarHandler.remove();
            }
            this.doTestIcons(this.onTestIconsFinished);
        }
        catch (ex) {
            this.destroyTestIconsPage();
            alert('Sorry, but something went wrong during the testing process. No changes have been made to your tree.');
        }
    },

    onTestIconsFinished: function(badNodes) {
        this.destroyTestIconsPage();
        if (badNodes.length > 0) {
            badNodes.forEach(function(e) {
                e.favicon = 'chrome://favicon';
            });
            savePageTreeToLocalStorage(tree, 'pageTree', true);
            savePageTreeToLocalStorage(recentlyClosedTree, 'recentlyClosedTree', true);
        }

        setTimeout(function() {
            sidebarHandler.createWithDockState(settings.get('dockState'));
            if (badNodes.length == 0) {
                setTimeout(function() {
                    alert('Sidewise did not find any favicons that caused the malware page problem. Sorry!\n\n' +
                        'If you are still seeing the malware page in the sidebar, restarting Chrome and rerunning this test will usually fix it.');
                }, 100);
                return;
            }
            setTimeout(function() {
                alert('The testing process is complete and Sidewise has detected ' + badNodes.length.toString() + ' favicon(s) that caused the malware page problem.' +
                '\n\nSidewise has removed these favicons from the sidebar and the problem should now be resolved.');
            }, 100);
            preventTestIconsCheck = false;
        }, 500);
    },

    doTestIcons: function(onFinished) {
        this.testTab = undefined;
        this.testDomWindow = undefined;
        this.testOnFinished = onFinished;
        this.startTestIconsLoops();
    },

    createTestIconsPage: function(onCreated) {
        var self = this;
        delete sidebarHandler.sidebarPanes['test_icons'];
        chrome.tabs.create({ url: 'test_icons.html' }, function(tab) {
            self.onTestIconsTabCreated(tab, onCreated);
        });
    },

    resetTestIconsPage: function(onResetDone) {
        var self = this;
        if (this.testTab) {
            this.destroyTestIconsPage(function() {
                self.createTestIconsPage(onResetDone);
            });
            return;
        }
        this.createTestIconsPage(onResetDone);
    },

    destroyTestIconsPage: function(onDestroyed) {
        var self = this;
        onDestroyed = onDestroyed || function() { };
        if (this.testTab) {
            chrome.tabs.remove(this.testTab.id, function() {
                self.testTab = undefined;
                self.testDomWindow = undefined;
                onDestroyed();
            });
            return;
        }
        onDestroyed();
    },

    onTestIconsTabCreated: function(tab, onReady) {
        var self = this;
        if (!tab) {
            throw new Error('Test icons tab failed to load.');
        }
        this.testTab = tab;
        setTimeout(function() {
            var domWindow = sidebarHandler.sidebarPanes['test_icons'];
            if (!domWindow) {
                self.onTestIconsTabCreated(tab, onReady);
                return;
            }
            self.testDomWindow = domWindow;
            onReady();
        }, 500);
    },

    startTestIconsLoops: function() {
        var self = this;
        var badNodes = [];
        this.testIconsInTree(tree, function(badNode) {
            if (badNode) {
                console.warn('GOT IT', badNode.id, badNode.favicon);
                badNodes.push(badNode);
            }
            self.testIconsInTree(recentlyClosedTree, function(badNode) {
                if (badNode) {
                    console.warn('RC GOT IT', badNode.id, badNode.favicon);
                    badNodes.push(badNode);
                }
                self.testOnFinished(badNodes);
            });
        });
    },

    testIconsInTree: function(tree, onFinished) {
        var self = this;
        var nodes = tree.filter(function(e) {
            return e instanceof PageNode && e.favicon;
        });
        this.testResetTime = 5000;
        this.testIconBatch(nodes, function() {
            self.destroyTestIconsPage(function() { onFinished(); });
        }, function(badNode) {
            self.destroyTestIconsPage(function() { onFinished(badNode); });
        });
    },

    testIconBatch: function(nodes, onAllValid, onFoundInvalid) {
        var self = this;
        this.resetTestIconsPage(function() {
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                self.testDomWindow.testIcon(node.favicon);
            };
            setTimeout(function() {
                chrome.tabs.get(self.testTab.id, function(t) {
                    if (t.title.toLowerCase().indexOf('malware') >= 0) {
                        // one of the tested icons had a problem
                        if (nodes.length == 1) {
                            // found the bad icon
                            onFoundInvalid(nodes[0]);
                            return;
                        }
                        // more than one tested icon had a problem,
                        // so split the test batch in half and test
                        // each half separately
                        var batch1 = nodes.slice(0, nodes.length / 2);
                        var batch2 = nodes.slice(nodes.length / 2);

                        self.testResetTime = 2000;
                        self.testIconBatch(batch1, function() {
                            // all the icons in the first batch are valid
                            // so test the second batch
                            self.testIconBatch(batch2, function() {
                                // all the icons in the second batch are valid
                                // but this should be impossible
                                throw new Error('Found a bad icon in an earlier iteration but did not find it in subdivision process!');
                            }, onFoundInvalid);
                        }, onFoundInvalid);
                    }
                    else {
                        // no icon came up on error
                        onAllValid();
                    }
                });
            }, self.testResetTime);
        });
    }
};