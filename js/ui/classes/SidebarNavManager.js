var SidebarNavManager = function(navButtonsContainer, sidebarsContainer, parentContainer, scrollContainer, sidebarElemTag) {
    // init
    this.sidebars = [];
    this.navButtonsContainer = navButtonsContainer;
    this.sidebarsContainer = sidebarsContainer;
    this.parentContainer = parentContainer;
    this.scrollContainer = scrollContainer;
    this.sidebarElemTag = sidebarElemTag;
    this.currentSidebarId = undefined;

    var elem = $('<' + this.sidebarElemTag + ' id="sidebarPaddingContainer"/>');
    this.sidebarsContainer.append(elem);
    this._setSidebarParentContainerWidth();

};

SidebarNavManager.prototype = {

    addSidebarPanel: function(id, label, icon, url) {
        this.sidebars.push({ id: id, label: label, icon: icon, url: url });
        this._createSidebarButton(id, label, icon);
        this._createSidebarContainer(id);
    },

    addSidebarPanels: function(sidebars) {
        for (var i in sidebars) {
            var details = sidebars[i];
            this.addSidebarPanel(details.id, details.label, details.icon, details.url);
        }
    },

    removeSidebarPanel: function(id) {
        var currentIndex = this.sidebars.indexOf(this.getSidebarDetails(id));
        this.sidebars.splice(currentIndex, 1);

        $('#sidebarButton__' + id).remove();
        $('#sidebarContainer__' + id).remove();
        this._setSidebarParentContainerWidth();

        // switch to first sidebar if this one was focused
        if (this.currentSidebarId == id) {
            this.showSidebarPanel(this.sidebars[0].id);
        }
    },

    showSidebarPanel: function(id) {
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
        this.scrollToCurrentSidebarPanel(false, function() {
            if (oldSidebarId != mgr.currentSidebarId) {
                $('#sidebarContainer__' + oldSidebarId).css('visibility', 'hidden');
            }
        });
    },

    scrollToCurrentSidebarPanel: function(instant, onAfter) {
        if (instant) {
            this.scrollContainer.scrollTo('#sidebarContainer__' + this.currentSidebarId, { onAfter: onAfter });
            return;
        }
        this.scrollContainer.scrollTo('#sidebarContainer__' + this.currentSidebarId, 100, { onAfter: onAfter });
    },

    getSidebarDetails: function(id) {
        var matches = this.sidebars.filter(function(e) { return e.id == id; });
        if (matches.length != 1) {
            throw 'Nonexistent or too many matching sidebars found';
        }
        return matches[0];
    },

    _createSidebarButton: function(id, label, icon) {
        var elem = $('<li class="sidebarButton" title="' + label + '" id="sidebarButton__' + id + '">'
            + '<div><img src="' + icon + '"/></div>'
            + '</li>');
        elem.tooltip({ position: 'bottom center', predelay: 400,
            offset: [15, this.sidebars.length == 1 ? 10 : 0] });
        elem.mousedown({ manager: this, id: id }, this._onClickSidebarNavButton);
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

    _onClickSidebarNavButton: function(evt) {
        $(this).data('tooltip').hide();
        evt.data.manager.showSidebarPanel.call(evt.data.manager, evt.data.id);
    }

};
