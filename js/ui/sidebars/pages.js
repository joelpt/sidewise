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
    highlighted: 'highlighted'
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
    bg.focusCurrentTabInPageTree();
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
                {icon: '/images/hibernate_wake.png', tooltip: getMessage('pages_pageRowButtonTip_hibernateWake'), onClick: onPageRowHibernateButton },
                {icon: '/images/close.png', tooltip: getMessage('pages_pageRowButtonTip_close'), onClick: onPageRowCloseButton }
            ]
        },
        'folder': {
            allowAtTopLevel: false,
            allowAtChildLevel: true,
            autofocusOnClick: true,
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
            // onFormatTooltip: onPageRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthPercent: 0.95,
            buttons: [
                {icon: '/images/close.png', tooltip: getMessage('pages_folderRowButtonTip_close'), onClick: onFolderRowCloseButton }
            ]
        },
        'window': {
            allowAtTopLevel: true,
            allowAtChildLevel: false,
            autofocusOnClick: false,
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
                {icon: '/images/close.png', tooltip: getMessage('pages_windowRowButtonTip_close'), onClick: onWindowRowCloseButton }
            ]
        }
    };

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
        useAdvancedFiltering: settings.get('useAdvancedTreeFiltering')
    });

    $('.ftFilterStatus').attr('title', getMessage('pages_omniboxTip'));
    $(document)
        .on('mouseup', '.pinned', onRowPinMouseUp)
        .on('mouseleave', '.pinned', onRowPinMouseLeave);

    populateFancyTreeFromPageTree(fancyTree, pageTree);

    return fancyTree;
}

function populateFancyTreeFromPageTree(fancyTree, pageTree) {
    pageTree.forEach(function(e, i, d, a, p) {
        var parentId = (p ? p.id : undefined);
        addPageTreeNodeToFancyTree(fancyTree, e, parentId);
    });
}

function addPageTreeNodeToFancyTree(fancyTree, node, parentId)
{
    var row;
    if (node instanceof bg.WindowNode) {
        var img = (node.incognito ? '/images/incognito-16.png' : '/images/tab-stack-16.png');
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

    fancyTree.addRow(row, parentId);

    setTimeout(function() {
        fancyTree.updateRow.call(fancyTree, row, { icon: node.favicon });
    }, 10);
}


///////////////////////////////////////////////////////////
// Top-level event handlers
///////////////////////////////////////////////////////////

function PageTreeCallbackProxyListener(op, args)
{
    if (!window) {
        // ignore proxy callback events when our hosting window has already been destroyed;
        // this can happen when e.g. the background page destroys the sidebar and sends
        // a proxy callback in quick succession
        return;
    }

    log(op, args);
    switch (op)
    {
        case 'add':
            addPageTreeNodeToFancyTree(ft, args.element, args.parentId);
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
            ft.updateRow(args.id, details);
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
    }
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
    // console.log('MOVES', moves);
    var windowToWindowMoves = {};
    var windowToWindowMovesCount = 0;
    for (var i = 0; i < moves.length; i++) {
        var move = moves[i];
        var $row = move.$row;
        var $to = move.$to;
        var rowId = $row.attr('id');
        var toId = $to ? $to.attr('id') : undefined;
        // console.log('---- move:', rowId, move.relation, toId, move.keepChildren ? 'KEEP CHILDREN' : '');

        if (move.relation != 'nomove') {
            // record the move in bg.tree
            bg.tree.moveNodeRel(rowId, move.relation, toId, move.keepChildren, true);
        }

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
                // ... accumulate the list of window-to-window moves we'll perform after this loop
                var fromWindowId = getRowNumericId($oldTopParent);
                var toWindowId = getRowNumericId($moveTopParent);
                var movingTabId = getRowNumericId($row);
                if (windowToWindowMoves[fromWindowId] === undefined) {
                    windowToWindowMoves[fromWindowId] = [];
                    windowToWindowMovesCount++;
                }
                windowToWindowMoves[fromWindowId].push([toWindowId, movingTabId]);
                continue;
            }
        }
    }
    if (windowToWindowMovesCount > 0) {
        // perform window-to-window moves
        for (var fromWindowId in windowToWindowMoves) {
            if (!windowToWindowMoves.hasOwnProperty(fromWindowId)) {
                continue;
            }
            moveTabsBetweenWindows(parseInt(fromWindowId), windowToWindowMoves[fromWindowId]);
        }
    }
}

