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
})();

$(function() {
    if (window.Android)
        $('#navbar-login-button').hide();
});
