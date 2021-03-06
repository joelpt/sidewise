///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

$(document).ready(function() {
    initDebugBar();
    initPageTree(bg.tree, 'pages', createFancyTree);
    bg.focusCurrentTabInPageTree(true);

    if (!settings.get('createdNewTabViaDoubleClick')) {
        $('.ftBottomPadding').text('Double-click to create a new tab');
    }

    $(document).on('dblclick', 'body, .ftBottomPadding', onBodyDoubleClick);
    $(document).on('keydown', 'body', onBodyKeyDown);
});

function onBodyKeyDown(evt) {
    console.log(evt.ctrlKey, evt.keyCode);
    if (evt.ctrlKey && (evt.keyCode == 87 || evt.keyCode == 115)) {
        if (bg.tree.focusedTabId) {
            chrome.tabs.remove(bg.tree.focusedTabId);
        }
        return false;
    }
}

function initDebugBar() {
    if (!loggingEnabled) {
        return;
    }

    $('footer, #main').addClass('debugEnabled');

    $(document)
        .on('click', '#debug_promoteIframe', debugBarClickPromoteIframe)
        .on('click', '#debug_resetTree', debugBarClickResetTree);
}

function debugBarClickPromoteIframe() {
    window.parent.location='pages.html';
}

function debugBarClickResetTree() {
    if (!confirm('This will completely delete your existing tree and rebuild it from scratch. All existing hibernated rows will be lost. Are you sure you want to continue?')) {
        return;
    }
    ft.clear();
    bg.tree.clear();
    bg.injectContentScriptInExistingTabs('content_script.js');
    bg.populatePages();
    setTimeout(function() {
        location.reload();
    }, 500);
}

function createFancyTree(treeReplaceSelector, filterBoxReplaceSelector, pageTree) {
    var rowTypes = {
        'page': {
            allowedDropTargets: ['window', 'page', 'folder'],
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onPageRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onIconError: onPageRowIconError,
            buttons: [
                {id: 'hibernate', icon: '/images/hibernate_wake.png', tooltip: getMessage('pages_pageRowButtonTip_hibernateWake'), onClick: onPageRowHibernateButton },
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_pageRowButtonTip_close'), onClick: onPageRowCloseButton }
            ]
        },
        'folder': {
            allowedDropTargets: ['window', 'page', 'folder'],
            onDoubleClick: onFolderRowDoubleClick,
            onMiddleClick: onFolderRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            buttons: [
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_folderRowButtonTip_close'), onClick: onFolderRowCloseButton }
            ]
        },
        'window': {
            allowedDropTargets: ['ROOT', 'window'],
            onClick: onWindowRowClick,
            onDoubleClick: onWindowRowDoubleClick,
            onMiddleClick: onWindowRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onShowButtons: onWindowShowButtons,
            buttons: [
                {id: 'createTab', icon: '/images/create_tab.png', tooltip: getMessage('pages_windowRowButtonTip_createTab'), onClick: onWindowRowCreateTabButton },
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_windowRowButtonTip_close'), onClick: onWindowRowCloseButton }
            ]
        }
    };
    copyObjectSubProps(PageTreeRowTypes, rowTypes, false);

    var clickOnHoverDelayMs;
    if (settings.get('pages_clickOnHoverDelay')) {
        clickOnHoverDelayMs = settings.get('pages_clickOnHoverDelayMs');
    }

    fancyTree = new FancyTree($(treeReplaceSelector), $(filterBoxReplaceSelector), {
        rowTypes: rowTypes,
        onContextMenuShow: onContextMenuShow,
        onRowsMoved: onRowsMoved,
        allowDropHandler: allowDropHandler,
        scrollTargetElem: $('#main'),
        showFilterBox: true,
        autoSelectChildrenOnDrag: settings.get('autoSelectChildrenOnDrag'),
        filterPlaceholderText: getMessage('prompt_filterPlaceholderText'),
        filterActiveText: getMessage('prompt_filterActiveText'),
        useAdvancedFiltering: settings.get('useAdvancedTreeFiltering'),
        clickOnHoverDelayMs: clickOnHoverDelayMs,
        clickOnMouseWheel: settings.get('pages_clickOnMouseWheel'),
        logger: bg.log
    });

    $('.ftFilterStatus').attr('title', getMessage('pages_omniboxTip'));

    setTimeout(function() { populateFancyTreeFromPageTree(fancyTree, pageTree); }, 0);

    return fancyTree;
}

function populateFancyTreeFromPageTree(fancyTree, pageTree) {
    pageTree.forEach(function(e, i, d, a, p) {
        var parentId = (p ? p.id : undefined);
        addPageTreeNodeToFancyTree(fancyTree, e, parentId);
    });
}

function addPageTreeNodeToFancyTree(fancyTree, node, parentId, beforeSiblingId)
{
    var row;
    if (node instanceof bg.WindowNode) {
        var incognito = node.incognito;
        var popup = (node.type == 'popup');

        var img;
        if (incognito) {
            img = '/images/incognito-16.png';
        }
        else if (popup) {
            img ='/images/tab-single-16.png';
        }
        else {
            img = '/images/tab-stack-16.png';
        }

        row = fancyTree.getNewRowElem('window',
            node.id,
            img,
            node.label,
            node.title,
            {
                incognito: node.incognito,
                hibernated: node.hibernated,
                type: node.type,
                chromeid: node.chromeId
            },
            node.collapsed);
    }
    else if (node instanceof bg.PageNode) {
        row = fancyTree.getNewRowElem('page', node.id, 'chrome://favicon', node.label, node.title,
            {
                url: node.url,
                status: node.status,
                pinned: node.pinned,
                unread: node.unread,
                hibernated: node.hibernated,
                restorable: node.restorable,
                highlighted: node.highlighted,
                incognito: node.incognito,
                chromeid: node.chromeId
            },
            node.collapsed);
    }
    else if (node instanceof bg.FolderNode) {
        row = fancyTree.getNewRowElem('folder', node.id, '/images/folder.png', node.label, 'Folder', {}, node.collapsed);
    }
    else {
        throw new Error('Unknown node type');
    }

    fancyTree.addRow(row, parentId, beforeSiblingId);

    setTimeout(function() {
        fancyTree.updateRow.call(fancyTree, row, { icon: node.favicon });
    }, 10);
}


