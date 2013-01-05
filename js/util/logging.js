// Custom error handler
var nativeError = Error;
Error = function(message) {
    this.message = message;
    this.name = '';
    this._stack = getCallStack();
    var output = '';
    try {
        output = writeDiagnosticLog.apply(this, ['[THROWING ERROR]'].concat(message));
        // console.error(this.stack);
    }
    catch(ex) {
        console.error('Error in custom Error() handler!', ex);
        output = ex.message;
    }
};
Error.prototype = new nativeError();
Error.prototype.constructor = Error;

var nativeConsoleError = console.error;
console.error = function() {
    nativeConsoleError.apply(console, arguments);
    try {
        arguments['0'] = '[CONSOLE ERROR] ' + arguments[0];
        writeDiagnosticLog.apply(this, arguments);
    }
    catch(ex) {
        console.error('Error in custom console.error() handler!', ex);
    }
};


var RUNNING_LOG_MAX_SIZE = 1.0 * 1024 * 1024;
var RUNNING_LOG_OVERTRIM_PCT = 0.25;
var MAX_JSON_ARG_LENGTH = 250;

var loggingEnabled;
var logObjectsAsJSON;

var runningLog = '';

var log = function() { };

setLoggingState();
startLogTrimmer();

function setLoggingState() {
    loggingEnabled = localStorage['loggingEnabled'] == 'true' || false;
    logObjectsAsJSON = localStorage['logObjectsAsJSON'] == 'true' || false;
    if (loggingEnabled) {
        log = writeAndLogToConsole;
        return;
    }
    log = function() { };
}

function writeAndLogToConsole() {
    var messages = writeDiagnosticLog.apply(this, arguments);
    if (console && messages) {
        var stack = getCallStack();
        if (typeof(arguments['0']) == 'string' || typeof(arguments['0']) == 'int') {
            arguments['0'] = arguments['0'] + ' @ ' + stack[0];
        }
        else {
            for (var i = arguments.length - 1; i >= 0; i--) {
                arguments[(i + 1).toString()] = arguments[i.toString()];
            };

            // arguments[arguments.length.toString()] = arguments[0];
            arguments[0] = stack[0];
            arguments.length++;
        }
        console.groupCollapsed.apply(console, arguments);
        console.log.apply(console, [stack.join('\n')]);
        console.groupEnd();
    }
}

// Logs all passed arguments to console if loggingEnabled is true.
// If the first argument is a string it will be used as the starting label for the output log row;
//   if not, the caller function name is used instead.
// Object arguments are turned into JSON strings and output if logObjectsAsJSON is true.
// Call stack data is included in the output.
function writeDiagnosticLog() {
    if (!loggingEnabled) return;

    var messages = [];
    var jsonMessages = [];
    var isBackgroundPage = (window.bg ? false : true);

    for (var i in arguments) {
        var arg = arguments[i];
        if (typeof(arg) == 'string' || typeof(arg) == 'number') {
            messages.push(arg);
            if (isBackgroundPage) {
                jsonMessages.push(arg);
            }
            continue;
        }
        if (isBackgroundPage) {
            var json;
            try {
                if (arg instanceof DataTreeNode) {
                    json = arg.elemType + '::' + JSON.stringify({ id: arg.id, index: arg.index, windowId: arg.windowId, hibernated: arg.hibernated, restorable: arg.restorable,
                        incognito: arg.incognito, status: arg.status, url: arg.url, pinned: arg.pinned, title: arg.title, label: arg.label,
                        childrenCount: arg.children.length });
                }
                else {
                    json = JSON.stringify(arg, StringifyReplacer).substring(0, MAX_JSON_ARG_LENGTH);
                    if (json.length == MAX_JSON_ARG_LENGTH)  {
                        json += '...';
                    }
                }
                jsonMessages.push(json);
            }
            catch (ex) {
                jsonMessages.push('ERROR CONVERTING TO JSON');
                messages.push(arg);
                continue;
            }
            if (logObjectsAsJSON) {
                messages.push(json);
                continue;
            }
        }
        messages.push(arg);
        continue;
    }

    var stack = { CallStack: getCallStack() };
    var firstElem = stack.CallStack[0].toString();

    if (typeof(arguments[0]) == 'string') {
        messages.splice(1, 0, '@', firstElem, stack, '\n');
    }
    else {
        messages.splice(0, 0, firstElem, stack, '\n');
    }

    if (messages[messages.length-1] == '\n') {
        messages.pop();
    }

    if (!isBackgroundPage) {
        // don't write running log in non bg pages
        return messages;
    }

    jsonMessages = jsonMessages.join(' ');
    runningLog += jsonMessages + '\n';
    if (jsonMessages.indexOf('---') == 0) {
        runningLog += '\n\n';
    }
    else {
        runningLog += '    ' + stack.CallStack.join('\n    ') + '\n\n';
    }

    firstElem = '';
    stack = '';
    return messages;
}

