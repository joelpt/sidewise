"use strict";

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var IS_UNSCRIPTABLE_URL_REGEX = new RegExp(/^((data|about|file|view-source|chrome.*):|https?:\/\/chrome.google.com\/webstore)/);

var SECOND_MS = 1000;
var MINUTE_MS = SECOND_MS * 60;
var HOUR_MS = MINUTE_MS * 60;
var DAY_MS = HOUR_MS * 24;
var WEEK_MS = DAY_MS * 7;
var MONTH_MS = WEEK_MS * 4;
var YEAR_MS = DAY_MS * 365;


///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var URL_FAVICON_REPLACEMENTS = {
    'chrome://chrome/extensions': '/images/favicon/extensions.png',  // Chrome 19 and earlier
    'chrome://chrome/extensions/': '/images/favicon/extensions.png', // Chrome 20 early versions
    'chrome://extensions/': '/images/favicon/extensions.png',        // Chrome 20 later versions+
    'chrome://chrome/settings/': '/images/favicon/settings.png',     // Chrome 19 & 20 early versions
    'chrome://settings/': '/images/favicon/settings.png',            // Chrome 20 later versions
    'chrome://downloads/': '/images/favicon/downloads.png',
    'chrome://bookmarks/': '/images/favicon/bookmarks.png',
    'chrome://chrome/history/': '/images/favicon/history.png',
    'chrome://history/': '/images/favicon/history.png',
    'chrome://newtab/': '/images/favicon/newtab.png'
};

URL_FAVICON_REPLACEMENTS[(chrome.extension || window.parent.chrome.extension).getURL('/options.html')] = '/images/sidewise_icon_16.png';
URL_FAVICON_REPLACEMENTS[(chrome.extension || window.parent.chrome.extension).getURL('/options_install.html')] = '/images/sidewise_icon_16.png';
URL_FAVICON_REPLACEMENTS[(chrome.extension || window.parent.chrome.extension).getURL('/options_install.html?page=donate')] = '/images/sidewise_icon_16.png';

var URL_TITLE_REPLACEMENTS = {
    'chrome://chrome/extensions': getMessage('tabTitle_Extensions'),
    'chrome://chrome/extensions/': getMessage('tabTitle_Extensions'),
    'chrome://extensions/': getMessage('tabTitle_Extensions'),
    'chrome://chrome/settings/': getMessage('tabTitle_Settings'),
    'chrome://settings/': getMessage('tabTitle_Settings'),
    'chrome://downloads/': getMessage('tabTitle_Downloads'),
    'chrome://bookmarks/': getMessage('tabTitle_BookmarkManager'),
    'chrome://chrome/history/': getMessage('tabTitle_History'),
    'chrome://history/': getMessage('tabTitle_History'),
    'chrome://newtab/': getMessage('tabTitle_NewTab')
};

var PLATFORM = identifyPlatform();


///////////////////////////////////////////////////////////
// URL related functions
///////////////////////////////////////////////////////////

function getBestFavIconUrl(favIconUrl, url) {
    var replacedFavicon = URL_FAVICON_REPLACEMENTS[url];

    if (replacedFavicon) {
        return replacedFavicon;
    }

    if (favIconUrl && favIconUrl != '') {
        return favIconUrl;
    }

    return 'chrome://favicon/';
}

function getChromeFavIconUrl(url) {
    return 'chrome://favicon/' + dropUrlHash(url);
}

function isStaticFavIconUrl(favIconUrl) {
    if (!favIconUrl) {
        return false;
    }
    if (favIconUrl == '') {
        return false;
    }
    if (favIconUrl.indexOf('chrome://favicon') == 0) {
        return false;
    }
    return true;
};

function getBestPageTitle(title, url) {
    var replacedTitle = URL_TITLE_REPLACEMENTS[url];

    if (replacedTitle) {
        return replacedTitle;
    }

    if (title && title != '') {
        return title;
    }

    return url;
}

function isScriptableUrl(url)
{
    return (url !== '' && !IS_UNSCRIPTABLE_URL_REGEX.test(url));
}

function isExtensionUrl(url)
{
    return url.indexOf('chrome-extension://') == 0;
}

function isNewTabUrl(url) {
    return (url.substr(0, 15) === 'chrome://newtab');
}

