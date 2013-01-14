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

function onPageTreeModifiedDelayed() {
    if (browserIsClosed) {
        log('Browser is closed, will not save page tree!');
        return;
    }
    if (!allowSavingPageTree) {
        // log('Page tree saving currently not allowed, retry in ' + DENIED_SAVE_TREE_RETRY_MS + 'ms');
        TimeoutManager.reset('retryOnPageTreeModifiedDelayed', onPageTreeModifiedDelayed, config.DENIED_SAVE_TREE_RETRY_MS);
        return;
    }
    if (tree.lastModified != tree.lastSaved) {
        savePageTreeToLocalStorage(tree, 'pageTree', true);
        tree.lastSaved = tree.lastModified;
    }
    tree.onModifiedDelayedWaitMs = config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS;
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

    loadTreeFromLocalStorage(recentlyClosedTree, 'recentlyClosedTree', config.PAGETREE_NODE_TYPES);
    recentlyClosedTree.removeZeroChildTopNodes();
    var first = recentlyClosedTree.root.children[0];
    if (first && first.collecting) {
        first.collecting = false;
    }

    var backup = settings.get('backupPageTree', []);
    var haveBackup = backup && backup.length > 0
    if (haveBackup && localStorage['backupPageTreeLastSession'] != localStorage['backupPageTree']) {
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

        setTimeout(startAssociationRun, 2000); // wait a couple seconds for content scripts to get going
        populatePages(true);

        if (updatedSidewise) {
            showWhatsNewPane();
        }
        showPromoPageAnnually();
    }

    loadTreeFromLocalStorage(ghostTree, 'ghostTree', config.GHOSTTREE_NODE_TYPES);
    synchronizeGhostTree();
    setInterval(synchronizeGhostTree, MINUTE_MS * 30);

    // make an initial backup if we don't have one yet
    if (!haveBackup) {
        setTimeout(function() { backupPageTree(true); }, config.SAVE_TREE_INITIAL_BACKUP_AFTER_MS);
    }

    // save a backup of pageTree periodically
    setInterval(backupPageTree, config.SAVE_TREE_BACKUP_EVERY_MS);

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
        log('--- saving tree to ' + settingName + ' ---');
        var saveTree = clone(tree.tree, ['parent', 'root', 'hostTree', 'chromeId']);
        if (excludeIncognitoNodes) {
            saveTree = saveTree.filter(function(e) { return !e.incognito; });
    	}
    	if (saveTree.length == 0) {
        	console.error('Did not save tree because it is empty!');
        	return;
    	}
    	settings.set(settingName, saveTree);
    	tree.lastSaved = tree.lastModified;
    }
}

