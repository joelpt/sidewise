// ========================================================
// Tab/window-to-PageTreeNode assocation functions.
//
// Used to map session-restored tabs to existing rows.
// ========================================================

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var ASSOCIATE_PAGES_CHECK_INTERVAL_MS = 1000;
var ASSOCIATE_PAGES_CHECK_INTERVAL_MS_SLOW = 10000;


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var associationRuns = {};

var associatingTabs = false;
var associatingTabCount = 0;
var associatingTabTotal = 0;


///////////////////////////////////////////////////////////
// Association functions
///////////////////////////////////////////////////////////

// TODO deal with pages that are theoretically scriptable, yet fail to connect via ch.ext.connect
// Most common type is a page that 404'd on load.
// Solution: Accumulate a list of tabs that we have tried to do association for, and as we succeed
// in doing so remove them from the list.
// Each time we succeed in doing an association, record an lastAssociationSuccessTimestamp.
// In associatePagesCheck(), if the delta between now and lastAssociationSuccessTimestamp is more
// than N seconds, go through the list of tabs that we have not been able to associate yet and
// treat them in the way we treat nonscriptable tabs.
// If N=30 that means we won't try that tactic until 30 seconds pass between successfully associating
// any tab. 30 should be a sufficient amount of time for browser startup with 100 tabs, because
// the getPageDetails responses should be trickling in during this timeframe. However 30 seconds
// is a very long time to wait for a response for a given tab before finally doing fallback association.
// If we don't start checking this lastAssociationSuccessTimestamp delta until we get at least ONE
// association completed, then we should be able to make it more like N=10; thereafter, as long as
// we get one tab associated every 10 seconds, we won't mistakenly go and do the nonscriptable fallback
// technique on anybody erroneously.
//
// A more complex solution is to take the average of the time delta between the last N association-successes
// and use that to project into the future when we expect another association may still happen, with some
// amount of extra padding to compensate for variances when e.g. reddit is loading.
//
// Another possible approach is to do more of this work in onCommitted, e.g. whenever we see a 'reload'
// transitionType we should be trying to associate to a restorable (if no sessionGUID) or hibernated/recently-closed
// (if has sessionGUID) page.
//
// We might also be able to catch 404 type errors in webRequest event stream and act more quickly on those pages
// (treating them like nonscriptables) to associate them faster.
//
// This would then leave "uncommunicative" pages, like a 10-hour old isohunt.com page we saw, that refused
// to respond to executeContentScript(). But possibly we could treat that case as a fluke OR possibly using
// onConnect method will avoid the problem because port is already established and perhaps will still
// work when executeContentScript() no longer will.
//
// TODO keep running assocationRuns for some time, say 120 seconds, even after associatePagesCheck() finds
// nothing left to do, just in case we have a run that just happened to return nothing, but there could still
// be more that are slow to come up; this should probably be considered separate from a user doing a manual
// "reopen 15 closed tabs" from Chrome's deafult New Tab page since those will not happen upon session restore
// and should be adequately dealt with inside of onCommitted[transitionType=reload]->associateTabToPageNode()
// logic. However, during that 120 seconds, we should still expect that we will capture those tabs in a run
// of associatePages() and thus we should make sure that having both onCommitted and associatePages() firing
// associateTabToPageNode() doesn't fritz things out. A nice approach might be, when onCommitted sees
// a 'reload', if we think it might be an "associate to a restorable" case (sessionGUID not found in closed-tabs list
// or hibernated-tabs-in-tree), then just fire up an associatePages() run and let it do all that work for us;
// this is probably a better solution because we can reuse more of the association code and logics; we will
// just need to take care to set the 120-second timer separately from onCommitted's firing of associatePages().

// Main entry point for starting the association process.
// Tries to associate all existing tabs to a page row, and will
// repeatedly restart the process after a delay until all
// tabs have been associated with something.
function associatePages() {
    chrome.tabs.query({ }, function(tabs) {
        var runId = generateGuid();
        var runInfo = { total: 0, count: 0 };
        associationRuns[runId] = runInfo;

        for (var i in tabs) {
            var tab = tabs[i];
            if (sidebarHandler.tabId == tab.id) {
                // this tab is the sidebar
                continue;
            }
            if (tree.getNode('p' + tab.id)) {
                // this tab is already in the tree as a normal tab
                continue;
            }
            runInfo.total++;
            log('trying association', 'runId', runId, 'tabId', tab.id, 'total', associationRuns[runId].total, 'count', associationRuns[runId].count);
            if (!isScriptableUrl(tab.url)) {
                // this tab will never be able to return details to us from content_script.js,
                // so just associate it without the benefit of those extra details
                associateTabToPageNode(runId, tab);
                continue;
            }

            // ask the tab for more details via its content_script.js connected port
            try {
                getPageDetails(tab.id, { action: 'associate', runId: runId });
            }
            catch(ex) {
                if (ex.message == 'Port not found') {
                    log('Port does not exist for association yet', 'tabId', tab.id, 'runId', runId);
                    continue;
                }
                throw ex;
            }
        }
        if (runInfo.total == 0) {
            log('No unassociated tabs left to associate; ending association run and doing parent window guessing');
            endAssociationRun(runId);
            associateWindowstoWindowNodes();
            return;
        }
        log('Started association process, tabs in queue: ' + runInfo.total);
        // setTimeout(associatePagesCheck, 5000);
        TimeoutManager.reset(runId, function() { associatePagesCheck(runId); }, ASSOCIATE_PAGES_CHECK_INTERVAL_MS);
    });
}


///////////////////////////////////////////////////////////
// Helper functions used during assocation runs.
///////////////////////////////////////////////////////////

function associatePagesCheck(runId) {
    var runInfo = associationRuns[runId];

    if (!runInfo) {
        log('Associating page check thinks we are done', runId);
        associateWindowstoWindowNodes();
        log('Starting a slow tick loop of associatePages');
        setInterval(associatePages, ASSOCIATE_PAGES_CHECK_INTERVAL_MS_SLOW);
        return;
    }
    // TimeoutManager.reset(runId, function() { associatePagesCheck(runId) }, ASSOCIATE_PAGES_CHECK_INTERVAL_MS);

    log('associatePagesCheck', 'total', runInfo.total, 'count', runInfo.count);

    log('Ending old run', runId);
    endAssociationRun(runId);

    log('Starting a new associate run');
    associatePages();
}

function endAssociationRun(runId) {
    delete associationRuns[runId];
    try {
        TimeoutManager.clear(runId);
    }
    catch(ex) {
        if (ex.message == 'A timeout with the given label does not exist') {
            return;
        }
        throw ex;
    }
}

function associateTabToPageNode(runId, tab, referrer, historylength) {
    log('Associating tab', 'runId', runId, 'tabId', tab.id, 'url', tab.url, 'referrer', referrer, 'historylength', historylength, 'associationRuns', associationRuns);

    var runInfo = associationRuns[runId];

    if (runInfo) {
        // Run that started us is still happening
        TimeoutManager.reset(runId, function() { associatePagesCheck(runId) }, ASSOCIATE_PAGES_CHECK_INTERVAL_MS);
        runInfo.count++;
    }

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