///////////////////////////////////////////////////////////
// Background page callback proxy listener
///////////////////////////////////////////////////////////

function PageTreeCallbackProxyListener(op, args)
{
    if (!window) {
        // ignore proxy callback events when our hosting window has already been destroyed;
        // this can happen when e.g. the background page destroys the sidebar and sends
        // a proxy callback in quick succession
        return;
    }

    // log(op, args);
    switch (op)
    {
        case 'add':
            addPageTreeNodeToFancyTree(ft, args.element, args.parentId, args.beforeSiblingId);
            break;
        case 'remove':
            ft.removeRow(args.element.id, args.removeChildren);
            break;
        case 'move':
            ft.moveRow(args.element.id, args.newParentId, args.beforeSiblingId, args.keepChildren);
            break;
        case 'merge':
            ft.mergeRows(args.fromId, args.toId);
            break;
        case 'update':
            var elem = args.element;

            var details = {};
            for (var key in elem) {
                if (key in PAGETREE_FANCYTREE_UPDATE_DETAILS_MAP) {
                    details[PAGETREE_FANCYTREE_UPDATE_DETAILS_MAP[key]] = elem[key];
                }
            }

            var row = ft.getRow(args.id);
            if (!row) {
                throw new Error('Could not find row with id ' + args.id);
            }

            if (elem.status == 'complete' && row.attr('status') != 'complete' && row.attr('rowtype') == 'page' && row.attr('hibernated') == 'false') {
                // hack around Chrome bug which sometimes leaves icons in a partially rotated state
                // even though the CSS specifies they should be rotated back to 0deg when [status=complete]
                setTimeout(function() { row.css('-webkit-transform', 'rotate(0deg)'); }, 100);
                setTimeout(function() { row.css('-webkit-transform', ''); }, 150);
            }

            ft.updateRow(row, details);
            break;
        case 'focusPage':
            ft.focusRow(args.id);
            break;
        case 'expand':
            ft.expandRow(args.id);
            break;
        case 'collapse':
            ft.collapseRow(args.id);
            break;
        case 'multiSelectInWindow':
            var $win = ft.getRow(args.windowNodeId);
            if ($win.length == 0) {
                break;
            }
            var $kids = $('#' + args.pageNodeIds.join(',#'));
            ft.setMultiSelectedChildrenUnderRow($win, $kids, '[rowtype=page][hibernated=false]');
            break;
    }
}


///////////////////////////////////////////////////////////
// Page-scope event handlers
///////////////////////////////////////////////////////////

function onBodyDoubleClick(evt) {
    var $target = $(evt.target);
    if ($target.parents().is(ft.root) && !$target.is('.ftBottomPadding')) {
        // over the tree
        return true;
    }
    var windowId = bg.focusTracker.getFocused();
    createNewTabInWindow(windowId);
    settings.set('createdNewTabViaDoubleClick', true);
    $('.ftBottomPadding').text('');
    return false;
}


///////////////////////////////////////////////////////////
// FancyTree general event handlers
///////////////////////////////////////////////////////////

function onRowExpanderClick(evt) {
    bg.tree.updateNode(evt.data.row.attr('id'), { collapsed: !(evt.data.expanded) });
}

