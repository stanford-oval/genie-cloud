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

    function parseCookies() {
        if (!document.cookie)
            return {};
        const parsed = {};
        for (const cookie of document.cookie.split(/;/g)) {
            const [key, value] = cookie.split('=');
            parsed[key.trim()] = decodeURIComponent(value.trim());
        }
        return parsed;
    }

    $('#try-almond-now').click((event) => {
        event.preventDefault();
        $('#try-almond-now-row').addClass('expanded');

        const cookies = parseCookies();
        if (cookies.agreed_consent === '1')
            openConversation();
        else
            $('#try-almond-now-consent-form').removeClass('hidden');
    });

    $('#try-almond-now-agree-consent').click((event) => {
        event.preventDefault();
        document.cookie = 'agreed_consent=1;max-age=31536000;SameSite=Strict';
        openConversation();
    });
});
