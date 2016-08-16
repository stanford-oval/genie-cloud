$(function() {
    var tz = jstz.determine();
    $('#timezone').val(tz.name());
});
