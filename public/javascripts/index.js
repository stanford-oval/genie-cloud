"use strict";
(function() {
    ThingEngine.setCloudIdWhenReady();
})();
$(() => {
    var NEED_CONSENT = false;

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

        if (NEED_CONSENT) {
            const cookies = parseCookies();
            if (cookies.agreed_consent === '1')
                openConversation();
            else
                $('#try-almond-now-consent-form').removeClass('hidden');
        } else {
            openConversation();
        }
    });

    $('#try-almond-now-agree-consent').click((event) => {
        event.preventDefault();
        openConversation();
    });
});