function onRowsMoved(moves) {
    log(moves);
    var windowToWindowMoves = {};
    var windowToWindowMovesCount = 0;
    var $toTopParent;
    var needNewWindow = false;

    for (var i = 0; i < moves.length; i++) {
        var move = moves[i];
        var $row = move.$row;
        var $to = move.$to;
        var rowId = $row.attr('id');
        var toId = $to ? $to.attr('id') : undefined;
        log('---- move:', rowId, move.relation, toId, move.keepChildren ? 'KEEP CHILDREN' : '');

        if (move.relation != 'nomove') {
            // record the move in bg.tree
            bg.tree.moveNodeRel(rowId, move.relation, toId, move.keepChildren, true);
        }

        if ($row.hasClass('ftCollapsed')) {
            log('check collapse-hidden descendants for win to win moves');
            var $winMoveTests = $row.add($row.find('.ftRowNode'));
        }
        else {
            var $winMoveTests = $row;
        }

        $winMoveTests.each(function(i, e) {
            var $row = $(e);
            if ($row.attr('rowtype') == 'page' && $row.attr('hibernated') != 'true') {
                // moving a tab between windows
                // TODO when moving tabs between windows we wont generate a move event for selected tabs
                // which are direct children of other selected tabs; these come with due to keepChildren=true
                // and therefore do not generate a move event. Move these properly.
                $toTopParent = $to.parents('.ftRowNode').last();
                if ($toTopParent.length == 0) {
                    $toTopParent = $to; // $to is at the topmost tree depth
                }
                var $oldTopParent = move.$oldAncestors.last();

                // if we are moving row to a branch with a different non hibernated window row at the top ...
                if ($toTopParent.attr('rowtype') == 'window'
                    && !($toTopParent.is($oldTopParent)))
                {
                    // this works, but has the gray-window problem which we should be able to fix by building out winToWinMoves array again
                    // and using this here technique for doing the moves, but doing the temp-tab create-and-destroy crap in addition as needed
                    // (and possibly activating moved tabs after always, too)
                    var movingTabId = getChromeId($row);
                    var fromWindowId = getChromeId($oldTopParent);
                    var node = bg.tree.getNode(rowId);

                    if ($toTopParent.attr('hibernated') == 'false') {
                        node.windowId = getChromeId($toTopParent);
                    }
                    else {
                        needNewWindow = true;
                    }

                    if (windowToWindowMoves[fromWindowId] === undefined) {
                        windowToWindowMoves[fromWindowId] = [];
                        windowToWindowMovesCount++;
                    }

                    windowToWindowMoves[fromWindowId].push({ node: node, movingTabId: movingTabId });
                }
            }
        });
    }

    if (windowToWindowMovesCount > 0) {
        // perform window-to-window moves
        bg.tree.rebuildTabIndex();
        var newWindowCreated = false;
        var toWindowId = getChromeId($toTopParent);

        var fn = function(onCompleteFn) {
            var i = 0;
            for (var fromWindowId in windowToWindowMoves) {
                if (!windowToWindowMoves.hasOwnProperty(fromWindowId)) {
                    continue;
                }
                i++;
                if (i == windowToWindowMovesCount) {
                    // last iteration
                    moveTabsBetweenWindows(parseInt(fromWindowId), toWindowId, windowToWindowMoves[fromWindowId], onCompleteFn);
                    continue;
                }
                moveTabsBetweenWindows(parseInt(fromWindowId), toWindowId, windowToWindowMoves[fromWindowId], undefined);
            }
        };

        if (needNewWindow) {
            var createDetails = bg.sidebarHandler.getIdealNewWindowMetrics();
                createDetails.url = 'about:blank';
                createDetails.type = 'normal';
                chrome.windows.create(createDetails, function(win) {
                    chrome.windows.update(win.id, bg.sidebarHandler.getIdealNewWindowMetrics()); // make sure specified metrics are really used
                    chrome.tabs.query({ windowId: win.id }, function(tabs) {
                        if (tabs.length != 1) {
                            console.error('Wrong number of tabs under new waking-window, should be exactly one', win, tabs.length, tabs);
                        }
                        var removeTabId = tabs[0].id;
                        toWindowId = win.id;
                        var existingWinNode = bg.tree.getNode(['chromeId', toWindowId]);
                        if (existingWinNode) {
                            bg.tree.updateNode(existingWinNode, { id: 'X' + generateGuid() });
                            bg.tree.removeNode(existingWinNode, true);
                        }
                        bg.tree.setWindowToAwake($toTopParent.attr('id'), toWindowId);
                        fn(function() { chrome.tabs.remove(removeTabId); });
                    });
                });
        }
        else {
            fn();
        }
    }
    else {
        bg.tree.conformAllChromeTabIndexes(true);
    }
}

function moveTabsBetweenWindows(fromWindowId, toWindowId, moves, onComplete) {
    var multiSelection = ft.multiSelection;

    chrome.tabs.query({ windowId: fromWindowId }, function(tabs) {
        if (tabs.length > moves.length) {    // from-window will still have at least 1 tab after the moves are done
            var onCompleteFn = function() {
                setTimeout(function() {
                    bg.tree.rebuildPageNodeWindowIds(function() {
                        bg.tree.conformAllChromeTabIndexes(true);
                        ft.setMultiSelectedChildrenUnderRow(ft.root, multiSelection);
                        if (onComplete) onComplete();
                    });
                }, 500);
            };
            for (var i in moves) {
                var move = moves[i];
                var toPosition = bg.tree.getTabIndex(move.node) || 0;
                log('win to win move', 'moving', move.node.id, 'to', toWindowId, 'index', toPosition);
                moveTabToWindow(move.movingTabId, toWindowId, toPosition,
                    i == moves.length - 1 ? onCompleteFn : undefined);
            }
            return;
        }

        // This is just a hack around a Chrome bug.
        // We have to create a temporary about:blank tab in the moving-from window in the case where the from-window will
        // get removed by moving its last tab to another window; if we do not do this, the tabs that get moved to the new
        // window show up in the new window with no actual content (Chrome just shows an empty gray window for the tab/s).
        chrome.tabs.create({ url: 'about:blank', windowId: fromWindowId }, function(tempTab) {
            var onCompleteFn = function() {
                chrome.tabs.remove(tempTab.id);
                setTimeout(function() {
                    bg.tree.rebuildPageNodeWindowIds(function() {
                        bg.tree.conformAllChromeTabIndexes(true);
                        if (onComplete) onComplete();
                    });
                }, 500);
            };
            for (var i in moves) {
                var move = moves[i];
                var toPosition = bg.tree.getTabIndex(move.node) || 0;
                log('win to win move + last-tab hack', 'moving', move.node.id, 'to', toWindowId, 'index', toPosition);
                moveTabToWindow(move.movingTabId, toWindowId, toPosition,
                    i == moves.length - 1 ? onCompleteFn : undefined);
            }
        });
    });
}

