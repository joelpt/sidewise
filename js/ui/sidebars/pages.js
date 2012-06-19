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
    hibernated: 'hibernated'
};


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var ft;
var bg;


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

$(document).ready(function() {
    bg = chrome.extension.getBackgroundPage();
    ft = initTree('#pageTree', bg.tree);

    var binder = new SidebarPaneFancyTreeBinder(ft, bg);
    binder.bind();

    bg.sidebarHandler.registerSidebarPane('pages', window);
    bg.focusCurrentTabInPageTree();
});

function initTree(attachToSelector, pageTree) {
    var rowTypes = {
        'page': {
            autofocusOnClick: true,
            multiselectable: true,
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onPageRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onIconError: onPageRowIconError,
            onFormatTooltip: onPageRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            filterByExtraParams: ['url'],
            tooltipMaxWidthPercent: 0.9,
            buttons: [
                {icon: '/images/reload.png', tooltip: 'Hibernate', onClick: onHibernateButtonPageRow },
                {icon: '/images/close.png', tooltip: 'Close', onClick: onCloseButtonPageRow }
            ]
        },
        'window': {
            autofocusOnClick: false,
            multiselectable: false,
            onClick: onWindowRowClick,
            onDoubleClick: onWindowRowDoubleClick,
            onMiddleClick: onWindowRowMiddleClick,
            onExpanderClick: onRowExpanderClick,
            onFormatTooltip: onWindowRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthPercent: 0.9,
            buttons: [
                {icon: '/images/close.png', tooltip: 'Close&nbsp;window', onClick: onCloseButtonWindowRow }
            ]
        }
    };

    tree = new FancyTree($(attachToSelector), {
        rowTypes: rowTypes,
        showFilterBox: true,
        filterPlaceholderText: getMessage('prompt_filterPlaceholderText'),
        filterActiveText: getMessage('prompt_filterActiveText')
    });

    $('.ftFilterStatus').attr('title', getMessage('pages_omniboxTip'));

    populateFancyTreeFromPageTree(tree, pageTree);

    return tree;
}

function populateFancyTreeFromPageTree(fancyTree, pageTree) {
    pageTree.forEach(function(e, d, i, p) {
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
            getMessage('text_Window') + ' ' + node.id.slice(1),
            '',
            { incognito: node.incognito },
            node.collapsed,
            null);
    }
    else if (node instanceof bg.PageNode) {
        row = fancyTree.getNewRowElem('page', node.id, node.favicon, node.label, node.title,
            {
                url: node.url,
                status: node.status,
                pinned: node.pinned,
                unread: node.unread,
                hibernated: node.hibernated
            },
            node.collapsed, null);
    }
    else {
        throw new Error('Unknown node type');
    }

    fancyTree.addRow(row, parentId);
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
            ft.removeRow(args.element.id);
            break;
        case 'move':
            ft.moveRow(args.element.id, args.newParentId);
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
    bg.tree.updateNode(evt.data.row.attr('id'), { collapsed: !evt.data.expanded });
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
            onCloseButtonPageRow(evt);
            break;
        case 'hibernate':
            onHibernateButtonPageRow(evt);
            break;
        case 'expand':
            evt.data.treeObj.toggleExpandRow(evt.data.row);
            break;
    }
}

function onCloseButtonPageRow(evt) {
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

function onHibernateButtonPageRow(evt) {
    var row = evt.data.row;

    if (row.attr('hibernated') == 'true') {
        bg.tree.awakenPage(row.attr('id'), true);
        return;
    }

    bg.tree.hibernatePage(row.attr('id'));
}

function onPageRowFormatTooltip(evt) {
    var icon = evt.data.icon;
    var url = evt.data.row.attr('url');
    var text = evt.data.text;

    if (url == text) {
        text = '';
    }
    if (evt.data.row.attr('hibernated') == 'true') {
        text = '<div class="hibernatedHint">' + getMessage('pages_hibernatedHint') + '</div>' + text;
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
    chrome.windows.update(getRowNumericId(evt.data.row), { focused: true });
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
            onCloseButtonWindowRow(evt);
            break;
        // case 'hibernate':
        //     onHibernateButtonPageRow(evt);
        //     break;
        case 'expand':
            evt.data.treeObj.toggleExpandRow(evt.data.row);
            break;
    }
}

function onCloseButtonWindowRow(evt) {
    var childCount = evt.data.treeObj.getChildrenCount(evt.data.row);

    var msg = getMessage('prompt_closeWindow',
        [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

    if (!confirm(msg)) {
        return;
    }

    chrome.windows.remove(getRowNumericId(evt.data.row));
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