function splitUrl(url)
{
    var r = {};
    var m = url.match(/(?:()(www\.[^\s\/?#]+\.[^\s\/?#]+)|([^\s:\/?#]+):\/\/([^\s\/?#]*))([^\s?#]*)(?:\?([^\s#]*))?(?:#(\S*))?/);

    if (m)
    {
        r.protocol = m[3];
        r.host = m[4];
        r.path = m[5];
        r.query = m[6];
        r.hash = m[7];
        var m = r.host.match(/([^\.]+\.(org|com|net|info|[a-z]{2,3}(\.[a-z]{2,3})?))$/);
        r.domain = m ? m[0] : r.host;
        return r;
    }

    // that didn't work, try matching against a generic proto:remainder format
    m = url.match(/(.+):(.+)/);
    if (m) {
        r.protocol = m[1];
        r.host = m[2];
        r.path = r.host;
        r.domain = r.host;
        return r;
    }

    // no match
    return undefined;
}

function dropUrlHash(url)
{
    return url.replace(/#.*$/, '');
}

function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null;
}

///////////////////////////////////////////////////////////
// Script injection
///////////////////////////////////////////////////////////

function injectContentScriptInExistingTabs(url)
{
    readFile(url, injectScriptInExistingTabs);
}

function injectScriptInExistingTabs(script)
{
    chrome.tabs.query({}, function(tabs) {
        for (var i in tabs) {
            var tab = tabs[i];
            // log('Injecting script into tab', tab.id, tab.url);
            executeContentScript(tab.url, tab.id, script);
        }
    });
}

function executeContentScript(url, tabId, scriptBody)
{
    if (isScriptableUrl(url))
    {
        // log_brief(tabId, scriptBody);
        chrome.tabs.executeScript(tabId, { code: scriptBody });
    }
}


///////////////////////////////////////////////////////////
// File/script reading
///////////////////////////////////////////////////////////

function readFile(url, callback)
{
    var xhr = new XMLHttpRequest();
    try {
        xhr.onreadystatechange = function(){
            if (xhr.readyState != 4) {
                return;
            }

            if (xhr.responseText) {
                callback(xhr.responseText);
            }
            else {
                throw new Error('No data returned for readFile: ' + url);
            }
        }

        xhr.onerror = function(error) {
            console.error(error);
        }

        xhr.open("GET", url, true);
        xhr.send(null);
    } catch(e) {
        console.error(e);
    }
}

// Adds a includeScripts method which loads the specified
// scripts in order and executes them
// Requires jQuery
function includeScripts(scriptUrls) {
    $.ajaxSetup({async: false});
    scriptUrls.forEach(function(e) {
        $.getScript(e);
    });
    $.ajaxSetup({async: true});
}


///////////////////////////////////////////////////////////
// PageTree related
///////////////////////////////////////////////////////////

function getNumericId(id)
{
    return parseInt(id.slice(1));
}


///////////////////////////////////////////////////////////
// Platform detection
///////////////////////////////////////////////////////////

function identifyPlatform()
{
    var platform = navigator.platform;

    if (platform == 'MacIntel' || platform == 'MacPPC') {
        return 'Mac';
    }

    if (platform == 'Win32' || platform == 'WinNT') {
        return 'Win';
    }

    return 'Unix'; // probably a bit optimistic
}


///////////////////////////////////////////////////////////
// Javascript object manipulation
///////////////////////////////////////////////////////////

function clone(obj, ignoreProperties) {
    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        var copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        var copy = [];
        var len = obj.length;
        for (var i = 0; i < len; ++i) {
            copy[i] = clone(obj[i], ignoreProperties);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        var copy = {};
        for (var attr in obj) {
            if (!obj.hasOwnProperty(attr)) {
                continue;
            }
            if (ignoreProperties instanceof Array && ignoreProperties.indexOf(attr) > -1) {
                continue;
            }
            copy[attr] = clone(obj[attr], ignoreProperties);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

function castObject(object, toClass) {
    // pseudocast: doesn't actually change the object's type, but
    // will cause instanceof to report correct prototype inheritance
    object.__proto__ = toClass.prototype;
}

// Iterates through the properties of object, calling mapFn(key, value) on each one.
// To conveniently use as a filter, make mapFn() return undefined for those properties to not output.
// @returns An array of the return values of the mapFn calls.
function mapObjectProps(object, mapFn) {
    var ary = [];
    for (var k in object) {
        var r = mapFn(k, object[k]);
        if (r !== undefined) {
            ary.push(r);
        }
    }
    return ary;
}

// Copies all properties defined on fromObject onto toObject.
// Leaves from unchanged.
function copyObjectProps(fromObject, toObject, overwriteExisting) {
    for (var k in fromObject) {
        if (!fromObject.hasOwnProperty(k) ) {
            continue;
        }
        if (!overwriteExisting && toObject.hasOwnProperty(k)) {
            continue;
        }
        toObject[k] = fromObject[k];
    }
}

// Like copyObjectProps but works instead on each property of from/toObject
// which is itself an object.
function copyObjectSubProps(fromObject, toObject, overwriteExisting) {
    for (var k in fromObject) {
        if (!fromObject.hasOwnProperty(k) ) {
            continue;
        }
        if (!(fromObject[k] instanceof Object)) {
            continue;
        }
        if (toObject[k] === undefined) {
            toObject[k] = fromObject[k];
            continue;
        }
        copyObjectProps(fromObject[k], toObject[k], overwriteExisting);
    }
}


///////////////////////////////////////////////////////////
// Javascript object subclassing
///////////////////////////////////////////////////////////

// TODO drop smart surrogate logic. When a function that is defined on a parent prototype needs to call "across" to
// another function on its own prototype, rather than calling "down" to the child's prototype, we should instead
// just rename the target function in the parent and/or child.

// Create surrogate child functions for OO-like parent accesses.
var EXTEND_CLASS_BANNED_SURROGATE_NAMES =
    ['constructor', '$base', '$super', '$parent'];

// Inherit superClass's prototype onto subClass.
// Adds properties of prototype argument to subClass's prototype.
//
// Adds the following additional prototype properties to subClass:
//
// $super: function to call parent functions, e.g.
//      this.$super('parentFunctionName')(arg1, arg2, ...);
//      This will use the correct prototype functions of the parent within
//          the called super-function, so we don't have a parent trying to
//          call the child's functions of the same name.
// $base: function to call parent's constructor, e.g.
//      this.$base(constructorArg1, ...);
// $parent: equals the superClass object.
//
// For functions that exist on the superClass which are not explicitly
// overriden in the subClass, a surrogate function is generated of the
// same name and stored in the subClass's prototype which calls $super()
// for the given function. This ensures that for non-overriden functions,
// the parent function always gets executed with the proper parent-prototype
// context, as described above w.r.t. $super.
function extendClass(subClass, superClass, prototype) {
    if (!superClass) {
        superClass = Object;
    }
    subClass.prototype = Object.create(superClass.prototype);
    subClass.prototype.constructor = subClass;
    for (var x in prototype) {
        if (prototype.hasOwnProperty(x)) {
            subClass.prototype[x] = prototype[x];
        }
    }
    for (var x in superClass.prototype) {
        if (EXTEND_CLASS_BANNED_SURROGATE_NAMES.indexOf(x) >= 0) {
            // skip banned surrogate function names
            continue;
        }
        if (!subClass.prototype.hasOwnProperty(x)) {
            // subClass didn't override this superClass function,
            // so create a surrogate function for it
            subClass.prototype[x] = getExtendClassSurrogateFunction(x);
            console.log('EXTENDED ' + getExtendClassSurrogateFunction(x));
        }
    }
    subClass.prototype.$super = function (propName) {
        var prop = superClass.prototype[propName];
        if (typeof prop !== "function") {
            return prop;
        }
        var self = this;
        return function (/*arg1, arg2, ...*/) {
            var selfProto = self.__proto__;
            self.__proto__ = superClass.prototype;
            try {
                return prop.apply(self, arguments);
            }
            finally {
                self.__proto__ = selfProto;
            }
        };
    };
    subClass.prototype.$parent = superClass;
    subClass.prototype.$base = function() {
        this.$super('constructor').apply(this, arguments);
    }
}

// Factory method to get a surrogate function for a child object
// to call $super on its parent object. Used when a parent object
// has a certain prototype function but child has not overriden it;
// by setting up surrogate functions on the child's prototype for these
// non-overriden functions we ensure the parent functions always get
// called with the parent's prototype context.
function getExtendClassSurrogateFunction(functionName) {
    return function() {
        console.log('called surrogate fn '+ functionName);
        return this.$super(functionName).apply(this, arguments);
    };
}


///////////////////////////////////////////////////////////
// Javascript Array manipulation
///////////////////////////////////////////////////////////

// Array Remove - By John Resig (MIT Licensed)
function remove(array, from, to) {
    var rest = array.slice((to || from) + 1 || array.length);
    array.length = from < 0 ? array.length + from : from;
    return array.push.apply(array, rest);
}

function removeElemFromArray(array, elem) {
    var index = array.indexOf(elem);

    if (index == -1) {
        return undefined;
    }

    return array.splice(index, 1);
}

function first(array, matchFn) {
    for (var i = 0; i < array.length; i++) {
        if (matchFn(array[i])) {
            return [i, array[i]];
        }
    }
}

function firstElem(array, matchFn) {
    for (var i = 0; i < array.length; i++) {
        if (matchFn(array[i])) {
            return array[i];
        }
    }
}

function last(array, matchFn) {
    for (var i = array.length - 1; i >= 0; i--) {
        if (matchFn(array[i])) {
            return [i, array[i]];
        }
    }
}

function groupBy(array, groupFn) {
    var r = [];
    for (var i = array.length - 1; i >= 0; i--) {
        var a = array[i];
        if (a === undefined) continue;

        var g = groupFn(a);
        if (r[g]) {
            r[g].push(a);
            continue;
        }
        r[g] = [a];
    }
    return r;
}

function mostFrequent(arr) {
    var uniqs = {};

    for(var i = 0; i < arr.length; i++) {
        uniqs[arr[i]] = (uniqs[arr[i]] || 0) + 1;
    }

    var max = { val: arr[0], count: 1 };
    for(var u in uniqs) {
        if(max.count < uniqs[u]) { max = { val: u, count: uniqs[u] }; }
    }

    return max;
}

///////////////////////////////////////////////////////////
// Data type related
///////////////////////////////////////////////////////////

function clamp(value, min, max)
{
    value = value < min ? min : value;
    value = value > max ? max : value;
    return value;
}

function formatSecondsAsHMS(seconds)
{
    seconds = parseInt(seconds);
    var hours = Math.floor(seconds / 3600);
    var mins = Math.floor((seconds - (hours * 3600)) / 60);
    var secs = Math.floor(seconds - (hours * 3600) - (mins * 60));
    if (secs <= 9) {
        secs = '0' + secs;
    }
    if (hours > 0) {
        hours += ':';
        if (mins <= 9) {
            mins = '0' + mins;
        }
    }
    else {
        hours = '';
    }
    return '[' + hours + mins + ':' + secs + ']';
}

function daysBetween(date1, date2) {

    // The number of milliseconds in one day
    var DAY_MS = 1000 * 60 * 60 * 24;

    // Convert both dates to milliseconds
    var date1_ms = date1.getTime();
    var date2_ms = date2.getTime();

    // Calculate the difference in milliseconds
    var difference_ms = Math.abs(date1_ms - date2_ms);

    // Convert back to days and return
    return Math.round(difference_ms/DAY_MS);
}

// Returns the difference between two times in abbreviated form, e.g. -2m, -3h, -10w, etc.
// Arguments can be either Dates or ints (as milliseconds since the epoch)
function getTimeDeltaAbbreviated(a, b, showSeconds) {
    // Convert both dates to milliseconds
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();

    // Calculate the difference in seconds
    var sign = b > a ? '' : '-';
    var delta = Math.abs(b - a);

    // Show as numeric offset in largest time-unit that is at least 1.0 units
    if (delta >= YEAR_MS) {
        return sign + Math.floor(delta / YEAR_MS) + 'y';
    }
    if (delta >= WEEK_MS) {
        return sign + Math.floor(delta / WEEK_MS) + 'w';
    }
    if (delta >= DAY_MS) {
        return sign + Math.floor(delta / DAY_MS) + 'd';
    }
    if (delta >= HOUR_MS) {
        return sign + Math.floor(delta / HOUR_MS) + 'h';
    }
    if (delta >= MINUTE_MS) {
        return sign + Math.floor(delta / MINUTE_MS) + 'm';
    }
    if (showSeconds) {
        return sign + Math.floor(delta / SECOND_MS) + 's';
    }
    return undefined;
}


///////////////////////////////////////////////////////////
// String tools
///////////////////////////////////////////////////////////

function padStringLeft(string, width) {
    if (string === undefined) {
        return Array(width + 1).join(' ');
    }
    if (typeof(string) != 'string') {
        string = string.toString();
    }
    if (string.length >= width) {
        return string;
    }

    var r = Array(width - string.length + 1).join(' ') + string;
    return r;
}


///////////////////////////////////////////////////////////
// GUID generation
///////////////////////////////////////////////////////////

function generateGuid() {
    var guid = Math.random().toString(36).toUpperCase();
    return guid.substring(2, 6) + '-' + guid.substring(6, 15) + '-' + Math.random().toString(36).substring(2, 15);
}

