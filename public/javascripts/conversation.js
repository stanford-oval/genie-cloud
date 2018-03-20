"use strict";
$(function() {
    var url = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host
        + $('#conversation').attr('data-target');
    var ws = new WebSocket(url);

    function syncCancelButton(msg) {
        var visible = msg.ask !== null;
        if (visible)
            $('#cancel').removeClass('hidden');
        else
            $('#cancel').addClass('hidden');
    }

    var container = $('#chat');
    var currentGrid = null;

    var S3_CLOUDFRONT_HOST = $('body').attr('data-icon-cdn');
    function almondMessage(icon) {
        var msg = $('<span>').addClass('message-container from-almond');
        icon = icon || 'org.thingpedia.builtin.thingengine.builtin';
        var src = S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png';
        msg.append($('<img>').addClass('icon').attr('src', src));
        container.append(msg);
        return msg;
    }

    function textMessage(text, icon) {
        var container = almondMessage(icon);
        container.append($('<span>').addClass('message message-text')
            .text(text));
    }

    function picture(url, icon) {
        var container = almondMessage(icon);
        container.append($('<img>').addClass('message message-picture')
            .attr('src', url));
    }

    function rdl(rdl, icon) {
        var container = almondMessage(icon);
        var rdlMessage = $('<a>').addClass('message message-rdl')
            .attr('href', rdl.webCallback);
        rdlMessage.append($('<span>').addClass('message-rdl-title')
            .text(rdl.displayTitle));
        rdlMessage.append($('<span>').addClass('message-rdl-content')
            .text(rdl.displayText));
        container.append(rdlMessage);
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
        btn.click(function(event) {
            appendUserMessage(title);
            handleChoice(idx);
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
    }

    function buttonMessage(title, json) {
        var holder = $('<div>').addClass('col-xs-12 col-sm-6 col-md-4');
        var btn = $('<a>').addClass('message message-button btn btn-default')
            .attr('href', '#').text(title);
        btn.click(function(event) {
            appendUserMessage(title);
            handleParsedCommand(json);
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
    }

    function linkMessage(title, url) {
        if (url === '/apps')
            url = '/me';
        else if (url.startsWith('/devices'))
            url = '/me' + url;

        var holder = $('<div>').addClass('col-xs-12 col-sm-6 col-md-4');
        var btn = $('<a>').addClass('message message-button btn btn-default')
            .attr('href', url).text(title);
        holder.append(btn);
        getGrid().append(holder);
    }

    function yesnoMessage() {
        var holder = $('<div>').addClass('col-xs-6 col-sm-4 col-md-3');
        var btn = $('<a>').addClass('message message-yesno btn btn-default')
            .attr('href', '#').text("Yes");
        btn.click(function(event) {
            appendUserMessage("Yes");
            handleSpecial('yes');
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        holder = $('<div>').addClass('col-xs-6 col-sm-4 col-md-3');
        btn = $('<a>').addClass('message message-yesno btn btn-default')
            .attr('href', '#').text("No");
        btn.click(function(event) {
            appendUserMessage("No");
            handleSpecial('no');
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
    }

    function collapseButtons() {
        $('.message-button, .message-choice, .message-yesno').remove();
    }

    ws.onmessage = function(event) {
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
            syncCancelButton(parsed);
            if (parsed.ask === 'yesno')
                yesnoMessage();
            break;
        }
    };
    ws.onclose = function() {
        console.error('Web socket closed');
        // reconnect here...
    };

    function handleCommand(text) {
        ws.send(JSON.stringify({ type: 'command', text: text }));
    }
    function handleParsedCommand(json) {
        collapseButtons();
        ws.send(JSON.stringify({ type: 'parsed', json: json }));
    }
    function handleChoice(idx) {
        handleParsedCommand({ code: ['bookkeeping', 'choice', String(idx)], entities: {} });
    }
    function handleSpecial(special) {
        handleParsedCommand({ code: ['bookkeeping', 'special', 'special:'+special ], entities: {} });
    }

    function appendUserMessage(text) {
        container.append($('<span>').addClass('message message-text from-user')
            .text(text));
    }

    $('#input-form').submit(function(event) {
        var text = $('#input').val();
        $('#input').val('');

        collapseButtons();
        appendUserMessage(text);
        handleCommand(text);
        event.preventDefault();
    });
    $('#cancel').click(function() {
        collapseButtons();
        handleSpecial('nevermind');
    });
});