function moveTabsBetweenWindows(fromWindowId, moves) {
    chrome.tabs.query({ windowId: fromWindowId }, function(fromWinTabs) {
        if (fromWinTabs.length > moves.length) {
            var afterFn = function() { };
            for (var i in moves) {
                var toWindowId = moves[i][0];
                var movingTabId = moves[i][1];
                moveTabToWindow(movingTabId, toWindowId, afterFn);
            }
            return;
        }

        // This is just a hack around a Chrome bug.
        // We have to create a temporary about:blank tab in the moving-from window in the case where the from-window will
        // get removed by moving its last tab to another window; if we do not do this, the tabs that get moved to the new
        // window show up in the new window with no actual content (Chrome just shows an empty gray window for the tab/s).
        chrome.tabs.create({ url: 'about:blank', windowId: fromWindowId }, function(tempTab) {
            for (var i in moves) {
                var toWindowId = moves[i][0];
                var movingTabId = moves[i][1];
                var afterFn;
                console.log(i, moves.length - 1);
                if (i == moves.length - 1) {
                    afterFn = function() { chrome.tabs.remove(tempTab.id); };
                }
                else {
                    afterFn = function() { };
                }
                moveTabToWindow(movingTabId, toWindowId, afterFn);
            }
        });
    });
}

function moveTabToWindow(movingTabId, toWindowId, afterFn) {
    chrome.tabs.move(movingTabId, { windowId: toWindowId, index: -1 }, function() {
        chrome.tabs.update(movingTabId, { active: true }, afterFn);
    });
}

function allowDropHandler($fromRows, relation, $toRow) {
    // console.log('from', $fromRows, relation, 'to', $toRow);

    // allow window nodes to be dropped anywhere they normally can be
    if ($fromRows.is('[rowtype=window]')) {
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
            items.push({ $rows: $firstRow, id: 'awakenWindow', icon: '/images/wake_branch.png', label: 'Wake all tabs in window', callback: onContextMenuItemWakeWindow });

        if (awakeCount)
            items.push({ $rows: $firstRow, id: 'hibernateWindow', icon: '/images/hibernate_branch.png', label: 'Hibernate all tabs in window', callback: onContextMenuItemHibernateWindow });

        if (awakeCount || hibernatedCount)
            items.push({ separator: true });

        items.push({ $rows: $firstRow, id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });
        items.push({ separator: true });
        items.push({ $rows: $firstRow, id: 'closeWindow', icon: '/images/close.png', label: 'Close window', callback: onContextMenuItemCloseWindow });

        return items;
    }

    var $pages = $rows.filter(function(i, e) { return $(e).attr('rowtype') == 'page' });
    var $branches = $rows.add($rows.find('.ftRowNode'));
    var $branchesPages = $branches.filter(function(i, e) { return $(e).attr('rowtype') == 'page' });

    var hibernatedCount = $pages.filter(function(i, e) { return $(e).attr('hibernated') == 'true'; }).length;
    var awakeCount = $pages.length - hibernatedCount;

    var hibernatedBranchCount = $branchesPages.filter(function(i, e) { return $(e).attr('hibernated') == 'true'; }).length;
    var awakeBranchCount = $branchesPages.length - hibernatedBranchCount;

    var highlightedCount = $rows.filter(function(i, e) { return $(e).attr('highlighted') == 'true'; }).length;
    var unhighlightedCount = $rows.length - highlightedCount;

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

    if ($pages.length > 0)
        items.push({ $rows: $rows, id: 'copyUrl', icon: '/images/copy_url.png', label: 'Copy URL', callback: onContextMenuItemCopyURL, preserveSelectionAfter: true });

    items.push({ separator: true });

    items.push({ $rows: $rows, id: 'moveToNewFolder', icon: '/images/folder.png', label: 'Put in new folder', callback: onContextMenuItemMoveToNewFolder, preserveSelectionAfter: true });

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
    if (threshold > 0 && childrenCount >= threshold
        && !confirm('This action will close ' + childrenCount + ' child row(s). Proceed?'))
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
    $rows.each(function(i, e) { togglePageRowHibernated($(e), -1); });
}

