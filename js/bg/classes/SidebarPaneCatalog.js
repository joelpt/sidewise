var SidebarPaneCatalog = function() {
    this.$base(config.AVAILABLE_PANES);
};

SidebarPaneCatalog.prototype = {

    getPane: function(id) {
        return this.getItem(id);
    },

    getPaneIds: function() {
        return this.getIds();
    },

    loadState: function() {
        var saved = settings.get('sidebarPanesState');

        if (!saved) {
            return;
        }

        this.items = [];
        var seenPanes = [];

        var availPanes = clone(config.AVAILABLE_PANES);
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

            this.items.push(pane);
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
                this.items.splice(lastEnabledPaneIndex + 1, 0, pane);
            }
            else {
                // add new default-disabled panes at the end of the panes
                this.items.push(pane);
            }
        }
    },

    saveState: function() {
        return this.$super('saveState')('sidebarPanesState');
    },

    addPane: function(id, enabled, url, label, icon) {
        var pane = { id: id, enabled: enabled, url: url, label: label, icon: icon };
        return this.appendItem(pane);
    },

    removePane: function(id) {
        return this.removeItem(id);
    },

    reorderPane: function(id, newIndex) {
        return this.reorderItem(id, newIndex);
    }

};

extendClass(SidebarPaneCatalog, Catalog, SidebarPaneCatalog.prototype);
