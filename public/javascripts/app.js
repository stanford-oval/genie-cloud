"use strict";
$(function() {
    const CDN_HOST = $('body').attr('data-icon-cdn');
    const csrfToken = $('#commandpedia').attr('csrf');

    let insearch = false;

    let likedCommands = new Set(JSON.parse(window.localStorage.getItem('liked-commands') || '[]'));
    console.log(likedCommands);
    function addLiked(id) {
        if (likedCommands.has(id))
            return false;
        likedCommands.add(id);
        console.log(likedCommands);
        window.localStorage.setItem('liked-commands', JSON.stringify(Array.from(likedCommands)));
        return true;
    }
    function removeLiked(id) {
        if (!likedCommands.has(id))
            return false;
        likedCommands.delete(id);
        console.log(likedCommands);
        window.localStorage.setItem('liked-commands', JSON.stringify(Array.from(likedCommands)));
        return true;
    }

    function updateSearch() {
        if (insearch) {
            $('#command-reset-button').show();
            $('#commands-page-prev').hide();
            $('#commands-page-next').hide();
        } else {
            $('#command-reset-button').hide();
        }
    }

    function renderCommands(result) {
        let commands = result.data;
        let output = [];
        for (let i = 0; i < Math.min(commands.length, 9); i++) {
            let command = commands[i];
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
            let heart = $('<i>').addClass(likedCommands.has(String(command.id)) ? 'fas' : 'far')
                .addClass('fa-heart').attr('id', command.id).attr('role', 'button').attr('_csrf', csrfToken);
            heart.click(function(event) {
                let icon = $('#' + this.id);

                let count = $('#count' + this.id);
                let current = Number(count.text());

                if (icon.hasClass('far')) {
                    if (addLiked(this.id)) {
                        icon.removeClass('far').addClass('fas');
                        $.post('/thingpedia/examples/upvote/' + this.id, '_csrf=' + $(this).attr('_csrf'));
                        count.text(current + 1);
                    }
                } else {
                    if (removeLiked(this.id)) {
                        icon.removeClass('fas').addClass('far');
                        $.post('/thingpedia/examples/downvote/' + this.id, '_csrf=' + $(this).attr('_csrf'));
                        count.text(current - 1);
                    }
                }
                event.preventDefault();
            });

            user.append(heart);
            let count = $('<span>').attr('id', 'count' + command.id).text(command.click_count);
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

            commandContainer.click(function(event) {
                event.preventDefault();
                form.submit();
            });

            output.push(commandContainer[0]);
        }

        return output;
    }

    let slideIndex = 0;
    showSlides();

    function showSlides() {
        let slides = $('.icon-slide');
        for (let i = 0; i < slides.length; i++)
            $(slides[i]).css('display', 'none');
        slideIndex ++;
        if (slideIndex > slides.length) slideIndex = 1;
        $(slides[slideIndex - 1]).css('display', 'block');
        setTimeout(() => showSlides(), 3000);
    }

    const $container = $('#command-container');
    let infScroll;

    function initializeInfiniteScroll() {
        $container.infiniteScroll({
            path: function() {
                return '/thingpedia/api/commands/all?page=' + this.loadCount;
            },

            append: false,
            history: false,

            responseType: 'text'
        });
        $container.on('load.infiniteScroll', function(event, response) {
            const parsed = JSON.parse(response);
            const $items = renderCommands(parsed);
            $container.infiniteScroll('appendItems', $items);
        });

        infScroll = $container.data('infiniteScroll');
        $container.infiniteScroll('loadNextPage');
    }

    $('#command-search-button').click(function(event) {
        event.preventDefault();
        insearch = true;
        if (infScroll) {
            $container.infiniteScroll('destroy');
            infScroll = undefined;
        }
        $.ajax('/thingpedia/api/commands/search', { data: {
            q: $('#command-search-box').val()
        }, method: 'GET' }).then(function(response) {
            $container.empty();
            $container.append(renderCommands(response));
            updateSearch();
        });
    });

    $('#command-reset-button').click(function(event) {
        event.preventDefault();
        if (!insearch)
            return;
        $container.empty();
        updateSearch();
        initializeInfiniteScroll();
    });

    initializeInfiniteScroll();

});
