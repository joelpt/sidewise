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

