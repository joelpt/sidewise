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
    if (isDetectingMonitors()) {
        return;
    }
    log(details);
    tree.move('p' + details.tabId, 'p' + details.sourceTabId);
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
//        an 'afterId' and/or 'insertAtIndex' arg to tree.add()
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
    if (isDetectingMonitors()) {
        return;
    }
    log(details);
    if (details.frameId == 0
        && (details.transitionType == 'typed' || details.transitionType == 'generated')
        && details.transitionQualifiers.indexOf('from_address_bar') != -1) {

        var page = tree.getPage(details.tabId);
        if (!page.placed) {
            chrome.tabs.get(details.tabId, function(tab) {
                tree.move('p' + details.tabId, 'w' + tab.windowId);
                tree.updatePage(details.tabId, { placed: true });
            });
        }
    }
}

function onBeforeNavigate(details)
{
    log(details);
}

function onCompleted(details)
{
    if (details.frameId > 0)
    {
        // we don't care about activity occurring within a subframe of a tab
        return;
    }
    if (isDetectingMonitors()) {
        return;
    }
    if (tree.getPage(details.tabId) === undefined)
    {
        // tab doesn't exist in page tree yet
        // this can happen when chrome preloads a page while typing into the address bar
        return;
    }
    log(details);

    // Now that tab is completely loaded, fetch current details
    // of this tab and update page tree; often this will retrieve
    // us a tab.favIconUrl that wasn't available earlier
    chrome.tabs.get(details.tabId, function(tab) {
        var url = tab.url ? dropUrlHash(tab.url) : '';

        // do this after a slight delay to for chrome://favicon/theurl icons
        // Such urls sometimes don't show the site's favicon immediately; sometimes Chrome
        // just shows the default globe icon, but if you refresh the sidebar it then
        // shows the icon properly >:O ... if we wait a moment this usually corrects the issue

        // TODO see what happens if we injected a content script at this point; it should presumably
        // not execute until the hosting page is ready; maybe have it fire on window.onLoad which
        // should wait until all the resources of the page are fully loaded; and maybe also try
        // to sniff the favicon from html/head/link[rel=favicon] here; an even more aggressive solution
        // would be to readImageData() of a given fetched chrome://favicon/url.com favicon, and IF
        // it matches the 'globe icon' then try to pull the ico from
        // http://google.com/s2/favicons?domain=url.com instead

        // if (false && tab.favIconUrl && tab.favIconUrl != '' && tab.favIconUrl.indexOf('chrome://favicon/') == -1) {
        //     updatePageOnComplete(tree, tab, url, tab.favIconUrl);
        // }
        // else {
        //     console.log('delayed favicon update');
        //     var favicon = 'chrome://favicon/' + url;
        //     setTimeout(function() { updatePageOnComplete(tree, tab, url, favicon); }, 250);
        // }

        var favicon = getFixedFavIconUrl(tab.favIconUrl, url);
        if (tab.favIconUrl && tab.favIconUrl != '' && tab.favIconUrl.indexOf('chrome://favicon/') == -1) {
            updatePageOnComplete(tree, tab, url, favicon);
        }
        else {
            console.log('********** delayed favicon update');
            favicon = 'chrome://favicon/' + url;
            setTimeout(function() { updatePageOnComplete(tree, tab, url, favicon); }, 500);
        }

    });
}

function updatePageOnComplete(tree, tab, url, favicon) {
    tree.updatePage(tab.id, {
        placed: true,
        status: 'complete',
        url: url,
        favicon: favicon,
        title: getBestPageTitle(tab.title, url)
    });
    console.log('favicon updater', tab.id, favicon);
}