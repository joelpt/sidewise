var SidebarNavManager = function(sidebars, navButtonsContainer, sidebarsContainer, parentContainer, scrollContainer, sidebarElemTag) {
    // init
    this.sidebars = sidebars;
    this.navButtonsContainer = navButtonsContainer;
    this.sidebarsContainer = sidebarsContainer;
    this.parentContainer = parentContainer;
    this.scrollContainer = scrollContainer;
    this.sidebarElemTag = sidebarElemTag;
    this.currentSidebar = undefined;
};

SidebarNavManager.prototype = {

    createSidebarButtons: function() {
        var first = true;
        for (var s in this.sidebars) {
            var label = sidebars[s][1];
            var icon = sidebars[s][2];
            var elem = $('<li class="sidebarButton" title="' + label + '" id="sidebarButton__' + s + '">'
                + '<div><img src="' + icon + '"/></div>'
                + '</li>');
            elem.tooltip({ position: 'bottom center', predelay: 400, offset: [15, first ? 10 : 0] });
            elem.mousedown({ manager: manager, sidebarId: s }, function(evt) {
                $(this).data('tooltip').hide();
                evt.data.manager.showSidebar(evt.data.sidebarId);
            });
            this.navButtonsContainer.append(elem);
            first = false;
        }
    },

    createSidebarContainers: function() {
        var cnt = 0;
        // var initial;

        for (var s in this.sidebars) {
            var elem = $('<' + this.sidebarElemTag + ' id="' + s + '"/>');
            this.sidebarsContainer.append(elem);
            // if (cnt == 0) {
            //   var url = sidebars[s];
            //   var iframe = $('<iframe src="' + url + '"></iframe>');
            //   elem.append(iframe);
            //   initial = elem;
            // }


            cnt++;
        }
        this.parentContainer.width(cnt * 100 + '%');
        // $('body').scrollTo(initial);
    },

    showSidebar: function(id) {
        //$('#sidebar').attr('src', url);
        // $('#' + id).show();
        var container = $('#' + id);

        if (container.children().length == 0)
        {
            var url = sidebars[id][0];

            var iframe = $('<iframe src="' + url + '"></iframe>');
            container.append(iframe);
        }
        this.scrollContainer.scrollTo('#' + id, 100, { axis: 'x' });
      // $('#sidebars').children().not('#' + id).hide();
      this.currentSidebar = id;
  }

};
