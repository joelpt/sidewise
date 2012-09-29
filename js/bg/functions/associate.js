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
var ASSOCIATE_STUBBORN_TAB_FALLBACK_THRESHOLD_MS = 15000;

var ASSOCIATE_STUBBORN_TAB_FALLBACK_THRESHOLD_ITERATIONS =
    ASSOCIATE_STUBBORN_TAB_FALLBACK_THRESHOLD_MS / ASSOCIATE_PAGES_CHECK_INTERVAL_MS;

// When the referrer of a tab matches this regular expression, Chrome is
// known to sometimes blank out such referrers of tabs created during
// session restores or undo-closed-tabs
var CHROME_BLANKABLE_REFERRER_REGEXP = new RegExp(
    /^http.+google.+\/(search\?.*sugexp=chrome,mod=\d+\&sourceid=chrome|url\?.*source=web)/);


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var associationRuns = {};
var associationStubbornTabIds = {};
var associationConcurrentRuns = 0;


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
// of startAssociationRun() and thus we should make sure that having both onCommitted and startAssociationRun() firing
// associateTabToPageNode() doesn't fritz things out. A nice approach might be, when onCommitted sees
// a 'reload', if we think it might be an "associate to a restorable" case (sessionGUID not found in closed-tabs list
// or hibernated-tabs-in-tree), then just fire up an startAssociationRun() run and let it do all that work for us;
// this is probably a better solution because we can reuse more of the association code and logics; we will
// just need to take care to set the 120-second timer separately from onCommitted's firing of startAssociationRun().

// Main entry point for starting the association process.
// Tries to associate all existing tabs to a page row, and will
// repeatedly restart the process after a delay until all
// tabs have been associated with something.
function startAssociationRun() {
    if (associationConcurrentRuns > 0) {
        return;
    }

    chrome.tabs.query({ }, function(tabs) {
        if (associationConcurrentRuns > 0) {
            return;
        }

        var runId = generateGuid();
        var runInfo = { runId: runId, total: 0, count: 0, tabIds: [] };
        associationRuns[runId] = runInfo;
        associationConcurrentRuns++;
        log('Starting a new association run', 'runId', runId, 'runInfo', runInfo);

        for (var i in tabs) {
            var tab = tabs[i];
            if (sidebarHandler.tabId == tab.id) {
                // this tab is the sidebar
                continue;
            }
            if (tree.getPage(tab.id)) {
                // this tab is already in the tree as a normal tab
                continue;
            }
            runInfo.total++;
            log('trying association', 'runId', runId, 'tabId', tab.id, 'total', runInfo.total, 'count', runInfo.count);
            tryAssociateTab(runInfo, tab);
        }
        if (runInfo.total == 0) {
            log('No unassociated tabs left to associate; ending association run and doing parent window guessing');
            endAssociationRun(runId);
            associateWindowstoWindowNodes();
            return;
        }
        log('Started association process, tabs in queue: ' + runInfo.total);
        TimeoutManager.reset(runId, function() { associatePagesCheck(runId); }, ASSOCIATE_PAGES_CHECK_INTERVAL_MS);
    });
}


///////////////////////////////////////////////////////////
// Helper functions used during assocation runs.
///////////////////////////////////////////////////////////

function endAssociationRun(runId) {
    var runInfo = associationRuns[runId];
    log('Ending association run', runId, runInfo);
    delete associationRuns[runId];
    associationConcurrentRuns--;
    TimeoutManager.reset('conformAfterEndAssocationRun', function() {
        tree.rebuildPageNodeWindowIds(function() { tree.conformAllChromeTabIndexes(); });
    }, 5000);

    try {
        TimeoutManager.clear(runId);
    }
    catch(ex) {
        if (ex.message != 'A timeout with the given label does not exist') {
            throw ex;
        }
    }
}

function tryAssociateTab(runInfo, tab) {
    var runId = runInfo.runId;

    if (!isScriptableUrl(tab.url)) {
        // this tab will never be able to return details to us from content_script.js,
        // so just associate it without the benefit of those extra details
        associateTabToPageNode(runId, tab);
        return;
    }

    // record this tab's id in this run's tabIds list as one we expect to be restoring
    // in a later phase of this run
    runInfo.tabIds.push(tab.id);

    // ask the tab for more details via its content_script.js connected port
    try {
        getPageDetails(tab.id, { action: 'associate', runId: runId });
    }
    catch(ex) {
        if (ex.message == 'Port not found') {
            log('Port does not exist for association yet', 'tabId', tab.id, 'runId', runId);
            return;
        }
        throw ex;
    }
}

