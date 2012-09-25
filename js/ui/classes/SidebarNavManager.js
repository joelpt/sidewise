var SidebarNavManager = function(navButtonsContainer, sidebarsContainer, parentContainer, scrollContainer, sidebarElemTag) {
    // init
    this.panes = [];
    this.navButtonsContainer = navButtonsContainer;
    this.sidebarsContainer = sidebarsContainer;
    this.parentContainer = parentContainer;
    this.scrollContainer = scrollContainer;
    this.sidebarElemTag = sidebarElemTag;
    this.currentSidebarId = undefined;
    this.scrolling = false;
    this.enabledPaneCount = 0;

    var elem = $('<' + this.sidebarElemTag + ' id="sidebarPaddingContainer"/>');
    this.sidebarsContainer.append(elem);
    this._setSidebarParentContainerWidth();

    var data = { manager: this };

    $(document)
        .on('mousedown', '.sidebarButton', data, this._onMouseDownSidebarButton)
        .on('mouseup', '.sidebarButton', data, this._onMouseUpSidebarButton)
        .on('mouseover', '.sidebarButton', data, this._onMouseOverSidebarButton)
        .on('mouseout', '.sidebarButton', data, this._onMouseOutSidebarButton);
};

SidebarNavManager.prototype = {

    addSidebarPane: function(id, label, icon, url, enabled) {
        for (var i in this.panes) {
            if (this.panes[i].id == id) {
                return;
            }
        }

        var pane = { id: id, label: label, icon: icon, url: url, enabled: enabled };
        this.panes.push(pane);
        if (enabled) {
            this.enabledPaneCount++;
            this._createSidebarPaneElements(id);
        }
    },

    addSidebarPanes: function(sidebars) {
        for (var i in sidebars) {
            var details = sidebars[i];
            this.addSidebarPane(details.id, details.label, details.icon, details.url, details.enabled);
        }
    },

    removeSidebarPane: function(id) {
        var pane = this.getPaneDetails(id);

        if (pane.enabled) {
            this.enabledPaneCount--;
            this._destroySidebarPaneElements(id);
        }

        var currentIndex = this.panes.indexOf(pane);
        this.panes.splice(currentIndex, 1);

        // switch to first sidebar if this one was focused
        if (this.currentSidebarId == id) {
            this.showSidebarPane(this.panes[0].id);
        }
    },

    enableSidebarPane: function(id) {
        var pane = this.getPaneDetails(id);
        if (pane.enabled) {
            throw new Error('Requested pane is already enabled ' + id);
        }
        pane.enabled = true;
        this.enabledPaneCount++;
        this._createSidebarPaneElements(id);
    },

    disableSidebarPane: function(id) {
        var pane = this.getPaneDetails(id);
        if (!pane.enabled) {
            throw new Error('Requested pane is already disabled ' + id);
        }
        pane.enabled = false;
        this.enabledPaneCount--;
        this._destroySidebarPaneElements(id);

        if (!this.getPaneDetails(this.currentSidebarId).enabled) {
            var firstEnabled = this.getFirstEnabledPane();
            if (firstEnabled) {
                this.showSidebarPane(firstEnabled.id);
            }
        }
        else {
            this.scrollToCurrentSidebarPane(true);
        }
    },

    showSidebarPane: function(id) {
        // set selected state of correct nav button
        $('#sidebarButtons').children().removeClass('selected');
        $('.sidebarButton[buttonid="' + id + '"]').addClass('selected');

        // load container if needed, then show (scroll to) it
        var selector = '#sidebarContainer__' + id;
        var container = $(selector);

        if (container.children().length == 0)
        {
            var sidebar = this.getPaneDetails(id);
            var url = sidebar.url;
            var iframe = $('<iframe src="' + url + '"></iframe>');
            container.append(iframe);
        }

        container.css('visibility', 'visible');

        var oldSidebarId = this.currentSidebarId;
        var mgr = this;
        this.currentSidebarId = id;
        this.scrollToCurrentSidebarPane(false, function() {
            if (oldSidebarId != mgr.currentSidebarId) {
                $('#sidebarContainer__' + oldSidebarId).css('visibility', 'hidden');
            }
        });

        if (oldSidebarId != this.currentSidebarId) {
            reportEvent('sidebar', 'switch_pane', id, undefined, true);
            settings.set('lastSidebarPaneId', id);
        }
    },

    scrollToCurrentSidebarPane: function(instant, onAfter) {
        this.scrolling = true;
        var mgr = this;
        var onAfterWrapped = function() {
            if (onAfter) {
                onAfter();
            }
            // Using a 0ms timeout to clear scrolling flag prevents a scrolling 'vibration'
            // glitch on even-numbered panes when user has manually increased sidebar
            // zoom level. Glitch can still be seen by drag-selecting text in Notepad pane
            // off the side of the window when zoom level and sidebar width are 'just right'.
            setTimeout(function() { mgr.scrolling = false; }, 0);
        }
        if (instant) {
            this.scrollContainer.scrollTo('#sidebarContainer__' + this.currentSidebarId, { onAfter: onAfterWrapped });
            return;
        }
        this.scrollContainer.scrollTo('#sidebarContainer__' + this.currentSidebarId, 100, { onAfter: onAfterWrapped });
    },

    getPaneDetails: function(id) {
        var matches = this.panes.filter(function(e) { return e.id == id; });
        if (matches.length != 1) {
            throw new Error('Nonexistent or too many matching sidebars found');
        }
        return matches[0];
    },

    getPaneIndex: function(id) {
        var index;
        for (var i = 0; i < this.panes.length; i++) {
            if (this.panes[i].id == id) {
                return i;
            }
        }
        throw new Error('Could not find index of requested pane ' + id);
    },

    getFirstEnabledPane: function() {
        for (var i = 0; i < this.panes.length; i++) {
            if (this.panes[i].enabled) {
                return this.panes[i];
            }
        };
    },

    _getEnabledPanesBeforeIndex: function(index) {
        var count = 0;
        for (var i = 0; i < index; i++) {
            if (this.panes[i].enabled) {
                count++;
            }
        }
        return count;
    },

    _createSidebarPaneElements: function(id) {
        var index = this.getPaneIndex(id);
        var pane = this.panes[index];
        var insertAtIndex = this._getEnabledPanesBeforeIndex(index);
        this._createSidebarButton(pane.id, pane.label, pane.icon, insertAtIndex);
        this._createSidebarContainer(pane.id, insertAtIndex);
        this._setSidebarParentContainerWidth();
    },

    _destroySidebarPaneElements: function(id) {
        $('.sidebarButton[buttonid="' + id + '"]').remove();
        $('#sidebarContainer__' + id).remove();
        this._setSidebarParentContainerWidth();
    },

    _createSidebarButton: function(id, label, icon, atIndex) {
        var elem = $('<li/>', { 'class': 'sidebarButton', 'title': label, 'buttonid': id })
            .append(
                $('<div/>').append(
                    $('<img/>', { src: icon, draggable: false })
                )
            );
        elem.tooltip({ position: 'bottom center', predelay: 400,
            offset: [15, this.panes.length == 1 ? 10 : 0] });

        if (atIndex === undefined || atIndex >= this.sidebarsContainer.children().length - 1) {
            atIndex = -1;
        }
        else {
            atIndex = atIndex + 1;
        }
        this.navButtonsContainer.insertAt(atIndex, elem);
    },

    _createSidebarContainer: function(id, atIndex) {
        var elem = $('<' + this.sidebarElemTag + ' id="sidebarContainer__' + id + '"/>');

        atIndex = 999;
        var maxIndex = this.sidebarsContainer.children().length - 1;
        if (atIndex === undefined || atIndex >= maxIndex) {
            atIndex = maxIndex;
        }
        this.sidebarsContainer.insertAt(atIndex, elem);
        this._setSidebarParentContainerWidth();
    },

    _setSidebarParentContainerWidth: function() {
        this.parentContainer.width(((this.enabledPaneCount + 1) * 100) + '%');
    },

    _onMouseDownSidebarButton: function(evt) {
        var $target = $(evt.target);
        if (!$target.hasClass('sidebarButton')) {
            $target = $target.closest('.sidebarButton');
        }
        $target.addClass('mousedown');
        $target.data('tooltip').hide();
        evt.data.manager.showSidebarPane.call(evt.data.manager, $target.attr('buttonid'));
        evt.stopPropagation();
    },

    _onMouseUpSidebarButton: function(evt) {
        var $target = $(evt.target);
        if (!$target.hasClass('sidebarButton')) {
            $target = $target.closest('.sidebarButton');
        }
        $target.removeClass('mousedown');
        $target.data('tooltip').hide();
        evt.data.manager.showSidebarPane.call(evt.data.manager, $target.attr('buttonid'));
        evt.stopPropagation();
    },

    _onMouseOverSidebarButton: function(evt) {
        if (evt.which != 1) {
            return;
        }

        var $target = $(evt.target);
        if (!$target.hasClass('sidebarButton')) {
            $target = $target.closest('.sidebarButton');
        }
        $target.addClass('mousedown');
        evt.stopPropagation();
    },

    _onMouseOutSidebarButton: function(evt) {
        var $target = $(evt.target);
        if (!$target.hasClass('sidebarButton')) {
            $target = $target.closest('.sidebarButton');
        }
        $target.removeClass('mousedown');
        $target.data('tooltip').hide();
        evt.stopPropagation();
    }

};