function moveTabToWindow(movingTabId, toWindowId, toPosition, afterFn) {
    log('moving tab to window', 'movingTabId', movingTabId, 'toWindowId', toWindowId, 'toPosition', toPosition);
    bg.expectingTabMoves.push(movingTabId);
    chrome.tabs.move(movingTabId, { windowId: toWindowId, index: toPosition }, function() {
        chrome.tabs.update(movingTabId, { active: true }, function(tab) {
            // Unpin tab if necessary (Chrome typically does so silenty for pinned tabs moved btwn windows this way)
            if (!tab.pinned) {
                var page = bg.tree.getNode(['chromeId', movingTabId]);
                if (page.pinned) {
                    bg.tree.updateNode(page, { pinned: false });
                    // TODO don't use below calling style: chrome-functions.js is bg specific so it should
                    // NOT be in the util/ folder, it needs to be under /js/bg/...
                    bg.fixPinnedUnpinnedTabOrder.call(bg, page);
                }
            }
            if (afterFn) {
                afterFn();
            }
        });
    });
}

function allowDropHandler($fromRows, relation, $toRow) {
    // console.log('from', $fromRows, relation, 'to', $toRow);

    // allow window nodes to be dropped above or below other window nodes, not 'into'
    if ($fromRows.is('[rowtype=window]') && $toRow.is('[rowtype=window]')) {
        if (relation == 'append' || relation == 'prepend') {
            return false;
        }
        return true;
    }

    // don't allow drag-dropping of any rows into or out of a popup window
    if ($fromRows.parents('[rowtype=window][type=popup]').length > 0) {
        return false;
    }
    if ($toRow.add($toRow.parents()).is('[rowtype=window][type=popup]')) {
        return false;
    }

    // don't allow dropping an incognito row into a non-incognito window or vice versa
    var fromIncognito = $fromRows.add($fromRows.parents()).is('[incognito=true]');
    var toIncognito = $toRow.add($toRow.parents()).is('[incognito=true]');
    if (fromIncognito != toIncognito) {
        return false;
    }

    // do remaining checks also against all non visible children
    $fromRows = $fromRows.add($fromRows.filter('.ftCollapsed').find('.ftRowNode'));

    // don't allow dropping a non pinned tab to above a pinned one
    var movingNonPinnedTabs = $fromRows.is('[rowtype=page][pinned=false][hibernated=false]');

    if (movingNonPinnedTabs) {
        if (relation == 'before' && $toRow.is('[rowtype=page][hibernated=false][pinned=true]')) {
            return false;
        }

        if ((relation == 'before' || relation == 'prepend')
            && $toRow.following('.ftRowNode[rowtype=page][hibernated=false][pinned=true]', $toRow.parentsUntil('.ftRoot > .ftChildren').last()).length > 0)
        {
            return false;
        }

        if (relation == 'prepend' && $toRow.is('[rowtype=window]')) {
            var toNode = bg.tree.getNode($toRow.attr('id'));
            if (toNode.following(function(e) { return e.isTab() && e.pinned; }, toNode)) {
                return false;
            }
        }
        var toNode = bg.tree.getNode($toRow.attr('id'));
        if (toNode.following(function(e) { return e.isTab() && e.pinned; }, toNode.topParent())) {
            return false;
        }
    }

    // don't allow dropping a pinned tab to below a nonpinned one
    var movingPinnedTabs = $fromRows.is('[rowtype=page][pinned=true][hibernated=false]');

    if (movingPinnedTabs) {
        if (relation != 'before' && $toRow.is('[rowtype=page][hibernated=false][pinned=false]')) {
            return false;
        }

        if (relation == 'after' || relation == 'append') {
            if ($toRow.preceding('.ftRowNode[rowtype=page][hibernated=false][pinned=false]', $toRow.parentsUntil('.ftRoot > .ftChildren').last()).length > 0) {
                return false;
            }

            if ($toRow.hasClass('ftCollapsed') && $toRow.find('.ftRowNode[rowtype=page][hibernated=false][pinned=false]').length > 0) {
                return false;
            }
        }

        if (relation == 'append' && $toRow.is('[rowtype=window]')) {
            return false;
        }
        var toNode = bg.tree.getNode($toRow.attr('id'));
        if (toNode.topParent()) {
            // TODO precalculate this and pass it in from FT?
            var fromTopParentIds = $fromRows.map(function(i, e) {
                var $parents = $(e).parentsUntil(ft.root);
                return $parents[$parents.length - 2].id;
            }).toArray();
            if (fromTopParentIds.indexOf(toNode.topParent().id) >= 0) {
                // at least one of the nodes to move has the same top parent as the move-to target node; make sure we don't allow any pinned tab
                // to be placed after an unpinned tab within the same top parent (window)
                if (toNode.preceding(function(e) { return e.isTab() && !e.pinned; }, toNode.topParent())) {
                    return false;
                }
            }
        }
    }

    // allow any other type of drop
    return true;
}


///////////////////////////////////////////////////////////
// FancyTree context menu handlers
///////////////////////////////////////////////////////////

