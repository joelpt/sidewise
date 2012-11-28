///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var expectingSmartFocusTabId = null;
var expectingTabMoves = [];


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

function registerTabEvents()
{
    chrome.tabs.onCreated.addListener(onTabCreated);
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onMoved.addListener(onTabMoved);
    chrome.tabs.onActivated.addListener(onTabActivated);
    chrome.tabs.onDetached.addListener(onTabDetached);
    chrome.tabs.onAttached.addListener(onTabAttached);
    chrome.tabs.onHighlighted.addListener(onTabHighlighted);
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onTabCreated(tab)
{
    log(tab, tab.id);
    if (monitorInfo.isDetecting()) {
        return;
    }
    if (sidebarHandler.creatingSidebar && tab.url == sidebarHandler.sidebarUrl)
    {
        log('ignoring creation of the sidebar');
        return;
    }

    if (expectingNavigationTabIdSwap) {
        // tab id swapping is probably about to occur
        if (expectingNavigationOldTabId) {
            // it did occur; swap tab ids
            log('Swapping in new tab id and url', 'old', expectingNavigationOldTabId, 'new', tab.id);
            var page = tree.getPage(expectingNavigationOldTabId);
            tree.updatePage(page, {
                id: 'p' + tab.id,
                url: tab.url,
                windowId: tab.windowId
            });
            refreshPageStatus(page);
            resetExpectingNavigation();
            return;
        }

        // we thought a swap might occur but the old (replaceable) tab never was reported
        // as removed, so the user must have actually created a new tab (alt+enter) from
        // the tab that Chrome was preloading
        log('Cancelling expected tab id swap');
        resetExpectingNavigation();
    }

    // TODO do referrer/historylength retrieval for awakening pages in order to do a better
    // job of matching up duplicate-url pages
    var waking = first(tree.awakeningPages, function(e) { return e.url == tab.url });
    if (waking) {
        var wakingIndex = waking[0];
        var wakingPage = waking[1];
        log('associating waking tab to existing hibernated page element', tab, wakingPage);
        tree.updatePage(wakingPage, {
            id: 'p' + tab.id,
            windowId: tab.windowId,
            hibernated: false,
            unread: true,
            status: 'preload'
        });
        refreshPageStatus(wakingPage);
        tree.awakeningPages.splice(wakingIndex, 1); // remove matched element
        fixPinnedUnpinnedTabOrder(wakingPage);
        tree.rebuildTabIndex();
        return;
    }

    if (tab.url.indexOf('chrome://newtab') == 0 && !tab.pinned) {
        // special handling for New Tabs
        var tabsCount = tree.getWindowIndexedTabsCount(tab.windowId);
        if (tabsCount == tab.index) {
            // New Tab has been added as last node of the window
            // Try to associate to a hibernated New Tab node that is the last
            // child row of the window, if such exists
            var children = tree.getNode('w' + tab.windowId).children;
            if (children.length > 0) {
                var last = children[children.length - 1];
                if (last.children.length == 0 && last.hibernated && last.restorable
                    && last.url == tab.url && !last.pinned)
                {
                    restoreAssociatedPage(tab, last);
                    log('New Tab associated to hibernated last-in-window New Tab node');
                    return;
                }
            }
            // Otherwise just do a regular insert to last spot in window
            var page = new PageNode(tab, 'complete');
            page.unread = true;
            page.initialCreation = false;
            tree.addTabToWindow(tab, page);
            log('New Tab added to end of window');
            return;
        }
    }

    // try fast association first
    if (tryFastAssociateTab(tab, false)) {
        return;
    }

    var page = new PageNode(tab, 'preload');
    page.unread = true;
    page.initialCreation = false;

    // get updated page status in a moment, just in case Chrome fails to fire onTabUpdated subsequently
    refreshPageStatus(page);

    // view-source://*
    if (tab.url && tab.url.indexOf('view-source:') == 0 && tab.openerTabId) {
        // view source pages should be nested under the parent always
        tree.addNode(page, 'p' + tab.openerTabId, undefined, true);
        return;
    }

    // non scriptable urls, e.g. chrome://*
    if (tab.url && !isScriptableUrl(tab.url)) {
        // Non scriptable tab; attempt to associate it with a restorable page node
        // even though it's possible the user just created this tab freshly. We do this
        // because onCommitted never fires for non scriptable tabs and therefore
        // we'll never be able to detect if this tab's transitionType=='reload' which
        // is how we normally detect that a tab is being restored rather than created anew
        log('Adding non scriptable tab to tree via association attempt', tab.id, tab, tab.url);

        var winNode = tree.getNode('w' + tab.windowId);
        if (!winNode) {
            tree.addTabToWindow(tab, page);
        }
        else {
            if (tab.index == 0) {
                tree.addNodeRel(page, 'prepend', winNode);
            }
            else {
                var next = tree.getTabByIndex(tab.windowId, tab.index);
                if (next) {
                    tree.addNodeRel(page, 'before', next);
                }
                else {
                    tree.addNodeRel(page, 'append', winNode);
                }
            }
        }

        associateExistingToRestorablePageNode(tab);
        return;
    }

    page.initialCreation = true;

    var winTabs = tree.getWindowTabIndexArray(tab.windowId);

    if (!winTabs) {
        winTabs = [];
        log('Could not obtain winTabs for windowId ' + tab.windowId);
    }

    if (!tab.openerTabId) {
        if (winTabs.length > 0 && tab.index == 0) {
            log('No openerTabId and index is at start of tree; prepending to window');
            tree.addNodeRel(page, 'prepend', tree.getNode('w' + tab.windowId));
            return;
        }
        if (winTabs.length == 0 || winTabs.length == tab.index) {
            log('No openerTabId and index is at end of tree, or no tab indexes are found for hosting window; appending to window');
            tree.addTabToWindow(tab, page);
            return;
        }
        var nextByIndex = winTabs[tab.index];
        if (!nextByIndex) {
            log('nextByIndex not found though it should have been; just adding tab to window and scheduling full rebuild');
            tree.addTabToWindow(tab, page);
            tree.conformAllChromeTabIndexes(true);
            return;
        }
        log('No openerTabId and index is in middle of window\'s tabs; inserting before ' + nextByIndex.id, nextByIndex);
        tree.addNodeRel(page, 'before', nextByIndex);
        return;
    }

    var opener = tree.getNode('p' + tab.openerTabId);
    if (!opener) {
        log('Could not find node matching openerTabId; just adding tab to window', 'openerTabId', openerTabId);
        tree.addTabToWindow(tab, page);
        tree.conformAllChromeTabIndexes(true);
        return;
    }

    var precedingByIndex = winTabs[tab.index - 1];

    if (precedingByIndex) {
        if (opener === precedingByIndex) {
            log('openerTabId corresponds to preceding page by index; making a child of opener ' + opener);
            tree.addNodeRel(page, 'prepend', opener);
            return;
        }

        if (opener === precedingByIndex.parent) {
            log('openerTabId corresponds to parent of preceding page by index; inserting after preceding ' + precedingByIndex.id);
            tree.addNodeRel(page, 'after', precedingByIndex);
            return;
        }
    }

    var nextByIndex = winTabs[tab.index];
    if (nextByIndex) {
        log('openerTabId does not correspond to preceding page nor its parent; insert purely by index before following node ' + nextByIndex.id);
        tree.addNodeRel(page, 'before', nextByIndex);
        return;
    }

    if (winTabs.length > 0 && tab.index == winTabs.length) {
        log('Tab appears to be created as last tab in window, so just appending it to the window');
        tree.addTabToWindow(tab, page);
        return;
    }

    log('Could not find insert position on tab index basis, resorting to simple parent-append', opener, nextByIndex, precedingByIndex, winTabs);
    tree.addNodeRel(page, 'append', opener);
    tree.conformAllChromeTabIndexes(true);
}

function onTabRemoved(tabId, removeInfo)
{
    if (monitorInfo.isDetecting()) {
        return;
    }
    if (tabId == sidebarHandler.tabId)
    {
        // we ignore the sidebar tab
        return;
    }
    log(tabId, removeInfo);

    if (expectingNavigationTabIdSwap) {
        if (removeInfo.isWindowClosing) {
            // if a window is closing with this tab removal, a tab swap
            // did not and will not be happening for the removed tab
            resetExpectingNavigation();
        }
        else {
            // We think Chrome is about to swap this tab with another tab
            // due to preloading a tab in the background and swapping it in
            log('Recording expected navigation old tab id', tabId);
            expectingNavigationOldTabId = tabId;

            // If Chrome does not perform the tab swap very soon, then we
            // assume it never will
            setTimeout(function() {
                if (expectingNavigationTabIdSwap) {
                    log('Timing out expected navigation swap');
                    resetExpectingNavigation();
                    onTabRemoved(tabId, removeInfo);
                    return;
                }
                log('Navigation swap appears to have occurred before reset timeout');
            }, 250);
            return;
        }
    }

    var page = tree.getPage(tabId);

    if (!page) {
        // Page node with this tabId doesn't exist; this is most likely because
        // the user hibernated it from the sidebar. Don't try to remove the node
        // or do smart-focus because the node doesn't exist and we know nothing
        // about where it was in the tree.
        return;
    }

    // force one-time viewing of donate page during first time install, if user did
    // not click the "what now?" button on the first time install page
    if (firstTimeInstallTabId == tabId) {
        tree.removeNode(page);
        firstTimeInstallTabId = null;
        if (!settings.get('firstTimeInstallDonatePageShown')) {
            settings.set('firstTimeInstallDonatePageShown', true);
            chrome.tabs.create({ url: '/options_install.html?page=donate', active: true });
        }
        return;
    }

    // smart focus on close
    if (settings.get('smartFocusOnClose')
        && sidebarHandler.sidebarExists()
        && tabId == tree.focusedTabId)
    {
        var nextTabId;
        if (page.smartFocusParentTabId) {
            nextTabId = page.smartFocusParentTabId;
        }
        else {
            nextTabId = findNextTabToFocus(page.id, settings.get('smartFocusPrefersCousins'));
            if (nextTabId) {
                nextTabId = parseInt(nextTabId.slice(1));
            }
        }

        // if we found a next tab to show per our own logic, switch to it
        if (nextTabId) {
            log('Smart focus setting selected tab to ' + nextTabId);
            expectingSmartFocusTabId = nextTabId;
            TimeoutManager.reset('resetExpectingSmartFocusTabId', function() {
                expectingSmartFocusTabId = null;
            }, 500);
            try {
                chrome.tabs.update(nextTabId, { active: true }, function(tab) {
                    expectingSmartFocusTabId = null;
                    TimeoutManager.clear('resetExpectingSmartFocusTabId');
                    if (!tab) {
                        // an error occurred while trying to smart focus, most likely
                        // the tab we tried to focus was removed, so let Chrome decide
                        focusCurrentTabInPageTree(true);
                    }
                });
            }
            catch (ex) {
                log('Smart focus tab no longer exists, letting Chrome decide', nextTabId);
                expectingSmartFocusTabId = null;
                TimeoutManager.clear('resetExpectingSmartFocusTabId');
            }
        }
        // else, nothing suitable was found; we'll just let Chrome decide
    }

    if (page.hibernated) {
        // page is set to be hibernated; since its tab has been closed, that means
        // we are only removing the tab for purposes of hibernation
        return;
    }

    var parent = page.parent;

    // remove the page element from the tree
    tree.removeNode(page);

    // also remove zero-child parent window nodes if necessary
    if (parent instanceof WindowNode && parent.children.length == 0) {
        tree.removeNode(parent);
    }
}

function findNextTabToFocus(nextToNodeId, preferCousins) {
        // identify the next tab we would like to navigate to
        var node = tree.getNode(nextToNodeId);
        var id;

        var topParent = node.topParent();
        if (topParent instanceof WindowNode && topParent.children.length <= 1) {
            // don't do smart focus when there are no other nodes under our window node
            // to smart focus; just let Chrome decide which previous window/tab to focus
            return undefined;
        }

        // first valid descendant
        for (var i = 0; i < node.children.length; i++) {
            var id = testNodeForFocus(node.children[i], true);
            if (id) return id;
        }

        // next valid sibling or sibling-descendant
        var afters = node.afterSiblings();
        for (var i = 0; i < afters.length; i++) {
            var id = testNodeForFocus(afters[i], true);
            if (id) return id;
        }

        // use nearest preceding node unless it is at parent or higher level
        var preceding = node.preceding(function(e) { return e.isTab() });
        if (preceding && node.parents().indexOf(preceding) == -1) {
            return preceding.id;
        }

        // parent, when node is only child of parent and
        // we were just focusing the parent
        if (node.isTab() && node.parent.isTab() && node.parent.children.length == 1) {
            var nodeTabId = getNumericId(node.id);
            var parentTabId = getNumericId(node.parent.id);

            // test node and parent matching focused and last-focused in either pairing
            // combination; due to variances in timing of onTabActivated() event firings
            // either can occur and mean the same thing to us here
            if ((nodeTabId == tree.focusedTabId && parentTabId == tree.lastFocusedTabId)
                || (nodeTabId == tree.lastFocusedTabId && parentTabId == tree.focusedTabId))
            {
                return node.parent.id;
            }
        }

        // look for a later cousin before traversing up to node's parent
        if (preferCousins) {
            for (var i = node.parent.siblingIndex() + 1; i < node.parent.siblings().length; i++) {
                if (node.parent.siblings()[i].children.length > 0) {
                    var id = testNodeForFocus(node.parent.siblings()[i].children[0], true);
                    if (id) return id;
                }
            }
        }

        // use parent
        if (settings.get('smartFocusPrefersParent') && node.parent.isTab()) {
            return node.parent.id;
        }

        // use nearest following node within the same top level node (window)
        var following = node.following(function(e) { return e.isTab(); }, node.topParent());
        if (following) {
            return following.id;
        }

        // use nearest preceding node including ancestors
        if (preceding) {
            return preceding.id;
        }

        // nothing suitable found
        return undefined;
}

function testNodeForFocus(node, testDescendants)
{
    if (node.isTab()) {
        return node.id;
    }

    if (testDescendants && !node.collapsed) {
        for (var i = 0; i < node.children.length; i++) {
            var id = testNodeForFocus(node.children[i], true);
            if (id) return id;
        }
    }

    return undefined;
}

function onTabUpdated(tabId, changeInfo, tab)
{
    log(tab, changeInfo, tabId);
    if (tabId == sidebarHandler.tabId) {
        // we ignore the sidebar tab
        return;
    }
    if (monitorInfo.isDetecting()) {
        return;
    }

    var page = tree.getPage(tabId);

    if (!page) {
        // page row entry doesn't exist so we cannot update it
        // this can happen during browser startup
        return;
    }

    // Clear any checkPageStatus timers that may have been set in onBeforeNavigate; since
    // we have gotten an onTabUpdated event we won't need to do this redundant checking
    if (page.status == 'preload') {
        log('Clearing checkPageStatuses');
        TimeoutManager.clear('checkPageStatus1_' + tabId);
        TimeoutManager.clear('checkPageStatus2_' + tabId);
        TimeoutManager.clear('checkPageStatus3_' + tabId);
    }

    var url = tab.url ? dropUrlHash(tab.url) : '';
    var title = getBestPageTitle(tab.title, url)

    var favicon;
    var hasStaticFavicon = isStaticFavIconUrl(page.favicon);
    if (!hasStaticFavicon) {
        // existing page element doesn't have a "good" favicon, try to replace it
        favicon = getBestFavIconUrl(tab.favIconUrl, url);
    }
    else if (isStaticFavIconUrl(tab.favIconUrl)) {
        // got a potentially new static favicon, switch it out
        favicon = getBestFavIconUrl(tab.favIconUrl, url);
    }
    else if (!isScriptableUrl(url)) {
        if (hasStaticFavicon) {
            // keep the existing favicon
            favicon = page.favicon;
        }
        else {
            // we usually don't get a tab.faviconUrl for unscriptable tabs, so
            // just force-set one now from the favicon aliases catalog
            favicon = getBestFavIconUrl('', url);
        }
    }
    else if (url && page.url) {
        var tabUrlSplit = splitUrl(url);
        var pageUrlSplit = splitUrl(page.url);

        if (tabUrlSplit && pageUrlSplit) {
            var tabUrlDomain = tabUrlSplit.domain;
            var pageUrlDomain = pageUrlSplit.domain;

            if (tabUrlDomain != pageUrlDomain) {
                // changing domains, blank out the favicon until we get a new favicon
                favicon = 'chrome://favicon/';
            }
            else {
                // keep the existing favicon
                favicon = page.favicon;
            }
        }
    }

    if (!page.placed && !(page.parent instanceof WindowNode) && !tab.openerTabId && page.openerTabId) {
        // openerTabId has gone missing since onTabCreated and tab is not placed yet;
        // this can happen when opening several bookmarks into a new window from Chrome's
        // Bookmark Manager. Un-childify such tabs.
        var parent = page.topParent();
        var before = first(parent.children, function(e) {
            return e instanceof PageNode && !e.hibernated && e.index > page.index;
        });

        if (before) {
            before = before[1];
            tree.moveNodeRel(page, 'before', before);
            page.placed = true;
        }
        else {
            tree.moveNodeRel(page, 'append', parent);
            page.placed = true;
        }
    }
    else if (!page.placed && tab.openerTabId && !page.openerTabId && page.parent.id != 'p' + tab.openerTabId) {
        // openerTabId was missing initially in onTabCreated but exists now; this happens when
        // using "open selected links" extension, so place these under their correct parent now

        var newParent = tree.getPage(tab.openerTabId);
        if (!newParent) {
            console.error('Could not find correct parent by openerTabId ' + tab.openerTabId);
        }
        else {
            // try to put in the correct order
            var nextByIndex = first(newParent.children, function(e) {
                return e.isTab() && e.index > tab.index;
            });
            if (nextByIndex) {
                nextByIndex = nextByIndex[1];
                log('Moving node which now has openerTabId to be ordered child of correct parent',
                    'moving', page.id, 'before', nextByIndex, nextByIndex.id, 'parent', newParent.id);
                tree.moveNodeRel(page, 'before', nextByIndex);
                page.placed = true;
            }
            else {
                if ( !page.pinned
                    && newParent.following(function(e) {
                        return e.isTab() && e.pinned;
                    }, newParent.topParent()) )
                {
                    log('Denying move-to-child because doing so would put unpinned page before pinned one');
                }
                else {
                    log('Moving node which now has openerTabId to be NON ordered child of correct parent',
                        'moving', page.id, 'append', newParent.id);
                    tree.moveNodeRel(page, 'append', newParent);
                }
                page.placed = true;
            }
        }
    }

    // TODO also don't push status unless it's in changeInfo
    // TODO in fact only change what is in changeInfo, period
    tree.updateNode(page, {
        status: tab.status,
        url: tab.url,
        favicon: favicon,
        title: title,
        pinned: tab.pinned,
        openerTabId: tab.openerTabId,
        mediaState: 'unstarted',
        mediaTime: 0
    });

    if (tab.url.match(/^chrome-/)) {
        // chrome-*://* urls do not fire webNavigation events, so we want to check in a bit
        // for an updated title manually
        setTimeout(function() {
            chrome.tabs.get(tab.id, function(t) {
                tree.updatePage(tab.id, { title: getBestPageTitle(t.title) });
            });
        }, 1000);
    }

    // Some pages, e.g. maps.google.com, modify the history without triggering any
    // content-script-detectable events that we would otherwise use to detect such a modification.
    // So we always ask pages for current details here.
    try {
        getPageDetails(tab.id, { action: 'store' });
    }
    catch(ex) {
        // getPageDetails won't work if a page was just created because the port hasn't been established
        // yet, but this is okay because the page's content script will send us details anyway
    }
}

function onTabMoved(tabId, moveInfo) {
    log(tabId, moveInfo);
    if (removeFromExpectingTabMoves(tabId)) {
        log('Was expecting this tab move, just updating windowId and index');
        var page = tree.getPage(tabId);
        tree.removeFromTabIndex(page);
        page.index = moveInfo.toIndex;
        page.windowId = moveInfo.windowId;
        tree.addToTabIndex(page);
        return;
    }
    tree.updatePageIndex(tabId, moveInfo.windowId, moveInfo.fromIndex, moveInfo.toIndex);
}

function removeFromExpectingTabMoves(tabId) {
    var expectingTabMovesIndex = expectingTabMoves.indexOf(tabId);
    if (expectingTabMovesIndex > -1) {
        expectingTabMoves.splice(expectingTabMovesIndex, 1);
        return true;
    }
    return false;
}

function onTabActivated(activeInfo) {
    // log(activeInfo);
    if (monitorInfo.isDetecting()) {
        return;
    }
    if (sidebarHandler.creatingSidebar) {
        return;
    }
    if (sidebarHandler.tabId == activeInfo.tabId) {
        return;
    }
    if (expectingSmartFocusTabId) {
        if (expectingSmartFocusTabId != activeInfo.tabId) {
            // ignore Chrome's choice of focused tab when some tab is removed;
            // we'll set focus to Sidewise's choice when onTabActivated is
            // called again in a moment
            return;
        }
        expectingSmartFocusTabId = null;
    }
    tree.focusPage(activeInfo.tabId);
}

function onTabDetached(tabId, detachInfo) {
    // remove detatched tabs temporarily from tree.tabIndexes, they will
    // be added back correctly when we receive onTabAttached shortly
    var node = tree.getPage(tabId);
    if (node) {
        tree.removeFromTabIndex(node);
    }
}

function onTabAttached(tabId, attachInfo) {
    log(tabId, attachInfo);

    var moving = tree.getPage(tabId);
    if (!moving) {
        throw new Error('Could not find page with tab id ' + tabId);
    }

    moving.windowId = attachInfo.newWindowId;
    moving.index = attachInfo.newPosition;

    if (removeFromExpectingTabMoves(tabId)) {
        log('Was expecting this tab move, just updating its windowId and index');
        return;
    }

    var topParent = moving.topParent();
    if (topParent instanceof WindowNode
        && !(topParent.hibernated)
        && getNumericId(topParent.id) == attachInfo.newWindowId
        && tree.getTabIndex(moving) == attachInfo.newPosition)
    {
        log('attach move would have no effect, just updating moving.windowId/index, windowId ' + attachInfo.newWindowId + ' index ' + attachInfo.newPosition);
        return;
    }

    log('moving node in tree to window ' + attachInfo.newWindowId + ', to index ' + attachInfo.newPosition);

    var exists = tree.getTabIndex(moving);
    if (exists >= 0) {
        log('attached node exists already in tree, removing before doing lookup');
        tree.removeFromTabIndex(moving);
    }

    log('indexes look like this before getting before', moving.id, moving.index, tree.getWindowTabIndexArray(attachInfo.newWindowId));
    var before = tree.getTabByIndex(attachInfo.newWindowId, moving.index);

    if (before) {
        if (moving.following() === before) {
            log('moving node is already before ' + before.id + ' in tree, not moving');
        }
        else {
            log('moving to before ' + before.id, before);
            tree.moveNodeRel(moving, 'before', before);
        }
    }
    else {
        log('moving to last node under window ' + attachInfo.newWindowId);
        tree.moveNodeRel(moving, 'append', 'w' + attachInfo.newWindowId);
    }

    tree.rebuildPageNodeWindowIds(function() {
        tree.rebuildTabIndex();
    });
}

function onTabHighlighted(highlightInfo) {
    // log(highlightInfo);
    PageTreeCallbackProxy('multiSelectInWindow', highlightInfo);
}
