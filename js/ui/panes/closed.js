"use strict";

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var REFORMAT_ALL_ROW_TITLES_1H_INTERVAL_MS = SECOND_MS * 45;    // update row titles <1h old this often
var REFORMAT_ALL_ROW_TITLES_1D_INTERVAL_MS = MINUTE_MS * 45;    // update row titles <1d old this often
var REFORMAT_ALL_ROW_TITLES_OLDER_INTERVAL_MS = HOUR_MS * 12;   // update row titles older than 1d this often


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

$(document).ready(function() {
    initPageTree(bg.recentlyClosedTree, 'closed', createFancyTree);
    initRowTitleUpdater();
});

function initRowTitleUpdater() {
    // formats all row titles whose removedAt value is between minAge and maxAge
    var _update = function(minAge, maxAge) {
        if (ft.filtering) {
            return;
        }

        var now = Date.now();
        ft.formatAllRowTitles(function() {
            var removedAt = parseInt($(this).attr('removedAt'));
            if (!removedAt) {
                return false;
            }
            var age = now - removedAt;
            if (minAge != null && age <= minAge) {
                return false;
            }
            if (maxAge != null && age > maxAge) {
                return false;
            }
            return true;
        });
    };

    // schedule tiered title updating based on age of pages
    setInterval(function() { _update(0, HOUR_MS); }, REFORMAT_ALL_ROW_TITLES_1H_INTERVAL_MS);
    setInterval(function() { _update(HOUR_MS, DAY_MS); }, REFORMAT_ALL_ROW_TITLES_1D_INTERVAL_MS);
    setInterval(function() { _update(DAY_MS, null); }, REFORMAT_ALL_ROW_TITLES_OLDER_INTERVAL_MS);
}

function createFancyTree(treeReplaceSelector, filterBoxReplaceSelector, pageTree) {
    var rowTypes = {
        'page': {
            allowedDropTargets: [],
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onPageRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onIconError: onPageRowIconError,
            onFormatTitle: onPageRowFormatTitle,
            buttons: [
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('closed_pageRowButtonTip_close'), onClick: onPageRowCloseButton }
            ]
        },
        'folder': {
            allowedDropTargets: [],
            onDoubleClick: onFolderRowDoubleClick,
            onMiddleClick: onFolderRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            buttons: [
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_folderRowButtonTip_close'), onClick: onFolderRowCloseButton }
            ]
        },
        'header': {
            allowedDropTargets: [],
            onDoubleClick: onFolderRowDoubleClick,
            onMiddleClick: onFolderRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            buttons: [
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_folderRowButtonTip_close'), onClick: onFolderRowCloseButton }
            ]
        }
    };
    copyObjectSubProps(PageTreeRowTypes, rowTypes, false);


    var clickOnHoverDelayMs;
    if (settings.get('pages_clickOnHoverDelay')) {
        clickOnHoverDelayMs = settings.get('pages_clickOnHoverDelayMs');
    }

    var fancyTree = new FancyTree($(treeReplaceSelector), $(filterBoxReplaceSelector), {
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
    var c = 0;
    pageTree.forEach(function(e, i, d, a, p) {
        var parentId = (p ? p.id : undefined);
        var batchSize = 25;
        var waitBetweenBatches = 250;
        var wait = Math.floor(c / batchSize) * waitBetweenBatches + c % batchSize;
        setTimeout(function() { addPageTreeNodeToFancyTree(fancyTree, e, parentId); }, wait);
        c++;
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
                type: node.type
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
                removedAt: node.removedAt
            },
            node.collapsed);
    }
    else if (node instanceof bg.FolderNode) {
        row = fancyTree.getNewRowElem('folder', node.id, '/images/folder.png', node.label, 'Folder', {}, node.collapsed);
    }
    else if (node instanceof bg.HeaderNode) {
        row = fancyTree.getNewRowElem('header', node.id, '/images/folder.png', node.label, 'Header', {}, node.collapsed);
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
    bg.recentlyClosedTree.updateNode(evt.data.row.attr('id'), { collapsed: !(evt.data.expanded) });
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

    var $pages = $rows.filter(function(i, e) { return $(e).attr('rowtype') == 'page' });
    var $descendants = $rows.find('.ftRowNode');
    var $branches = $rows.add($descendants);
    var $branchesPages = $branches.filter(function(i, e) { return $(e).attr('rowtype') == 'page' });

    items.push({ $rows: $rows, id: 'restoreRow', icon: '/images/wake.png', label: 'Restore selected', callback: onContextMenuItemRestoreRows });

    items.push({ separator: true });

    if ($pages.length > 0)
        items.push({ $rows: $rows, id: 'copyUrl', icon: '/images/copy_url.png', label: 'Copy URL', callback: onContextMenuItemCopyURL, preserveSelectionAfter: true });

    if (bg.loggingEnabled)
        items.push({ $rows: $rows, id: 'copyId', icon: '/images/copy_url.png', label: 'Copy ID', callback: onContextMenuItemCopyId, preserveSelectionAfter: true });


    items.push({ separator: true });

    items.push({ $rows: $rows, id: 'removeRow', icon: '/images/close.png', label: 'Permanently remove selected', callback: onContextMenuItemRemoveRows });

    return items;
}

function onContextMenuItemRestoreRows($rows) {
    $rows.each(function(i, e) {
        restoreRow($(e));
    });
    focusPagesPaneAfterRestoringPage();
}

function onContextMenuItemRemoveRows($rows) {
    $rows.each(function(i, e) {
        removeRow($(e));
    });
}

function onContextMenuItemCloseWindow($rows) {
    closeWindowRow($rows.first());
}

function onContextMenuItemClosePages($rows) {
    $rows.each(function(i, e) { removeRow($(e)); });
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

    $rows.add($children).each(function(i, e) { removeRow($(e)); });
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
            removeRow($(e));
        });
    });
}


