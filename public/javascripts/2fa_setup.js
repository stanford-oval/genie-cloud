"use strict";
$(() => {
    var text = $('#qrcode-target').text();
    new QRCode('qrcode-placeholder', text);
});
