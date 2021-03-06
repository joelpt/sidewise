"use strict";

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var TAB_REMOVE_SAVE_TREE_DELAY_MS = 3000;
var SMART_FOCUS_DISABLE_FOR_TABS_CREATED_IN_LAST_MS = 8000;

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

    var ignoredPreloadedTab = false;

    if (expectingNavigationTabIdSwap) {
        // tab id swapping is probably about to occur
        if (expectingNavigationPossibleNewTabIds.indexOf(tab.id) >= 0) {
            if (expectingNavigationOldTabId) {
                // it did occur; swap tab ids
                var page = tree.getNode(['chromeId', expectingNavigationOldTabId]);
                if (page) {
                    log('Swapping in new tab id and url', 'old', expectingNavigationOldTabId, 'new', tab.id, 'found page node', page);
                    tree.updatePage(page, {
                        chromeId: tab.id,
                        url: tab.url,
                        windowId: tab.windowId
                    });
                    refreshPageStatus(page);
                    resetExpectingNavigation();
                    return;
                }
                log('Old page for swap no longer exists, so adding as new node', 'old', expectingNavigationOldTabId, 'new', tab.id);
            }
            else {
                log('No tab closed just before the preloaded tab was created so creating preloaded as new node');
            }

            // the preloaded tab has been created as a new normal tab, because we do not have
            // expectingNavigationOldTabId here which we otherwise would have if a swap was going on
            ignoredPreloadedTab = true;
            resetExpectingNavigation(); // TODO just substract our tab.id from expectingPossibleNewTabIds, don't do a full reset?
                                        // sounds reasonable although it seems chrome only ever has one preload-tab open at once
        }
        else {
            log('Was expecting a tab id swap, but some other tab was created in the meantime');
        }
    }

    // TODO do referrer/historylength retrieval for awakening pages in order to do a better
    // job of matching up duplicate-url pages
    var waking = first(tree.awakeningPages, function(e) { return e.url == tab.url });
    if (waking) {
        var wakingIndex = waking[0];
        var wakingPage = waking[1];
        log('associating waking tab to existing hibernated page element', tab, wakingPage);
        tree.updatePage(wakingPage, {
            chromeId: tab.id,
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

    if (isNewTabUrl(tab.url) && !tab.pinned) {
        // special handling for New Tabs
        var tabsCount = tree.getWindowIndexedTabsCount(tab.windowId);
        if (tabsCount == tab.index) {
            // New Tab has been added as last node of the window
            // Try to associate to a hibernated New Tab node that is the last
            // child row of the window, if such exists
            var children = tree.getNode(['chromeId', tab.windowId]).children;
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
        tree.addNode(page, ['chromeId', tab.openerTabId], undefined, true);
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

        var winNode = tree.getNode(['chromeId', tab.windowId]);
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

    if (ignoredPreloadedTab) {
        log('Preloaded tab created as normal new tab, adding to end of window like normal alt+enter');
        tree.addTabToWindow(tab, page);
        tree.conformAllChromeTabIndexes(true);
        return;
    }

    if (tree.focusedTabId == tab.id) {
        // try to counteract late-firing smart focus when we miss a preloading event
        log('Trying to counteract potential late-firing smart focus');
        chrome.tabs.update(tab.id, { active: true });
    }

    var winTabs = tree.getWindowTabIndexArray(tab.windowId);

    if (!winTabs) {
        winTabs = [];
        log('Could not obtain winTabs for windowId ' + tab.windowId);
    }

    if (!tab.openerTabId) {
        var prevByIndex = winTabs[tab.index - 1];
        var nextByIndex = winTabs[tab.index];
        if (prevByIndex && nextByIndex) {   // is the tab in the middle of the tab index (not at just one end)?
            if (prevByIndex.chromeId == tree.focusedTabId) {
                log('Making child of previous by index because previous is also focused tab');
                tree.addNodeRel(page, 'prepend', prevByIndex);
                return;
            }
            if (prevByIndex.parent && prevByIndex.parent.chromeId == tree.focusedTabId) {
                log('Making sibling after previous-by-index because PBI\'s parent is focused tab');
                tree.addNodeRel(page, 'after', prevByIndex);
                return;
            }
        }

        if (nextByIndex) {
            log('No openerTabId and index is in middle of window\'s tabs; inserting before ' + nextByIndex.id, nextByIndex);
            tree.addNodeRel(page, 'before', nextByIndex);
            return;
        }

        if (prevByIndex) {
            log('Place after previous by index', prevByIndex.id, prevByIndex);
            if (prevByIndex.children.length > 0) {
                tree.addNodeRel(page, 'prepend', prevByIndex);
            }
            else {
                tree.addNodeRel(page, 'after', prevByIndex);
            }
            return;
        }

        log('nextByIndex not found though it should have been; just adding tab to window and scheduling full rebuild');
        tree.addTabToWindow(tab, page);
        tree.conformAllChromeTabIndexes(false);
        return;
    }

    var opener = tree.getNode(['chromeId', tab.openerTabId]);
    if (!opener) {
        log('Could not find node matching openerTabId; just adding tab to window', 'openerTabId', openerTabId);
        tree.addTabToWindow(tab, page);
        tree.conformAllChromeTabIndexes(false);
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
    tree.conformAllChromeTabIndexes(false);
}

function onTabRemoved(tabId, removeInfo, denyTabSwap)
{
    if (monitorInfo.isDetecting()) {
        return;
    }
    if (tabId == sidebarHandler.tabId)
    {
        // we ignore the sidebar tab
        return;
    }
    log(tabId, removeInfo, 'denyTabSwap', denyTabSwap || false);

    if (expectingNavigationTabIdSwap && !denyTabSwap) {
        if (removeInfo.isWindowClosing) {
            // if a window is closing with this tab removal, a tab swap
            // did not and will not be happening for the removed tab
            log('Window is closing with this tab removal, so stop expecting a tab swap');
            resetExpectingNavigation();
        }
        else if (expectingNavigationPossibleNewTabIds.indexOf(tabId) >= 0) {
            // the preloaded tab has been removed so cannot be used
            // in future tab swapping
            log('Expected preload tab has been removed, so stop expecting a tab swap', tabId, 'not in', expectingPossibleNewTabIds);
            resetExpectingNavigation();
            return;
        }
        else {
            // We think Chrome is about to swap this tab with another tab,
            // due to preloading a tab in the background and swapping it in
            log('Recording expected navigation old tab id ' + tabId + ' and retriggering onTabRemoved');
            expectingNavigationOldTabId = tabId;

            // If Chrome does not perform the tab swap very soon, then we
            // assume it never will
            setTimeout(function() {
                var page = tree.getNode(['chromeId', tabId]);
                if (!page) {
                    return; // tab's node has either been swapped or otherwise removed from tree
                }
                // tab was not removed yet so do it now
                onTabRemoved(tabId, removeInfo, true);
            }, 125);
            return;
        }
    }

    var page = tree.getNode(['chromeId', tabId]);

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
        if (Date.now() - page.createdOn < SMART_FOCUS_DISABLE_FOR_TABS_CREATED_IN_LAST_MS) {
            log('Smart focus skipped due to removing tab being too recently created', (Date.now() - page.createdOn) / 1000, 'seconds old');
        }
        else {
            var nextNode = findNextTabToFocus(page, settings.get('smartFocusPrefersCousins'));

            // if we found a next tab to show per our own logic, switch to it
            if (nextNode) {
                expectingSmartFocusTabId = nextNode.chromeId;
                TimeoutManager.reset('resetExpectingSmartFocusTabId', function() {
                    expectingSmartFocusTabId = null;
                }, 500);
                try {
                    log('Smart focus queueing for tab ' + nextNode.chromeId, nextNode.id);
                    chrome.tabs.update(nextNode.chromeId, { active: true }, function(tab) {
                        expectingSmartFocusTabId = null;
                        TimeoutManager.clear('resetExpectingSmartFocusTabId');
                        if (!tab) {
                            // an error occurred while trying to smart focus, most likely
                            // the tab we tried to focus was removed, so let Chrome decide
                            log('Smart focus tab no longer exists, letting Chrome decide');
                            focusCurrentTabInPageTree(true);
                            return;
                        }
                        log('Smart focused tab ' + tab.id);
                    });
                }
                catch (ex) {
                    log('Smart focus tab no longer exists, letting Chrome decide', nextNode.chromeId);
                    expectingSmartFocusTabId = null;
                    TimeoutManager.clear('resetExpectingSmartFocusTabId');
                }
            }
            else {
                // else, nothing suitable was found; we'll just let Chrome decide
                log('Smart focus found nothing suitable, letting Chrome decide');
            }
        }
    }

    if (page.hibernated) {
        // page is set to be hibernated; since its tab has been closed, that means
        // we are only removing the tab for purposes of hibernation
        return;
    }

    var parent = page.parent;

    // delay tree saving after a removal to avoid accidentally recording removals
    // when browser is in the process of shutting down
    disallowSavingTreeForDuration(TAB_REMOVE_SAVE_TREE_DELAY_MS);

    // remove the page element from the tree
    tree.removeNode(page);

    // also remove zero-child parent window nodes if necessary
    if (parent instanceof WindowNode && parent.children.length == 0) {
        tree.removeNode(parent);
    }
}

function findNextTabToFocus(node, preferCousins) {
        // identify the next tab we would like to navigate to
        var nextNode;

        var topParent = node.topParent();
        if (topParent instanceof WindowNode && topParent.children.length <= 1) {
            // don't do smart focus when there are no other nodes under our window node
            // to smart focus; just let Chrome decide which previous window/tab to focus
            return undefined;
        }

        // first valid descendant
        for (var i = 0; i < node.children.length; i++) {
            nextNode = testNodeForFocus(node.children[i], true);
            if (nextNode) return nextNode;
        }

        // next valid sibling or sibling-descendant
        var afters = node.afterSiblings();
        for (var i = 0; i < afters.length; i++) {
            nextNode = testNodeForFocus(afters[i], true);
            if (nextNode) return nextNode;
        }

        // use nearest preceding node unless it is at parent or higher level
        var preceding = node.preceding(function(e) { return e.isTab() });
        if (preceding && node.parents().indexOf(preceding) == -1) {
            return preceding;
        }

        // parent, when node is only child of parent and
        // we were just focusing the parent
        if (node.isTab() && node.parent.isTab() && node.parent.children.length == 1) {
            var nodeTabId = node.chromeId;
            var parentTabId = node.parent.chromeId;

            // test node and parent matching focused and last-focused in either pairing
            // combination; due to variances in timing of onTabActivated() event firings
            // either can occur and mean the same thing to us here
            if ((nodeTabId == tree.focusedTabId && parentTabId == tree.lastFocusedTabId)
                || (nodeTabId == tree.lastFocusedTabId && parentTabId == tree.focusedTabId))
            {
                return node.parent;
            }
        }

        // look for a later cousin before traversing up to node's parent
        if (preferCousins) {
            for (var i = node.parent.siblingIndex() + 1; i < node.parent.siblings().length; i++) {
                if (node.parent.siblings()[i].children.length > 0) {
                    nextNode = testNodeForFocus(node.parent.siblings()[i].children[0], true);
                    if (nextNode) return nextNode;
                }
            }
        }

        // use parent
        if (settings.get('smartFocusPrefersParent') && node.parent.isTab()) {
            return node.parent;
        }

        // use nearest following node within the same top level node (window)
        var following = node.following(function(e) { return e.isTab(); }, node.topParent());
        if (following) {
            return following;
        }

        // use nearest preceding node including ancestors
        if (preceding) {
            return preceding;
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

    var page = tree.getNode(['chromeId', tabId]);

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
    else if (!page.placed && tab.openerTabId && !page.openerTabId && page.parent.chromeId != tab.openerTabId) {
        // openerTabId was missing initially in onTabCreated but exists now; this happens when
        // using "open selected links" extension, so place these under their correct parent now

        var newParent = tree.getNode(['chromeId', tab.openerTabId]);
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
    // Though getPageDetails won't work here if a page was just created (as the port hasn't been established
    // yet), this is okay because the page's content script will send us details anyway once the page is loaded
    getPageDetails(tab.id, { action: 'store' });
}

function onTabMoved(tabId, moveInfo) {
    log(tabId, moveInfo);
    if (removeFromExpectingTabMoves(tabId)) {
        log('Was expecting this tab move, just updating windowId and index');
        var page = tree.getNode(['chromeId', tabId]);
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
    var tabId = activeInfo.tabId;
    var windowId = activeInfo.windowId;
    log(tabId, windowId);

    if (monitorInfo.isDetecting()) {
        return;
    }
    if (sidebarHandler.creatingSidebar) {
        return;
    }
    if (sidebarHandler.tabId == tabId) {
        return;
    }

    if (expectingSmartFocusTabId) {
        if (expectingSmartFocusTabId != tabId) {
            // ignore Chrome's choice of focused tab when some tab is removed;
            // we'll set focus to Sidewise's choice when onTabActivated is
            // called again in a moment
            return;
        }
        expectingSmartFocusTabId = null;
    }

    if (!tree.focusedTabId || tree.getNode(['chromeId', tabId])) {
        // we have no memorized focusedTabId and/or a page node does exist for the
        // just-focused tab, so just focus that page node
        tree.focusPage(tabId);
        return;
    }

    // test if we've lost our focused tab; if so we believe we are seeing
    // a preloaded-tab swap
    var focused = tree.focusedTabId;
    chrome.tabs.get(focused, function(tab) {
        if (tab) {
            // just focus the page
            tree.focusPage(tabId);
            return;
        }

        // perform tab swap
        var page = tree.getNode(['chromeId', focused]);
        if (!page) {
            // the reportedly focused tab does not exist
            log('Focused tab does not have a page node to do preload tab swapping against after tab focused', focused, activeInfo);
            tree.focusPage(tabId);
            return;
        }

        log('Swapping in new tab id and url', 'old', focused, 'new', tabId, 'found page node', page);
        tree.updatePage(page, {
            chromeId: tabId,
            windowId: windowId
        });
        refreshPageStatus(page);
        refreshFaviconAndTitle(tabId);
        resetExpectingNavigation();
        return;
    });
}

function onTabDetached(tabId, detachInfo) {
    // remove detatched tabs temporarily from tree.tabIndexes, they will
    // be added back correctly when we receive onTabAttached shortly
    var node = tree.getNode(['chromeId', tabId]);
    if (node) {
        tree.removeFromTabIndex(node);
    }
}

function onTabAttached(tabId, attachInfo) {
    log(tabId, attachInfo);

    var moving = tree.getNode(['chromeId', tabId]);
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
        && topParent.chromeId == attachInfo.newWindowId
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
        tree.moveNodeRel(moving, 'append', ['chromeId', attachInfo.newWindowId]);
    }

    tree.rebuildPageNodeWindowIds(function() {
        tree.rebuildTabIndex();
    });
}

function onTabHighlighted(highlightInfo) {
    // log(highlightInfo);
    var windowNode = tree.getNode(['chromeId', highlightInfo.windowId]);
    var windowNodeId = windowNode ? windowNode.id : undefined;

    var pageNodeIds = highlightInfo.tabIds.map(function(e) {
        var pageNode = tree.getNode(['chromeId', e]);
        return pageNode ? pageNode.id : undefined;
    });
    PageTreeCallbackProxy('multiSelectInWindow', { windowNodeId: windowNodeId, pageNodeIds: pageNodeIds });
}
