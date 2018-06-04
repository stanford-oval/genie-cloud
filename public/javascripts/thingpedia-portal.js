"use strict";
$(function() {
    var S3_CLOUDFRONT_HOST = $('body').attr('data-icon-cdn');
    var developerKey = $('body').attr('data-developer-key') || '';
    var page = 0;
    var insearch = false;

    function renderDevices(result) {
        var devices = result.devices;
        var container = $('#devices-container');
        container.empty();

        for (var i = 0; i < Math.min(devices.length, 9); i++) {
            var dev = devices[i];

            if (i % 6 === 0)
                container.append($('<div>').addClass('clearfix visible-lg visible-md'));
            else if (i % 3 === 0)
                container.append($('<div>').addClass('clearfix visible-lg'));
            else if (i % 2 === 0)
                container.append($('<div>').addClass('clearfix visible-md'));

            var deviceContainer = $('<div>').addClass('col-lg-4 col-md-6 dev-template');
            var panel = $('<div>').addClass('panel panel-default');
            deviceContainer.append(panel);

            var link = $('<a>').attr('href', '/thingpedia/devices/by-id/' + dev.primary_kind)
                .addClass('panel-heading').text(dev.name);
            panel.append(link);

            var panelBody = $('<div>').addClass('panel-body');
            var deviceIconContainer = $('<p>').addClass('device-icon-small');
            var deviceIcon = $('<img>');
            deviceIcon.attr('src', S3_CLOUDFRONT_HOST + '/icons/' + dev.primary_kind + '.png')
                .attr("Icon for " + dev.name);
            deviceIconContainer.append(deviceIcon);
            panelBody.append(deviceIconContainer);
            var description = $('<p>').text(dev.description);
            panelBody.append(description);
            panel.append(panelBody);

            container.append(deviceContainer);
        }

        if (insearch) {
            $('#device-reset-button').show();
            $('#devices-page-prev').hide();
            $('#devices-page-next').hide();
        } else {
            $('#device-reset-button').hide();

            if (page > 0)
                $('#devices-page-prev').show();
            else
                $('#devices-page-prev').hide();

            if (devices.length > 9)
                $('#devices-page-next').show();
            else
                $('#devices-page-next').hide();
        }
    }

    function loadAll() {
        $.get('/thingpedia/api/devices/all?page=' + page + '&developer_key=' + developerKey, renderDevices);
    }

    loadAll();

    $('#device-search-button').click(function(event) {
        page = 0;
        insearch = true;
        $.get('/thingpedia/api/devices/search?q=' + encodeURIComponent($('#device-search-box').val() + '&developer_key=' + developerKey), renderDevices);
        event.preventDefault();
    });
    $('#device-reset-button').click(function(event) {
        page = 0;
        insearch = false;
        loadAll();
        event.preventDefault();
    });

    $('#devices-page-prev').click(function(event) {
        page = page - 1;
        if (!(page >= 0))
            page = 0;
        loadAll();
        event.preventDefault();
    });
    $('#devices-page-next').click(function(event) {
        page = page + 1;
        loadAll();
        event.preventDefault();
    });
});