function onContextMenuShow($rows) {
    log($rows);

    var items = [];

    var $firstRow = $rows.first();
    if ($firstRow.attr('rowtype') == 'window') {
        var $children = $firstRow.find('.ftChildren > .ftRowNode');

        var hibernatedCount = $children.filter(function(i, e) { return $(e).attr('hibernated') == 'true' }).length;
        var awakeCount = $children.length - hibernatedCount;

        if (hibernatedCount)
            items.push({ $rows: $firstRow, id: 'awakenWindow', icon: '/images/wake_branch.png', label: 'Wake tabs in window', callback: onContextMenuItemWakeWindow });

        if (awakeCount)
            items.push({ $rows: $firstRow, id: 'hibernateWindow', icon: '/images/hibernate_branch.png', label: 'Hibernate tabs in window', callback: onContextMenuItemHibernateWindow });

        if (awakeCount || hibernatedCount)
            items.push({ separator: true });

        items.push({ $rows: $firstRow, id: 'setLabel', icon: '/images/label.png', label: 'Edit title', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });
        items.push({ separator: true });
        items.push({ $rows: $firstRow, id: 'closeWindow', icon: '/images/close.png', label: 'Close window', callback: onContextMenuItemCloseWindow });

        return items;
    }

    var $pages = $rows.filter(function(i, e) { return $(e).attr('rowtype') == 'page' });
    var $descendants = $rows.find('.ftRowNode');
    var $branches = $rows.add($descendants);
    var $branchesPages = $branches.filter(function(i, e) { return $(e).attr('rowtype') == 'page' });

    var hibernatedCount = $pages.filter(function(i, e) { return $(e).attr('hibernated') == 'true'; }).length;
    var awakeCount = $pages.length - hibernatedCount;

    var hibernatedBranchCount = $branchesPages.filter(function(i, e) { return $(e).attr('hibernated') == 'true'; }).length;
    var awakeBranchCount = $branchesPages.length - hibernatedBranchCount;

    var highlightedCount = $rows.filter(function(i, e) { return $(e).attr('highlighted') == 'true'; }).length;
    var unhighlightedCount = $rows.length - highlightedCount;

    var pinnedCount = $pages.filter(function(i, e) { return $(e).attr('pinned') == 'true'; }).length;
    var unpinnedCount = $pages.length - pinnedCount;

    if (hibernatedCount)
        items.push({ $rows: $pages, id: 'awakenPage', icon: '/images/wake.png', label: 'Wake tab', callback: onContextMenuItemWakePages });

    if (awakeCount)
        items.push({ $rows: $pages, id: 'hibernatePage', icon: '/images/hibernate.png', label: 'Hibernate tab', callback: onContextMenuItemHibernatePages });

    if (hibernatedBranchCount && hibernatedBranchCount != hibernatedCount)
        items.push({ $rows: $branchesPages, id: 'awakenBranch', icon: '/images/wake_branch.png', label: 'Wake branch', callback: onContextMenuItemWakePages });

    if (awakeBranchCount && awakeBranchCount != awakeCount)
        items.push({ $rows: $branchesPages, id: 'hibernateBranch', icon: '/images/hibernate_branch.png', label: 'Hibernate branch', callback: onContextMenuItemHibernatePages });

    if (awakeCount || hibernatedCount) {
        items.push({ separator: true });
    }

    var editLabel;
    if (items.length == 1 && $rows.attr('rowtype') == 'folder') {
        editLabel = 'Edit title';
    }
    else {
        editLabel = 'Set label';
    }

    items.push({ $rows: $rows, id: 'setLabel', icon: '/images/label.png', label: editLabel, callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });

    if (unhighlightedCount)
       items.push({ $rows: $rows, id: 'setHighlight', icon: '/images/highlight.png', label: 'Highlight', callback: onContextMenuItemSetHighlight, preserveSelectionAfter: true });

    if (highlightedCount)
        items.push({ $rows: $rows, id: 'clearHighlight', icon: '/images/clear_highlight.png', label: 'Clear highlight', callback: onContextMenuItemClearHighlight, preserveSelectionAfter: true });

    if (unpinnedCount)
        items.push({ $rows: $pages, id: 'pinPage', icon: '/images/pinned.png', label: 'Pin tab', callback: onContextMenuItemPinPages, preserveSelectionAfter: true });

    if (pinnedCount)
        items.push({ $rows: $pages, id: 'unpinPage', icon: '/images/unpin.png', label: 'Unpin tab', callback: onContextMenuItemUnpinPages, preserveSelectionAfter: true });

    if ($pages.length > 0)
        items.push({ $rows: $rows, id: 'copyUrl', icon: '/images/copy_url.png', label: 'Copy URL', callback: onContextMenuItemCopyURL, preserveSelectionAfter: true });

    if (bg.loggingEnabled)
        items.push({ $rows: $rows, id: 'copyId', icon: '/images/copy_url.png', label: 'Copy ID', callback: onContextMenuItemCopyId, preserveSelectionAfter: true });

    items.push({ separator: true });

    items.push({ $rows: $rows, id: 'moveToNewFolder', icon: '/images/folder.png', label: 'Put in new folder', callback: onContextMenuItemMoveToNewFolder, preserveSelectionAfter: true });

    items.push({ separator: true });

    if (awakeCount)
       items.push({ $rows: $rows, id: 'reloadPage', icon: '/images/reload.png', label: 'Reload tab', callback: onContextMenuItemReload, preserveSelectionAfter: true });

    if ($pages.length > 0) {
        items.push({ $rows: $rows, id: 'closePage', icon: '/images/close.png', label: 'Close tab', callback: onContextMenuItemClosePages });
    }
    else {
        items.push({ $rows: $rows, id: 'closeFolder', icon: '/images/close_branch.png', label: 'Remove folder', callback: onContextMenuItemCloseBranches });
    }

    if ($rows.length != $branches.length || $descendants.length > 0) {
        items.push({ separator: true });
    }

    if ($descendants.length > 0) {
        var $subrows = $descendants.find('.ftRowNode');
        if ($subrows.length > 0) {
            items.push({ $rows: $rows, id: 'flattenBranch', icon: '/images/text_indent_remove.png', label: 'Flatten branch', callback: onContextMenuItemFlattenBranch, preserveSelectionAfter: true });
        }
        items.push({ $rows: $rows, id: 'promoteChildren', icon: '/images/text_indent_promote.png', label: 'Promote children', callback: onContextMenuItemPromoteChildren, preserveSelectionAfter: true });
    }

    if ($rows.length != $branches.length) {
        items.push({ $rows: $rows, id: 'closeBranch', icon: '/images/close_branch.png', label: 'Close branch', callback: onContextMenuItemCloseBranches });
    }

    return items;
}

