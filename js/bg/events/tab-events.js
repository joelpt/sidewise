function registerTabEvents()
{
    chrome.tabs.onCreated.addListener(onTabCreated);
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onActivated.addListener(onTabActivated);
}

function onTabCreated(tab)
{
    if (isDetectingMonitors()) {
        return;
    }
    log(tab);
    if (sidebarHandler.creatingSidebar && tab.url == sidebarHandler.sidebarUrl)
    {
        log('ignoring creation of sidebar in onTabCreated');
        return;
    }

    var page = new Page(tab, 'preload');
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


    if (tab.openerTabId) {
        tree.add(page, 'p' + tab.openerTabId);
        return;
    }
    tree.add(page, 'w' + tab.windowId);
}

function onTabRemoved(tabId, removeInfo)
{
    if (isDetectingMonitors()) {
        return;
    }
    if (tabId == sidebarHandler.tabId)
    {
        // we ignore the sidebar tab
        return;
    }
    log(tabId, removeInfo);

    // this will remain disabled until we can guarantee proper tab ordering on
    // mass moves, then we may add it as a user option
    var useSmartNextTabAfterClose = false;
    if (useSmartNextTabAfterClose) {
        // identify the next tab we would like to navigate to
        var nextTabId;
        tree.findById('p' + tabId, function(e, i, a, p) {
            if (e.children.length > 0) {
                // first child
                nextTabId = e.children[0].id;
                return;
            }
            if (a.length > i + 1) {
                // next sibling
                nextTabId = a[i + 1].id;
                return;
            }
            if (i > 0) {
                // preceding sibling
                nextTabId = a[i - 1].id;
                return;
            }

            // access parent
            tree.getPage(tabId, function(e, i, a, p, pi, pa) {
                var preferCousins = true;
                if (preferCousins) {
                    // look for a later cousin before going to e's parent
                    for (var j = pi + 1; j < pa.length; j++) {
                        if (pa[j].children.length > 0) {
                            nextTabId = pa[j].children[0].id;
                            return;
                        }
                    }
                }

                if (p && p.elemType == 'page') {
                    // parent
                    nextTabId = p.id;
                    return;
                }

                // nothing suitable found; we'll just let Chrome decide
                return;
            });
        });

        // if we found a next tab to show per our own logic, switch to it
        if (nextTabId) {
            nextTabId = parseInt(nextTabId.slice(1));
            log('Setting new selected tab to ' + nextTabId);
            chrome.tabs.update(nextTabId, { active: true });
        }
    }

    tree.remove('p' + tabId);
}

function onTabUpdated(tabId, changeInfo, tab)
{
    if (tabId == sidebarHandler.tabId) {
        // we ignore the sidebar tab
        return;
    }
    if (isDetectingMonitors()) {
        return;
    }
    log(tab);


    var page = tree.getPage(tabId);
    var url = tab.url ? dropUrlHash(tab.url) : '';
    var title = getBestPageTitle(tab.title, url)

    var favicon;
    if (!isStaticFavIconUrl(page.favicon)) {
        // existing page element doesn't have a "good" favicon, try to replace it
        favicon = getBestFavIconUrl(tab.favIconUrl, url);
    }
    else if (isStaticFavIconUrl(tab.favIconUrl)) {
        // got a potentially new static favicon, use it
        favicon = getBestFavIconUrl(tab.favIconUrl, url);
    }
    else {
        // keep the existing favicon
        favicon = page.favicon;
    }
    // TODO also don't push status unless it's in changeInfo
    // TODO in fact only change what is in changeInfo, period
    tree.updatePage(tabId, {
        status: tab.status,
        url: tab.url,
        favicon: favicon,
        title: title
    });

    if (tab.openerTabId !== undefined) {
        var page = tree.getPage(tabId);
        if (!page.placed) {
            tree.move('p' + tabId, 'p' + tab.openerTabId);
        }
    }
}


function onTabActivated(activeInfo) {
    if (isDetectingMonitors()) {
        return;
    }
    if (sidebarHandler.creatingSidebar) {
        return;
    }
    if (sidebarHandler.tabId == activeInfo.tabId) {
        return;
    }
    tree.focusPage(activeInfo.tabId);
}