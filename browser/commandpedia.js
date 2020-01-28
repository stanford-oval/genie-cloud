// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

require('./polyfill');

const ThingTalkTrainer = require('./deps/new-command');
const SearchOrInfiniteScroll = require('./deps/search-or-infinite-scroll');

$(() => {
    const trainer = new ThingTalkTrainer({
        container: '#new-command-dialog',
    });

    const CDN_HOST = document.body.dataset.iconCdn;
    const csrfToken = document.body.dataset.csrfToken;

    $('#subscribe-done').hide();
    $('#subscribe-form').submit((event) => {
        event.preventDefault();
        $.post('/user/subscribe', {'_csrf': csrfToken, 'email': $('#subscribe-email').val() });
        $('#subscribe-form').hide();
        $('#subscribe-done').show();
    });

    $('#add-to-commandpedia').click(() => {
        trainer.init();
    });

    new SearchOrInfiniteScroll({
        container: '#commandpedia',
        url: '/thingpedia/commands/all',
        searchUrl: '/thingpedia/commands/search',
        autoScrollOnStart: false,

        render(command) {
            let commandContainer = $('<div>').addClass('col-lg-4 col-md-6 aligned-grid-item dev-template');
            let panel = $('<div>').addClass('panel panel-default');
            commandContainer.append(panel);

            let body = $('<div>').addClass('panel-body');
            let main = $('<div>').addClass('row').addClass('panel-body-main');
            let icons = $('<div>').addClass('device-icon-list-small');
            command.devices.forEach((device) => {
                let link = $('<a>').attr('href', '/thingpedia/devices/by-id/' + device);
                let icon = $('<img>').attr('src', CDN_HOST + '/icons/' + device + '.png');
                link.append(icon);
                icons.append(link);
            });
            main.append(icons);
            let info = $('<div>');
            main.append(info);
            let utterance = $('<p>').addClass('command-utterance').text(command.utterance);
            info.append(utterance);

            let user = $('<div>').addClass('device-owner');
            user.append($('<span>').text(`By ${command.owner_name || 'anonymous user'}`));
            let heart = $('<i>').addClass(command.liked ? 'fas' : 'far')
                .addClass('fa-heart').attr('id', command.id).attr('role', 'button').attr('_csrf', csrfToken);
            heart.click(function(event) {
                event.preventDefault();
                event.stopPropagation();

                let icon = $('#' + this.id);

                let count = $('#count' + this.id);
                let current = Number(count.text());

                if (!document.body.dataset.cloudId) {
                    // not logged in
                    location.href = '/user/login';
                    return;
                }

                if (icon.hasClass('far')) {
                    $.post('/thingpedia/examples/upvote/' + this.id, '_csrf=' + $(this).attr('_csrf')).then((res) => {
                        if (res.result === 'ok') {
                            count.text(current + 1);
                            icon.removeClass('far').addClass('fas');
                        }
                    });
                } else {
                    $.post('/thingpedia/examples/downvote/' + this.id, '_csrf=' + $(this).attr('_csrf')).then((res) => {
                        if (res.result === 'ok') {
                            count.text(current - 1);
                            icon.removeClass('fas').addClass('far');
                        }
                    });
                }
            });

            user.append(heart);
            let count = $('<span>').attr('id', 'count' + command.id).text(command.like_count);
            user.append(count);
            info.append(user);
            body.append(main);
            panel.append(body);

            let footer = $('<div>').addClass('sr-only panel-footer');
            let footer_row = $('<div>').addClass('row');
            let footer_container = $('<div>').addClass('col-md-6').addClass('col-md-offset-3');
            let form = $('<form>').addClass('form-inline').attr('action', '/me').attr('method', 'post');
            footer_container.append(form);
            form.append($('<input>').attr('type', 'hidden').attr('name', '_csrf').attr('value', csrfToken));
            form.append($('<input>').attr('type', 'hidden').attr('name', 'command').attr('value', command.utterance));
            form.append($('<button>').addClass('btn').addClass('btn-sm').addClass('btn-success').addClass('btn-block').attr('type', 'submit').text('Adopt'));
            footer_row.append(footer_container);
            footer.append(footer_row);
            panel.append(footer);

            commandContainer.click((event) => {
                event.preventDefault();
                form.submit();
            });

            return commandContainer[0];
        }
    });

});
