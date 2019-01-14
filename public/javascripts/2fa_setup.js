$(function() {
    var text = $('#qrcode-target').text();
    new QRCode('qrcode-placeholder', text);
});
