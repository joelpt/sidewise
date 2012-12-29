// Supports a generic pagetree sidebar pane that contains pages, folders, et al.
//

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

var ft;
initSidebarPane();


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

function initPageTree(dataTree, paneName) {
    ft = initTree('#treePlaceholder', '#filterBoxPlaceholder', dataTree);

    var binder = new SidebarPaneFancyTreeBinder(ft, bg);
    binder.bind();

    bg.sidebarHandler.registerSidebarPane(paneName, window);

    $(document).on('dblclick', 'body, .ftBottomPadding', onBodyDoubleClick);
}


///////////////////////////////////////////////////////////
// Helpers
///////////////////////////////////////////////////////////

function getChromeId($row) {
    // return parseInt(pageRow.attr('id').slice(1));
    return parseInt($row.attr('chromeid'));
}


function getRowNumericId(pageRow) {
    return getChromeId(pageRow);
    // return parseInt(pageRow.attr('id').slice(1));
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
        tooltipMaxWidthPercent: 0.95
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
        tooltipMaxWidthPercent: 0.95
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
        tooltipMaxWidthPercent: 0.95
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
        tooltipMaxWidthPercent: 0.95
    }
};
