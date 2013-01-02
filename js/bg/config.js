var config = config || {};

config.AVAILABLE_PANES = [
    { enabled: true, id: 'pages', url: 'panes/pages.html', label: getMessage('sidebarLabel_Pages'), icon: 'images/nav/pages.png' },
    { enabled: true, id: 'closed', url: 'panes/closed.html', label: 'Recently closed', icon: 'images/nav/closed.png' },
    { enabled: true, id: 'notepad', url: 'panes/notepad.html', label: getMessage('sidebarLabel_Notepad'), icon: 'images/nav/notepad.png' },
    { enabled: false, id: 'reddit', url: 'panes/external-site.html#http://i.reddit.com', label: 'Reddit', icon: 'images/nav/reddit.png' },
    { enabled: false, id: 'grooveshark', url: 'panes/external-site.html#http://html5.grooveshark.com/#!/music/stations', label: 'Grooveshark', icon: 'images/nav/grooveshark.ico' }
];

config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS = 2500;
config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS = 1000;
config.TREE_ONMODIFIED_STARTUP_DURATION_MS = 20000;
config.TREE_ONMODIFIED_SAVE_AFTER_TAB_CLOSE_MS = 5000;
config.TREE_ONMODIFIED_SAVE_AFTER_WINDOW_CLOSE_MS = 10000;
