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
    chrome.tabs.onAttached.addListener(onTabAttached);
    chrome.tabs.onHighlighted.addListener(onTabHighlighted);
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onTabCreated(tab)
{
    log(tab);
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
        if (expectingNavigationOldTabId && expectingNavigationPossibleNewTabIds.indexOf(tab.id) >= 0) {
            // it did occur; swap tab ids
            log('Swapping in new tab id and url', 'old', expectingNavigationOldTabId, 'new', tab.id);
            tree.updatePage(expectingNavigationOldTabId, {
                id: 'p' + tab.id,
                url: tab.url
            });
            resetExpectingNavigation();
            return;
        }

        // sometimes onBeforeNavigate fails to fire before we get here when we're expecting
        // a tab id swap; if this happens, as long as we did get a tabRemoved event while
        // we were expecting a tab id swap, just assume this newly created tab is in fact
        // the one that should be swapped in for that removed tab
        if (expectingNavigationOldTabId) {
            log('Fallback approach - swapping in new tab id and url', 'old', expectingNavigationOldTabId, 'new', tab.id);
            tree.updatePage(expectingNavigationOldTabId, {
                id: 'p' + tab.id,
                url: tab.url
            });
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
        tree.updatePage(wakingPage, { id: 'p' + tab.id, hibernated: false, unread: true, status: 'preload' });
        tree.awakeningPages.splice(wakingIndex, 1); // remove matched element
        tree.conformChromeTabIndexForPageNode(wakingPage, true);
        return;
    }

    page = new PageNode(tab, 'preload');
    page.unread = true;

    // TODO find any edge cases where chrome doesn't add a child tab to the right of parent tab in tabbar
    // TODO consider adding pages to the tree in the same order as they appear on tabbar
    //      (utilize tab.index hint which usually means first opened child tab will have index=0
    //      below the parent, second will have index=1, etc.) rather than always adding child tabs
    //      at the end of parent.children; this would conform more to how the tabs appear on the
    //      tabbar, but possibly might not be desirable when the actual tab-tree is visible and
    //      may also have unwanted effects on the next-tab-on-close ordering
    // TODO consider doing our custom next-tab-on-close ordering only when sidebar is visible and
    //      fallback on chrome default if not; this might make everything seem intuitive since if
    //      sidebar's visible you intuitively see what's happening and if not visible then
    //      chrome's mechanism appears to be more intuitive; possibly make it an option;
    //      OTOH maybe our mechanism is decidedly superior at all times and we should just
    //      always go with it and assume the user will either turn this "smart next tab" feature
    //      option off entirely if they don't like it, or else will usually have the sidebar visible
    // TODO consider using a navigation style where prior to jumping to the parent tab,
    //      we prefer to jump to that parent's next sibling's first child if it has one; this may be more useful
    //      if for instance we open a bunch of tabs off reddit and slashdot then navigate to one of
    //      the reddit children; after closing them all using this mechanic, we'd start browsing
    //      through the slashdot tab's children. the current behavior is "clean up parent tabs first",
    //      this alternative approach would be more like "look forward through all tabs before
    //      returning to parent level". the alternative approach might not be desirable in some cases though:
    //      not sure when, it might be sensical to have an option for next-tab-on-close:
    //          [x] use smart navigation when closing tabs (navigate to children, siblings, and parent in that order)
    //              [x] navigate to cousins first: navigate to children of parent pages later in the tree before parent

    page.initialCreation = false;

    // Special handling for extension pages
    if (isExtensionUrl(tab.url)) {
        if (tab.url.match(/options|prefs|settings/)) {
            // Appears to be an extension options page.
            // Tell smart focus to refocus the currently focused tab when the
            // options page is closed.
            log('Setting smart focus parent for an extension options page');
            page.smartFocusParentTabId = tree.focusedTabId;
            page.placed = true; // prevent tab from being moved by a later webnav/tabupdated event
            tree.addNode(page, 'w' + tab.windowId);
            return;
        }
        // Appears to be a non-options extension page, make it a child of focused tab
        // as long as they're in the same window
        if (tab.windowId == focusTracker.getFocused()) {
            // It's often logical for an extension page to appear as a child of
            // the currently focused page, e.g. LastPass's Generate Password dialog.
            log('Setting non-options extension page as child of focused tab');
            tree.addNode(page, 'p' + tree.focusedTabId);
            return;
        }
    }
    else if (tab.url == 'chrome://newtab/') {
        // New Tab pages always get put at the top level of the tree since they are
        // created via Ctrl+T or the New Tab button in the tab bar.
        log('Setting New Tab page as child of its hosting window', page, tab.windowId);
        tree.addTabToWindow(tab, page, function(pageNode, winNode) {
            tree.updateNode(pageNode, { placed: true });
        });
        return;
    }
    else if (!isScriptableUrl(tab.url)) {
        // Non scriptable tab; attempt to associate it with a restorable page node
        // even though it's possible the user just created this tab freshly. We do this
        // because onCommitted never fires for non scriptable tabs and therefore
        // we'll never be able to detect if this tab's transitionType=='reload' which
        // is how we normally detect that a tab is being restored rather than created anew
        tree.addNode(page, 'w' + tab.windowId);
        associateExistingToRestorablePageNode(tab);
        return;
    }

    page.initialCreation = true;

    if (tab.openerTabId) {
        // Make page a child of its opener tab; this may be overriden later in webnav-events.js
        log('Tentatively setting page as child of its opener tab', page.id, tab.openerTabId);
        tree.addNode(page, 'p' + tab.openerTabId);
        return;
    }

    // Make page a child of its hosting window
    log('Setting page as child of its hosting window', page, tab.windowId);
    tree.addTabToWindow(tab, page, undefined, true);
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
        // We think Chrome is about to swap this tab with another tab
        // due to preloading a tab in the background and swapping it in
        log('Recording expected navigation old tab id', tabId);
        expectingNavigationOldTabId = tabId;
        return;
    }

    var page = tree.getPage(tabId);

    if (!page) {
        // Page node with this tabId doesn't exist; this is most likely because
        // the user hibernated it from the sidebar. Don't try to remove the node
        // or do smart-focus because the node doesn't exist and we know nothing
        // about where it was in the tree.
        return;
    }

    // smart focus on close
    if (settings.get('smartFocusOnClose') && sidebarHandler.sidebarExists())
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
            chrome.tabs.update(nextTabId, { active: true });
        }
        // else, nothing suitable was found; we'll just let Chrome decide
    }

    if (page.hibernated) {
        // page is set to be hibernated; since its tab has been closed, that means
        // we are only removing the tab for purposes of hibernattion
        return;
    }

    // remove the page element from the tree
    tree.removeNode(page);
}

