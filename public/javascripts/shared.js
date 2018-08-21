"use strict";
(function() {
    window.ThingEngine = {};

    window.ThingEngine.setCloudId = function(cloudId, authToken) {
        if (window.Android !== undefined)
            window.Android.setCloudId(cloudId, authToken);
        else
            console.log('Setting cloud ID and auth token: ' + cloudId + ',' + authToken);
    };

    window.ThingEngine.setCloudIdWhenReady = function() {
        $(function() {
            var holder = $('#cloud-id-holder');
            window.ThingEngine.setCloudId(holder.attr('data-cloud-id'),
                                          holder.attr('data-auth-token'));
        });
    };

    window.ThingEngine.getThingpedia = function() {
        return $('body[data-thingpedia-url]').attr('data-thingpedia-url') || '';
    }
})();

$(function() {
    if (window.Android)
        $('#navbar-login-button').hide();

    $('#subscribe-email').hide();
    $('#subscribe-submit').hide();

    function isEmail(email) {
        let regex = /^([a-zA-Z0-9_.+-])+\@(([a-zA-Z0-9-])+\.)+([a-zA-Z0-9]{2,4})+$/;
        return regex.test(email);
    }

    $('#subscribe-submit').click(function(event) {
        if (isEmail($('#subscribe-email').val())) {
            $.post('/user/subscribe', {'_csrf': $(this).attr('csrf'), 'email': $('#subscribe-email').val()});
            $('#subscribe-submit').hide();
            $('#subscribe-hint').hide();
            $('#subscribe-done').show();
        } else {
            $('#subscribe-hint').show();
        }
        event.preventDefault();
    });

    $('#subscribe-start').click(function(event) {
        $('#subscribe-email').show();
        $('#subscribe-submit').show();
        $('#subscribe-start').hide();
        event.preventDefault();
    });
});
