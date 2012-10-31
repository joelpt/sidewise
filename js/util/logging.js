var RUNNING_LOG_MAX_SIZE = 1.4 * 1024 * 1024; // 2 MB
var RUNNING_LOG_OVERTRIM_PCT = 0.5;

var loggingEnabled = localStorage['loggingEnabled'] == 'true' || false;
var logObjectsAsJSON = false;
var runningLog = '';
// loggingEnabled = false;

// Logs all passed arguments to console if loggingEnabled is true.
// If the first argument is a string it will be used as the starting label for the output log row;
//   if not, the caller function name is used instead.
// Object arguments are turned into JSON strings and output if logObjectsAsJSON is true.
// Call stack data is included in the output.
function log() {
    var messages = [];
    var jsonMessages = [];
    for (var i in arguments) {
        var arg = arguments[i];
        if (typeof(arg) == 'string' || typeof(arg) == 'number') {
            messages.push(arg);
            jsonMessages.push(arg);
            continue;
        }
        var json;
        try {
            if (arg instanceof DataTreeNode) {
                json = arg.elemType + '::' + JSON.stringify({ id: arg.id, index: arg.index, windowId: arg.windowId, hibernated: arg.hibernated, restorable: arg.restorable,
                    incognito: arg.incognito, status: arg.status, url: arg.url, pinned: arg.pinned, title: arg.title, label: arg.label,
                    childrenCount: arg.children.length });
            }
            else {
                json = JSON.stringify(arg, StringifyReplacer);
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
        messages.push(arg);
    }

    var stack;
    try {
        // induce an exception so we can capture the call stack
        throw new Error();
    }
    catch(e) {
        stack = new CallStack(e.stack);

        // discard unwanted calls from top of stack
        while (stack.stack[0].indexOf('log') == 0 || stack.stack[0].indexOf('Error') == 0) {
            stack.stack.shift(1);
        }
    }

    if (typeof(arguments[0]) == 'string') {
        messages.splice(1, 0, '@', stack.stack[0], stack, '\n');
    }
    else {
        messages.splice(0, 0, stack.stack[0], stack, '\n');
    }

    if (messages[messages.length-1] == '\n') {
        messages.pop();
    }

    jsonMessages = jsonMessages.join(' ');
    runningLog += jsonMessages + '\n';
    if (jsonMessages.indexOf('---') == 0) {
        runningLog += '\n\n';
    }
    else {
        runningLog += '    ' + stack.stack.join('\n    ') + '\n\n';
    }

    if (runningLog.length >= RUNNING_LOG_MAX_SIZE) {
        runningLog = runningLog.substring((runningLog.length - RUNNING_LOG_MAX_SIZE) + (RUNNING_LOG_MAX_SIZE * RUNNING_LOG_OVERTRIM_PCT));
    }

    if (!loggingEnabled || !console) {
        return;
    }
    console.log.apply(console, messages);
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


function CallStack(stack) {
    this.stack = (stack + '\n')
        .replace(/^\S[^\(]+?[\n$]/gm, '')
        .replace(/^\s+(at eval )?at\s+/gm, '')
        .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}()@$1$2')
        .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}()@$1')
        .replace(/chrome\-extension\:\/\/(.+?)\//g, '/')
        .replace(/\n$/gm, '')
        .split('\n');
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