function findNextTabToFocus(id, preferCousins) {
        // identify the next tab we would like to navigate to
        var found = tree.getNodeEx(id);

        // first valid descendant
        for (var i = 0; i < found.node.children.length; i++) {
            var id = testNodeForFocus(found.node.children[i], true);
            if (id) return id;
        }

        // next valid sibling or sibling-descendant
        if (found.siblings.length > found.index + 1) {
            var id = testNodeForFocus(found.siblings[found.index + 1], true);
            if (id) return id;
        }

        // preceding valid sibling
        if (found.index > 0) {
            for (var i = found.index - 1; i >= 0; i--) {
                var id = testNodeForFocus(found.siblings[i], true);
                if (id) return id;
            }
        }

        // look for a later cousin before traversing up to found.node's parent
        if (preferCousins) {
            for (var i = found.parentIndex + 1; i < found.parentSiblings.length; i++) {
                if (found.parentSiblings[i].children.length > 0) {
                    var id = testNodeForFocus(found.parentSiblings[i].children[0], true);
                    if (id) return id;
                }
            }
        }

        // use direct parent
        var id = testNodeForFocus(found.parent, false);
        if (id) return id;

        // nothing suitable found
        return undefined;
}

function testNodeForFocus(node, testDescendants)
{
    if (node instanceof PageNode && !node.hibernated) {
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
    if (tabId == sidebarHandler.tabId) {
        // we ignore the sidebar tab
        return;
    }
    // TODO obtain the detection tab's tabId and check against it here and in other spots,
    // since we really don't want to miss all tab events while monitor detection is going on
    // should be able to obtain by creating the detection window/tab, then immediately asking
    // chrome for the tabId of the (only) tab in the detection window and storing that in
    // monitorInfo
    // One case where this could be an issue is if Chrome is shut down, then on another synced
    // machine the user adds Sidewise, then starts up Chrome on the original computer --
    // Sidewise will have to do monitor detection near the time of browser startup, but
    // Chrome could also be in the midst of session restore and we do not want to miss
    // anything whilst detecting too; going off the literal tabId of the detection tab
    // would cure this
    if (monitorInfo.isDetecting()) {
        return;
    }
    log(tab);

    var page = tree.getPage(tabId);

    if (!page) {
        // page row entry doesn't exist so we cannot update it
        // this can happen during browser startup
        return;
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
    else {
        var tabUrlDomain = splitUrl(url).domain;
        var pageUrlDomain = splitUrl(page.url).domain;

        if (tabUrlDomain != pageUrlDomain) {
            // changing domains, blank out the favicon until we get a new favicon
            favicon = 'chrome://favicon/';
        }
        else {
            // keep the existing favicon
            favicon = page.favicon;
        }
    }

    // TODO also don't push status unless it's in changeInfo
    // TODO in fact only change what is in changeInfo, period
    tree.updatePage(tabId, {
        status: tab.status,
        url: tab.url,
        favicon: favicon,
        title: title,
        pinned: tab.pinned
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

    if (tab.openerTabId !== undefined && !page.placed) {
        var pageEx = tree.getNodeEx(page);
        if (getNumericId(pageEx.parent.id) !== tab.openerTabId) {
            log('moving page to parent by openerTabId', tab.openerTabId);
            tree.moveNode(page, 'p' + tab.openerTabId);
        }
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

function onTabAttached(tabId, attachInfo) {
    var moving = tree.getPageEx(tabId);

    if (!moving) {
        throw new Error('Could not find page with tab id ' + tabId);
    }

    if (moving.ancestors[0] instanceof WindowNode
        && !(moving.ancestors[0].hibernated)
        && getNumericId(moving.ancestors[0].id) == attachInfo.newWindowId) {
        // row is already under the correct parent window in the tree
        return;
    }

    tree.moveNode(moving.node, tree.getNode('w' + attachInfo.newWindowId));
}

function onTabHighlighted(highlightInfo) {
    log(highlightInfo);
    PageTreeCallbackProxy('multiSelectInWindow', highlightInfo);
}

