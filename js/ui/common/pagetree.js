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

function getChromeId($row) {
    return parseInt(pageRow.attr('id').slice(1));
}


function getRowNumericId(pageRow) {
    return parseInt(pageRow.attr('id').slice(1));
}
