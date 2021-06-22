"use strict";
(function() {
    ThingEngine.setCloudIdWhenReady();
})();
$(() => {
    function openConversation() {
        $('#try-almond-now-consent-form').addClass('hidden');

        const section = $('#try-almond-now-conversation').removeClass('hidden')[0];
        const top = section.offsetTop + 45;
        $(document.documentElement).animate({ scrollTop: top }, 800);
        event.preventDefault();
    }

    $('#try-almond-now').click((event) => {
        event.preventDefault();
        $('#try-almond-now-row').addClass('expanded');

        openConversation();
    });
});
