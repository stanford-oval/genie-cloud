// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
"use strict";

const Recorder = require('./deps/recorder');

$(() => {
    var url = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host
        + $('#conversation').attr('data-target');

    var ws;
    var open = false;
    var recording = false;

    let _isRecording = false;
    let _stream, _recorder;
    const _sttUrl = document.body.dataset.voiceServerUrl + '/rest/stt' || 'http://127.0.0.1:8000/rest/stt';

    var pastCommandsUp = []; // array accessed by pressing up arrow
    var pastCommandsDown = []; // array accessed by pressing down arrow
    var currCommand = ""; // current command between pastCommandsUp and pastCommandsDown

    var conversationId = null;

    function refreshToolbar() {
        const saveButton = $('#save-log');
        $.get('/me/recording/status/' + conversationId).then((res) => {
            if (res.status === 'on') {
                recording = true;
                $('#recording-toggle').prop("checked", true);
                saveButton.removeClass('hidden');
            } else {
                recording = false;
                $('#recording-toggle').prop("checked", false);
            }
        });
        $.get('/me/recording/log/' + conversationId).then((res) => {
            if (res)
                saveButton.removeClass('hidden');
        });
    }

    function updateFeedback(thinking) {
        if (!ws || !open) {
            $('#input-form-group').addClass('has-warning');
            $('#input-form-group .spinner-container').addClass('hidden');
-           $('#input-form-group .glyphicon-warning-sign, #input-form-group .help-block').removeClass('hidden');
            return;
        }

        $('#input-form-group').removeClass('has-warning');
        $('#input-form-group .glyphicon-warning-sign, #input-form-group .help-block').addClass('hidden');
        if (thinking)
            $('#input-form-group .spinner-container').removeClass('hidden');
        else
            $('#input-form-group .spinner-container').addClass('hidden');
    }

    function postAudio(blob) {
        const data = new FormData();
        data.append('audio', blob);
        $.ajax({
            url: _sttUrl,
            type: 'POST',
            data: data,
            contentType: false,
            processData: false,
            success: (data) => {
                if (data.status === 'ok') {
                    $('#input').val(data.text).focus();
                    $('#record-button').text('Say a command!');
                    handleUtterance();
                } else {
                    console.log(data);
                    $('#record-button').text('Hmm I couldn\'t understand...');
                }
            },
            error: (error) => {
                console.log(error);
                $('#record-button').text('Hmm there seems to be an error...');
            }
        });
    }

    function startStopRecord() {
        if (!_isRecording) {
            navigator.mediaDevices.getUserMedia({audio: true, video: false}).then((stream) => {
                // console.log('getUserMedia() success, stream created, initializing Recorder.js...');
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                const context = new AudioContext(); 
                const input = context.createMediaStreamSource(stream);
                const rec = new Recorder(input, {numChannels: 1});
                rec.record();

                // console.log('Recording started');
                $('#record-button').text('Recording... Press this to stop');

                _isRecording = true;
                _stream = stream;
                _recorder = rec; 
            }).catch((err) => {
                console.log('getUserMedia() failed');
                console.log(err);
                $('#record-button').text('You don\'t seem to have a recording device enabled!');
                // alert('You don\'t seem to have a recording device enabled!');
            });
        } else {
            $('#record-button').text('Processing command...');
            _recorder.stop();
            _stream.getAudioTracks()[0].stop();
            _recorder.exportWAV((blob) => {
                postAudio(blob);
            });
            _isRecording = false;
        }
    }

    (function() {
        var reconnectTimeout = 100;

        function connect() {
            ws = new WebSocket(url);
            ws.onmessage = function(event) {
                if (!open) {
                    open = true;
                    reconnectTimeout = 100;
                    updateFeedback(false);
                }
                onWebsocketMessage(event);
                refreshToolbar();
            };

            ws.onclose = function() {
                console.error('Web socket closed');
                ws = undefined;
                updateFeedback(false);

                // reconnect immediately if the connection previously succeeded, otherwise
                // try again in a little bit
                if (open) {
                    setTimeout(connect, 100);
                } else {
                    reconnectTimeout = 1.5 * reconnectTimeout;
                    setTimeout(connect, reconnectTimeout);
                }
            };
        }

        connect();
    })();

    function syncCancelButton(msg) {
        var visible = msg.ask !== null;
        if (visible)
            $('#cancel').removeClass('hidden');
        else
            $('#cancel').addClass('hidden');
    }

    var container = $('#chat');
    var currentGrid = null;

    var CDN_HOST = $('body').attr('data-icon-cdn');
    function almondMessage(icon) {
        var msg = $('<span>').addClass('message-container from-almond');
        icon = icon || 'org.thingpedia.builtin.thingengine.builtin';
        var thingpediaUrl = ThingEngine.getThingpedia();
        var src;
        if (thingpediaUrl !== '/thingpedia')
            src = thingpediaUrl + '/api/v3/devices/icon/' + icon;
        else
            src = CDN_HOST + '/icons/' + icon + '.png';
        msg.append($('<img>').addClass('icon').attr('src', src));
        container.append(msg);

        if (recording)
            addVoteButtons();
        return msg;
    }

    function addVoteButtons() {
        $('.comment-options').remove();
        const upvote = $('<i>').addClass('far fa-thumbs-up').attr('id', 'upvoteLast');
        const downvote = $('<i>').addClass('far fa-thumbs-down').attr('id', 'downvoteLast');
        const comment = $('<i>').addClass('far fa-comment-alt').attr('id', 'commentLast')
            .attr('data-toggle', 'modal')
            .attr('data-target', '#comment-popup');
        upvote.click((event) => {
            $.post('/me/recording/vote/up', {
                id: conversationId,
                _csrf: document.body.dataset.csrfToken
            }).then((res) => {
                if (res.status === 'ok') {
                    upvote.attr('class', 'fa fa-thumbs-up');
                    downvote.attr('class', 'far fa-thumbs-down');
                }
            });
            event.preventDefault();
        });
        downvote.click((event) => {
            $.post('/me/recording/vote/down', {
                id: conversationId,
                _csrf: document.body.dataset.csrfToken
            }).then((res) => {
                if (res.status === 'ok') {
                    upvote.attr('class', 'far fa-thumbs-up');
                    downvote.attr('class', 'fa fa-thumbs-down');
                }
            });
            event.preventDefault();
        });
        const div = $('<span>').addClass('comment-options');
        div.append(upvote);
        div.append(downvote);
        div.append(comment);
        container.append(div);
        return div;
    }

    function maybeScroll(container) {
        if (!$('#input:focus').length)
            return;

        scrollChat();
        setTimeout(scrollChat, 1000);
    }

    function scrollChat() {
        let chat = document.getElementById('conversation');
        chat.scrollTop = chat.scrollHeight;
    }

    function textMessage(text, icon) {
        var container = almondMessage(icon);
        container.append($('<span>').addClass('message message-text')
            .text(text));
        maybeScroll(container);
    }

    function picture(url, icon) {
        var container = almondMessage(icon);
        container.append($('<img>').addClass('message message-picture')
            .attr('src', url));
        maybeScroll(container);
    }

    function rdl(rdl, icon) {
        var container = almondMessage(icon);
        var rdlMessage = $('<a>').addClass('message message-rdl')
            .attr('href', rdl.webCallback).attr("target", "_blank").attr("rel", "noopener nofollow");
        rdlMessage.append($('<span>').addClass('message-rdl-title')
            .text(rdl.displayTitle));
        if (rdl.pictureUrl) {
            rdlMessage.append($('<span>').addClass('message-rdl-content')
                .append($('<img>').attr('src', rdl.pictureUrl)));
        }
        rdlMessage.append($('<span>').addClass('message-rdl-content')
            .text(rdl.displayText));
        container.append(rdlMessage);
        maybeScroll(container);
    }

    function getGrid() {
        if (!currentGrid) {
            var wrapper = $('<div>').addClass('message-container button-grid container');
            currentGrid = $('<div>').addClass('row');
            wrapper.append(currentGrid);
            container.append(wrapper);
        }
        return currentGrid;
    }

    function choice(idx, title) {
        var holder = $('<div>').addClass('col-xs-12 col-sm-6');
        var btn = $('<a>').addClass('message message-choice btn btn-default')
            .attr('href', '#').text(title);
        btn.click((event) => {
            appendUserMessage(title);
            handleChoice(idx);
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function buttonMessage(title, json) {
        var holder = $('<div>').addClass('col-xs-12 col-sm-6');
        var btn = $('<a>').addClass('message message-button btn btn-default')
            .attr('href', '#').text(title);
        btn.click((event) => {
            appendUserMessage(title);
            handleParsedCommand(json);
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function linkMessage(title, url) {
        if (url === '/apps')
            url = '/me';
        else if (url.startsWith('/devices'))
            url = '/me' + url;

        var holder = $('<div>').addClass('col-xs-12 col-sm-6');
        var btn = $('<a>').addClass('message message-button btn btn-default')
            .attr('href', url).attr("target", "_blank").attr("rel", "noopener").text(title);
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function yesnoMessage() {
        var holder = $('<div>').addClass('col-xs-6 col-sm-4 col-md-3');
        var btn = $('<a>').addClass('message message-yesno btn btn-default')
            .attr('href', '#').text("Yes");
        btn.click((event) => {
            appendUserMessage("Yes");
            handleSpecial('yes');
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        holder = $('<div>').addClass('col-xs-6 col-sm-4 col-md-3');
        btn = $('<a>').addClass('message message-yesno btn btn-default')
            .attr('href', '#').text("No");
        btn.click((event) => {
            appendUserMessage("No");
            handleSpecial('no');
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function collapseButtons() {
        $('.message-button, .message-choice, .message-yesno').remove();
        $('.comment-options').remove();
    }

    function syncKeyboardType(ask) {
        if (ask === 'password')
            $('#input').attr('type', 'password');
        else
            $('#input').attr('type', 'text');
    }

    function onWebsocketMessage(event) {
        var parsed = JSON.parse(event.data);
        console.log('received ' + event.data);
        switch (parsed.type) {
        case 'text':
            textMessage(parsed.text, parsed.icon);
            currentGrid = null;
            break;

        case 'picture':
            picture(parsed.url, parsed.icon);
            currentGrid = null;
            break;

        case 'rdl':
            rdl(parsed.rdl, parsed.icon);
            currentGrid = null;
            break;

        case 'result':
            // FIXME: support more type of results
            textMessage(parsed.fallback, parsed.icon);
            currentGrid = null;
            break;

        case 'choice':
            choice(parsed.idx, parsed.title);
            break;

        case 'button':
            buttonMessage(parsed.title, parsed.json);
            break;

        case 'link':
            linkMessage(parsed.title, parsed.url);
            break;

        case 'askSpecial':
            syncKeyboardType(parsed.ask);
            syncCancelButton(parsed);
            if (parsed.ask === 'yesno')
                yesnoMessage();
            break;

        case 'id':
            conversationId = parsed.id;
            return;
        }

        updateFeedback(false);
    }

    function handleSlashR(line) {
        line = line.trim();
        if (line.startsWith('{'))
            handleParsedCommand(JSON.parse(line));
        else
            handleParsedCommand({ code: line.split(' '), entities: {} });
    }

    function handleCommand(text) {
        if (text.startsWith('\\r')) {
            handleSlashR(text.substring(3));
            return;
        }
        if (text.startsWith('\\t')) {
            handleThingTalk(text.substring(3));
            return;
        }

        collapseButtons();
        updateFeedback(true);

        if ($('#input').attr('type') === 'password')
            appendUserMessage("••••••••");
        else
            appendUserMessage(text);
        ws.send(JSON.stringify({ type: 'command', text: text }));
    }
    function handleParsedCommand(json, title) {
        collapseButtons();
        updateFeedback(true);

        if (title)
            appendUserMessage(title);
        ws.send(JSON.stringify({ type: 'parsed', json: json }));
    }
    function handleThingTalk(tt) {
        collapseButtons();
        updateFeedback(true);

        appendUserMessage('\\t ' + tt);
        ws.send(JSON.stringify({ type: 'tt', code: tt }));
    }
    function handleChoice(idx, title) {
        handleParsedCommand({ code: ['bookkeeping', 'choice', String(idx)], entities: {} }, title);
    }
    function handleSpecial(special, title) {
        handleParsedCommand({ code: ['bookkeeping', 'special', 'special:'+special ], entities: {} }, title);
    }

    function appendUserMessage(text) {
        container.append($('<span>').addClass('message message-text from-user')
            .text(text));
    }

    function handleUtterance() {
        var text = $('#input').val();
        if (currCommand !== "")
          pastCommandsUp.push(currCommand);
        if (pastCommandsDown.length !== 0) {
          pastCommandsUp = pastCommandsUp.concat(pastCommandsDown);
          pastCommandsDown = [];
        }
        pastCommandsUp.push(text);

        $('#input').val('');

        handleCommand(text);
    }

    $('#input-form').submit((event) => {
        event.preventDefault();
        handleUtterance();
    });
    $('#cancel').click(() => {
        handleSpecial('nevermind', "Cancel.");
    });

    $('#try-almond-btn').click(function(event) {
        $(this).hide();
        $('#conversation').collapse('show');
        event.preventDefault();
    });

    $('#input-form').on('keydown', (event) => { // button is pressed
      if (event.keyCode === 38) {  // Up
        // removes last item from array pastCommandsUp, displays it as currCommand, adds current input text to pastCommandsDown
        currCommand = pastCommandsUp.pop();
        if ($('#input').val() !== "")
          pastCommandsDown.push($('#input').val());
        $('#input').val(currCommand);
      }

      if (event.keyCode === 40) {  // Down
        // removes last item from array pastCommandsDown, displays it as currCommand, adds current input text to pastCommandsUp
        currCommand = pastCommandsDown.pop();
        if ($('#input').val() !== "")
          pastCommandsUp.push($('#input').val());
        $('#input').val(currCommand);
      }
    });

    $('#record-button').click((event) => {
        startStopRecord();
    });

    $('#recording-toggle').click(() => {
        if ($('#recording-toggle').is(':checked')) {
            $('#recording-warning').modal('toggle');
        } else {
            recording = false;
            $.post('/me/recording/stop', {
                id: conversationId,
                _csrf: document.body.dataset.csrfToken
            });
            $.post('/me/recording/save', {
                id: conversationId,
                _csrf: document.body.dataset.csrfToken
            });
        }
    });

    $('#confirm-recording').click(() => {
        recording = true;
        $.post('/me/recording/start', {
            id: conversationId,
            _csrf: document.body.dataset.csrfToken
        });
        $('#save-log').removeClass('hidden');
        $('#recording-warning').modal('toggle');
        $('#recording-toggle').prop('checked', true);
    });

    $('#save-log').click(() => {
        $.post('me/recording/save', {
            id: conversationId,
            _csrf: document.body.dataset.csrfToken
        }).then((res) => {
            if (res.status === 'ok') {
                $.get('me/recording/log/' + conversationId).then((res) => {
                    if (res.status === 'ok') {
                        $('#recording-log').text(res.log);
                        const email = 'oval-bug-reports@lists.stanford.edu';
                        const subject = 'Almond Conversation Log';
                        const body = encodeURIComponent(res.log);
                        $('#recording-share').prop('href', `mailto:${email}?subject=${subject}&body=${body}`);
                        $('#recording-save').modal('toggle');
                    }
                });
            }
        });
    });

    $('#recording-download').click(() => {
        window.open("me/recording/log/" + conversationId + '.txt', "Almond Conversation Log");
    });

    $('#recording-save-done').click(() => {
        $('#recording-save').modal('toggle');
    });

    $('#recording-warning').on('hidden.bs.modal', () => {
        $('#recording-toggle').prop('checked', false);
    });

    $('#cancel-recording').click(() => {
        $('#recording-toggle').prop('checked', false);
        $('#recording-warning').modal('toggle');
    });

    $('#comment-popup').submit((event) => {
        event.preventDefault();
        $.post('/me/recording/comment', {
            id: conversationId,
            comment: $('#comment-block').val(),
            _csrf: document.body.dataset.csrfToken
        }).then((res) => {
            if (res.status === 'ok') {
                $('#commentLast').attr('class', 'fa fa-comment-alt');
                $('#comment-popup').modal('toggle');
            }
        });
    });
});
