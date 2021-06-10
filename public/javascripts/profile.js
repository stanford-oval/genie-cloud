"use strict";
$(() => {
    var text = $('#qrcode-target').text();
    try {
        new QRCode('qrcode-placeholder', text);
    } catch(e) {
        // ignore errors
    }

    if (navigator.userAgent.match(/android/i)) {
        $('#config-phone-desktop-browser').hide();
        $('#config-phone-mobile-browser').show();
    }

    $('#issue-token-form').submit((event) => {
        event.preventDefault();

        var csrfToken = document.body.dataset.csrfToken;
        $.ajax('/user/token', { data: { _csrf: csrfToken }, method: 'POST' }).then((response) => {
            $('#issue-token-result').removeClass('hidden');
            $('#issue-token-result-placeholder').text(response.token);
        }, (err) => {
            console.error(err);
        });
    });
});
