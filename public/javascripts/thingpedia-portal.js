"use strict";
$(function() {
    var CDN_HOST = $('body').attr('data-icon-cdn');
    var developerKey = $('body').attr('data-developer-key') || '';
    var page = 0;
    var insearch = false;

    function updateSearch() {
        if (insearch)
            $('#device-reset-button').show();
        else
            $('#device-reset-button').hide();
    }

    function renderDevices(result) {
        var devices = result.devices;
        var output = [];

        for (var i = 0; i < Math.min(devices.length, 9); i++) {
            var dev = devices[i];

            var deviceContainer = $('<a>').attr('href', '/thingpedia/devices/by-id/' + dev.primary_kind).addClass('col-lg-4 col-md-6 aligned-grid-item dev-template');
            var panel = $('<div>').addClass('panel panel-default');
            deviceContainer.append(panel);

            var link = $('<div>').addClass('panel-heading').text(dev.name);
            panel.append(link);

            var panelBody = $('<div>').addClass('panel-body');
            var deviceIconContainer = $('<p>').addClass('device-icon-small');
            var deviceIcon = $('<img>');
            deviceIcon.attr('src', CDN_HOST + '/icons/' + dev.primary_kind + '.png')
                .attr("Icon for " + dev.name);
            deviceIconContainer.append(deviceIcon);
            panelBody.append(deviceIconContainer);
            var description = $('<p>').text(dev.description);
            panelBody.append(description);
            panel.append(panelBody);

            output.push(deviceContainer);
        }
    }

    function loadAll() {
        $.get('/thingpedia/api/devices/all', { page: page, page_size: 9, developer_key: developerKey }, renderDevices);
    }

    loadAll();

    $('#device-search-button').click(function(event) {
        page = 0;
        insearch = true;
        $.get('/thingpedia/api/devices/search', { q: $('#device-search-box').val(), developer_key: developerKey }, renderDevices);
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