function onContextMenuItemWakePages($rows) {
    $rows.each(function(i, e) { togglePageRowHibernated($(e), 1); });
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

    alert(urls.length + ' URL(s) copied to clipboard.');
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
    bg.tree.moveNodeRel(folder, 'before', $rows.first().attr('id'), false, false);

    ft.moveRowSetAnimate($rows, 'append', ft.getRow(folder.id), function(moves) {
        onRowsMoved(moves);
    });
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
        // case 'hibernate':
        //     var isFocused = evt.data.row.is(evt.data.treeObj.focusedRow);
        //     togglePageRowHibernated(evt.data.row, 0, isFocused);
        //     break;
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

    if (childCount > 0 && confirm('Also close ' + childCount + ' child row(s)?\nPress Cancel to remove the parent folder only.')) {
        $rows = $rows.add($children);
    }

    $rows.each(function(i, e) {
        closeRow($(e));
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

        if (settings.get('wakeHibernatedPagesOnClick')) {
            // also wake it up
            bg.tree.awakenPage(row.attr('id'), true);
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
            togglePageRowHibernated(evt.data.row, 0, isFocused);
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

    if (row.hasClass('ftCollapsed')) {
        var childCount = row.children('.ftChildren').find('.ftRowNode').length;
        if (childCount > 0) {
            textAffix = '(' + childCount + ')';
        }
    }

    if (loggingEnabled) {
        label = row.attr('id').slice(0, 5) + (label ? ': ' : '') + label;
    }

    itemTextElem.children('.ftItemTitle').html(text);
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
            var newPin = $('<img/>', { class: 'pinned', src: '/images/pinned.png', title: getMessage('pages_pageRowButtonTip_unpin') });
            itemTextElem.before(newPin);
            newPin.tooltip({ tip: '#ftSimpleTip', predelay: 400, position: 'top right', offset: [10, 10],
                onShow: function(evt) {
                    // prevent tooltip from showing whenever permitTooltipHandler() returns false
                    if (ft.permitTooltipHandler && !ft.permitTooltipHandler()) {
                        this.hide();
                    }
                    ft.hideTooltip(true);
                }
            });
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
    if (row.attr('hibernated') == 'true') {
        text = '<div class="hibernatedHint">' + getMessage('pages_hibernatedHint') + '</div>' + text;
    }

    if (loggingEnabled) {
        var page = bg.tree.getNode(row.attr('id'));
        url += '<br/><br/>Id: ' + page.id
            + '<br/>History length: ' + page.historylength
            + '<br/>Referrer: ' + (page.referrer || "''");
    }

    var elem = getBigTooltipContent(text, icon, url);

    var onIconError = evt.data.rowTypeParams.onIconError;
    if (onIconError) {
        elem.find('.ftBigTipImage').error(evt.data, onIconError);
    }

    return elem;

}

function onPageRowIconError(evt) {
    evt.target.src = getChromeFavIconUrl(evt.data.row.attr('url'));
}

function onPageRowCloseButton(evt) {
    var $row = evt.data.row;
    var $rows = $row;

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
}

function onPageRowHibernateButton(evt) {
    togglePageRowHibernated(evt.data.row);
}

function onRowPinMouseUp(evt) {
    var row = $(this).closest('.ftRowNode');
    setPageRowPinnedState(row, false);
    evt.stopPropagation();
}

function onRowPinMouseLeave(evt) {
    var row = $(this).closest('.ftItemRow');
    row.trigger('mouseenter');
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

    var childCount = treeObj.getChildrenCount(row);

    var msg = getMessage('prompt_awakenWindow',
        [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

    if (!confirm(msg)) {
        return;
    }

    setTimeout(function() { bg.tree.awakenWindow(row.attr('id')); }, 400);
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

function onWindowRowCloseButton(evt) {
    var treeObj = evt.data.treeObj;
    var row = evt.data.row;

    closeWindowRow(row);
}

function closeWindowRow(row) {
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

    if (row.attr('hibernated') == 'true' || !windowId) {
        bg.tree.removeNode(id, true);
        return;
    }

    chrome.windows.get(windowId, function(win) {
        if (win) {
            chrome.windows.remove(windowId);
            return;
        }
        bg.tree.removeNode(id, true);
    });
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
    var childCount = evt.data.treeObj.getChildrenCount(evt.data.row);
    var img = (incognito ? '/images/incognito-32.png' : '/images/tab-stack-32.png');
    var body = childCount + ' '
        + (incognito ? 'incognito' + ' ' : '')
        + (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'));
    return getBigTooltipContent(evt.data.label, img, body);
}


///////////////////////////////////////////////////////////
// Row action helper functions
///////////////////////////////////////////////////////////

function closeRow($row) {
    if ($row.attr('rowtype') != 'page' || $row.attr('hibernated') == 'true' || $row.hasClass('closing')) {
        // row has no corresponding tab so just remove it from the tree
        bg.tree.removeNode($row.attr('id'));
        return;
    }

    $row.addClass('closing'); // "about to close" styling
    chrome.tabs.remove(getRowNumericId($row));
}

// hibernateAwakeState values:
//   1: awaken page row
//   0: toggle hibernate/awake
//  -1: hibernate page row
function togglePageRowHibernated(row, hibernateAwakeState, activateAfterWaking) {
    hibernateAwakeState = hibernateAwakeState || 0;

    var hibernated = (row.attr('hibernated') == 'true');
    if (hibernated && hibernateAwakeState >= 0) {
        bg.tree.awakenPage(row.attr('id'), activateAfterWaking || false);
        return;
    }

    if (hibernateAwakeState == 1 || hibernated) {
        return;
    }

    bg.tree.hibernatePage(row.attr('id'));
}

function setPageRowPinnedState(row, pinned) {
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


///////////////////////////////////////////////////////////
// Miscellaneous helper functions
///////////////////////////////////////////////////////////

function getBigTooltipContent(header, icon, body) {
    var elem = $('<div class="ftBigTip"/>');
    var table = $('<table/>');
    var tr = $('<tr/>');

    var img = $('<img class="ftBigTipImage">').attr('src', icon);

    tr.append($('<td>').append(img));

    var td = $('<td>');
    tr.append(td);

    if (header) {
        var headerElem = $('<div class="ftBigTipHeader">').html(header);
        td.append(headerElem);
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
