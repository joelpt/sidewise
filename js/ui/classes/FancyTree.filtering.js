///////////////////////////////////////////////////////////
// FancyTree.filtering.js
// Filter box event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.onFilterStatusClick = function(evt) {
    var treeObj = evt.data.treeObj;
    treeObj.filterElem.children('.ftFilterInput').val('').trigger('keyup');
    treeObj.filtering = false;
    return false;

};

FancyTree.prototype.onFilterBoxModified = function(evt) {
    if (evt.keyCode == 27) // Esc key pressed
    {
        // Clear any existing filter
        evt.target.value = '';
    }

    var filter = evt.target.value || '';
    var treeObj = evt.data.treeObj;
    treeObj.handleHideTooltipEvent(evt);

    clearTimeout(treeObj.applyFilterTimer);
    treeObj.applyFilterTimer = setTimeout(function() {
        treeObj.applyFilter.call(evt.data.treeObj, filter);
    }, 100);
};

FancyTree.prototype.applyFilter = function(filter) {
    // remove char highlighting effects
    this.root.find('.ftFilteredIn > .ftItemRow > .ftItemRowContent > .ftInnerRow > .ftItemText')
        .children().each(function(i, e) {
            var $e = $(e);
            $e.text($e.text());
        });

    // reset which rows are filtered
    this.root.find('.ftFilteredIn').removeClass('ftFilteredIn');

    if (filter.length == 0)
    {
        this.filtering = false;

        // remove filtering class
        this.root.removeClass('ftFiltering');

        // hide filter status message
        this.filterStatusElem.hide();
    }
    else
    {
        this.filtering = true;

        // filter out non matching entries
        var advancedFilter = this.useAdvancedFiltering;
        var escapedFilter = filter.replace('"', '\\"'); // escape embedded double quotes
        if (advancedFilter) {
            filter = filter.replace(/ /g, '');
            var regexFilter = filter.split('').join('.*').replace('"', '\\"');
            var selector = '.ftItemText:regexicontains("' + regexFilter + '")';
        }
        else {
            var words = filter.split(' ');
            var regexFilter = words.join('.*').replace('"', '\\"');
            var selector = '.ftItemText:regexicontains("' + regexFilter + '")';
        }

        var matches = this.root.find(selector).closest('.ftRowNode');

        // highlight matched letters in row's visible text
        this.highlightMatches.call(this, matches, filter, words, advancedFilter);

        // filter by additional per-rowType parameter filters
        for (var rowType in this.rowTypes) {
            var extraParams = this.rowTypes[rowType].filterByExtraParams;
            if (extraParams && extraParams.length > 0) {
                for (var i in extraParams) {
                    var selector = '.ftRowNode[' + extraParams[i] + '*="' + escapedFilter + '"]';
                    matches = matches.add(this.root.find(selector));
                }
            }
        }

        // apply ftFilteredIn css class to matched rows
        matches.each(function(i, e) { $(e).addClass('ftFilteredIn'); });

        // apply filtering css styling which will filter out unmatched rows
        this.root.addClass('ftFiltering');

        // show filter status message
        this.filterStatusElem.show();

    }
};

///////////////////////////////////////////////////////////
// Filter substring/subchar highlighting
///////////////////////////////////////////////////////////

FancyTree.prototype.highlightMatches = function(elements, filter, words, advancedFilterUsed) {
    var self = this;

    elements.each(function(i, e) {
        var $e = $(e);
        var $textElem = $e.find('.ftItemRow > .ftItemRowContent > .ftInnerRow > .ftItemText');

        if (advancedFilterUsed) {
            self.highlightMatchChars.call(this, $textElem, filter);
        }
        else {
            self.highlightMatchWords.call(this, $textElem, words);
        }

    });
};

FancyTree.prototype.highlightMatchChars = function(elem, filter) {
    var lastCharIndex = 0;

    elem.children().each(function(i, f) {
        var $f = $(f);
        var text = $f.text();
        var newHtml = '';

        // match individual chars
        if (lastCharIndex == filter.length) {
            // already all matched up
            newHtml = text;
        }
        else {
            for (var charIndex in text) {
                if (filter[lastCharIndex].toLowerCase() == text[charIndex].toLowerCase()) {
                    // this character was part of the search
                    newHtml += '<span class="ftHighlightChar">' + text[charIndex] + '</span>';
                    lastCharIndex++;
                }
                else {
                    // this character was not part of the search
                    newHtml += text[charIndex];
                }
                if (lastCharIndex == filter.length) {
                    // filter chars have all been matched up, so just output
                    // the remainder of the text as is
                    newHtml += (text.slice(parseInt(charIndex) + 1));
                    break;
                }
            }
        }
        $f.html(newHtml);
    });
};

FancyTree.prototype.highlightMatchWords = function(elem, words) {
    var lastWordIndex = 0;

    elem.children().each(function(i, f) {
        var $f = $(f);
        var text = $f.text();
        var newHtml = '';

        // match word-chunks
        for (var wordIndex = lastWordIndex; wordIndex < words.length; wordIndex++) {
            var word = words[wordIndex];
            var pos = text.toLowerCase().indexOf(word);
            if (pos > -1) {
                // word found, add preceding text as plain and word as highlighted
                newHtml += text.slice(0, pos)
                    + '<span class="ftHighlightChar">'
                    + text.slice(pos, pos + word.length)
                    + '</span>';
                text = text.slice(pos + word.length); // remainder
                lastWordIndex++;
            }
            else {
                // word not found
                break;
            }
        }

        // add any remaining text
        newHtml += text;

        $f.html(newHtml);
    });
};
