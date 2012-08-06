$(document).ready(function() {
    reportEvent('install', 'viewed_first_time_install');
    initOptionsPage();
    showCard('optionsCard');
    $('#version').text(getMessage('text_Version') + ' ' + getVersion());
    styleOptionsNavButton();
    $(document).on('click', '#installDoneButton', onDonateLinkClick);
    setTimeout(drawInstallIndicatorArrow, 100);
});

function styleOptionsNavButton() {
    var button = $('img[src="/images/nav/settings.png"]');
    var div = $('<div class="navButton">').append(button.clone());
    button.replaceWith(div);
}

function drawInstallIndicatorArrow() {
    if (settings.get('dockState') != 'left') {
        return;
    }

    var p = $('#optionsContainer p').first();
    var arrow = $('#installIndicatorArrow');
    var newArrow = $('<div id="installIndicatorArrow"/>');

    newArrow.append( $('<div id="installIndicatorArrowContent">').html(getMessage('installIndicatorArrowText')) );
    arrow.replaceWith(newArrow);

    newArrow.offset({ top: p.offset().top, left: p.offset().left });

    setTimeout(function() {
        newArrow.animate({ left: -4 }, 2000, 'easeOutBounce', function() {
            setTimeout(function() {
                newArrow.fadeOut(300);
            }, 7000);
        });
    }, 1000);
}