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
            autoselectChildrenOnDrag: true,
            multiselectable: true,
            allowedDropTargets: ['window', 'page'],
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
                {icon: '/images/pause.png', tooltip: getMessage('pages_pageRowButtonTip_hibernateWake'), onClick: onPageRowHibernateButton },
                {icon: '/images/close.png', tooltip: getMessage('pages_pageRowButtonTip_close'), onClick: onPageRowCloseButton }
            ]
        },
        'window': {
            allowAtTopLevel: true,
            allowAtChildLevel: false,
            autofocusOnClick: false,
            autoselectChildrenOnDrag: false,
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
        onDragDrop: onRowDragDrop,
        scrollTargetElem: $('#main'),
        showFilterBox: true,
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

function onRowDragDrop(moves) {
    console.log('MOVES', moves);
    for (var i = 0; i < moves.length; i++) {
        var move = moves[i];
        var rowId = move.row.attr('id');
        var parentId = move.parent.attr('id');
        var beforeSiblingId = (move.beforeSibling
            ? move.beforeSibling.attr('id')
            : undefined
        );
        console.log('---- recording move ----', 'row', rowId, 'parent', parentId, 'beforeSibling', beforeSiblingId, 'keepChildren', move.keepChildren);
        bg.tree.moveNode(rowId, parentId, beforeSiblingId, move.keepChildren, true);
    }
}

///////////////////////////////////////////////////////////
// FancyTree context menu handlers
///////////////////////////////////////////////////////////

function onContextMenuShow(rows) {
    console.log(rows);
    if (rows[0].rowtype == 'window') {
        return [
            { id: 'closeWindow', icon: '/images/close.png', label: 'Close window', callback: onContextMenuItemCloseWindow },
            { id: 'hibernateWindow', icon: '/images/pause.png', label: 'Hibernate all tabs in window', callback: onContextMenuItemHibernateWindow },
            { id: 'awakenWindow', icon: '/images/pause.png', label: 'Wake all tabs in window', callback: onContextMenuItemWakeWindow },
            { id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true }
        ];

    };
    return [
        { id: 'reloadPage', icon: '/images/reload.png', label: 'Reload', callback: onContextMenuItemReload, preserveSelectionAfter: true },
        { separator: true },
        { id: 'closePage', icon: '/images/close.png', label: 'Close', callback: onContextMenuItemClosePages },
        { id: 'hibernatePage', icon: '/images/pause.png', label: 'Hibernate', callback: onContextMenuItemHibernatePages },
        { id: 'awakenPage', icon: '/images/pause.png', label: 'Wake up', callback: onContextMenuItemWakePages },
        { id: 'setLabel', icon: '/images/label.png', label: 'Set label', callback: onContextMenuItemSetLabel, preserveSelectionAfter: true },
        { id: 'setHighlight', icon: '/images/highlight.png', label: 'Highlight', callback: onContextMenuItemSetHighlight }, //, preserveSelectionAfter: true },
        { id: 'clearHighlight', icon: '/images/clear_highlight.png', label: 'Clear highlight', callback: onContextMenuItemClearHighlight } //, preserveSelectionAfter: true }
    ];
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

    if (row.hasClass('ftCollapsed')) {
        var childCount = row.children('.ftChildren').find('.ftRowNode').length;
        if (childCount > 0) {
            text = '(+' + childCount + ') ' + text;
        }
    }

    if (loggingEnabled) {
        label = row.attr('id').slice(0, 6) + (label ? ': ' : '') + label;
    }

    itemTextElem.children('.ftItemTitle').html(text);
    itemTextElem.children('.ftItemLabel').html(label + (text && label ? ': ' : ''));

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
        label = row.attr('id').slice(0, 6) + ': ' + label;
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
        var row = rows[i];
        bg.tree.updateNode(row.attr('id'), { label: label });
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
    }

    table.append(tr);
    elem.append(table);
    return elem;
}

function getRowNumericId(pageRow) {
    return parseInt(pageRow.attr('id').slice(1));
}
