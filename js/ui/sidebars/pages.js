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
var bg;


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

$(document).ready(function() {
    if (loggingEnabled) {
        $('footer, #main').addClass('debugEnabled');
    }

    bg = chrome.extension.getBackgroundPage();
    ft = initTree('#treePlaceholder', '#filterBoxPlaceholder', bg.tree);

    var binder = new SidebarPaneFancyTreeBinder(ft, bg);
    binder.bind();

    bg.sidebarHandler.registerSidebarPane('pages', window);
    bg.focusCurrentTabInPageTree();
});

function initTree(treeReplaceSelector, filterBoxReplaceSelector, pageTree) {
    var rowTypes = {
        'page': {
            autofocusOnClick: true,
            multiselectable: true,
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onPageRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onIconError: onPageRowIconError,
            onFormatTitle: onPageRowFormatTitle,
            onFormatTooltip: onPageRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            filterByExtraParams: ['url'],
            tooltipMaxWidthPercent: 0.9,
            buttons: [
                {icon: '/images/pause.png', tooltip: 'Hibernate/wake', onClick: onPageRowHibernateButton },
                {icon: '/images/close.png', tooltip: 'Close', onClick: onPageRowCloseButton }
            ]
        },
        'window': {
            autofocusOnClick: false,
            multiselectable: false,
            onClick: onWindowRowClick,
            onDoubleClick: onWindowRowDoubleClick,
            onMiddleClick: onWindowRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onFormatTitle: onWindowRowFormatTitle,
            onFormatTooltip: onWindowRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthPercent: 0.9,
            buttons: [
                {icon: '/images/close.png', tooltip: 'Close&nbsp;window', onClick: onWindowRowCloseButton }
            ]
        }
    };

    fancyTree = new FancyTree($(treeReplaceSelector), $(filterBoxReplaceSelector), {
        rowTypes: rowTypes,
        showFilterBox: true,
        filterPlaceholderText: getMessage('prompt_filterPlaceholderText'),
        filterActiveText: getMessage('prompt_filterActiveText')
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

    if (node instanceof bg.PageNode) {
        // delay setting of the actual page favicon to avoid delaying initial page load
        setTimeout(function() { fancyTree.updateRow(row, { icon: node.favicon }); }, 100);
    }
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
            ft.moveRow(args.element.id, args.newParentId);
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
            try {
                ft.updateRow(args.id, details);
            }
            catch(ex) {
                log('Row does not exist to update', args.id, details);
            }
            break;
        case 'focusPage':
            try {
                ft.focusRow(args.id);
            }
            catch(ex) {
                log('Row does not exist to focus', args.id);
            }
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


///////////////////////////////////////////////////////////
// FancyTree specific rowtype event handlers
///////////////////////////////////////////////////////////

// ----------------------------------------------
// Page rowtype handlers
// ----------------------------------------------

function onPageRowClick(evt) {
    log(evt);
    var treeObj = evt.data.treeObj;
    var row = evt.data.row;

    if (row.attr('hibernated') == 'true') {
        // row is hibernated, don't try to activate its (nonexistent) tab;
        // just show its tooltip quickly
        treeObj.startTooltipTimer(row, evt, 500);
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
    var action = loadSetting('pages_doubleClickAction');
    handlePageRowAction(action, evt);
}

function onPageRowMiddleClick(evt) {
    var action = loadSetting('pages_middleClickAction');
    handlePageRowAction(action, evt);
}

function handlePageRowAction(action, evt) {
    switch (action) {
        case 'close':
            onPageRowCloseButton(evt);
            break;
        case 'hibernate':
            onPageRowHibernateButton(evt);
            break;
        case 'expand':
            evt.data.treeObj.toggleExpandRow(evt.data.row);
            break;
        case 'setlabel':
            setRowLabels(evt.data.row);
            break;
        case 'highlight':
            setRowHighlights(evt.data.row);
            break;
    }
}

function onPageRowCloseButton(evt) {
    var row = evt.data.row;

    if (row.attr('hibernated') == 'true') {
        // page is hibernated so just remove it; don't actually try to close its
        // (nonexistent) tab
        bg.tree.removeNode(row.attr('id'));
        return;
    }

    if (row.hasClass('closing')) {
        // already trying to close this page
        return;
    }
    row.addClass('closing'); // "about to close" styling
    chrome.tabs.remove(getRowNumericId(row));
}

function onPageRowHibernateButton(evt) {
    var row = evt.data.row;

    if (row.attr('hibernated') == 'true') {
        bg.tree.awakenPage(row.attr('id'), true);
        return;
    }

    bg.tree.hibernatePage(row.attr('id'));
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


// ----------------------------------------------
// Window rowtype handlers
// ----------------------------------------------

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
    var action = loadSetting('pages_doubleClickAction');
    handleWindowRowAction(action, evt);
}

function onWindowRowMiddleClick(evt) {
    var action = loadSetting('pages_middleClickAction');
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

    var childCount = treeObj.getChildrenCount(row);

    if (childCount >= WINDOW_ACTION_CONFIRM_CHILDREN_THRESHOLD) {
        var msg = getMessage('prompt_closeWindow',
            [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

        if (!confirm(msg)) {
            return;
        }
    }

    var id = row.attr('id');
    var windowId = getRowNumericId(row);

    if (!windowId) {
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
// Helper functions
///////////////////////////////////////////////////////////

function setRowLabels(rows) {
    var label = prompt(getMessage('prompt_setLabel'), $(rows[0]).attr('label'));

    if (label === null) {
        // user cancelled
        return;
    }

    rows.each(function(i, e) {
        bg.tree.updateNode(e.attributes.id.value, { label: label });
    });
}

function setRowHighlights(rows) {
    var highlighted = $(rows[0]).attr('highlighted') == 'true';

    rows.each(function(i, e) {
        bg.tree.updateNode(e.attributes.id.value, { highlighted: !highlighted });
    });
}

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
