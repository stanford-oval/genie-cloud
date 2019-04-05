"use strict";
$(function() {
    var text = $('#qrcode-target').text();
    try {
        new QRCode('qrcode-placeholder', text);
    } catch(e) {}

    if (navigator.userAgent.match(/android/i)) {
        $('#config-phone-desktop-browser').hide();
        $('#config-phone-mobile-browser').show();
    }

    $('#issue-token-form').submit(function(event) {
        event.preventDefault();

        var csrfToken = document.body.dataset.csrfToken;
        $.ajax('/user/token', { data: { _csrf: csrfToken }, method: 'POST' }).then(function(response) {
            $('#issue-token-result').removeClass('hidden');
            $('#issue-token-result-placeholder').text(response.token);
        }, function (err) {
            console.error(err);
        });
    });
});
