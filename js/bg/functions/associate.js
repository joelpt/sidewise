// ========================================================
// Tab/window-to-PageTreeNode assocation functions.
//
// Used to map session-restored tabs to existing rows.
// ========================================================


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var associatingTabs = false;
var associatingTabCount = 0;
var associatingTabTotal = 0;


///////////////////////////////////////////////////////////
// Main function to start assocation run on existing tabs.
///////////////////////////////////////////////////////////

function associatePages() {
    chrome.tabs.query({ }, function(tabs) {
        associatingTabs = true;
        associatingTabCount = 0;
        associatingTabTotal = 0;
        for (var i in tabs) {
            var tab = tabs[i];
            if (sidebarHandler.tabId == tab.id) {
                continue;
            }
            if (!tree.getNode('p' + tab.id)) {
                associatingTabTotal++;
                log('trying association', tab.id, associatingTabTotal);
                getPageDetails(tab, 'associate');
            }
        }
        if (associatingTabTotal == 0) {
            log('Nothing further found to associate');
            associateWindowstoWindowNodes();
            return;
        }
        log('Started association process, tabs in queue: ' + associatingTabTotal);
        // setTimeout(associatePagesCheck, 5000);
        TimeoutManager.set('associateCheck', associatePagesCheck, 5000);
    });
}


///////////////////////////////////////////////////////////
// Helper functions used during assocation runs.
///////////////////////////////////////////////////////////

function associatePagesCheck() {
    log('associatePagesCheck', associatingTabs, 'total', associatingTabTotal, 'count', associatingTabCount);
    if (!associatingTabs) {
        log('Associating page check thinks we are done');
        associateWindowstoWindowNodes();
        return;
    }
    // if (associatingTabCount < associatingTabTotal) {
        // restart associatePages routine, the previous run missed some
        log('Restarting associate run');
        // associatingTabs = false;
        associatePages();
        // TimeoutManager.reset('associateCheck');
    // }
    // throw new Error('This should never happen');
}

function associateTabToPageNode(tab, referrer, historylength) {
    log('Associating tab', tab.id, 'url', tab.url, 'referrer', referrer, 'historylength', historylength);
    TimeoutManager.reset('associateCheck', associatePagesCheck, 5000);
    if (tree.getNode('p' + tab.id)) {
        // tab is already properly present as a pagenode in the tree; don't associate/add again
        return;
    }
    var match = tree.getNode(function(node) {
        return node.restorable
            && node.hibernated
            && node.url == tab.url
            && node.pinned == tab.pinned
            && (referrer === undefined || node.referrer == referrer)
            && (historylength === undefined || node.historylength == historylength);
    });

    if (match) {
        // found a match
        log('matching PageNode found, restoring', tab.id, tab, match);
        var details = { hibernated: false, restorable: false, id: 'p' + tab.id };
        if (loggingEnabled) {
            details.label = details.id;
        }
        tree.updateNode(match, details);
        return;
    }

    // apparently a new tab to us
    log('no matching PageNode found, creating as new', tab.id, tab, match);
    tree.addTabToWindow(tab);
    // TODO set referrer and historylen here, addTabToWindow needs a callback for this
}

function associateWindowstoWindowNodes() {
    var resWindows = tree.filter(function(e) {
        return e.elemType == 'window' && e.restorable == true;
    });

    log('Restorable window set ids', resWindows.map(function(e) { return e.id; }));

    var tabs = chrome.tabs.query({ }, function(tabs) {
        // For each restorable window, find the windowId that is most common amongst its awake tabs
        var associatedWindowIds = [];
        for (var i in resWindows) {
            var resWindow = resWindows[i];

            // count frequency of each windowId in resWindow's pages
            var windowIdFrequencies = tree.reduce(function(last, e) {
                if (e.elemType != 'page' || e.hibernated) {
                    return last;
                }
                var tabId = getNumericId(e.id);
                var tab = first(tabs, function(e) { return e.id == tabId; });
                var windowId = tab.windowId;
                last[windowId] = (last[windowId] || 0) + 1;
                return last;
            }, {}, resWindow.children);

            // log('Window frequencies', resWindow.id, windowIdFrequencies);

            // find the most frequent windowId
            var mostFrequentWindowId;
            var mostFrequentCount = 0;
            for (var windowId in windowIdFrequencies) {
                if (associatedWindowIds.indexOf(windowId) >= 0) {
                    // don't associate with windowIds which have already been associated
                    continue;
                }
                var frequency = windowIdFrequencies[windowId];
                if (mostFrequentCount < frequency) {
                    mostFrequentCount = frequency;
                    mostFrequentWindowId = windowId;
                }
            }

            if (!mostFrequentWindowId) {
                log('No most frequent windowId found', resWindow.id);
                continue;
            }

            log('Most frequent found', 'resWindowId', resWindow.id, 'mostFrequentWindowId', mostFrequentWindowId, 'frequency', mostFrequentCount);

            // does a WindowNode already exist matching the mostFrequentWindowId?
            var winNode = tree.getNode('w' + mostFrequentWindowId);
            if (winNode) {
                // already exists, so merge its children into our restorable window
                tree.mergeNodes(winNode, resWindow);
            }

            // update the restore window to look like the real window
            var details = { restorable: false, hibernated: false, id: 'w' + mostFrequentWindowId };
            if (loggingEnabled) {
                details.label = details.id;
            }
            tree.updateNode(resWindow, details);

            // record the windowId used so we don't try to use it again in an upcoming iteration
            associatedWindowIds.push(mostFrequentWindowId);
        }
    });
}
