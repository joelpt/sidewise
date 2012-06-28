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
            return;
        }

        console.log('Initializing settings', 'old version:', lastInitVersion, 'current version:', version);

        var defaultSettings = {
            openSidebarOnStartup: true,
            keepSidebarOnTop: false,
            dockState: 'right',
            browserActionButtonBehavior: 'show',
            useAdvancedTreeFiltering: false,
            pages_doubleClickAction: 'expand',
            pages_middleClickAction: 'none',
            smartFocusOnClose: false,
            smartFocusPrefersCousins: false,
            loggingEnabled: false,
            alwaysShowAdvancedOptions: false,
            sidebarTargetWidth: 300,
            allowAutoUnmaximize: true,
            autoCollapseLastSessionWindows: true,
            rememberOpenPagesBetweenSessions: true,
            wakeHibernatedPagesOnClick: true
        };

        for (var setting in defaultSettings) {
            var oldValue = this.get(setting);
            var newValue = (oldValue === undefined ? defaultSettings[setting] : oldValue);

            this.set(setting, newValue);

            if (oldValue != newValue) {
                console.log('Initialized setting', setting, 'to:', newValue);
            }
        }

        this.set('lastInitializedVersion', version);
        console.log('Initialization of settings done, settings version now at', version);
    },


    ///////////////////////////////////////////////////////////
    // Setting-related helpers
    ///////////////////////////////////////////////////////////

    updateStateFromSettings: function() {
        var bg = chrome.extension.getBackgroundPage();
        var sh = bg.sidebarHandler;

        bg.loggingEnabled = this.get("loggingEnabled");

        sh.targetWidth = this.get('sidebarTargetWidth');

        var dockState = this.get('dockState');
        if (sh.sidebarExists()) {
            if (sh.dockState != dockState) {
                sh.remove(function() {
                    sh.createWithDockState(dockState);
                });
                return;
            }
            var pagesDOMWindow = sh.sidebarPanes['pages'];
            if (pagesDOMWindow) {
                pagesDOMWindow.ft.useAdvancedFiltering = this.get('useAdvancedTreeFiltering');
            }
        }
    }

};