function backupPageTree(force) {
    if (browserIsClosed) {
        log('Skipped saving backup of tree because browser is closed');
        return;
    }
    var count = tree.reduce(function(last, e) { return last + 1; }, 0);
    if (count < config.MIN_NODES_TO_BACKUP_TREE && !force) {
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

function loadTreeFromLocalStorage(tree, settingKey, casts) {
    tree.loadTree(settings.get(settingKey), casts);
}

// loads saved tree data from local storage and populates the tree with it
function loadPageTreeFromLocalStorage(storedPageTree) {
    tree.loadTree(storedPageTree, config.PAGETREE_NODE_TYPES);

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

    chrome.tabs.query({ }, function(tabs) {
        var urlAndTitles = tabs.map(function(e) { return e.url + '\n' + e.title });
        var lastSessionWindowNumber = 1;
        var toRemove = [];

        // set hibernated+restorable flags on all non-hibernated nodes
        tree.forEach(function(node, index, depth, containingArray, parentNode) {

            // Remove window nodes that have only a single New Tab page row child
            if (node instanceof WindowNode && node.children.length == 1
                && node.children[0] instanceof PageNode
                && node.children[0].url == 'chrome://newtab/'
                && node.children[0].children.length == 0)
            {
                toRemove.push(node.children[0]);
                toRemove.push(node);
                return;
            }

            // remove nonexisting, nonhibernated chrome-*://* tabs from the tree because
            // Chrome will often not reopen these types of tabs during a session restore
            if (node instanceof PageNode
                && !node.hibernated
                && node.url.match(/^chrome-/)
                && urlAndTitles.indexOf(node.url + '\n' + node.title) == -1)
            {
                // remove the dead node
                toRemove.push(node);
                return;
            }

            node.restored = false;

            if (node instanceof WindowNode) {
                if (node.restorable && node.hibernated) {
                    // mark for removal post-association
                    node.old = true;
                }
                else if (!node.hibernated) {
                    node.title = getMessage('text_LastSession');
                    lastSessionWindowNumber++;
                    node.restorable = true;
                    node.hibernated = true;

                    if (settings.get('autoCollapseLastSessionWindows')) {
                        node.collapsed = true;
                    }
                }
            }
            else if (node instanceof PageNode) {
                // allow restoration of pages which either failed to restore in a previous
                // session, or were not manually hibernated by the user
                if (node.restorable || !node.hibernated) {
                    node.hibernated = true;
                    node.restorable = true;
                    node.status = 'complete';
                }
            }

            if (sidebarHandler.sidebarExists()) {
                tree.callbackProxyFn('add', { element: node, parentId: parentNode ? parentNode.id : undefined });
            }
        });

        toRemove.forEach(function(e) {
            try {
                tree.removeNode(e);
            } catch(ex) { }
        });
        var toRemove = [];

        // remove any WindowNodes that now have no children
        tree.root.children.forEach(function(e) {
            if (e instanceof WindowNode && e.children.length == 0) {
                toRemove.push(e);
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
        var now = Date.now();
        node = clone(node, ['root', 'parent', 'children']);
        node.__proto__ = config.PAGETREE_NODE_TYPES[node.elemType].prototype;
        node.children = [];

        // Find insert position by looking for another dead ghost node that
        // we have a positional relationship to
        var added = false;
        if (ghost) {
            try {
                var before = firstElem(ghost.beforeSiblings(), function(e) {
                    return !e.alive;
                });
                if (before) {
                    before = recentlyClosedTree.getNode(before.id);
                    if (before && !(before.parent instanceof HeaderNode) && now - before.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
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
                        if (after && !(after.parent instanceof HeaderNode) && now - after.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
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
                        if (parent && now - parent.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
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
                if (child && now - child.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
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
   TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
   TimeoutManager.reset('autoGroupRecentlyClosedTreeAfterIdle', autoGroupRecentlyClosedTreeAfterIdle, config.RECENTLY_CLOSED_GROUP_AFTER_REMOVE_IDLE_MS);
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

    if (recentlyClosedGroupList.length <= config.GROUPING_ROW_COUNT_THRESHOLD) {
        recentlyClosedGroupList = [];
        return;
    }

    // Retrigger this function instead of performing a grouping if there are more than config.GROUPING_ROW_COUNT_WAIT_THRESHOLD
    // tabs in the group list; once the number of tabs in the group list does not change between successive checks here,
    // we'll do the groupification. This helps to prevent unwanted splitting of a large multiple-tab-close operation
    // into multiple groups in the recently closed tree.
    if (recentlyClosedGroupList.length >= config.GROUPING_ROW_COUNT_WAIT_THRESHOLD) {
        if (recentlyClosedGroupListLastCount != recentlyClosedGroupList.length) {
            recentlyClosedGroupWaitIteration = 0;
            recentlyClosedGroupListLastCount = recentlyClosedGroupList.length;
            TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
            log('Retriggering autoGroupRecentlyClosedTreeNodes()');
            return;
        }
        // Tab count in group list didn't change between successive calls
        if (recentlyClosedGroupWaitIteration < config.GROUPING_ROW_COUNT_WAIT_ITERATIONS) {
            recentlyClosedGroupWaitIteration++;
            TimeoutManager.reset('autoGroupRecentlyClosedTreeNodes', autoGroupRecentlyClosedTreeNodes, config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
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

function synchronizeGhostTree() {
    removeMissingNodesFromGhostTree();
    addMissingNodesToGhostTree(tree, true);
    addMissingNodesToGhostTree(recentlyClosedTree, false);
}

// Remove nodes from ghost tree which are no longer present in either the pages or
// recently closed trees.
function removeMissingNodesFromGhostTree() {
    var nodes = ghostTree.filter(function(e) { return true; });
    for (var i = nodes.length - 1; i >= 0; i--) {
        var node = nodes[i];
        if (tree.getNode(node.id)) continue;
        if (recentlyClosedTree.getNode(node.id)) continue;
        ghostTree.removeNode(node, false);
    }
}

function addMissingNodesToGhostTree(fromTree, asAlive) {
    var missing = fromTree.getCondensedTree(function(e) {
        return ghostTree.getNode(e.id) === undefined;
    });
    if (missing.length == 0) return;

    function _mapper(e) {
        var r = new GhostNode(e.node.id, e.node.elemType);
        r.children = e.children.map(_mapper);
        r.alive = asAlive;
        return r;
    }

    var newGhosts = missing.map(_mapper);
    newGhosts.forEach(function(e) {
        ghostTree.addNode(e);
    });

    ghostTree.rebuildIndexes(); // addNode doesn't index existing descendants
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
            if (incognito === true && !win.incognito) continue;
            if (incognito === false && win.incognito) continue;

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
                var page = tree.getNode(['chromeId', tab.id]);
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
    TimeoutManager.clear('retryOnPageTreeModifiedDelayed');

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
    if (newsPane && settings.get('showWhatsNewPane') && !newsPane.enabled) {
        newsPane.enabled = true;
        paneCatalog.saveState();
        if (sidebarHandler.sidebarExists()) {
            var manager = sidebarHandler.sidebarPanes.sidebarHost.manager;
            manager.enableSidebarPane(pane.id);
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

