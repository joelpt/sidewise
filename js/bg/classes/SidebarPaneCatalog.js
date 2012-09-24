var AVAILABLE_PANES = [
    { enabled: true, id: 'pages', url: 'sidebars/pages.html', label: getMessage('sidebarLabel_Pages'), icon: 'images/nav/pages.png' },
    { enabled: true, id: 'notepad', url: 'sidebars/notepad.html', label: getMessage('sidebarLabel_Notepad'), icon: 'images/nav/notepad.png' },
    { enabled: true, id: 'reddit', url: 'sidebars/external-site.html#http://i.reddit.com', label: 'Reddit', icon: 'images/nav/reddit.png' },
    { enabled: false, id: 'grooveshark', url: 'sidebars/external-site.html#http://html5.grooveshark.com/#!/music/stations', label: 'Grooveshark', icon: 'images/nav/grooveshark.ico' }
];

var SidebarPaneCatalog = function() {
    this.panes = AVAILABLE_PANES;
};

SidebarPaneCatalog.prototype = {

    getPaneIds: function() {
        return this.panes.map(function(e) { return e.id; });
    },

    loadState: function() {
        var saved = settings.get('sidebarPanesState');

        if (!saved) {
            return;
        }

        this.panes = [];
        var seenPanes = [];

        var availPanes = clone(AVAILABLE_PANES);
        var availPaneIds = availPanes.map(function(e) { return e.id; });
        var lastEnabledPaneIndex = -1;

        // add panes with a known state from settings to this.panes
        for (var i = 0; i < saved.length; i++) {
            var s = saved[i];
            seenPanes.push(s.id);
            var index = availPaneIds.indexOf(s.id);
            if (index == -1) {
                log('State data found for pane that is not in available panes', s, availPanes);
                continue;
            }
            var pane = availPanes[index];
            pane.enabled = s.enabled;

            if (pane.enabled) {
                lastEnabledPaneIndex++;
            }

            this.panes.push(pane);
        }

        // add panes from the available panes which did not have a known state from settings
        // (allows us to add new panes to the built in list over time)
        for (var i = 0; i < availPanes.length; i++) {
            var pane = availPanes[i];
            if (seenPanes.indexOf(pane.id) > -1) {
                // already added
                continue;
            }
            // new pane
            if (pane.enabled) {
                // add new default-enabled panes just after last state-enabled pane;
                // helps prevent us from adding important new panes after "detritus" panes
                // that the user has not enabled
                this.panes.splice(lastEnabledPaneIndex + 1, 0, pane);
            }
            else {
                // add new default-disabled panes at the end of the panes
                this.panes.push(pane);
            }
        }
    },

    saveState: function() {
        var state = [];

        for (var i = 0; i < this.panes.length; i++) {
            state.push({ id: this.panes[i].id, enabled: this.panes[i].enabled });
        }

        settings.set('sidebarPanesState', state);
    },

};
