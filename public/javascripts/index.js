"use strict";
(function() {
    ThingEngine.setCloudIdWhenReady();
})();
$(() => {
    $('#try-almond-now').click((event) => {
        $('#try-almond-now-row').addClass('expanded');

        const section = document.querySelector('#try-almond-now-row + .row');
        const top = section.offsetTop + 50;
        $(document.documentElement).animate({ scrollTop: top }, 800);
        event.preventDefault();
    });
});