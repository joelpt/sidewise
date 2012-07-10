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

var WINDOW_ACTION_CONFIRM_CHILDREN_THRESHOLD = 2;


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
                hibernated: node.hibernated
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
    console.log('MOVES', moves);
    for (var i = 0; i < moves.length; i++) {
        var move = moves[i];
        var $row = move.$row;
        var $to = move.$to;
        var rowId = $row.attr('id');
        var toId = $to ? $to.attr('id') : undefined;
        console.log('---- move:', rowId, move.relation, toId);

        if (move.relation != 'nomove') {
            // record the move in bg.tree
            bg.tree.moveNodeRel(rowId, move.relation, toId, false, true);
        }

        if ($row.attr('rowtype') == 'page') {
            // moving a tab between windows
            // TODO when moving tabs between windows we wont generate a move event for selected tabs
            // which are direct children of other selected tabs; these come with due to keepChildren=true
            // and therefore do not generate a move event. Move these properly.

            // var $topParent = row.parents('.ftRowNode').last();

            // var $moveTopParent = move.parent.parents('.ftRowNode').last();
            var $moveTopParent = $to.parents('.ftRowNode').last();
            // if ($moveTopParent.length == 0) {
            //     $moveTopParent = $to.parent().closest('.ftRowNode');
            // }

            var $oldTopParent = move.$oldAncestors.last();

            // if we are moving row to a branch with a different non hibernated window row at the top ...
            if ($moveTopParent.attr('rowtype') == 'window'
                && $moveTopParent.attr('hibernated') != 'true'
                && !($moveTopParent.is($oldTopParent)))
            {
                // TODO enable reliable window-moving of subselected children nodes by issuing
                // redundant 'moves' entries for selected>selected rows? or else sniff
                // it all out right here ... SOLUTION: output a moves entry for each
                // selected>selected row that is moved along with a boolean .staticMove=(true|false),
                // onRowsMoved listeners can check this bool to decide if they need to do
                // something with a given move. In our case we will want to use non-staticMove
                // moves entries to indicate when we should still try to move that one to a new window
                // here

                // && !($moveTopParent.is($topParent))) {
                // The reason this isn't working is that by the time this code gets executed,
                // the node has already been physically moved in the tree, so getting $topParent
                // will always return the same node as $moveTopParent; we're already actually moved there.
                // Solution: implement onRowsMovedBefore with blocking callback providing the proposed
                // list of moves, and onRowsMovedAfter called once move is all done and animated.
                // solution 2: in moves, add oldParent, oldBeforeSibling, then we could perform this
                // comparison properly .... UNLESS oldParent/oldBeforeSibling get moved themselves.
                // solution 3: in moves, add oldAncestors which is an array exactly describing the parents
                // that a given node had prior to being moved (though they may have themselves moved);
                // we could look at the top oldAncestor to find out if we've been switched between
                // two windows

                // TODO prevent doing moves to non-normal type windows via droppable:accept
                // TODO figure out some way to block onTabAttached events re-sorting what the tree
                // looks like: this is probably possible by verifying in onTabAttached that
                // we're under a different window than the one that's reported as the moveto window,
                // and do nothing if they're the same window
                chrome.tabs.move(getRowNumericId($row), { windowId: getRowNumericId($moveTopParent), index: 9999 });
                continue;
            }
        }
    }
}

///////////////////////////////////////////////////////////
// FancyTree context menu handlers
///////////////////////////////////////////////////////////

function onContextMenuShow(rows) {
    console.log(rows);

    var items = [];

    if (rows[0].rowtype == 'window') {
        var $row = rows[0].jQueryElement;
        var $children = $row.find('.ftChildren > .ftRowNode');

        var hibernatedCount = $children.filter(function(i, e) { return $(e).attr('hibernated') == 'true' }).length;
        var awakeCount = $children.length - hibernatedCount;

        if (awakeCount)
            items.push({ id: 'hibernateWindow', icon: '/images/hibernate.png', label: 'Hibernate all tabs in window', callback: onContextMenuItemHibernateWindow });

        if (hibernatedCount)
            items.push({ id: 'awakenWindow', icon: '/images/wake.png', label: 'Wake all tabs in window', callback: onContextMenuItemWakeWindow });

        if (awakeCount || hibernatedCount)
            items.push({ separator: true });

        items.push({ id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });
        items.push({ separator: true });
        items.push({ id: 'closeWindow', icon: '/images/close.png', label: 'Close window', callback: onContextMenuItemCloseWindow });

        return items;
    }

    var pages = rows.filter(function(e) { return e.rowtype == 'page' });

    if (pages.length > 0) {
        var hibernatedCount = pages.filter(function(e) { return e.hibernated; }).length;
        var awakeCount = pages.length - hibernatedCount;

        var highlightedCount = pages.filter(function(e) { return e.highlighted; }).length;
        var unhighlightedCount = pages.length - highlightedCount;

        if (awakeCount)
           items.push({ id: 'hibernatePage', icon: '/images/hibernate.png', label: 'Hibernate', callback: onContextMenuItemHibernatePages });

        if (hibernatedCount)
           items.push({ id: 'awakenPage', icon: '/images/wake.png', label: 'Wake up', callback: onContextMenuItemWakePages });

        if (awakeCount || hibernatedCount)
           items.push({ separator: true });

        items.push({ id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });

        if (unhighlightedCount)
           items.push({ id: 'setHighlight', icon: '/images/highlight.png', label: 'Highlight', callback: onContextMenuItemSetHighlight, preserveSelectionAfter: true });

        if (highlightedCount)
        items.push({ id: 'clearHighlight', icon: '/images/clear_highlight.png', label: 'Clear highlight', callback: onContextMenuItemClearHighlight, preserveSelectionAfter: true });

        items.push({ separator: true });

        items.push({ id: 'moveToNewFolder', icon: '/images/folder.png', label: 'Put in new folder', callback: onContextMenuItemMoveToNewFolder, preserveSelectionAfter: true });

        items.push({ separator: true });

        if (awakeCount)
           items.push({ id: 'reloadPage', icon: '/images/reload.png', label: 'Reload', callback: onContextMenuItemReload, preserveSelectionAfter: true });

        items.push({ id: 'closePage', icon: '/images/close.png', label: 'Close', callback: onContextMenuItemClosePages });

        return items;
    }

    // must only have folder nodes selected
    items.push({ id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true });
    items.push({ id: 'setHighlight', icon: '/images/highlight.png', label: 'Highlight', callback: onContextMenuItemSetHighlight, preserveSelectionAfter: true });
    items.push({ id: 'clearHighlight', icon: '/images/clear_highlight.png', label: 'Clear highlight', callback: onContextMenuItemClearHighlight, preserveSelectionAfter: true });
    items.push({ separator: true });
    items.push({ id: 'moveToNewFolder', icon: '/images/folder.png', label: 'Put in new folder', callback: onContextMenuItemMoveToNewFolder, preserveSelectionAfter: true });
    items.push({ separator: true });
    items.push({ id: 'closeFolder', icon: '/images/close.png', label: 'Remove', callback: onContextMenuItemCloseFolders });
    return items;
}

