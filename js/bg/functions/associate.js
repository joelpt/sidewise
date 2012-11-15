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
            if (sidebarHandler.tabId == tab.id || tab.url == chrome.extension.getURL('/sidebar.html')) {
                // this tab is the sidebar
                continue;
            }
            if (tree.getPage(tab.id)) {
                // this tab is already in the tree as a normal tab
                continue;
            }
            // log('trying association', 'runId', runId, 'tabId', tab.id, 'total', runInfo.total, 'count', runInfo.count);
            if (!tryAssociateTab(runInfo, tab)) {
                runInfo.total++;
            }

        }
        if (runInfo.total == 0) {
            log('No unassociated tabs left to associate; ending association run and doing parent window guessing');
            endAssociationRun(runId);
            // log(tree.dump());
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

    tree.rebuildTabIndex();

    // This ugly hunk of code cleans up the tree, getting it as accurately in sync
    // with Chrome's current tab/window configuration as we can. Most of the time
    // this is overkill, but it catches tricky edge cases which if not corrected now
    // will often lead to bizarre UI behavior/breakage later on.
    TimeoutManager.reset('conformAfterEndAssocationRun', function() {
        tree.rebuildPageNodeWindowIds(function() {                                  // obtain fresh tab windowIds and indexes
            associateWindowstoWindowNodes(true, false, function() {                 // associate OR merge windows, stringent match
                disambiguatePageNodesByWindowId();                                  // disambiguate tabs
                associateWindowstoWindowNodes(true, true, function() {              // associate windows, stringent match
                    disambiguatePageNodesByWindowId();                              // disambiguate tabs
                    associateWindowstoWindowNodes(false, true, function() {         // associate windows, relaxed match
                        disambiguatePageNodesByWindowId();                          // disambiguate tabs
                        associateWindowstoWindowNodes(false, false, function() {    // associate OR merge windows, relaxed match
                            disambiguatePageNodesByWindowId();                      // move pages to be under correct window node based on .windowId
                            fixAllPinnedUnpinnedTabOrder();                         // correct ordering of pinned vs. unpinned tabs in the tree/tab order
                            tree.conformAllChromeTabIndexes(true);                  // conform chrome's tab order to match the tree's order
                        });
                    });
                });
            });
        });
    }, 500);

    try {
        TimeoutManager.clear(runId);
    }
    catch(ex) {
        if (ex.message != 'A timeout with the given label does not exist') {
            throw ex;
        }
    }
}

// Returns true if tab was immediately associated or false if an asynchronous
// call to the page's content script was required to do potential association later
function tryAssociateTab(runInfo, tab) {
    var runId = runInfo.runId;

    if (tryFastAssociateTab(tab, true)) {
        return true;
    }

    if (!isScriptableUrl(tab.url)) {
        // this tab will never be able to return details to us from content_script.js,
        // so just associate it without the benefit of those extra details
        log('Doing blind association for non scriptable tab', tab.id, tab.url);
        associateTabToPageNode(runId, tab);
        return true;
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
    return false;
}

function tryFastAssociateTab(tab, mustBeRestorable) {
    var existingWindow = tree.getNode('w' + tab.windowId);
    var inArray = (existingWindow ? existingWindow.children : undefined);
    var matches = tree.filter(function(e) {
        return e instanceof PageNode
            && e.hibernated
            && (!mustBeRestorable || e.restorable)
            && tab.url == e.url
            && tab.index == e.index
            && tab.incognito == e.incognito
            && tab.pinned == e.pinned;
    }, inArray);

    if (matches.length == 1) {
        // Exactly one page node matches this tab by url+index so assume it's a match
        // and do the association
        var match = matches[0];
        log('doing fast associate', tab, match, tab.id, match.id, 'pinned states', tab.pinned.toString(), match.pinned.toString());
        restoreAssociatedPage(tab, match);

        // ask the tab for more details via its content_script.js connected port
        // in this case we only need them to store on the node in case a successive
        // assocation run fails to do fast association
        if (isScriptableUrl(tab.url)) {
            try {
                getPageDetails(tab.id, { action: 'store' });
            }
            catch(ex) { }
        }
        return match;
    }
    return undefined;
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
        throw ex; // unhandled exception here
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
        pinned: tab.pinned,
        incognito: tab.incognito
    });

    if (!match) {
        log('No restorable match found');
        return;
    }

    log('Restorable match found', 'match', match, 'match.id', match.id);

    tree.mergeNodes(existingPage, match);
    restoreAssociatedPage(tab, match);

    if (referrer !== undefined) {
        match.referrer = referrer;
    }
    if (historylength !== undefined) {
        match.historylength = historylength;
    }

    // TODO call associateWindowsToWindowNodes() iff all existing restorable windows
    // have zero .restorable children (and there is at least one such restorable window
    // still left to try and restore)
    TimeoutManager.reset('WinAssociationForExistingRestorable', function() {
        associateWindowstoWindowNodes(true, true, function() {
            disambiguatePageNodesByWindowId();
            associateWindowstoWindowNodes(true, false, function() {
                disambiguatePageNodesByWindowId();
                fixAllPinnedUnpinnedTabOrder();
            });
        });
    }, 2000);
}

