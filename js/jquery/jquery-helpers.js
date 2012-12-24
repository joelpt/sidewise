// Add $.reverse()
jQuery.fn.reverse = [].reverse;

// Adds an :icontains jQuery selector, which does a case-insensitive match of elements' contained text
$.expr[':'].icontains = function(obj, index, meta, stack){
    return (obj.textContent || obj.innerText || jQuery(obj).text() || '')
        .toLowerCase()
        .indexOf(meta[3].toLowerCase()) >= 0;
};

// Adds a :regexicontains jQuery selector, which does a case-insensitive regex match of elements' contained text
$.expr[':'].regexicontains = function(obj, index, meta, stack) {
    var re = new RegExp(meta[3], 'i');
    return re.test(obj.textContent || obj.innerText || jQuery(obj).text() || '');
};

// Adds an insertAtCaret jQuery method to insert myValue at the current
// insert point in a textarea/input=text
jQuery.fn.extend({
    insertAtCaret: function(myValue) {
        return this.each(function(i) {
            if (document.selection) {
                //For browsers like Internet Explorer
                this.focus();
                sel = document.selection.createRange();
                sel.text = myValue;
                this.focus();
            }
            else if (this.selectionStart || this.selectionStart == '0') {
                //For browsers like Firefox and Webkit based
                var startPos = this.selectionStart;
                var endPos = this.selectionEnd;
                var scrollTop = this.scrollTop;
                this.value = this.value.substring(0, startPos)+myValue+this.value.substring(endPos,this.value.length);
                this.focus();
                this.selectionStart = startPos + myValue.length;
                this.selectionEnd = startPos + myValue.length;
                this.scrollTop = scrollTop;
            } else {
                this.value += myValue;
                this.focus();
            }
        });
    }
});

// Insert element at the requested index
jQuery.fn.insertAt = function(index, element) {
  var lastIndex = this.children().size();
  if (index < 0) {
    index = Math.max(0, lastIndex + 1 + index);
  }
  this.append(element);
  if (index < lastIndex) {
    this.children().eq(index).before(this.children().last());
  }
  return this;
};

jQuery.fn.following = function(selector, topParent) {
    if (topParent && !this.parentsUntil(topParent).parent().is(topParent)) {
        return $();
    }

    if (!selector) {
        selector = '*';
    }
    var firstSelector = selector.replace(',', ':first,') + ':first';

    var $child = this.find(firstSelector);
    if ($child.length > 0) {
        return $child;
    }

    var $next = this.next();

    if ($next.length == 1) {
        if ($next.is(selector)) {
            return $next;
        }

        $next = $next.following(selector, topParent);
        if ($next.length == 1) {
            return $next;
        }
    }

    var parent = this.parentsUntil(selector).parent();
    while (parent.length > 0 && !parent.is(topParent)) {
        var $afters = parent.nextAll();
        for (var i = 0; i < $afters.length; i++) {
            var $after = $($afters[i]);
            if ($after.is(selector)) {
                return $after;
            }
            var $child = $after.find(firstSelector);
            if ($child.length > 0) {
                return $child;
            }
        }
        parent = parent.parent();
    }
    return $();
};

jQuery.fn.preceding = function(selector, topParent) {
    if (topParent && !this.parentsUntil(topParent).parent().is(topParent)) {
        return $();
    }

    if (!selector) {
        selector = '*';
    }

    var $befores = this.prevAll();

    for (var i = 0; i < $befores.length; i++) {
        var $before = $($befores[i]);
        var $child = $before.find(selector).last();
        if ($child.length > 0) {
            return $child;
        }
        if ($before.is(selector)) {
            return $before;
        }
    }

    var $parent = this.parentsUntil(selector).parent();

    if ($parent.is(topParent)) {
        return $();
    }

    if ($parent.length > 0) {
        if ($parent.is(selector)) {
            return $parent;
        }

        var $before = $parent.preceding(selector);
        if ($before.length > 0) {
            return $before;
        }
    }

    return $();
};