function tryAssociateExistingToRestorablePageNode(existingPage) {
    var tabId = getNumericId(existingPage.id);

    // ask the tab for more details via its content_script.js connected port
    try {
        getPageDetails(tabId, { action: 'associate_existing' });
    }
    catch(ex) {
        if (ex.message == 'Port not found') {
            log('Port does not exist for existing-to-restorable association yet, retrying in 1s', 'tabId', tabId, 'existing page', existingPage);
            setTimeout(function() {
                tryAssociateExistingToRestorablePageNode(existingPage);
            }, 1000);
            return;
        }
        throw ex;
    }
}

function associateExistingToRestorablePageNode(tab, referrer, historylength) {
    var tabId = tab.id;
    var existingPage = tree.getPage(tabId);

    log('associating existing to restorable', 'tabId', tabId, 'existing', existingPage, 'referrer', referrer,
        'historylength', historylength);

    var match = findPageNodeForAssociation({
        mustBeHibernated: true,
        mustBeRestorable: true,
        url: tab.url,
        referrer: referrer,
        historylength: historylength,
        pinned: tab.pinned
    });

    if (!match) {
        log('No restorable match found');
        return;
    }

    log('Restorable match found', 'match', match.node, 'match.node.id', match.node.id);

    var details = { restored: true, hibernated: false, restorable: false,
        id: existingPage.id, status: existingPage.status };

    if (referrer !== undefined) {
        details.referrer = referrer;
    }
    if (historylength !== undefined) {
        details.historylength = historylength;
    }

    tree.mergeNodes(existingPage, match.node);
    tree.updateNode(match.node, details);

    var topParent = match.ancestors[0];
    restoreParentWindowViaUniqueChildPageNode(topParent, match.node, tab.windowId);

    // TODO call associateWindowsToWindowNodes() iff all existing restorable windows
    // have zero .restorable children (and there is at least one such restorable window
    // still left to try and restore)
}

function associatePagesCheck(runId) {
    var runInfo = associationRuns[runId];

    if (!runInfo) {
        log('Association run is already ended', runId);
        associateWindowstoWindowNodes();
        // log('Starting a slow tick loop of startAssociationRun');
        // setInterval(startAssociationRun, ASSOCIATE_PAGES_CHECK_INTERVAL_MS_SLOW);
        return;
    }

    log('associatePagesCheck', 'total', runInfo.total, 'count', runInfo.count, 'tabIds', runInfo.tabIds);

    log('stubborn tabs list before update', JSON.stringify(associationStubbornTabIds));

    for (var i in runInfo.tabIds) {
        var tabId = runInfo.tabIds[i];
        var count = (associationStubbornTabIds[tabId] || 0) + 1;

        if (count >= ASSOCIATE_STUBBORN_TAB_FALLBACK_THRESHOLD_ITERATIONS) {
            // this tab is being too stubborn and will not respond to getPageDetails() attempts,
            // so just fallback to the simpler method of url matching
            chrome.tabs.get(tabId, function(tab) {
                log('Using fallback association for stubborn tab', 'tabId', tab.id, 'runId', runId);
                associateTabToPageNode(runId, tab);
            });
        }
        else {
            associationStubbornTabIds[tabId] = count;
        }
    }

    log('stubborn tabs list after update', JSON.stringify(associationStubbornTabIds));

    endAssociationRun(runId);

    startAssociationRun();
}

function associateTabToPageNode(runId, tab, referrer, historylength) {
    log('Associating tab', 'runId', runId, 'tabId', tab.id, 'url', tab.url, 'referrer', referrer, 'historylength', historylength, 'associationRuns', associationRuns);

    var runInfo = associationRuns[runId];

    // Is this run still in progress?
    if (runInfo) {
        // Remove this tab from the list of tabs still to be processed in this run
        runInfo.tabIds.splice(runInfo.tabIds.indexOf(tab.id), 0);

        // Reset the associatePagesCheck timeout for this run
        TimeoutManager.reset(runId, function() { associatePagesCheck(runId) }, ASSOCIATE_PAGES_CHECK_INTERVAL_MS);

        // Increment number of tabs that have been associated this run
        runInfo.count++;
    }

    var existingPage = tree.getPage(tab.id);

    if (existingPage) {
        // tab is already properly present as a pagenode in the tree and we don't want to
        // merge it into a restorable pagenode
        return;
    }

    var match = findPageNodeForAssociation({
        mustBeHibernated: true,
        mustBeRestorable: true,
        topParentMustBeRealOrRestorableWindow: true,
        url: tab.url,
        referrer: referrer,
        historylength: historylength,
        pinned: tab.pinned
    });

    if (!match) {
        // apparently a new tab to us
        log('no matching PageNode found, adding to a new window', tab.id, tab);
        tree.addTabToWindow(tab, undefined, function(page, win) {
            tree.updateNode(page, { referrer: referrer || '', historylength: historylength || 1 });

            // set focus to this page if it and its window have the current focus
            if (tab.active && focusTracker.getFocused() == tab.windowId) {
                tree.focusPage(tab.id);
            }
        });
        return;
    }

    log('matching PageNode found, restoring', tab.id, tab, match.node);
    var details = { restored: true, hibernated: false, restorable: false, id: 'p' + tab.id };
    tree.updateNode(match.node, details);

    // get updated status from Chrome in a moment
    chrome.tabs.get(tab.id, function(t) {
        tree.updateNode(match.node, { status: t.status });
    });

    // set focus to this page if it and its window have the current focus
    if (tab.active && focusTracker.getFocused() == tab.windowId) {
        tree.focusPage(tab.id);
    }

    var topParent = match.ancestors[0];
    restoreParentWindowViaUniqueChildPageNode(topParent, match.node, tab.windowId);
}

