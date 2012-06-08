var ft;
var bg;

$(document).ready(function() {
    bg = chrome.extension.getBackgroundPage();
    ft = initTree('#pageTree', bg.tree);

    bg.sidebarHandler.registerSidebarPane('pages', window);
    bg.focusCurrentTabInPageTree();
});

function initTree(attachToSelector, pageTree) {
    var rowTypes = {
        'page': {
            onClick: onPageRowClick,
            onDoubleClick: onPageRowDoubleClick,
            onMiddleClick: onCloseButtonPageRow,
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
            onFormatTooltip: onWindowRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthFixed: 150,
            buttons: [
                {icon: '/images/close.png', tooltip: 'Close&nbsp;window', onClick: onCloseButtonWindowRow }
            ]
        }
    };

    tree = new FancyTree($(attachToSelector), {
        rowTypes: rowTypes,
        permitTooltipHandler: onPermitFancyTreeTooltip,
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
        addPageTreeElemToFancyTree(fancyTree, e, parentId);
    });
}

function addPageTreeElemToFancyTree(fancyTree, pageTreeElem, parentId)
{
    var newRow;
    if (pageTreeElem.elemType == 'window') {
        var img = (pageTreeElem.incognito ? '/images/incognito-16.png' : '/images/tab-stack-16.png');
        newRow = fancyTree.getNewElem('window',
            pageTreeElem.id,
            img,
            getMessage('text_Window') + ' ' + pageTreeElem.id.slice(1),
            '',
            { incognito: pageTreeElem.incognito },
            false,
            null);
    }
    else if (pageTreeElem.elemType == 'page') {
        newRow = fancyTree.getNewElem('page', pageTreeElem.id, pageTreeElem.favicon,
            pageTreeElem.id, pageTreeElem.title, {
                url: pageTreeElem.url,
                status: pageTreeElem.status,
                pinned: pageTreeElem.pinned,
                unread: pageTreeElem.unread,
                hibernated: pageTreeElem.hibernated
            }, false, null);
    }
    fancyTree.addElem(newRow, parentId);
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
    evt.data.row.addClass('closing'); // "about to close" styling
    chrome.tabs.remove(getRowNumericId(evt.data.row));
}

function getRowNumericId(pageRow) {
    return parseInt(pageRow.attr('id').slice(1));
}

function onHibernateButtonPageRow(evt) {
    if (evt.data.row.attr('hibernated') == 'true') {
        bg.tree.awakenPage(getRowNumericId(evt.data.row));
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
        treeObj.startTooltipTimer(row, evt, 250);
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
    onHibernateButtonPageRow(evt);
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
            addPageTreeElemToFancyTree(ft, args.element, args.parentId);
            break;
        case 'remove':
            ft.removeElem(args.id);
            break;
        case 'move':
            ft.moveElem(args.id, args.newParentId);
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

function onPermitFancyTreeTooltip() {
    // Return false if a Chrome window isn't currently focused
    // to block the tooltips from showing
    return bg.focusTracker.chromeHasFocus;
}

function onPageRowIconError(evt) {
    evt.target.src = getChromeFavIconUrl(evt.data.row.attr('url'));
}

