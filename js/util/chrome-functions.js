/* Functions relating to Chrome specific functionality */

// Get extension version from manifest.json.
function getVersion() {
    var details = chrome.app.getDetails();
    return details.version;
}

// Update window's position and state.
function positionWindow(winId, metrics, callback)
{
    if (callback) {
        chrome.windows.update(winId, metrics, callback);
        return;
    }
    chrome.windows.update(winId, metrics);
}

// Focus the current Chrome window's active tab in the page tree.
// If force=true, perform a (re)focusing even if we're already focused
// on the currently focused tab.
function focusCurrentTabInPageTree(force) {
    var windowId = focusTracker.getFocused();

    if (!windowId) {
        return;
    }

    chrome.tabs.query({ active: true, windowId: windowId }, function(tabs) {
        if (tabs.length == 0) {
            return;
        }

        var activeTab = tabs[0];

        if (activeTab.id == tree.focusedTabId && !force) {
            return;
        }

        tree.focusPage(activeTab.id);
    });
}

// Retrieve and update the tab.status of the specified PageTreeNode or matcher.
function refreshPageStatus(page) {
    if (!page.isTab()) {
        return;
    }
    setTimeout(function() {
        chrome.tabs.get(getNumericId(page.id), function(tab) {
            tree.updateNode(page, { status: tab.status });
        });
    }, 100);
}

function fixAllPinnedUnpinnedTabOrder() {
    tree.filter(function(e) { return e instanceof PageNode && !e.hibernated && e.pinned; })
        .forEach(function(e) { fixPinnedUnpinnedTabOrder(e); }
    );

    tree.filter(function(e) { return e instanceof PageNode && !e.hibernated && !e.pinned; }).reverse()
        .forEach(function(e) { fixPinnedUnpinnedTabOrder(e); }
    );
}

// Repair the tab ordering of the given PageTreeNode with respect to
// its pinned state versus the pinned state of other page nodes in the tree
function fixPinnedUnpinnedTabOrder(page) {
    // log('doing fix un/pin tab order check', page.id, page);
    // log(tree.dump());
    // log(tree.dumpTabIndexes());

    // fix order wrt pinned tabs if necessary
    if (!page.pinned
        && page.following(function(e) { return e.isTab() && e.pinned }, page.topParent()))
    {
        var lastPinned = last(page.followingNodes(page.topParent()), function(e) {
            return e.isTab() && e.pinned;
        })[1];
        if (!lastPinned) {
            throw new Error('Could not find lastPinned but should have been able to');
        }
        log('Moving non-pinned tab to be after last pinned tab', page.id, 'after', lastPinned.id);
        return tree.moveNodeRel(page, 'after', lastPinned);
        // TODO should it really be 'below', which would translate to 'prepend' if target has children
        // or 'after' if not ... ??
    }

    if (page.pinned
        && page.preceding(function(e) { return e.isTab() && !e.pinned }, page.topParent()))
    {
        var topUnpinned = first(page.precedingNodes(page.topParent()), function(e) {
            return e.isTab && !e.pinned;
        })[1];
        if (!topUnpinned) {
            throw new Error('Could not find topUnpinned but should have been able to');
        }
        log('Moving pinned tab to be before first pinned tab', page.id, 'before', topUnpinned.id);
        return tree.moveNodeRel(page, 'before', topUnpinned);
    }

    // log('no un/pin fix made');
    return undefined;
}