function onContextMenuItemCloseWindow($rows) {
    closeWindowRow($rows.first());
}

function onContextMenuItemClosePages($rows) {
    $rows.reverse().each(function(i, e) { closeRow($(e)); });
}

function onContextMenuItemCloseBranches($rows) {
    var $children = $rows.find('.ftRowNode');
    var childrenCount = $children.length;
    var threshold = settings.get('multiSelectActionConfirmThreshold');

    if (threshold > 0 && childrenCount >= threshold &&
        !confirm('This action will close ' + childrenCount + ' child row(s). Proceed?'))
    {
        return;
    }

    $rows.add($children).reverse().each(function(i, e) { closeRow($(e)); });
}

function onContextMenuItemWakeWindow($rows) {
    bg.tree.awakenWindow($rows.first().attr('id'));
}

function onContextMenuItemHibernateWindow($rows) {
    bg.tree.hibernateWindow($rows.first().attr('id'));
}

function onContextMenuItemHibernatePages($rows) {
    togglePageRowsHibernated($rows, -1);
}

function onContextMenuItemWakePages($rows) {
    togglePageRowsHibernated($rows, 1);
}

function onContextMenuItemReload($rows) {
    $rows.each(function(i, e) {
        var $e = $(e);
        if ($e.attr('rowtype') != 'page' || $e.attr('hibernated') == 'true') {
            return;
        }
        var chromeId = getChromeId($e);
        chrome.tabs.executeScript(chromeId, { code: "window.location.reload();" });
    });
}

function onContextMenuItemSetLabel($rows) {
    setRowLabels($rows);
}

function onContextMenuItemSetHighlight($rows) {
    $rows.each(function(i, e) { setRowHighlight($(e), 1); });
}

function onContextMenuItemClearHighlight($rows) {
    $rows.each(function(i, e) { setRowHighlight($(e), -1); });
}

function onContextMenuItemMoveToNewFolder($rows) {
    var $branchesChildren = $rows.not('.ftCollapsed').find('.ftRowNode').not($rows).not(function() {
        return $(this).parents('.ftCollapsed').length != 0;
    });

    if ($branchesChildren.length > 0 && confirm('Move entire branches of selected rows into new folder?\nPress Cancel to move just the selected rows.') ) {
        $rows = $rows.add($branchesChildren);
    }

    var newFolderLabel;

    // Guess at a new folder label if a majority of the pages have the same domain excluding subdomain and TLD
    var domains = $rows.map(function(i, e) {
        var $e = $(e);
        var url = $e.attr('url');
        if (url) {
            try {
                return splitUrl(url).domain.replace('www.', '').split('.')[0];
            }
            catch(ex) {
                return undefined;
            }
        }
    });
    var guess = mostFrequent(domains);
    if (guess.count >= domains.length / 2 && guess.val) {
        newFolderLabel = guess.val;
    }
    else {
        newFolderLabel = getMessage('text_NewFolder');
    }

    var label = prompt(getMessage('prompt_setNewFolderName'), newFolderLabel);

    if (!label) {
        // user cancelled or entered no label
        return;
    }

    var folder = new bg.FolderNode(label);

    // TODO implement .addNodeRel
    bg.tree.addNode(folder);
    bg.tree.moveNodeRel(folder, 'before', $rows.first().attr('id'));

    ft.moveRowSetAnimate($rows, 'append', ft.getRow(folder.id), function(moves) {
        onRowsMoved(moves);
    });
}

function onContextMenuItemFlattenBranch($rows) {
    var $subrows = $rows.find('.ftRowNode');
    $rows = $rows.add($subrows);

    flattenRows($rows, 'prepend', false);
}

function onContextMenuItemPromoteChildren($rows) {
    var $children = $rows.children('.ftChildren').children();

    flattenRows($rows.add($children), 'after', true);
}

function flattenRows($rows, relation, keepChildren) {
    for (var i = $rows.length; i >= 0; i--) {
        var $row = $($rows[i]);
        var $parents = $row.parents();
        var $matching = $parents.filter($rows);
        if ($matching.length > 0) {
            var $target = $($matching[$matching.length - 1]);
            bg.tree.moveNodeRel($row.attr('id'), relation, $target.attr('id'), keepChildren);
        }
    }
    ft.formatLineageTitles($rows);
}


function onContextMenuItemUnpinPages($rows) {
    $rows
        .filter(function(i, e) { $e = $(e); return $e.attr('pinned') == 'true'; })
        .each(function(i, e) { setPageRowPinnedState($(e), false); });
}

function onContextMenuItemPinPages($rows) {
    $rows
        .filter(function(i, e) { $e = $(e); return $e.attr('pinned') == 'false'; })
        .each(function(i, e) { setPageRowPinnedState($(e), true); });
}


///////////////////////////////////////////////////////////
// Folder rowtype handlers
///////////////////////////////////////////////////////////

function onFolderRowDoubleClick(evt) {
    var action = settings.get('pages_doubleClickAction');
    handleFolderRowAction(action, evt);
}

function onFolderRowMiddleClick(evt) {
    var action = settings.get('pages_middleClickAction');
    handleFolderRowAction(action, evt);
}

