///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var settingsCache = {};


///////////////////////////////////////////////////////////
// Setting save and load
///////////////////////////////////////////////////////////

function saveSetting(name, value) {
    if (value === undefined) {
        // unset localStorage setting value
        localStorage.removeItem(name);

        if (settingsCache[name] !== undefined)  {
            // unset cached setting value
            delete settingsCache[name];
        }
        return;
    }

    // store setting value in localStorage
    localStorage[name] = JSON.stringify(value);

    // cache setting value
    settingsCache[name] = value;
}

function loadSetting(name, defaultValue) {
    // get setting value from cache
    var value = settingsCache[name];

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
        settingsCache[name] = parsed;

        // return parsed setting value
        return parsed;
    }

    // did not find the setting, use defaultValue as provided
    return defaultValue;
}


///////////////////////////////////////////////////////////
// Setting-related helpers
///////////////////////////////////////////////////////////

function updateStateFromSettings() {
    var bg = chrome.extension.getBackgroundPage();
    var sh = bg.sidebarHandler;

    bg.loggingEnabled = loadSetting("loggingEnabled");

    sh.targetWidth = loadSetting('sidebarTargetWidth');

    var dockState = loadSetting('dockState');
    if (sh.sidebarExists() && sh.dockState != dockState) {
        sh.remove(function() {
            sh.createWithDockState(dockState);
        });
    }
}


///////////////////////////////////////////////////////////
// Settings initialization
///////////////////////////////////////////////////////////

// One-time initialization of default settings.
// If already initialized, does nothing, unless forceReset is true.
function initializeDefaultSettings(forceReset) {
    var version = getVersion();
    var lastInitVersion = loadSetting('lastInitializedVersion');

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
        allowAutoUnmaximize: true
    };

    for (var setting in defaultSettings) {
        var oldValue = loadSetting(setting);
        var newValue = (oldValue === undefined ? defaultSettings[setting] : oldValue);

        saveSetting(setting, newValue);

        if (oldValue != newValue) {
            console.log('Initialized setting', setting, 'to:', newValue);
        }
    }

    saveSetting('lastInitializedVersion', version);
    console.log('Initialization of settings done, settings version now at', version);
}