function associatePagesCheck(runId) {
    var runInfo = associationRuns[runId];

    if (!runInfo) {
        log('Association run is already ended', runId);
        // associateWindowstoWindowNodes();
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
        pinned: tab.pinned,
        incognito: tab.incognito
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

    log('matching PageNode found, restoring', tab.id, tab, 'match', match.id, match, 'pinned states', tab.pinned.toString(), match.pinned.toString());
    restoreAssociatedPage(tab, match);
}

function restoreAssociatedPage(tab, page) {
    log('restoring associated page', 'tab', tab.id, tab, 'page', page.id, page, tab.url, page.url);
    var details = {
        restored: true,
        hibernated: false,
        restorable: false,
        id: 'p' + tab.id,
        windowId: tab.windowId,
        index: tab.index,
        pinned: tab.pinned
    };
    tree.updateNode(page, details);

    // get updated status from Chrome in a moment
    chrome.tabs.get(tab.id, function(t) {
        tree.updateNode(page, { status: t.status });
    });

    // set focus to this page if it and its window have the current focus
    if (tab.active && focusTracker.getFocused() == tab.windowId) {
        tree.focusPage(tab.id);
    }

    var topParent = page.topParent();
    restoreParentWindowViaUniqueChildPageNode(topParent, page, tab.windowId);

    // check and fix pinned-vs-unpinned tab order after restoration
    fixPinnedUnpinnedTabOrder(page);
    return page;
}

function restoreParentWindowViaUniqueChildPageNode(parentWindowNode, childPageNode, childWindowId)
{
    // When node is under a hibernated window node, we want to see if this tab/node has
    // a unique key amongst all nodes. If so, we know that this tab's .windowId
    // can definitively identify the parent hibernated window's new windowId.
    if (!parentWindowNode instanceof WindowNode || !parentWindowNode.hibernated) {
        return;
    }

    // parentWindowNode is a restorable window node.
    // Is there any other page node in the tree with the same constructed key
    // as childPageNode?
    var otherMatch = findPageNodeForAssociation({
        url: childPageNode.url,
        title: childPageNode.title,
        referrer: childPageNode.referrer,
        historylength: childPageNode.historylength,
        notMatchingNode: childPageNode,
        pinned: childPageNode.pinned,
        incognito: childPageNode.incognito
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

function findPageNodeForAssociation(params, findAll) {
    var fallbackReferrer = params.referrer;
    if (params.referrer && CHROME_BLANKABLE_REFERRER_REGEXP.test(params.referrer)) {
        fallbackReferrer = '';
    }

    var testUrl = params.url;
    var matchingGoogleUrl = false;

    if (isGoogleSearchUrl(testUrl)) {
        // special handling for google urls, which seem to tack on &sei= query parameters
        // that vary between restarts
        matchingGoogleUrl = true;
        var googleTestUrl = getGoogleTestUrl(testUrl);
    }

    if (findAll) {
        return tree.filter(testNodeForAssociation);
    }
    return tree.getNode(testNodeForAssociation);

    function testNodeForAssociation(node) {
        if (!(node instanceof PageNode)) {
            return false;
        }

        var urlMatch = false;
        if (!matchingGoogleUrl) {
            urlMatch = (testUrl == node.url);
        }
        else {
            if (!isGoogleSearchUrl(node.url)) {
                return false;
            }
            // special handling for google urls, which seem to tack on &sei= and/or #hash.. components to the url
            // which are known to vary between restarts for the same tab
            var googleNodeUrl = getGoogleTestUrl(node.url);
            urlMatch = (googleNodeUrl == googleTestUrl);
        }

        var matched = (!params.mustBeHibernated || node.hibernated === true)
            && (!params.mustBeRestorable || node.restorable === true)
            && urlMatch
            && (!params.title || node.title == params.title)
            && (params.incognito === undefined || node.incognito == params.incognito)
            && (params.pinned === undefined || node.pinned == params.pinned)
            && (params.historylength === undefined || node.historylength == params.historylength)
            && (params.notMatchingNode === undefined || node !== params.notMatchingNode);

        if (!matched) {
            return false;
        }


        if (params.topParentMustBeRealOrRestorableWindow) {
            var topParent = node.topParent();
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
    }
}


function isGoogleSearchUrl(url) {
    return url.match(/^https?:\/\/.*google.*\/search\?q=/);
}

function getGoogleTestUrl(url) {
    var r = url.replace(/sei=[a-zA-Z0-9]+/g, '').replace(/\#.+$/, '');
    return r;
}

function associateWindowstoWindowNodes(requireChildrenCountMatch, prohibitMergingWindows, onComplete) {
    var resWindows = tree.filter(function(e) {
        return e.elemType == 'window' && e.restorable == true;
    });

    log('Restorable window set ids', resWindows.map(function(e) { return e.id; }));

    // THIS IS WRONG
    // we have to:
    //      for each restorable window calculate its most likely matching windowId
    //      then we want to assign windowIds starting with the most-likely-candidate down
    //      this maybe does not fix our problem: one window has 2 tabs, another has 3 tabs,
    //      both have 2 .windowId-matching subtabs because of initial mis-association, so half the time
    //      sidewise will assign the wrong windowId here by assigning a windowId to a window node
    //      which has more awake children than the chrome window associated with .windowId (though 1 of those
    //      children has the wrong .windowId); we could increase accuracy by
    //          preferentially matching against page.index when guessing window node's windowId,
    //          essentially scoring index matchers a little higher
    //
    //          not setting mostFrequentWindowId when the window node has too many awake tabs in it vs the chrome window
    //              since this would indicate that we should instead pick another window node which MAY actually have fewer
    //              windowId-matching pages in it right now, but because it has the right number of children, it is actually
    //              the more likely match
    //
    //          thus in cases where two windows have each 4 tabs, and each get a frequency score of 2,
    //          there is actually no way for sidewise to distinguish which window is which other than by conceivably
    //              using their chrome.window.index values as a hint - which is a good idea actually
    //
    var tabs = chrome.tabs.query({ }, function(tabs) {
        var windowTabCounts = {};
        for (var i = tabs.length - 1; i >= 0; i--) {
            windowTabCounts[tabs[i].windowId] = (windowTabCounts[tabs[i].windowId] || 0) + 1;
        }

        // For each restorable window, find the windowId that is most common amongst its awake tabs
        var associatedWindowIds = [];
        var associatedNodes = [];
        var scores = [];

        // Compute best match scores
        for (var i in resWindows) {
            var resWindow = resWindows[i];
            var resWindowTabCount = 0;
            var resWindowPageCount = 0;

            // console.log('--- try associating window ---', resWindow);

            // count frequency of each windowId in resWindow's pages
            var windowIdFrequencies = tree.reduce(function(last, e) {
                if (!(e instanceof PageNode)) {
                    return last;
                }

                resWindowPageCount++;

                if (e.hibernated) {
                    return last;
                }

                var tabId = getNumericId(e.id);
                var tab = first(tabs, function(e) { return e.id == tabId; })[1];
                var windowId = tab.windowId;

                if (e.pinned != tab.pinned || e.incognito != tab.incognito) {
                    return last;
                }

                last[windowId] = (last[windowId] || 0.0) + 1.0 + (e.index == tab.index ? 0.00001 : 0);
                resWindowTabCount++;
                return last;
            }, {}, resWindow.children);

            // log('Window frequencies', resWindow.id, windowIdFrequencies);

            // find the most frequent windowId
            var mostFrequentWindowId = null;
            var mostFrequentCount = 0;
            for (var windowId in windowIdFrequencies) {
                if (associatedWindowIds.indexOf(windowId) >= 0) {
                    // don't associate with windowIds which have already been associated
                    // log('skipping already-used windowId', windowId);
                    continue;
                }
                if (requireChildrenCountMatch && resWindowTabCount != windowTabCounts[windowId]) {
                    // don't associate window nodes to chrome windows when we have more awake
                    // tabs under the window node than we do in the actual chrome window; in this case
                    // we have mis-associated some page nodes in the tree and will correct those later
                    // in disambiguatePageNodesByWindowId().
                    // log('not using window as it has different number of wake children than the chrome window', windowId);
                    continue;
                }
                // if (resWindowPageCount < windowTabCounts[windowId]) {
                //     // don't associate window nodes to chrome windows when we have fewer total awake+hibernated
                //     // page nodes under the window node than exist in the proposed chrome window; could this catch us up
                //     // if we are launching sidewise and we have created new tabs in a given existing window while it was
                //     // shut down? then the window node will report having fewer tabs total than vs the chrome window
                //     // and we would fail to associate here... hmmmmmmm
                //     continue;
                // }
                var frequency = windowIdFrequencies[windowId];
                if (mostFrequentCount < frequency) {
                    mostFrequentCount = frequency;
                    mostFrequentWindowId = windowId;
                }
            }

            // TODO change the logic of this whole bloody function as follows:
            // generate frequency-score for each proposed windownode-windowId pairing across the whole tree
            // sort list by best score first:
            //      +1 for a tab that matches a child page by windowId+pinned+incognito
            //      +.0001 when that tab's index also matches
            //      (+0.1) when chrome.window.index == windownode.index [later]
            //
            // go through the list and assign windowIds to window nodes starting with the highest frequency matcher first
            // after each assignation add that windowId to the used-list
            // and don't reuse the same windowId for more than one window node during this association process, and only assign
            //      for each resWindow a single time as well

            if (!mostFrequentWindowId) {
                log('No most frequent windowId found', resWindow.id);
                continue;
            }

            log('Most frequent found', 'resWindowId', resWindow.id, 'mostFrequentWindowId', mostFrequentWindowId, 'frequency', mostFrequentCount);

            // does a WindowNode already exist matching the mostFrequentWindowId?
            var winNode = tree.getNode('w' + mostFrequentWindowId);
            if (winNode) {
                if (!prohibitMergingWindows) {
                    // already exists, so merge its children into our restorable window
                    log('Merging windows', winNode.id, resWindow.id);
                    tree.mergeNodes(winNode, resWindow);
                }
                else {
                    // that is not allowed
                    log('Merging windows not allowed, though we did find an existing node with this window id already in existence', winNode.id, resWindow.id);
                    continue;
                }
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
        if (onComplete) onComplete();
    });
}

// When multiple page nodes have identical matching-keys during an association run, sometimes such a node
// will get put into the tree under what eventually becomes the incorrect window node. Here we identify such
// sets of matching-key nodes and swap their ids around to make things correct
// Set iterations to the maximum number of times the function should re-call itself after completing, which it does
//    only when there was at least one swap performed in this run; our logic sometimes does not get everything
//    100% correct in the first round; defaults to 3 when undefined
function disambiguatePageNodesByWindowId(iterations) {
    var swapCount = 0;

    if (iterations === undefined) iterations = 3;

    // find all matching-key groups, removing those page nodes whose windowId already matches its parent window.id
    var groups = tree.groupBy(function(e) {
        if (!e.isTab()) {
            return undefined;
        }
        if ('w' + e.windowId == e.topParent().id) {
            return undefined;
        }
        var key = [e.url, e.referrer, e.historylength, e.pinned, e.incognito].join('|');
        return key;
    });
    for (var g in groups) {
        var items = groups[g];
        console.log(g, items);
        if (items.length < 2) {
            continue;
        }
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var topParentId = item.topParent().id;
            if ('w' + item.windowId == topParentId) {
                // already under the correct parent window node
                // console.log('already under correct parent', item.windowId, topParentId);
                continue;
            }

            swapCount++;

            // In order of preference:
            // (1) swap with a same-key node whose .windowId and topParent.id are transpositions of our working node's
            var swapWith = items.filter(function(e) { return e !== item && 'w' + e.windowId == topParentId && 'w' + item.windowId == e.topParent().id; });
            // (2) swap with a same-key node whose topParent.id matches our working node's .windowId (we need to be in that window)
            if (swapWith.length == 0) {
                swapWith = items.filter(function(e) { return e !== item && 'w' + item.windowId == e.topParent().id; });
                if (swapWith.length == 0) {
                    swapWith = items.filter(function(e) { return e !== item && 'w' + e.windowId == topParentId; });
                    if (swapWith.length == 0) {
                        // node is in the wrong window but there is nobody to swap with in that window with the same key;
                        // this should never happen and if it does we need to track down what caused that to occur
                        log('Disambiguation missed:', swapCount, g, i, item);
                        continue;
                    }
                }
            }
            log('Swapping for disambiguation:', swapCount, 'page ids', item.id, swapWith[0].id, '.windowIds', item.windowId, swapWith[0].windowId, 'topParentIds', item.topParent().id, swapWith[0].topParent().id, 'group', g, items);
            swapPageNodeIdValues(item, swapWith[0]);
        }
    }
    if (swapCount > 0 && iterations > 1) {
        // log('- Verifying disambiguation -');
        disambiguatePageNodesByWindowId(iterations - 1);
        return;
    }
    // log('Disambiguation complete');
}

function swapPageNodeIdValues(a, b) {
    var origIdA = a.id;
    var origIdB = b.id;
    var tempIdA = generateGuid();
    var tempIdB = generateGuid();
    var c = { id: tempIdB, windowId: b.windowId, index: b.index };
    tree.updateNode(b, { id: tempIdA, windowId: a.windowId, index: a.index });
    tree.updateNode(a, c);
    tree.updateNode(b, { id: origIdA });
    tree.updateNode(a, { id: origIdB });
}