function handleFolderRowAction(action, evt) {
    switch (action) {
        case 'close':
            onFolderRowCloseButton(evt);
            break;
        case 'hibernate':
            var rowChildrenContainer = ft.getChildrenContainer(evt.data.row);
            var firstChild = rowChildrenContainer.children().first();
            var hibernate = firstChild.attr('hibernated') == 'true' ? 1 : -1;
            var targets = rowChildrenContainer.find('.ftRowNode[rowtype=page]');
            togglePageRowsHibernated(targets, hibernate, false);
            break;
        case 'expand':
            evt.data.treeObj.toggleExpandRow(evt.data.row);
            break;
        case 'setlabel':
            setRowLabels(evt.data.row);
            break;
        case 'highlight':
            setRowHighlight(evt.data.row, 0);
            break;
    }
}

function onFolderRowCloseButton(evt) {
    var $rows = evt.data.row;
    var $children = evt.data.row.children('.ftChildren').find('.ftRowNode');
    var childCount = $children.length;

    ft.resetDragDropState(function() {
        if (childCount > 0 && confirm('Also close ' + childCount + ' child row(s)?\nPress Cancel to remove the parent folder only.')) {
            $rows = $rows.add($children);
        }

        $rows.each(function(i, e) {
            closeRow($(e));
        });
    });
}


///////////////////////////////////////////////////////////
// Page rowtype handlers
///////////////////////////////////////////////////////////

function onPageRowClick(evt) {
    var treeObj = evt.data.treeObj;
    var row = evt.data.row;

    if (row.attr('hibernated') == 'true') {
        // row is hibernated, show its tooltip extra quickly
        treeObj.startTooltipTimer(row, evt, 500);
        if (settings.get('wakeHibernatedPagesOnClick') && !evt.data.clickedViaHover && !evt.data.clickedViaScroll) {
            // also wake it up
            bg.tree.awakenPages([row.attr('id')], true);
        }
        return;
    }

    var keepUndockedTop = (bg.sidebarHandler.dockState == 'undocked' && settings.get('keepSidebarOnTop'));

    // If we don't need to keep undocked sidebar on-top, OR if we do but the user changed the focused
    // row...
    if (!keepUndockedTop || bg.tree.focusedTabId != getChromeId(row)) {
        // set visual focus asap in ft
        ft.focusRow(row);

        // actually set Chrome's focused tab
        chrome.tabs.update(getChromeId(row), { active: true }, function(tab) {
            chrome.windows.get(tab.windowId, function(win) {
                // if the tab's hosting window is currently minimized, un-minimize it
                if (win.state == 'minimized') {
                    chrome.windows.update(win.id, { state: 'normal' });
                }

                // if the tab's hosting window is not focused, focus it now
                if (!win.focused) {
                    chrome.windows.update(win.id, { focused: true });
                }

                if (keepUndockedTop) {
                    // when in undocked mode and keepVisible is set, refocus
                    // the sidebar 'popup'
                    chrome.windows.update(bg.sidebarHandler.windowId, { focused: true });
                }
            });
        });
    }

    // trigger page row tooltip to appear after 2s
    treeObj.startTooltipTimer(row, evt, 2000);

}

function onPageRowDoubleClick(evt) {
    var action = settings.get('pages_doubleClickAction');
    handlePageRowAction(action, evt);
}

function onPageRowMiddleClick(evt) {
    var action = settings.get('pages_middleClickAction');
    handlePageRowAction(action, evt);
}

function handlePageRowAction(action, evt) {
    switch (action) {
        case 'close':
            onPageRowCloseButton(evt);
            break;
        case 'hibernate':
            var isFocused = evt.data.row.is(evt.data.treeObj.focusedRow);
            togglePageRowsHibernated(evt.data.row, 0, isFocused);
            break;
        case 'expand':
            evt.data.treeObj.toggleExpandRow(evt.data.row);
            break;
        case 'setlabel':
            setRowLabels(evt.data.row);
            break;
        case 'highlight':
            setRowHighlight(evt.data.row, 0);
            break;
    }
}

function onPageRowCloseButton(evt) {
    var $row = evt.data.row;
    var $rows = $row;

    ft.resetDragDropState(function() {
        if ($row.hasClass('ftCollapsed')) {
            var $children = $row.children('.ftChildren').find('.ftRowNode');
            var childCount = $children.length;

            if (childCount > 0 && confirm('Also close ' + childCount + ' hidden child row(s)?\nPress Cancel to remove the parent row only.')) {
                $rows = $rows.add($children);
            }
        }

        $rows.each(function(i, e) {
            closeRow($(e));
        });
    });
}

function onPageRowHibernateButton(evt) {
    togglePageRowsHibernated(evt.data.row);
}


///////////////////////////////////////////////////////////
// Window rowtype handlers
///////////////////////////////////////////////////////////

