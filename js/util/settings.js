function saveSetting(name, value) {
    if (value == null || value === undefined) {
        localStorage.removeItem(name);
        return;
    }
    localStorage[name] = JSON.stringify(value);
}

function loadSetting(name, defaultValue) {
    var value = localStorage[name];

    if (value) {
        return JSON.parse(value);
    }

    return defaultValue;
}

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
    // TODO implement redock/undock type functionality instead of recreating sidebar
}

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
        sidebarTargetWidth: 300
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