function onContextMenuItemCloseWindow(rows) {
    var id = rows[0].id;
    console.log('CLOSE WIN', id);
    closeWindowRow(rows[0].jQueryElement);
    // var $descendants = rows[0].jQueryElement.children('.ftChildren').find('.ftRowNode');
    // $descendants.each(function(i, e) { closePageRow($(e)); });
}

function onContextMenuItemClosePages(rows) {
console.log('CLOSE');
for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    closePageRow(row.jQueryElement);
}
}

function onContextMenuItemCloseFolders(rows) {
    console.log('CLOSE FOLDERS');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        bg.tree.removeNode($(row).attr('id'));
    }
}

function onContextMenuItemWakeWindow(rows) {
    var id = rows[0].id;
    console.log('WAKE WIN', id);
    bg.tree.awakenWindow(id);
}

function onContextMenuItemHibernateWindow(rows) {
    var id = rows[0].id;
    console.log('HIBERNATE WIN', id);
    bg.tree.hibernateWindow(id);
}

function onContextMenuItemHibernatePages(rows) {
    console.log('HIBERNATE');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        togglePageRowHibernated(row.jQueryElement, -1);
    }
}

function onContextMenuItemWakePages(rows) {
    console.log('WAKIE');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        togglePageRowHibernated(row.jQueryElement, 1);
    }
}

function onContextMenuItemReload(rows) {
    console.log('RELOAD');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.hibernated) {
            continue;
        }
        var chromeId = row.chromeId;
        chrome.tabs.executeScript(chromeId, { code: "window.location.reload();" });
    }
}

function onContextMenuItemSetLabel(rows) {
    setRowLabels(rows.map(function(e) { return e.jQueryElement; }));
}

function onContextMenuItemSetHighlight(rows) {
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        setRowHighlight(row.jQueryElement, 1);
    }
}

function onContextMenuItemClearHighlight(rows) {
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        setRowHighlight(row.jQueryElement, -1);
    }
}

function onContextMenuItemMoveToNewFolder(rows) {
    var label = prompt(getMessage('prompt_setNewFolderName'), getMessage('text_NewFolder'));

    if (!label) {
        // user cancelled or entered no label
        return;
    }

    var folder = new bg.FolderNode(label);
    var ids = rows.map(function(e) { return e.id; });
    var $rows = ft.root.find('#' + ids.join(',#'));

    // TODO implement .addNodeRel
    bg.tree.addNode(folder);
    bg.tree.moveNodeRel(folder, 'before', $($rows[0]).attr('id'), false, false);

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
    bg.tree.removeNode(evt.data.row.attr('id'));
}

function onFolderRowFormatTitle(row, itemTextElem) {
    var label = row.attr('label');
    var childCount = row.children('.ftChildren').find('.ftRowNode').length;

    if (childCount > 0) {
        var textAffix = '&nbsp;(' + childCount + ')';
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
    closePageRow(evt.data.row);
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

    bg.tree.awakenWindow(row.attr('id'));
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

    if (childCount >= WINDOW_ACTION_CONFIRM_CHILDREN_THRESHOLD) {
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

function closePageRow(row) {
    if (row.attr('hibernated') == 'true' || row.hasClass('closing')) {
        // page is hibernated so just remove it; don't actually try to close its
        // (nonexistent) tab; or we were already trying to close this tab
        bg.tree.removeNode(row.attr('id'));
        return;
    }

    row.addClass('closing'); // "about to close" styling
    chrome.tabs.remove(getRowNumericId(row));
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
