(function() {
    ThingEngine.setCloudIdWhenReady();
})();

$(function() {
    $('#subscribe-submit').click(function(event) {
        $.post('/user/subscribe', {'_csrf': $(this).attr('csrf'), 'email': $('#subscribe-email').val() } );
        $('#subscribe-submit').hide();
        $('#subscribe-done').show();
        event.preventDefault();
    });
});