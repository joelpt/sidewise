///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var PAGETREE_FANCYTREE_UPDATE_DETAILS_MAP = {
    id: 'id',
    url: 'url',
    favicon: 'icon',
    label: 'label',
    title: 'text',
    status: 'status',
    pinned: 'pinned',
    unread: 'unread',
    hibernated: 'hibernated',
    restorable: 'restorable',
    highlighted: 'highlighted',
    mediaState: 'media-state',
    mediaTime: 'media-time'
};


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var ft;
initSidebarPane();


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

$(document).ready(function() {

    initDebugBar();

    ft = initTree('#treePlaceholder', '#filterBoxPlaceholder', bg.tree);

    var binder = new SidebarPaneFancyTreeBinder(ft, bg);
    binder.bind();

    bg.sidebarHandler.registerSidebarPane('pages', window);
    bg.focusCurrentTabInPageTree(true);

    if (!settings.get('createdNewTabViaDoubleClick')) {
        $('.ftBottomPadding').text('Double-click to create a new tab');
    }

    $(document).on('dblclick', 'body, .ftBottomPadding', onBodyDoubleClick);
});

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
    bg.tree.clear();
    bg.injectContentScriptInExistingTabs('content_script.js');
    bg.populatePages();
    setTimeout(function() {
        location.reload()
    }, 500);
}

function initTree(treeReplaceSelector, filterBoxReplaceSelector, pageTree) {
    var rowTypes = {
        'page': {
            allowAtTopLevel: false,
            allowAtChildLevel: true,
            autofocusOnClick: true,
            allowClickOnHover: true,
            allowClickOnScroll: true,
            permitAutoSelectChildren: true,
            alwaysMoveChildren: false,
            multiselectable: true,
            allowedDropTargets: ['window', 'page', 'folder'],
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onPageRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onIconError: onPageRowIconError,
            onFormatTitle: onPageRowFormatTitle,
            onFormatTooltip: onPageRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            filterByExtraParams: ['url'],
            tooltipMaxWidthPercent: 0.95,
            buttons: [
                {id: 'hibernate', icon: '/images/hibernate_wake.png', tooltip: getMessage('pages_pageRowButtonTip_hibernateWake'), onClick: onPageRowHibernateButton },
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_pageRowButtonTip_close'), onClick: onPageRowCloseButton }
            ]
        },
        'folder': {
            allowAtTopLevel: false,
            allowAtChildLevel: true,
            autofocusOnClick: true,
            allowClickOnHover: false,
            allowClickOnScroll: false,
            permitAutoSelectChildren: true,
            alwaysMoveChildren: false,
            multiselectable: true,
            allowedDropTargets: ['window', 'page', 'folder'],
            // onClick: onPageRowClick,
            onDoubleClick: onFolderRowDoubleClick,
            onMiddleClick: onFolderRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            // onIconError: onPageRowIconError,
            onFormatTitle: onFolderRowFormatTitle,
            onFormatTooltip: onFolderRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthPercent: 0.95,
            buttons: [
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_folderRowButtonTip_close'), onClick: onFolderRowCloseButton }
            ]
        },
        'window': {
            allowAtTopLevel: true,
            allowAtChildLevel: false,
            autofocusOnClick: false,
            allowClickOnHover: false,
            allowClickOnScroll: false,
            permitAutoSelectChildren: false,
            alwaysMoveChildren: true,
            multiselectable: false,
            allowedDropTargets: ['ROOT', 'window'],
            onClick: onWindowRowClick,
            onDoubleClick: onWindowRowDoubleClick,
            onMiddleClick: onWindowRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onFormatTitle: onWindowRowFormatTitle,
            onFormatTooltip: onWindowRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthPercent: 0.95,
            buttons: [
                {id: 'createTab', icon: '/images/create_tab.png', tooltip: getMessage('pages_windowRowButtonTip_createTab'), onClick: onWindowRowCreateTabButton },
                {id: 'close', icon: '/images/close.png', tooltip: getMessage('pages_windowRowButtonTip_close'), onClick: onWindowRowCloseButton }
            ],
            onShowButtons: onWindowShowButtons
        }
    };

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

    populateFancyTreeFromPageTree(fancyTree, pageTree);

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
                incognito: node.incognito
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
            var $win = ft.getRow('w' + args.windowId);
            var $kids = $('#p' + args.tabIds.join(',#p'));
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

function onResizeTooltip(evt) {
    // Manually set a fixed width for the tooltip's text content region; without this
    // the CSS 'word-wrap: break-word' has no effect
    evt.data.tooltip.find('td:nth-child(2) > div').width(evt.data.width - 47);
}

function onRowExpanderClick(evt) {
    bg.tree.updateNode(evt.data.row.attr('id'), { collapsed: !(evt.data.expanded) });
}

function onRowsMoved(moves) {
    log(moves);
    var windowToWindowMoves = {};
    var windowToWindowMovesCount = 0;
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
                var $moveTopParent = $to.parents('.ftRowNode').last();
                var $oldTopParent = move.$oldAncestors.last();

                // if we are moving row to a branch with a different non hibernated window row at the top ...
                if ($moveTopParent.attr('rowtype') == 'window'
                    && $moveTopParent.attr('hibernated') != 'true'
                    && !($moveTopParent.is($oldTopParent)))
                {
                    // this works, but has the gray-window problem which we should be able to fix by building out winToWinMoves array again
                    // and using this here technique for doing the moves, but doing the temp-tab create-and-destroy crap in addition as needed
                    // (and possibly activating moved tabs after always, too)
                    //
                    var movingTabId = getRowNumericId($row);
                    var fromWindowId = getRowNumericId($oldTopParent);
                    var toWindowId = getRowNumericId($moveTopParent);
                    var node = bg.tree.getNode(rowId);
                    node.windowId = toWindowId;

                    if (windowToWindowMoves[fromWindowId] === undefined) {
                        windowToWindowMoves[fromWindowId] = [];
                        windowToWindowMovesCount++;
                    }

                    windowToWindowMoves[fromWindowId].push({ node: node, movingTabId: movingTabId, toWindowId: toWindowId });
                }
            }
        });
    }

    if (windowToWindowMovesCount > 0) {
        // perform window-to-window moves
        bg.tree.rebuildTabIndex();
        for (var fromWindowId in windowToWindowMoves) {
            if (!windowToWindowMoves.hasOwnProperty(fromWindowId)) {
                continue;
            }
            moveTabsBetweenWindows(parseInt(fromWindowId), windowToWindowMoves[fromWindowId]);
        }
    }
    else {
        bg.tree.conformAllChromeTabIndexes(true);
    }
}