// Like log(), but abbreviates multiline strings to 'first line...'
function log_brief() {
    if (!loggingEnabled) {
        return;
    }

    var newargs = [];
    for (var i in arguments) {
        var arg = arguments[i];
        if (typeof(arg) == 'string') {
            var lines = arg.split('\n');
            newargs.push(lines[0] + (lines.length > 1 ? '...' : ''));
            continue;
        }
        newargs.push(arg);
    }
    log.apply(this, newargs);
}

function startLogTrimmer() {
    if (chrome.extension.getBackgroundPage() !== window) {
        return;
    }
    setInterval(trimRunningLog, 30000);
}

function trimRunningLog() {
    if (runningLog.length >= RUNNING_LOG_MAX_SIZE) {
        console.log('trimmed running log: before', runningLog.length);
        runningLog = runningLog.substring((runningLog.length - RUNNING_LOG_MAX_SIZE) + (RUNNING_LOG_MAX_SIZE * RUNNING_LOG_OVERTRIM_PCT));
        console.log('trimmed running log: after', runningLog.length);
    }
}

function getCallStack() {
    var stack = new nativeError().stack;

    stack = (stack + '\n')
        .replace(/^\S[^\(]+?[\n$]/gm, '')
        .replace(/^\s+(at eval )?at\s+/gm, '')
        .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}()@$1$2')
        .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}()@$1')
        .replace(/\n+$/gm, '');

    stack = stack.split('\n');

    // discard unwanted calls from top of stack
    while (stack[0].indexOf('logging.js:') >= 0
        || stack[0].indexOf('Error') == 0)
    {
        stack.shift(1);
    }

    return stack;
}

var StringifyReplacer = function (stack, undefined, r, i) {
  // a WebReflection hint to avoid recursion
  return function StringifyReplacer(key, value) {
    // this happens only first iteration
    // key is empty, and value is the object
    if (key === "") {
      // put the value in the stack
      stack = [value];
      // and reset the r
      r = 0;
      return value;
    }
    switch(typeof value) {
      case "function":
        // not allowed in JSON protocol
        // let's return some info in any case
        return "".concat(
          "function ",
          value.name || "anonymous",
          "(",
            Array(value.length + 1).join(",arg").slice(1),
          "){}"
        );
      // is this a primitive value ?
      case "boolean":
      case "number":
        return value;
      case "string":
        // primitives cannot have properties
        // <span class="goog_qs-tidbit goog_qs-tidbit-0">so these are safe to parse</span>
        if (value.indexOf('data:image') == 0) {
            return value.substring(0, 16) + '...';
        }
        return value;
      default:
        // only null does not need to be stored
        // for all objects check recursion first
        // hopefully 255 calls are enough ...
        if (!value || !StringifyReplacer.filter(value) || 255 < ++r) return undefined;
        i = stack.indexOf(value);
        // all objects not already parsed
        if (i < 0) return stack.push(value) && value;
        // all others are duplicated or cyclic
        // mark them with index
        return "*R" + i;
    }
  };
}();

// reusable to filter some undesired object
// as example HTML node
StringifyReplacer.filter = function (value) {
  // i.e. return !(value instanceof Node)
  // to ignore nodes
  // if (value.indexOf('data:image') == 0) {
  //   return 'data:image....';
  // }
  // console.log(value);
  // console.log('***> ' + value);

  return value;
};