function restoreParentWindowViaUniqueChildPageNode(parentWindowNode, childPageNode, childWindowId)
{
    // When node is under a restorable window node, we want to see if this tab/node has
    // a unique key amongst all nodes. If so, we know that this tab's .windowId
    // can definitively identify the parent restorable window's new windowId.
    if (!parentWindowNode instanceof WindowNode || !parentWindowNode.restorable) {
        return;
    }

    // parentWindowNode is a restorable window node.
    // Is there any other page node in the tree with the same constructed key
    // as childPageNode?
    var otherMatch = findPageNodeForAssociation({
        url: childPageNode.url,
        referrer: childPageNode.referrer,
        historylength: childPageNode.historylength,
        notMatchingNode: childPageNode
    });

    if (otherMatch) {
        // childPageNode's constructed key is not unique, cannot use it
        // to establish parent window's new windowId
        return;
    }

    // Node's key is unique, so we can use this tab's .windowId to set
    // the restorable parent window node's proper windowId.

    // does a WindowNode already exist matching the tab's .windowId?
    var existingWinNode = tree.getNode('w' + childWindowId);
    if (existingWinNode) {
        // already exists, so merge its children into our restorable window
        tree.mergeNodes(existingWinNode, parentWindowNode);
    }

    // Restore the restorable parent window and assign it tab's .windowId
    tree.updateNode(parentWindowNode, {
        restorable: false,
        hibernated: false,
        id: 'w' + childWindowId,
        title: WINDOW_DEFAULT_TITLE
    });
    tree.expandNode(parentWindowNode);
}

function findPageNodeForAssociation(params) {
    var fallbackReferrer = params.referrer;
    if (params.referrer && CHROME_BLANKABLE_REFERRER_REGEXP.test(params.referrer)) {
        fallbackReferrer = '';
    }

    return tree.getNodeEx(function(node, ancestors) {
        var matched = node instanceof PageNode
            && (!params.mustBeHibernated || node.hibernated === true)
            && (!params.mustBeRestorable || node.restorable === true)
            && node.url == params.url
            && (params.historylength === undefined || node.historylength == params.historylength)
            && (params.notMatchingNode === undefined || node !== params.notMatchingNode);

        if (!matched) {
            return false;
        }


        if (params.topParentMustBeRealOrRestorableWindow) {
            var topParent = ancestors[0];
            if (!(topParent instanceof WindowNode)) {
                return false;
            }

            if (topParent.restorable == false && topParent.hibernated == true) {
                return false;
            }
        }

        if (params.referrer === undefined || params.referrer == node.referrer) {
            return true;
        }

        if (params.pinned && node.pinned) {
            // for pinned tabs, Chrome blanks out the referrer if 'Open pages from last time'
            // setting is not on; since we cannot determine if that setting is on, we just
            // match on pinned state and ignore referrer matching entirely for these
            return true;
        }

        // Chrome sometimes blanks out certain referrers after a browser restart;
        // for such referrers we will count a node as matching if either the existing
        // node's referrer or the passed referrer match parameter are blank
        var fallbackNodeReferrer = node.referrer;
        if (node.referrer && CHROME_BLANKABLE_REFERRER_REGEXP.test(node.referrer)) {
            fallbackNodeReferrer = '';
        }

        if (fallbackReferrer == fallbackNodeReferrer) {
            return true;
        }

        return false;
    });
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
                var tab = first(tabs, function(e) { return e.id == tabId; })[1];
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
            var details = { restorable: false, hibernated: false, id: 'w' + mostFrequentWindowId,
                title: WINDOW_DEFAULT_TITLE
            };
            tree.updateNode(resWindow, details);
            tree.expandNode(resWindow);

            // record the windowId used so we don't try to use it again in an upcoming iteration
            associatedWindowIds.push(mostFrequentWindowId);
        }
    });
}
