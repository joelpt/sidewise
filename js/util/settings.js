/**
  * @class
  * @constructor
  */
var Settings = function()
{
    this.cache = {};
};

Settings.prototype = {

    ///////////////////////////////////////////////////////////
    // Setting set (save) and get (load)
    ///////////////////////////////////////////////////////////

    set: function(name, value) {
        if (value === undefined) {
            // unset localStorage setting value
            localStorage.removeItem(name);

            if (this.cache[name] !== undefined)  {
                // unset cached setting value
                delete this.cache[name];
            }
            return;
        }

        // store setting value in localStorage
        localStorage[name] = JSON.stringify(value);

        // cache setting value
        this.cache[name] = value;
    },

    get: function(name, defaultValue) {
        // get setting value from cache
        var value = this.cache[name];

        if (value !== undefined) {
            // cached setting value found, return it
            return value;
        }

        // get setting value from localStorage
        value = localStorage[name];
        if (value !== undefined) {
            // setting exists, parse it
            var parsed = JSON.parse(value);

            // store parsed setting value in cache
            this.cache[name] = parsed;

            // return parsed setting value
            return parsed;
        }

        // did not find the setting, use defaultValue as provided
        return defaultValue;
    },

    dump: function(maxElemLength) {
        return mapObjectProps(this.cache, function(k, v) {
            var o = JSON.stringify(v, StringifyReplacer);
            if (maxElemLength && maxElemLength < o.length) {
                o = o.substring(0, maxElemLength) + '...';
            }
            return k + ': ' + o;
        }).join('\n');
    },

    ///////////////////////////////////////////////////////////
    // Settings initialization
    ///////////////////////////////////////////////////////////

    // One-time initialization of default settings.
    // If already initialized, does nothing, unless forceReset is true.
    initializeDefaults: function(forceReset) {
        var version = getVersion();
        var lastInitVersion = this.get('lastInitializedVersion');

        if (version == lastInitVersion && !forceReset) {
            console.log('Settings are at current version', version);
            return false;
        }

        console.log('Initializing settings', 'old version:', lastInitVersion, 'current version:', version);

        var defaultSettings = {
            openSidebarOnStartup: true,
            keepSidebarOnTop: false,
            dockState: 'left',
            browserActionButtonBehavior: 'show',
            useAdvancedTreeFiltering: false,
            pages_doubleClickAction: 'hibernate',
            pages_middleClickAction: 'none',
            pages_createNewTabUrl: 'newtab',
            pages_clickOnHoverDelay: false,
            pages_clickOnHoverDelayMs: 250,
            pages_clickOnMouseWheel: false,
            pages_showMediaPlayTime: true,
            smartFocusOnClose: false,
            smartFocusPrefersCousins: false,
            smartFocusPrefersParent: true,
            loggingEnabled: false,
            alwaysShowAdvancedOptions: false,
            sidebarTargetWidth: 275,
            allowAutoUnmaximize: true,
            autoCollapseLastSessionWindows: true,
            rememberOpenPagesBetweenSessions: true,
            wakeHibernatedPagesOnClick: false,
            animationEnabled: true,
            autoSelectChildrenOnDrag: true,
            reportUsageStatistics: true,
            multiSelectActionConfirmThreshold: 5,
            showWhatsNewPane: true
        };

        for (var setting in defaultSettings) {
            var oldValue = this.get(setting);
            var newValue = (oldValue === undefined || forceReset ? defaultSettings[setting] : oldValue);

            this.set(setting, newValue);

            if (oldValue != newValue) {
                console.log('Initialized setting', setting, 'to:', newValue);
            }
        }

        if (lastInitVersion === undefined) {
            reportEvent('sidewise', 'installed', version);
            reportPageView('/installed');
        }
        else {
            reportEvent('sidewise', 'updated', version);
        }

        this.set('lastInitializedVersion', version);
        console.log('Initialization of settings done, settings version now at', version);
        return true;
    },


    ///////////////////////////////////////////////////////////
    // Setting-related helpers
    ///////////////////////////////////////////////////////////

    updateStateFromSettings: function() {
        var bg = chrome.extension.getBackgroundPage();
        var sh = bg.sidebarHandler;

        var loggingChanged = false;
        if (loggingEnabled != this.get("loggingEnabled")) {
            loggingChanged = true;
            bg.setLoggingState();
        }

        sh.targetWidth = this.get('sidebarTargetWidth');

        var dockState = this.get('dockState');
        if (sh.sidebarExists()) {
            if (sh.dockState != dockState) {
                sh.remove(function() {
                    sh.createWithDockState(dockState);
                });
                return;
            }

            // Push changes out to sidebar panes
            for (var k in sh.sidebarPanes) {
                var domWindow = sh.sidebarPanes[k];
                if (domWindow) {
                    try {
                        // TODO improve this; we assume too much wrt what's happening in
                        // the child page with domWindow.ft. To fix, when someone calls
                        // sbh.registerSidebarPane, accept an onSettingsChanged event handler arg
                        // and call it here; SidebarPaneFancyTreeBinder can bind up the onSettingsChanged
                        // event to listen for settings changes and set java.fx appropriately
                        domWindow.ft.useAdvancedFiltering = this.get('useAdvancedTreeFiltering');
                        domWindow.ft.autoSelectChildrenOnDrag = this.get('autoSelectChildrenOnDrag');
                        domWindow.ft.clickOnMouseWheel = this.get('pages_clickOnMouseWheel');

                        var clickOnHoverDelayMs;
                        if (this.get('pages_clickOnHoverDelay')) {
                            clickOnHoverDelayMs = this.get('pages_clickOnHoverDelayMs');
                        }
                        domWindow.ft.clickOnHoverDelayMs = clickOnHoverDelayMs;

                    }
                    catch(ex) {}

                    domWindow.$.fx.off = !this.get('animationEnabled');

                    if (loggingChanged) {
                        if (domWindow.loggingEnabled === undefined) {
                            continue;
                        }
                        if (k != 'sidebarHost') {
                            // reload the sidebar pane, which will cause it to get
                            // an updated loggingEnabled value on load and redraw
                            // its contents accordingly
                            domWindow.location.reload();
                        }
                    }
                }
            }
        }
    }

};
