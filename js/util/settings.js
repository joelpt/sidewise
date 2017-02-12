"use strict";

class Settings {

    constructor() {
        // Used to reduce JSON-parsing cost of setting lookups
        this.cache = {};
    }

    // Record a setting value.
    set(name, value) {
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
    }

    // Retrieve a setting value, or defaultValue if that setting has no existing value.
    get(name, defaultValue) {
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
    }

    // Save data to chrome.storage.local. This differs from the set/get methods which rely
    // on localStorage: for larger chunks of data such as tree data we prefer using
    // chrome.storage.local to avoid the possibility of hitting the localStorage 5MB quota.
    async saveData(key, data) {
        return new Promise(resolve => {
            const payload = {};
            payload[key] = data;
            chrome.storage.local.set(payload, function() {
                resolve();
            });
        });
    }

    // Load data from chrome.storage.local.
    async loadData(key, defaultValue) {
        return new Promise(resolve => {
            chrome.storage.local.get(key, function(result) {
                resolve(result[key] || defaultValue);
            });
        });
    }

    // Returns all data stored in chrome.storage.local.
    async loadAllData() {
        return new Promise(resolve => {
            chrome.storage.local.get(null, function(result) {
                resolve(result);
            });
        });
    }

    // Output all the settings and saved data as a JSON string
    async toJSON() {
        const localStorageJson = mapObjectProps(localStorage, (k, v) => `"${k}": ${v}`).join(',');

        const chromeStorageAll = await this.loadAllData();
        const chromeStorageJson = mapObjectProps(chromeStorageAll, (k, v) => `"${k}": ${JSON.stringify(v)}`).join(',');

        const result = `{ "localStorage": { ${localStorageJson} }, "chromeStorage": { ${chromeStorageJson} } }`;
        return result;
    }

    dump(maxElemLength) {
        return mapObjectProps(localStorage, function(k, v) {
            var o = JSON.stringify(v, StringifyReplacer);
            if (maxElemLength && maxElemLength < o.length) {
                o = o.substring(0, maxElemLength) + '...';
            }
            return k + ': ' + o;
        }).join('\n');
    }


    ///////////////////////////////////////////////////////////
    // Settings initialization
    ///////////////////////////////////////////////////////////

    // One-time initialization of default settings.
    // If already initialized, does nothing, unless forceReset is true.
    async initializeDefaults(forceReset) {
        var version = getVersion();
        var lastInitVersion = this.get('lastInitializedVersion');

        const STORAGE_SWITCHOVER_VERSION_THRESHOLD = '2017.02.11';  // chrome.storage.local is in use after this version ID
        if (lastInitVersion && lastInitVersion < STORAGE_SWITCHOVER_VERSION_THRESHOLD) {
            console.log(`Need to migrate tree data to chrome.storage.local: ${lastInitVersion} < ${STORAGE_SWITCHOVER_VERSION_THRESHOLD}`);
            await this.migrateTreeStorageToChromeStorage();
        }

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
            pages_trimPageTitlePrefixes: true,
            closed_maxPagesRemembered: 200,
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
            showWhatsNewPane: true,
            lastPromoPageShownDate: null,
            focusSidebarOnHover: false
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
    }

    // Beginning in the 2017 releases of Sidewise, chrome.storage.local is used instead of localStorage for all tree data
    // (localStorage is still used for the other settings). When upgrading to this new version of Sidewise, we therefore
    // must migrate any tree data from localStorage over to chrome.storage.local. This is a one-time operation per install.
    async migrateTreeStorageToChromeStorage() {
        console.log('Initiating migration of tree data to chrome.storage.local');

        // Need to migrate now
        var treeNames = ['pageTree', 'backupPageTree', 'backupPageTreeLastSession', 'ghostTree', 'recentlyClosedTree'];

        for (const i in treeNames) {
            var name = treeNames[i];
            await migrateTreeData(name);
        }

        console.log('Finished migration of tree data to chrome.storage.local');
        return;

        async function migrateTreeData(name) {
            console.log(`Migrating ${name}`);

            // get the data from the old location
            const data = localStorage[name];

            if (!data || data.length === 0) {
                console.log('No old data to migrate');
                return;
            }

            // parse it
            const dataObject = JSON.parse(data);

            // deposit it in the new location
            await settings.saveData(name, dataObject);

            // clear the data from the old location
            localStorage.removeItem(name);

            // validation via console log
            var movedData = await settings.loadData(name);
            console.log(`Migrated data successfully: ${movedData.length} top level entries, first entry has ${movedData[0].children.length} children`);
        }
    }

    ///////////////////////////////////////////////////////////
    // Setting-related helpers
    ///////////////////////////////////////////////////////////

    updateStateFromSettings(changedSetting) {
        var bg = chrome.extension.getBackgroundPage();
        var sh = bg.sidebarHandler;

        var loggingChanged = false;
        if (loggingEnabled != this.get("loggingEnabled")) {
            loggingChanged = true;
            bg.setLoggingState();
        }

        sh.targetWidth = this.get('sidebarTargetWidth');

        var dockState = this.get('dockState');
        
        if (!sh.sidebarExists()) {
            return;
        }

        if (sh.dockState != dockState) {
            sh.remove(function() {
                sh.createWithDockState(dockState);
            });
            return;
        }

        // Push changes out to sidebar panes
        for (var k in sh.sidebarPanes) {
            var domWindow = sh.sidebarPanes[k];
            
            if (!domWindow) {
                continue;
            }

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

                if (changedSetting == 'pages_trimPageTitlePrefixes' && k == 'pages') {
                    domWindow.ft.formatAllRowTitles.call(domWindow.ft);
                }
            }
            catch(ex) {}

            domWindow.$.fx.off = !this.get('animationEnabled');

            if (!loggingChanged) {
                continue;
            }

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
