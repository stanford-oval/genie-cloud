(function() {
    $(function() {
        var text = $('#qrcode-target').text();
        new QRCode('qrcode-placeholder', text);

        if (navigator.userAgent.match(/android/i)) {
            $('#config-phone-desktop-browser').hide();
            $('#config-phone-mobile-browser').show();
        }
    });
})();
