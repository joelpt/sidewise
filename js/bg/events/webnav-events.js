// delay before asking Chrome for favicon again in onComplete
var ONCOMPLETED_LATE_UPDATE_DELAY_MS = 1000;

// additional delay before setting a favicon to chrome://favicon in onCompletedLateUpdateTimeout
var ONCOMPLETED_CHROME_FAVICON_UPDATE_DELAY_MS = 500;


function registerWebNavigationEvents()
{
    chrome.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigationTarget);
    chrome.webNavigation.onCommitted.addListener(onCommitted);
    chrome.webNavigation.onCompleted.addListener(onCompleted);
    // chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
}

function onCreatedNavigationTarget(details)
{
    if (details.frameId > 0)
    {
        // we don't care about activity occurring within a subframe of a tab
        return;
    }
    if (monitorInfo.isDetecting()) {
        return;
    }
    log(details);
    tree.moveNode('p' + details.tabId, 'p' + details.sourceTabId);
    tree.updatePage(details.tabId, { placed: true });
}



// problem: oncommitted "typed" fires both when you alt-enter from the urlbar and when you do not.
// currently we're "ignoring" the placed flag when we get a "typed" event on the assumption that
// the address entered in the bar was always alt-entered, which normally means we would want to do
// a move of the page.
// we should instead set "placed", but only in onCommitted below, and treat "placed" as an indication
// that we don't want anyone automaticaly re-placing our page anymore. We can then check "placed"
// in onCommitted, and only if it is false will we potentially move a page from a parent tab to parent window.
// Once we DO such a move we will set "placed". But we will not set "placed" in e.g. onTabCreated because
// we aren't sure at that point whether the page really has gotten its proper place yet.
// What about the case when we create a new page via another mechanism and we make it a child of a parent page
// but we do not set "placed"? Then later, if the user types into that page's bar and hits enter, we would
// end up moving it which is no longer correct.
// As a solution we could set "placed" in onCompleted on the idea that once onCompleted fires, we can assume
// that all onCommitted events which should potentially move the page have already been fired and therefore
// we will not move the page in any later onCommitted firing. This will work. This is good.
// We should still set "placed" in getPageDetailsMessage because after we do the referrer-based placement
// we also consider the page's placement to be locked and would not want to alter that in any later onCommitted event.

// TODO capture the 'reload' transitionType, which could mean one of at least 3 things:
//      an existing tab has been reloaded manually or possibly automatically
//      an existing tab was DUPLICATED and will report openerTabId of the duplicate source tab
//        > should be possible to detect this case, by seeing that:
//          - openerTabId is given
//          - tabId doesn't exist in tree yet
//          - transition type is reload
//        a nice thing to do would probably be to add the duplicated page as the next sibling to
//        the openerTabId (duplicate source tab), this would likely require adding something like
//        an 'afterId' and/or 'insertAtIndex' arg to tree.addNode()
//      a tab was reopened with Ctrl-Shift-T and will report no openerTabId even though
//          it may have had a parent tab in its previous life
//          > Induce a call to getPageDetails possibly passing some "ignore placed flag" boolean
//            to ensure that if onCompleted fires first, we don't refuse to place it
//            or else set a "block_setting_placed" flag on the tree item itself for the duration
//            To really deal with this case properly we would most likely need to keep a list
//            of recently-closed tabs ourselves, and in that list keep track of who the old parent
//            tab was; that may prove the most reliable way to reassociate a reopened tab to its old parent
//            but if the old parent has been closed we cannot; it MIGHT be possible if an old parent is
//            closed and reopened first, to still correctly track the association through the recent-closed list
//            by e.g. updating the tabId stored in the recent-closed list for a reopened tab to match
//            the reopened parent tabId in each recent-closed tab entry who reports a parentTabId corresponding
//            to the old parentTabId
//


function onCommitted(details)
{
    if (details.frameId > 0)
    {
        return;  // don't care about subframe activity
    }
    if (monitorInfo.isDetecting()) {
        return;
    }
    log(details);
    if (details.frameId == 0
        && (details.transitionType == 'typed' || details.transitionType == 'generated')
        && details.transitionQualifiers.indexOf('from_address_bar') != -1) {

        var page = tree.getPage(details.tabId);
        if (!page.placed) {
            chrome.tabs.get(details.tabId, function(tab) {
                tree.moveNode('p' + details.tabId, 'w' + tab.windowId);
                tree.updatePage(details.tabId, { placed: true });
            });
        }
    }
}

function onBeforeNavigate(details)
{
    if (details.frameId > 0) {
        return;
    }
    log(details);
}

function onCompleted(details)
{
    if (details.frameId > 0)
    {
        // we don't care about activity occurring within a subframe of a tab
        return;
    }
    if (monitorInfo.isDetecting()) {
        return;
    }
    var page = tree.getPage(details.tabId);
    if (page === undefined)
    {
        // tab doesn't exist in page tree yet
        // this can happen when chrome preloads a page while typing into the address bar
        return;
    }
    log(details);

    // Mark page status as complete and that its position in the tree can now be considered
    // fixed/well-known
    tree.updatePage(details.tabId, {
        placed: true,
        status: 'complete'
    });

    // Ask for the latest static favicon
    chrome.tabs.get(details.tabId, function(tab) {
        var url = tab.url ? dropUrlHash(tab.url) : '';
        if (isStaticFavIconUrl(tab.favIconUrl)) {
            // got a static favicon url, use it now
            var favicon = getBestFavIconUrl(tab.favIconUrl, url);
            tree.updatePage(details.tabId, { favicon: favicon });
            return;
        }

        // Delay a bit, then ask for the favicon again; if we don't get one we'll try to fall back
        // on the (sometimes unavailable) chrome://favicon/URL icon cache
        setTimeout(function() {
            onCompletedLateUpdateTimeout(details.tabId)
        }, ONCOMPLETED_LATE_UPDATE_DELAY_MS);
    });
}

function onCompletedLateUpdateTimeout(tabId) {
    chrome.tabs.get(tabId, function(tab) {
        var url = tab.url ? dropUrlHash(tab.url) : '';
        var favicon;
        if (isStaticFavIconUrl(tab.favIconUrl)) {
            // static favicon url has been provided by site, use that
            favicon = getBestFavIconUrl(tab.favIconUrl, url);
            tree.updatePage(tabId, { favicon: favicon });
            return;
        }

        // no static favicon url available, fall back on chrome://favicon/URL icon cache
        favicon = getChromeFavIconUrl(url);
        setTimeout(function() { tree.updatePage(tabId, { favicon: favicon }); },
            ONCOMPLETED_CHROME_FAVICON_UPDATE_DELAY_MS);

    });
}