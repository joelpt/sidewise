"use strict";

// Supports a generic pagetree sidebar pane that contains pages, folders, et al.

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
    mediaTime: 'media-time',
    chromeId: 'chromeid'
};

// wait this long before accessing chrome://favicon cache to obtain
// a working icon when the assigned favicon fails to load on the page
var ICON_ERROR_FALLBACK_DELAY_MS = 10000;


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var binder;
var ft;
initSidebarPane();


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

// TODO this function should not know about initTree in pages.js/closed.js;
// instead, it should all be parameterized appropriately
function initPageTree(dataTree, paneName, getFancyTreeFn) {
    ft = getFancyTreeFn('#treePlaceholder', '#filterBoxPlaceholder', dataTree);

    binder = new SidebarPaneFancyTreeBinder(ft, dataTree, bg);
    binder.bind();

    bg.sidebarHandler.registerSidebarPane(paneName, window);
}


///////////////////////////////////////////////////////////
// FancyTree general event handlers
///////////////////////////////////////////////////////////

function onResizeTooltip(evt) {
    // Manually set a fixed width for the tooltip's text content region; without this
    // the CSS 'word-wrap: break-word' has no effect
    evt.data.tooltip.find('td:nth-child(2) > div').width(evt.data.width - 47);
}


///////////////////////////////////////////////////////////
// FancyTree-pagetree row types prototype
///////////////////////////////////////////////////////////

var PageTreeRowTypes = {
    'page': {
        allowAtTopLevel: false,
        allowAtChildLevel: true,
        autofocusOnClick: true,
        allowClickOnHover: true,
        allowClickOnScroll: true,
        permitAutoSelectChildren: true,
        alwaysMoveChildren: false,
        multiselectable: true,
        onResizeTooltip: onResizeTooltip,
        filterByExtraParams: ['url'],
        tooltipMaxWidthPercent: 0.95,
        onFormatTitle: onPageRowFormatTitle,
        onFormatTooltip: onPageRowFormatTooltip
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
        onResizeTooltip: onResizeTooltip,
        tooltipMaxWidthPercent: 0.95,
        onFormatTitle: onFolderRowFormatTitle,
        onFormatTooltip: onFolderRowFormatTooltip
    },
    'header': {
        allowAtTopLevel: true,
        allowAtChildLevel: false,
        autofocusOnClick: false,
        allowClickOnHover: false,
        allowClickOnScroll: false,
        permitAutoSelectChildren: true,
        alwaysMoveChildren: true,
        multiselectable: false,
        onResizeTooltip: onResizeTooltip,
        tooltipMaxWidthPercent: 0.95,
        onFormatTitle: onFolderRowFormatTitle,
        onFormatTooltip: onFolderRowFormatTooltip
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
        onResizeTooltip: onResizeTooltip,
        tooltipMaxWidthPercent: 0.95,
        onFormatTitle: onWindowRowFormatTitle,
        onFormatTooltip: onWindowRowFormatTooltip
    }
};


///////////////////////////////////////////////////////////
// Common row type event handlers
///////////////////////////////////////////////////////////

// ----------------------------------------------
// Folders
// ----------------------------------------------

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
        label = row.attr('id').slice(0, 4) + (label ? ': ' : '') + label;
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

// ----------------------------------------------
// Pages
// ----------------------------------------------

function onPageRowFormatTitle(row, itemTextElem) {
    var label = row.attr('label');
    var text = row.attr('text');

    var textAffix = '';

    if (settings.get('pages_showMediaPlayTime')) {
        var mediaState = row.attr('media-state');
        if (mediaState == 'playing') {
            var mediaTime = parseFloat(row.attr('media-time'));
            if (mediaTime >= 0.1) {
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
        label = row.attr('id').slice(0, 4) + (label ? ': ' : '') + label;
    }

    if (settings.get('pages_trimPageTitlePrefixes') && row.attr('url').indexOf(text) == -1) {
        text = getTrimmedPageTitle(row);
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
        var page = binder.dataTree.getNode(row.attr('id'));
        url += '<br/><br/>Id: ' + page.id
            + '<br/>History length: ' + page.historylength
            + '<br/>Referrer: ' + (page.referrer || "''")
            + '<br/>Chrome ID: ' + (page.chromeId || "''")
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
    }, ICON_ERROR_FALLBACK_DELAY_MS);
}

// ----------------------------------------------
// Windows
// ----------------------------------------------

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
        label = row.attr('id').slice(0, 4) + ': ' + label;
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
// Common context menu item handlers
///////////////////////////////////////////////////////////

function onContextMenuItemCopyURL($rows) {
    var urls = $rows.map(function(i, e) {
        var $e = $(e);
        if ($e.attr('rowtype') != 'page') {
            return;
        }
        return $e.attr('url');
    });

    copyTextToClipboard(urls.toArray().join('\n'));

    ft.resetDragDropState(function() {
        alert(urls.length + ' URL(s) copied to clipboard.');
    });
}

function onContextMenuItemCopyId($rows) {
    var ids = $rows.map(function(i, e) {
        return $(e).attr('id');
    });

    copyTextToClipboard(ids.toArray().join('\n'));

    ft.resetDragDropState(function() {
        alert(ids.length + ' ID(s) copied to clipboard.');
    });
}


///////////////////////////////////////////////////////////
// Helpers
///////////////////////////////////////////////////////////

function getChromeId(pageRow) {
    return parseInt(pageRow.attr('chromeId'));
}

function getTrimmedPageTitle(row) {
    // trim common prefixes from child page titles vs. parent/preceding/next page titles
    var text = row.attr('text');
    var parent = row.parent().closest('.ftRowNode');
    if (parent.length > 0) { // && parent.attr('text').substring(0, 5) == text.substring(0, 5)) {
        var nearby = $();
        var nearbyTitle;
        var reformatPrev;

        var next = row.next();
        if (next.is(row.following('.ftRowNode'))) {
            nearby = next;
            nearbyTitle = nearby.attr('text');
            reformatPrev = false;
        }

        if (nearby.length == 0 || nearbyTitle == text || nearbyTitle.substring(0, 5) != text.substring(0, 5))
        {
            nearby = row.preceding('.ftRowNode');
            nearbyTitle = nearby.attr('text');
            reformatPrev = true;
        }

        if (nearby.length == 0 || nearbyTitle == text || nearbyTitle.substring(0, 5) != text.substring(0, 5)) {
            nearby = parent;
            nearbyTitle = nearby.attr('text');
            reformatPrev = false;
        }

        if (reformatPrev && nearby.index() == 0) {
            onPageRowFormatTitle(nearby, nearby.find('> .ftItemRow > .ftItemRowContent > .ftInnerRow > .ftItemText'));
        }

        if (nearby && nearby.attr('rowtype') == 'page') {
            if (nearbyTitle != text) {
                var pos = 0;
                while (pos < text.length && pos < nearbyTitle.length && text[pos] == nearbyTitle[pos]) {
                    pos++;
                }
                if (pos >= 5) {
                    while (text[pos] != ' ' && pos > 0) {
                        // Move pos back to last non space char so we don't include partial words at the end of the prefix
                        pos--;
                    }

                    if (pos >= 5 && text[pos].match(/[^A-Za-z0-9,]/) && text[pos-1].match(/[^A-Za-z0-9,]/)) {
                        // Only perform trimming when the prefix ends with two non-alphanumeric chars
                        text = text.substring(pos).trim().replace(/^([^A-Za-z0-9]* )?(.+?)( [^A-Za-z0-9]*)?$/, '$2');
                    }
                }
            }
        }
    }
    return text;
}

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
