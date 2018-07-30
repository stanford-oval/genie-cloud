"use strict";
$(function() {
    var S3_CLOUDFRONT_HOST = $('body').attr('data-icon-cdn');
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

    function renderRules(result) {
        var rules = result;
        var container = $('#rules-container');
        container.empty();
        var list = $('<ul>');
        container.append(list);
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            var html = rule.utterance;
            list.append($('<li onclick="$(\'#rule-edit\').data(\'rule\',\'' + rule.id + '\').dialog(\'open\')">').addClass('rule').html(html));
        }
    }

    function loadAll() {
        $.get('/thingpedia/api/devices/all?page=' + page, renderDevices);
        $.get('/thingpedia/api/rules', renderRules);
    }

    loadAll();

    $('#rule-edit').dialog({
        autoOpen: false,
        width: "60%",
        open: function() {
            var ruleId = $(this).data('rule');
            $.get('/thingpedia/api/rules/' + ruleId).then((rule) => {
                $('#rule-edit-utterance').val(rule.utterance);
                $('#rule-edit-code').val(rule.target_code || rule.target_json );
            });
        },
    });

    $('#rule-new').dialog({
        autoOpen: false,
        width: "60%"
    });
    $('#rule-new-button').click(function(event) {
        $('#rule-new').dialog("open");
    });

    $('#device-search-button').click(function(event) {
        page = 0;
        insearch = true;
        $.get('/thingpedia/api/devices/search?q=' + encodeURIComponent($('#device-search-box').val()), renderDevices);
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