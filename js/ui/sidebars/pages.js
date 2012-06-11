var ft;
var bg;

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
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onPageRowMiddleClick,
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
            onClick: onWindowRowClick,
            onDoubleClick: onWindowRowDoubleClick,
            onMiddleClick: onWindowRowMiddleClick,
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
    if (node.elemType == 'window') {
        var img = (node.incognito ? '/images/incognito-16.png' : '/images/tab-stack-16.png');
        row = fancyTree.getNewElem('window',
            node.id,
            img,
            getMessage('text_Window') + ' ' + node.id.slice(1),
            '',
            { incognito: node.incognito },
            false,
            null);
    }
    else if (node.elemType == 'page') {
        row = fancyTree.getNewElem('page', node.id, node.favicon,
            node.id, node.title, {
                url: node.url,
                status: node.status,
                pinned: node.pinned,
                unread: node.unread,
                hibernated: node.hibernated
            }, false, null);
    }
    else {
        throw new Error('Unknown node type');
    }

    fancyTree.addElem(row, parentId);
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

function onPageRowFormatTooltip(evt) {
    var icon = evt.data.icon;
    var url = evt.data.row.attr('url');
    var title = evt.data.title;
    if (url == title) {
        title = '';
    }
    if (evt.data.row.attr('hibernated') == 'true') {
        title = '<div class="hibernatedHint">' + getMessage('pages_hibernatedHint') + '</div>' + title;
    }
    return getBigTooltipContent(title, icon, url);
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

function onResizeTooltip(evt) {
    // Manually set a fixed width for the tooltip's text content region; without this
    // the CSS 'word-wrap: break-word' has no effect
    evt.data.tooltip.find('td:nth-child(2) > div').width(evt.data.width - 47);
}

function onCloseButtonPageRow(evt)
{
    if (evt.data.row.attr('hibernated') == 'true') {
        // page is hibernated so just remove it; don't actually try to close its
        // (nonexistent) tab
        bg.tree.removeNode(evt.data.row.attr('id'));
        return;
    }

    evt.data.row.addClass('closing'); // "about to close" styling
    chrome.tabs.remove(getRowNumericId(evt.data.row));
}

function getRowNumericId(pageRow) {
    return parseInt(pageRow.attr('id').slice(1));
}

function onHibernateButtonPageRow(evt) {
    if (evt.data.row.attr('hibernated') == 'true') {
        bg.tree.awakenPage(getRowNumericId(evt.data.row), true);
        return;
    }

    bg.tree.hibernatePage(getRowNumericId(evt.data.row));
}

function onCloseButtonWindowRow(evt)
{
    var childCount = evt.data.treeObj.getChildrenCount(evt.data.row);

    var msg = getMessage('prompt_closeWindow',
        [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

    if (!confirm(msg)) {
        return;
    }

    chrome.windows.remove(getRowNumericId(evt.data.row));
}

function onPageRowClick(evt) {
    log(evt);
    var treeObj = evt.data.treeObj;
    var row = evt.data.row;

    // set visible focus immediately; this is just for maximum visible responsiveness
    treeObj.focusElem(row);

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
            evt.data.treeObj.toggleExpandElem(evt.data.row);
            break;
    }
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
            evt.data.treeObj.toggleExpandElem(evt.data.row);
            break;
    }
}

function onWindowRowClick(evt) {
    chrome.windows.update(getRowNumericId(evt.data.row), { focused: true });
}

function PageTreeCallbackProxyListener(op, args)
{
    log(op, args);
    switch (op)
    {
        case 'add':
            addPageTreeNodeToFancyTree(ft, args.element, args.parentId);
            break;
        case 'remove':
            ft.removeElem(args.element.id);
            break;
        case 'move':
            ft.moveElem(args.element.id, args.newParentId);
            break;
        case 'updatePage':
            var elem = args.element;
            ft.updateElem(args.id, elem.favicon, null, elem.title, {
                id: elem.id,
                url: elem.url,
                status: elem.status,
                pinned: elem.pinned,
                unread: elem.unread,
                hibernated: elem.hibernated
            });
            break;
        case 'focusPage':
            ft.focusElem(args.id);
            break;
    }
}

function onPageRowIconError(evt) {
    evt.target.src = getChromeFavIconUrl(evt.data.row.attr('url'));
}

