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

    sh.monitorMetrics = loadSetting('monitorMetrics');
    sh.maximizedMonitorOffset = loadSetting('maximizedMonitorOffset');
    sh.targetWidth = loadSetting('sidebarTargetWidth');

    var dockState = loadSetting('dockState');
    if (sh.sidebarExists() && sh.dockState != dockState) {
        sh.remove(function() {
            sh.createWithDockState(dockState);
        });
    }
    // TODO implement redock/undock type functionality instead of recreating sidebar
}

// One-time initialization of default settings; if already initialized, does nothing
function initializeDefaultSettings() {
    if (loadSetting('settingsInitialized')) {
        return;
    }

    var defaultSettings = {
        openSidebarOnStartup: true,
        keepSidebarOnTop: false,
        dockState: 'right',
        browserActionButtonBehavior: 'show',
        loggingEnabled:  false,
        sidebarTargetWidth: 400,
        settingsInitialized: true
    };

    for (var setting in defaultSettings) {
        saveSetting(setting, defaultSettings[setting]);
    }
}
