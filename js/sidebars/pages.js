var ft;
var bg;

$(document).ready(function() {

    $(document).keydown(function(evt) {
        if (evt.keyCode == 70 && evt.ctrlKey) {
            $('#pageFilter').focus();
            evt.stopPropagation();
            return false;
        }
        return true;
    });

    bg = chrome.extension.getBackgroundPage();
    ft = initTree('#pageTree', bg.tree);

    bg.sidebarHandler.registerSidebarPane('pages', window);
    bg.focusCurrentTabInPageTree();

});

function initTree(attachToSelector, pageTree) {
    var rowTypes = {
        'page': {
            onClick: onPageRowClicked,
            onMiddleClick: onCloseButtonPageRow,
            onIconError: onPageRowIconError,
            onFormatTooltip: onPageRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            filterByExtraParams: ['url'],
            tooltipMaxWidthPercent: 0.9,
            buttons: [
                {icon: '/images/reload.png', tooltip: 'Reload', onClick: function() { alert('reload'); } },
                {icon: '/images/close.png', tooltip: 'Close', onClick: onCloseButtonPageRow }
            ]
        },
        'window': {
            onClick: onWindowRowClicked,
            onFormatTooltip: onWindowRowFormatTooltip,
            onResizeTooltip: onResizeTooltip,
            tooltipMaxWidthFixed: 150,
            buttons: [
                {icon: '/images/close.png', tooltip: 'Close&nbsp;window', onClick: onCloseButtonWindowRow }
            ]
        }
    };

    tree = new FancyTree($(attachToSelector), {
        permitTooltipHandler: onPermitFancyTreeTooltip,
        rowTypes: rowTypes
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

function getBigTooltipContent(header, icon, body) {
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

    if (body) {
        var bodyElem = $('<div class="ftBigTipBody">').text(body);
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
    chrome.tabs.remove(parseInt(evt.data.row.attr('id').slice(1)));
}

function onCloseButtonWindowRow(evt)
{
    var childCount = evt.data.treeObj.getChildrenCount(evt.data.row);

    var msg = getMessage('prompt_closeWindow',
        [childCount, (childCount == 1 ? getMessage('text_page') : getMessage('text_pages'))]);

    if (!confirm(msg)) {
        return;
    }

    chrome.windows.remove(parseInt(evt.data.row.attr('id').slice(1)));
}

function onPageRowClicked(evt) {
    // set visible focus immediately
    evt.data.treeObj.focusElem(evt.data.row);

    // actually set the focused tab; this will trigger a callback to us to visibly focus
    // the row again as above, but we do it twice so the visual responseness is as fast
    // as possible
    chrome.tabs.update(parseInt(evt.data.row.attr('id').slice(1)), { active: true }, function(tab) {
        // if the tab's hosting window is currently minimzed, un-minimize it
        chrome.windows.get(tab.windowId, function(win) {
            if (win.state == 'minimized') {
                chrome.windows.update(win.id, { state: 'normal' });
            }
        });
    });

    // trigger page row tooltip to appear after 2s
    evt.data.treeObj.startTooltipTimer(evt.data.row, evt, 2000);

}

function onWindowRowClicked(evt) {
    var winId = parseInt(evt.data.row.attr('id').slice(1));
    chrome.windows.update(winId, { focused: true });
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
            ft.updateElem(elem.id, elem.favicon, null, elem.title, {
                url: elem.url,
                status: elem.status,
                pinned: elem.pinned,
                unread: elem.unread
            });
            break;
        case 'focusPage':
            ft.focusElem(args.id);
            break;
    }
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
                pinned: pageTreeElem.pinned
            }, false, null);
    }
    fancyTree.addElem(newRow, parentId);
}

function onPermitFancyTreeTooltip() {
    // Return false if a Chrome window isn't currently focused
    // to block the tooltips from showing
    return bg.focusTracker.chromeHasFocus;
}

function onPageRowIconError(evt) {
    evt.target.src = getChromeFavIconUrl(evt.data.row.attr('url'));
}