///////////////////////////////////////////////////////////
// Page rowtype handlers
///////////////////////////////////////////////////////////

function onPageRowClick(evt) {
    return;
}

function onPageRowDoubleClick(evt) {
    restoreRow(evt.data.row);
    focusPagesPaneAfterRestoringPage();
}

function focusPagesPaneAfterRestoringPage() {
    if (settings.get('focusPagesPaneAfterRestoringPage') || true) {
        try {
            // focus pages pane via iframe-parent
            window.parent.manager.showSidebarPane('pages');
        }
        catch (ex) {
            // we ignore errors which occur when pages pane
            // is currently disnabled by user
        }
    }
}

function restoreRow($row) {
    bg.restoreNode($row.attr('id'));
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
            removeRow($(e));
        });
    });
}

function onPageRowHibernateButton(evt) {
    togglePageRowsHibernated(evt.data.row);
}

function onPageRowFormatTitle(row, itemTextElem) {
    var label = row.attr('label');
    var text = row.attr('text');

    var textAffix = '';

    var removedAt = row.attr('removedAt');
    if (removedAt) {
        textAffix = getTimeDeltaAbbreviated(removedAt, Date.now(), false) || '<1m';
    }

    if (loggingEnabled) {
        label = row.attr('id').slice(0, 5) + (label ? ': ' : '') + label;
    }

    if (settings.get('pages_trimPageTitlePrefixes') && row.attr('url').indexOf(text) == -1) {
        text = getTrimmedPageTitle(row);
    }

    itemTextElem.children('.ftItemTitle').text(text);
    itemTextElem.children('.ftItemLabel').html(label + (text && label ? ': ' : ''));

    if (row.hasClass('ftCollapsed')) {
        var childCount = row.children('.ftChildren').find('.ftRowNode').length;
        if (childCount > 0) {
            textAffix = '(' + childCount + ')' + (textAffix == '' ? '' : ' ') + textAffix;
        }
    }

    var itemTextAffix = row.children('.ftItemRow').find('.ftItemTextAffix');
    if (textAffix) {
        itemTextAffix.html(textAffix);
        var buttonsShowing = row.children('.ftItemRow').find('.ftButtons').is(':visible');
        if (!buttonsShowing) {
            itemTextAffix.show();
        }
    }
    else {
        itemTextAffix.html('').hide();
    }

    var existingPin = itemTextElem.parent().children('.pinned');
    if (row.attr('pinned') == 'true') {
        if (existingPin.length == 0) {
            var newPin = $('<img/>', { class: 'pinned', src: '/images/pinned.png' });
            itemTextElem.before(newPin);
        }
    }
    else {
        if (existingPin.length > 0) {
            existingPin.remove();
        }
    }
}


///////////////////////////////////////////////////////////
// Row action helper functions
///////////////////////////////////////////////////////////

function removeRow($row) {
    bg.recentlyClosedTree.removeNode($row.attr('id'));
    bg.recentlyClosedTree.removeZeroChildTopNodes();
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
                chrome.windows.remove(windowId);
                setTimeout(function() {
                    var checkWinNode = bg.tree.getNode(row.attr('id'));
                    if (checkWinNode) {
                        log('Removing window node from tree', checkWinNode.id);
                        bg.tree.removeNode(checkWinNode, true);
                        return;
                    }
                    log('Window node already removed from tree', id);
                }, 100);
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

    var ids = $awakeRows.map(function(i, e) { return $(e).attr('id'); });
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
