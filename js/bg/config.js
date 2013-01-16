var config = config || {};

config.AVAILABLE_PANES = [
    { enabled: true, id: 'pages', url: 'panes/pages.html', label: getMessage('sidebarLabel_Pages'), icon: 'images/nav/pages.png' },
    { enabled: true, id: 'closed', url: 'panes/closed.html', label: 'Recently closed', icon: 'images/nav/closed.png' },
    { enabled: true, id: 'notepad', url: 'panes/notepad.html', label: getMessage('sidebarLabel_Notepad'), icon: 'images/nav/notepad.png' },
    { enabled: false, id: 'reddit', url: 'panes/external-site.html#http://i.reddit.com', label: 'Reddit', icon: 'images/nav/reddit.png' },
    { enabled: false, id: 'grooveshark', url: 'panes/external-site.html#http://html5.grooveshark.com/#!/music/stations', label: 'Grooveshark', icon: 'images/nav/grooveshark.ico' },
    { enabled: false, id: 'whatsnew', url: '/sidebars/whatsnew.html', label: 'What\'s New', icon: '/images/nav/whatsnew.gif' }
];

config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS = 2500;
config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS = 1000;
config.TREE_ONMODIFIED_STARTUP_DURATION_MS = 20000;
config.TREE_ONMODIFIED_SAVE_AFTER_TAB_CLOSE_MS = 5000;
config.TREE_ONMODIFIED_SAVE_AFTER_WINDOW_CLOSE_MS = 10000;

config.DENIED_SAVE_TREE_RETRY_MS = 2000;           // how soon to retry saving the page tree when it is temporariliy disallowed
config.SAVE_TREE_BACKUP_EVERY_MS = 1000 * 60 * 15; // how often to save a backup of the page tree (15 minutes)
config.MIN_NODES_TO_BACKUP_TREE = 6;               // skip backups when we have fewer than this many nodes in the tree
config.SAVE_TREE_INITIAL_BACKUP_AFTER_MS = 15000;  // save the initial backup when none yet exists this soon after startup

config.PAGETREE_NODE_TYPES = {
    'window': WindowNode,
    'page': PageNode,
    'folder': FolderNode,
    'header': HeaderNode
};

config.GHOSTTREE_NODE_TYPES = {
    'ghost': GhostNode
};

config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS = 750;
config.GROUPING_ROW_COUNT_THRESHOLD = 7;
config.GROUPING_ROW_COUNT_WAIT_THRESHOLD = 8;
config.GROUPING_ROW_COUNT_WAIT_ITERATIONS = 4;

// Nodes in the recently closed tree must be at most no older than this many
// ms to qualify for having another node matched to an associated position vs.
// them, e.g. a new recently-closed node being made a child of an existing
// recently-closed node. When a recently-closed node can't be placed in
// relative positioning to another node due to exceeding this timeout or just
// not finding any qualifying nodes, the fallback behavior is simply to
// prepend it to the top .collecting=true HeaderNode in the recently closed
// tree.
config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS = MINUTE_MS * 10;

config.RECENTLY_CLOSED_GROUP_AFTER_REMOVE_IDLE_MS = HOUR_MS * 3;