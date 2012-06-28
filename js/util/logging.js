var loggingEnabled = localStorage['loggingEnabled'] == 'true' || false;
var logObjectsAsJSON = false;
// loggingEnabled = false;

// Logs all passed arguments to console if loggingEnabled is true.
// If the first argument is a string it will be used as the starting label for the output log row;
//   if not, the caller function name is used instead.
// Object arguments are turned into JSON strings and output if logObjectsAsJSON is true.
// Call stack data is included in the output.
function log() {
    if (!loggingEnabled || !console) {
        return;
    }

    var messages = [];
    for (var i in arguments) {
        var arg = arguments[i];
        if (typeof(arg) == 'string' || typeof(arg) == 'number') {
            messages.push(arg);
            continue;
        }
        if (logObjectsAsJSON) {
            try {
                messages.push(JSON.stringify(arg));
            }
            catch(ex) {
                messages.push(arg);
            }
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

        // discard calls to log*() from top of stack
        while (stack.stack[0].indexOf('log') == 0) {
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
    this.stack = (stack + '\n').replace(/^\S[^\(]+?[\n$]/gm, '')
      .replace(/^\s+(at eval )?at\s+/gm, '')
      .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}()@$1$2')
      .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}()@$1')
      .replace(/chrome\-extension\:\/\/(.+?)\//g, '/')
      .split('\n');
}