function onWindowRowClick(evt) {
    var row = evt.data.row;
    var treeObj = evt.data.treeObj;

    var windowId = getChromeId(row);

    if (windowId) {
        chrome.windows.update(windowId, { focused: true });
        return;
    }

    if (row.attr('hibernated') != 'true') {
        return;
    }

    var childCount = treeObj.getChildrenContainer(row).find('.ftRowNode[rowtype=page][hibernated=true][restorable=true]').length;
    var justRestorables;

    if (childCount == 0) {
        childCount = treeObj.getChildrenContainer(row).find('.ftRowNode[rowtype=page][hibernated=true]').length;
        justRestorables = false;
    }
    else {
        justRestorables = true;
    }

    var msg = getMessage(justRestorables ? 'prompt_restoreWindow' : 'prompt_awakenWindow',
        [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

    if (!confirm(msg)) {
        return;
    }

    bg.tree.awakenWindow(row.attr('id'), function(e) { return e.hibernated && (!justRestorables || e.restorable); });
}

function onWindowRowDoubleClick(evt) {
    var action = settings.get('pages_doubleClickAction');
    handleWindowRowAction(action, evt);
}

function onWindowRowMiddleClick(evt) {
    var action = settings.get('pages_middleClickAction');
    handleWindowRowAction(action, evt);
}

function handleWindowRowAction(action, evt) {
    switch (action) {
        case 'close':
            onWindowRowCloseButton(evt);
            break;
        // case 'hibernate':
        //     onPageRowHibernateButton(evt);
        //     break;
        case 'expand':
            evt.data.treeObj.toggleExpandRow(evt.data.row);
            break;
        case 'setlabel':
            setRowLabels(evt.data.row);
            break;
    }
}

function onWindowShowButtons(row, buttons) {
    var show = [];

    for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        if (button.id == 'close') {
            show.push(button);
            continue;
        }
        if (button.id == 'createTab' && row.attr('hibernated') == 'false' && row.attr('type') == 'normal') {
            show.push(button);
            continue;
        }
    };

    return show;
}

function onWindowRowCloseButton(evt) {
    var treeObj = evt.data.treeObj;
    var row = evt.data.row;

    closeWindowRow(row);
}

function onWindowRowCreateTabButton(evt) {
    var treeObj = evt.data.treeObj;
    var row = evt.data.row;

    createNewTabInWindow(getChromeId(row) || undefined);
}


///////////////////////////////////////////////////////////
// Row action helper functions
///////////////////////////////////////////////////////////

function closeRow($row) {
    var $parent = ft.getParentRowNode($row.parent());
    if ($row.attr('rowtype') != 'page' || $row.attr('hibernated') == 'true' || $row.hasClass('closing')) {
        // row has no corresponding tab so just remove it from the tree
        bg.tree.removeNode($row.attr('id'));
    }
    else {
        $row.addClass('closing'); // "about to close" styling
        bg.tree.removeNode($row.attr('id'));
        setTimeout(function(e) { chrome.tabs.remove(getChromeId($row)); }, 0);
    }
    if ($parent.attr('rowtype') == 'window' && $parent.find('.ftRowNode').length == 0) {
        bg.tree.removeNode($parent.attr('id'), true);
    }
}

function closeWindowRow(row) {
    ft.resetDragDropState(function() {
        var childCount = ft.getChildrenCount(row);

        var threshold = settings.get('multiSelectActionConfirmThreshold');
        if (threshold > 0 && childCount >= threshold) {
            var msg = getMessage('prompt_closeWindow',
                [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);
            if (!confirm(msg)) {
                return;
            }
        }

        var id = row.attr('id');
        var windowId = getChromeId(row);
        var winNode = bg.tree.getNode(id);

        if (row.attr('hibernated') == 'true' || !windowId) {
            bg.tree.removeNode(winNode, true);
            return;
        }

        chrome.windows.get(windowId, function(win) {
            if (win) {
                row.find('.ftRowNode[rowtype=page][hibernated=false]').each(function(i, e) {
                    closeRow($(e));
                });
                chrome.windows.remove(windowId);
            }
        });
    });
}

// hibernateAwakeState values:
//   1: awaken page rows
//   0: toggle hibernate/awake
//  -1: hibernate page rows
function togglePageRowsHibernated($rows, hibernateAwakeState, activateAfterWaking) {
    var $hibernatedRows = $rows.filter(function(i, e) { return $(e).attr('hibernated') == 'true'; });
    var $awakeRows = $rows.not($hibernatedRows);

    hibernateAwakeState = hibernateAwakeState || 0;

    if (hibernateAwakeState >= 0 && $hibernatedRows.length > 0) {
        var ids = $hibernatedRows.map(function(i, e) { return $(e).attr('id'); });
        bg.tree.awakenPages(ids, activateAfterWaking || false);
        return;
    }

    if (hibernateAwakeState == 1 || $awakeRows.length == 0) {
        return;
    }

    var ids = $awakeRows.map(function(i, e) { return parseInt($(e).attr('chromeid')); });
    bg.tree.hibernatePages(ids);
}

function setPageRowPinnedState(row, pinned) {
    bg.tree.updateNode(row.attr('id'), { pinned: pinned });
    if (row.attr('hibernated') == 'true') {
        return;
    }
    chrome.tabs.update(getChromeId(row), { pinned: pinned });
}

function setRowLabels(rows) {
    var label = prompt(getMessage('prompt_setLabel'), $(rows[0]).attr('label'));

    if (label === null) {
        // user cancelled
        return;
    }

    for (var i = 0; i < rows.length; i++) {
        var $row = $(rows[i]);
        bg.tree.updateNode($row.attr('id'), { label: label });
    }
}

// highlightState values:
//   1: set highlight
//   0: toggle highlight
//  -1: clear highlight
function setRowHighlight(row, highlightState) {
    highlightState = highlightState || 0;

    var highlighted = (row.attr('highlighted') == 'true');
    if (highlighted && highlightState <= 0) {
        bg.tree.updateNode(row.attr('id'), { highlighted: false });
        return;
    }

    if (highlightState == -1 || highlighted) {
        return;
    }

    bg.tree.updateNode(row.attr('id'), { highlighted: true });
}

function createNewTabInWindow(windowId, url) {
    if (!url) {
        var mode = settings.get('pages_createNewTabUrl');
        switch (mode) {
            case 'newtab':
                url = 'chrome://newtab/';
                break;
            case 'homepage':
                url = undefined;
                break;
            case 'blank':
                url = 'about:blank';
                break;
            case 'google':
                url = 'https://www.google.com/webhp';
                break;
        }
    }

    chrome.windows.update(windowId, { focused: true }, function(win) {
        chrome.tabs.create({ windowId: windowId, url: url, active: true });
    });
}