function moveTabsBetweenWindows(fromWindowId, moves) {
    chrome.tabs.query({ windowId: fromWindowId }, function(tabs) {
        if (tabs.length > moves.length) {    // from-window will still have at least 1 tab after the moves are done
            var onCompleteFn = function() {
                setTimeout(function() {
                    bg.tree.rebuildPageNodeWindowIds(function() {
                        bg.tree.conformAllChromeTabIndexes(true);
                    });
                }, 500);
            };
            for (var i in moves) {
                var move = moves[i];
                var toPosition = bg.tree.getTabIndex(move.node) || 0;
                log('win to win move', 'moving', move.node.id, 'to', move.toWindowId, 'index', toPosition);
                moveTabToWindow(move.movingTabId, move.toWindowId, toPosition,
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
                    });
                }, 500);
            };
            for (var i in moves) {
                var move = moves[i];
                var toPosition = bg.tree.getTabIndex(move.node) || 0;
                log('win to win move + last-tab hack', 'moving', move.node.id, 'to', move.toWindowId, 'index', toPosition);
                moveTabToWindow(move.movingTabId, move.toWindowId, toPosition,
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
                var page = bg.tree.getPage(movingTabId);
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
    if ($fromRows.is('[rowtype=window]')) {
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

        items.push({ $rows: $firstRow, id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });
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

    items.push({ separator: true });

    items.push({ $rows: $rows, id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });

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

    items.push({ separator: true });

    items.push({ $rows: $rows, id: 'moveToNewFolder', icon: '/images/folder.png', label: 'Put in new folder', callback: onContextMenuItemMoveToNewFolder, preserveSelectionAfter: true });

    if ($descendants.length > 0) {
        var $subrows = $descendants.find('.ftRowNode');
        if ($subrows.length > 0) {
            items.push({ $rows: $rows, id: 'flattenBranch', icon: '/images/text_indent_remove.png', label: 'Flatten children', callback: onContextMenuItemFlattenBranch, preserveSelectionAfter: true });
        }
        else {
        }
        items.push({ $rows: $rows, id: 'promoteChildren', icon: '/images/text_indent_promote.png', label: 'Flatten branch', callback: onContextMenuItemPromoteChildren, preserveSelectionAfter: true });
    }

    items.push({ separator: true });

    if (awakeCount)
       items.push({ $rows: $rows, id: 'reloadPage', icon: '/images/reload.png', label: 'Reload tab', callback: onContextMenuItemReload, preserveSelectionAfter: true });

    if ($pages.length > 0) {
        items.push({ $rows: $rows, id: 'closePage', icon: '/images/close.png', label: 'Close tab', callback: onContextMenuItemClosePages });
        if ($rows.length != $branches.length) {
            items.push({ separator: true });
            items.push({ $rows: $rows, id: 'closeBranch', icon: '/images/close_branch.png', label: 'Close branch', callback: onContextMenuItemCloseBranches });
        }
    }
    else {
        items.push({ $rows: $rows, id: 'closeFolder', icon: '/images/close_branch.png', label: 'Remove folder', callback: onContextMenuItemCloseBranches });
    }

    return items;
}

function onContextMenuItemCloseWindow($rows) {
    closeWindowRow($rows.first());
}

function onContextMenuItemClosePages($rows) {
    $rows.each(function(i, e) { closeRow($(e)); });
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

    $rows.add($children).each(function(i, e) { closeRow($(e)); });
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
        var chromeId = getRowNumericId($e);
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

function onContextMenuItemCopyURL($rows) {
    var urls = $rows.map(function(i, e) {
        var $e = $(e);
        if ($e.attr('rowtype') != 'page') {
            return;
        }
        return $(e).attr('url');
    });

    copyTextToClipboard(urls.toArray().join('\n') + '\n');

    ft.resetDragDropState(function() {
        alert(urls.length + ' URL(s) copied to clipboard.');
    });
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

    var threshold = settings.get('multiSelectActionConfirmThreshold');
    if (threshold > 0 && $subrows.length >= threshold && !confirm('Flatten ' + $subrows.length + ' rows?') ) {
        return;
    }

    flattenRows($rows, 'prepend');
}

function onContextMenuItemPromoteChildren($rows) {
    var $subrows = $rows.find('.ftRowNode');
    $rows = $rows.add($subrows);

    var threshold = settings.get('multiSelectActionConfirmThreshold');
    if (threshold > 0 && $subrows.length >= threshold && !confirm('Promote ' + $subrows.length + ' rows to parent tree depth?') ) {
        return;
    }

    flattenRows($rows, 'after');
}

function flattenRows($rows, relation) {
    for (var i = $rows.length; i >= 0; i--) {
        var $row = $($rows[i]);
        var $parents = $row.parents();
        var $matching = $parents.filter($rows);
        if ($matching.length > 0) {
            var $target = $($matching[$matching.length - 1]);
            bg.tree.moveNodeRel($row.attr('id'), relation, $target.attr('id'));
        }
    }
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

function onFolderRowFormatTitle(row, itemTextElem) {
    var label = row.attr('label');
    var childCount = row.children('.ftChildren').find('.ftRowNode').length;

    var textAffix;
    if (childCount > 0) {
        textAffix = '&nbsp;(' + childCount + ')';
    }
    else {
        textAffix = '';
    }

    if (loggingEnabled) {
        label = row.attr('id').slice(0, 5) + (label ? ': ' : '') + label;
    }

    itemTextElem.children('.ftItemLabel').html(label);
    itemTextElem.children('.ftItemTitle').html(textAffix).show();
}

function onFolderRowFormatTooltip(evt) {
    var childCount = evt.data.treeObj.getChildrenCount(evt.data.row);
    var icon = evt.data.icon;
    var label = evt.data.label;
    var body = childCount + ' '  + (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'));
    return getBigTooltipContent(label, icon, body);
}


///////////////////////////////////////////////////////////
// Page rowtype handlers
///////////////////////////////////////////////////////////

function onPageRowClick(evt) {
    log(evt);
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

    // actually set Chrome's focused tab
    chrome.tabs.update(getRowNumericId(row), { active: true }, function(tab) {
        // if the tab's hosting window is currently minimized, un-minimize it
        chrome.windows.get(tab.windowId, function(win) {
            if (win.state == 'minimized') {
                chrome.windows.update(win.id, { state: 'normal' });
            }
        });
    });

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

function onPageRowFormatTitle(row, itemTextElem) {
    var label = row.attr('label');
    var text = row.attr('text');

    var textAffix = '';

    if (settings.get('pages_showMediaPlayTime')) {
        var mediaState = row.attr('media-state');
        if (mediaState == 'playing') {
            var mediaTime = parseInt(row.attr('media-time'));
            if (mediaTime > 0) {
                textAffix = formatSecondsAsHMS(mediaTime);
            }
        }
    }

    if (row.hasClass('ftCollapsed')) {
        var childCount = row.children('.ftChildren').find('.ftRowNode').length;
        if (childCount > 0) {
            textAffix += (textAffix == '' ? '' : ' ') + '(' + childCount + ')';
        }
    }

    if (loggingEnabled) {
        label = row.attr('id').slice(0, 5) + (label ? ': ' : '') + label;
    }

    itemTextElem.children('.ftItemTitle').text(text);
    itemTextElem.children('.ftItemLabel').html(label + (text && label ? ': ' : ''));

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

function onPageRowFormatTooltip(evt) {
    var row = evt.data.row;
    var icon = evt.data.icon;
    var url = row.attr('url');
    var text = evt.data.text;

    if (url == text) {
        text = '';
    }

    var headerPrefix;
    if (row.attr('hibernated') == 'true') {
        headerPrefix = '<div class="hibernatedHint">' + getMessage('pages_hibernatedHint') + '</div>';
    }

    if (loggingEnabled) {
        var page = bg.tree.getNode(row.attr('id'));
        url += '<br/><br/>Id: ' + page.id
            + '<br/>History length: ' + page.historylength
            + '<br/>Referrer: ' + (page.referrer || "''")
            + '<br/>WinId/index: ' + page.windowId + '/' + page.index;
    }

    var elem = getBigTooltipContent(text, icon, url, headerPrefix);

    var onIconError = evt.data.rowTypeParams.onIconError;
    if (onIconError) {
        elem.find('.ftBigTipImage').error(evt.data, onIconError);
    }

    return elem;

}

function onPageRowIconError(evt) {
    setTimeout(function() {
        evt.target.src = getChromeFavIconUrl(evt.data.row.attr('url'));
    }, 2000);
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

    var windowId = getRowNumericId(row);

    if (windowId) {
        chrome.windows.update(windowId, { focused: true });
        return;
    }

    if (row.attr('hibernated') != 'true') {
        return;
    }

    var childCount = treeObj.getChildrenContainer(row).find('.ftRowNode[rowtype=page][restorable=true]').length;

    var msg = getMessage('prompt_awakenWindow',
        [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

    if (!confirm(msg)) {
        return;
    }

    bg.tree.awakenWindow(row.attr('id'), function(e) { return e.restorable; });
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

    createNewTabInWindow(getRowNumericId(row) || undefined);
}

function onWindowRowFormatTitle(row, itemTextElem) {
    var label = row.attr('label');
    var text = row.attr('text');
    var childCount = row.children('.ftChildren').find('.ftRowNode[rowtype=page]').length;

    if (!text) {
        text = getMessage('text_Window');
    }

    text = (label ? '' : text)
        + ' (' + childCount + ' '
        + getMessage(childCount == 1 ? 'text_page' : 'text_pages') + ')';

    if (loggingEnabled) {
        label = row.attr('id').slice(0, 5) + ': ' + label;
    }

    itemTextElem.children('.ftItemTitle').text(text);
    itemTextElem.children('.ftItemLabel').text(label);
}

function onWindowRowFormatTooltip(evt) {
    var incognito = (evt.data.row.attr('incognito') == 'true');
    var popup = (evt.data.row.attr('type') == 'popup');
    var childCount = evt.data.treeObj.getChildrenCount(evt.data.row);

    var img;
    if (incognito) {
        img = '/images/incognito-32.png';
    }
    else if (popup) {
        img ='/images/tab-single-32.png';
    }
    else {
        img = '/images/tab-stack-32.png';
    }

    var body = childCount + ' '
        + (incognito ? 'incognito' + ' ' : '')
        + (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'));
    return getBigTooltipContent(evt.data.label, img, body);
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
        chrome.tabs.remove(getRowNumericId($row));
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
        var windowId = getRowNumericId(row);
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
    chrome.tabs.update(getRowNumericId(row), { pinned: pinned });
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


///////////////////////////////////////////////////////////
// Miscellaneous helper functions
///////////////////////////////////////////////////////////

function getBigTooltipContent(header, icon, body, headerPrefix) {
    var elem = $('<div class="ftBigTip"/>');
    var table = $('<table/>');
    var tr = $('<tr/>');

    var img = $('<img class="ftBigTipImage">').attr('src', icon);

    tr.append($('<td>').append(img));

    var td = $('<td>');
    tr.append(td);

    if (header) {
        var headerElem = $('<div class="ftBigTipHeader">').text(header);
        td.append(headerElem);
    }

    if (headerPrefix) {
        td.prepend(headerPrefix);
    }

    if (body) {
        var bodyElem = $('<div class="ftBigTipBody">').html(body);
        td.append(bodyElem);

        if (loggingEnabled) {
            bodyElem.css('max-height', '999em');
        }
    }

    table.append(tr);
    elem.append(table);
    return elem;
}

function getRowNumericId(pageRow) {
    return parseInt(pageRow.attr('id').slice(1));
}
