initSidebarPane();

$(document).ready(onReady);

function onReady() {
    setI18NText();

    readFile('http://www.sidewise.info/changelog?embed=1', function(data) {
        $('#latestChanges').html(data);
    });

    $('#showAfterNew').attr('checked', settings.get('showWhatsNewPane', true));

    $(document)
        .on('click', '#closeButton', function() {
            bg.paneCatalog.removePane('whatsnew');
            bg.paneCatalog.saveState();
            bg.sidebarHandler.sidebarPanes['sidebarHost'].manager.removeSidebarPane('whatsnew');
        })
        .on('click', '#showAfterNew', function() {
            settings.set('showWhatsNewPane', $('#showAfterNew').is(':checked'));
        });
}
