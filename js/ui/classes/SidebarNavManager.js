var SidebarNavManager = function(navButtonsContainer, sidebarsContainer, parentContainer, scrollContainer, sidebarElemTag) {
    // init
    this.sidebars = [];
    this.navButtonsContainer = navButtonsContainer;
    this.sidebarsContainer = sidebarsContainer;
    this.parentContainer = parentContainer;
    this.scrollContainer = scrollContainer;
    this.sidebarElemTag = sidebarElemTag;
    this.currentSidebarId = undefined;
    this.scrolling = false;

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

    addSidebarPane: function(id, label, icon, url) {
        for (var i in this.sidebars) {
            if (this.sidebars[i].id == id) {
                return;
            }
        }

        this.sidebars.push({ id: id, label: label, icon: icon, url: url });
        this._createSidebarButton(id, label, icon);
        this._createSidebarContainer(id);
    },

    addSidebarPanes: function(sidebars) {
        for (var i in sidebars) {
            var details = sidebars[i];
            if (details.enabled) {
                this.addSidebarPane(details.id, details.label, details.icon, details.url);
            }
        }
    },

    removeSidebarPane: function(id) {
        var currentIndex = this.sidebars.indexOf(this.getSidebarDetails(id));
        this.sidebars.splice(currentIndex, 1);

        $('.sidebarButton[buttonid="' + id + '"]').remove();
        $('#sidebarContainer__' + id).remove();
        this._setSidebarParentContainerWidth();

        // switch to first sidebar if this one was focused
        if (this.currentSidebarId == id) {
            this.showSidebarPane(this.sidebars[0].id);
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
            var sidebar = this.getSidebarDetails(id);
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

    getSidebarDetails: function(id) {
        var matches = this.sidebars.filter(function(e) { return e.id == id; });
        if (matches.length != 1) {
            throw new Error('Nonexistent or too many matching sidebars found');
        }
        return matches[0];
    },

    _createSidebarButton: function(id, label, icon) {
        var elem = $('<li/>', { 'class': 'sidebarButton', 'title': label, 'buttonid': id })
            .append(
                $('<div/>').append(
                    $('<img/>', { src: icon, draggable: false })
                )
            );

        elem.tooltip({ position: 'bottom center', predelay: 400,
            offset: [15, this.sidebars.length == 1 ? 10 : 0] });
        this.navButtonsContainer.append(elem);
    },

    _createSidebarContainer: function(id) {
        var elem = $('<' + this.sidebarElemTag + ' id="sidebarContainer__' + id + '"/>');
        this.sidebarsContainer.children().last().before(elem);
        this._setSidebarParentContainerWidth();
    },

    _setSidebarParentContainerWidth: function() {
        this.parentContainer.width(((this.sidebars.length + 1) * 100) + '%');
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
