/**
  * @static
  * @class
  * Used to manage timeouts more easily.
  * Use as a singleton: do not instatiate, just call TimeoutManager.set(), et al. directly.
  */
var TimeoutManager = {
    timeouts: {},

    get: function(label) {
        var timeout = this.timeouts[label];
        return timeout;
    },

    exists: function(label) {
        return (this.timeouts[label] !== undefined);
    },

    set: function(label, fn, timeoutMs) {
        if (this.exists(label)) {
            throw new Error('A timeout with the given label has already been set');
        }
        var tmgr = this;
        var timeoutFn = function() {
            fn();
            tmgr.del(label);
        }
        var t = setTimeout(timeoutFn, timeoutMs);
        this.timeouts[label] = {id: t, fn: timeoutFn, ms: timeoutMs};
    },

    clear: function(label) {
        var timeout = this.get(label);
        if (timeout) {
            clearTimeout(timeout.id);
            this.del(label);
            return true;
        }
        return false;
    },

    del: function(label) {
        delete this.timeouts[label];
    },

    reset: function(label, fn, timeoutMs) {
        if (this.exists(label)) {
            var timeout = this.get(label);
            clearTimeout(timeout.id);
            timeout.fn = fn || timeout.fn;
            timeout.ms = timeoutMs !== undefined ? timeoutMs : timeout.ms;
            timeout.id = setTimeout(timeout.fn, timeout.ms);
            return;
        }

        if (!fn || !timeoutMs) {
            throw new Error('Tried to reset a timer that does not yet exist, but did not pass fn or timeoutMs');
        }

        // Called .reset but we haven't .set yet; do that now
        this.set(label, fn, timeoutMs);
    }
};

