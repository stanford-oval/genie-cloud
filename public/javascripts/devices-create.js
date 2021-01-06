"use strict";
$(function() {
    function getThingpedia() {
        return document.body.dataset.thingpediaUrl;
    }

    function handleOnlineAccountFactory(json, kind, name) {
        console.log('Handling online account ' + kind);
        const self = $('<div>');
        self.addClass('online-account-choice col-md-4');

        if (json.type === 'none') {
            const form = $('<form>');
            form.attr('action', "/me/devices/create");
            form.attr('method', "post");
            const csrf = $('<input>');
            csrf.attr('type', 'hidden');
            csrf.attr('name', '_csrf');
            csrf.val(document.body.dataset.csrfToken);
            form.append(csrf);
            const btn = $('<button>').attr('type', 'submit').attr('name', 'kind').attr('value', kind);
            btn.addClass('btn btn-default btn-block');
            btn.text(name);
            form.append(btn);
            self.append(form);
        } else {
            const btn = $('<a>');
            btn.addClass('btn btn-default btn-block');
            btn.text(name);
            self.append(btn);

            switch(json.type) {
            case 'form': {
                const form = $('<form>');
                form.attr('action', "/me/devices/create");
                form.attr('method', "post");
                const csrf = $('<input>');
                csrf.attr('type', 'hidden');
                csrf.attr('name', '_csrf');
                csrf.val(document.body.dataset.csrfToken);
                form.append(csrf);
                form.addClass('online-account-expander collapse');
                form.attr('id', 'online-account-' + kind);
                form.attr('aria-expanded', 'false');

                json.fields.forEach(function(field) {
                    const input = $('<input>').addClass('form-control')
                        .attr('type', field.type).attr('name', field.name);
                    const label = $('<label>').addClass('control-label').text(field.label);
                    const div = $('<div>').addClass('form-group').append(label).append(input);
                    form.append(div);
                });
                form.append($('<button>').addClass('btn btn-primary')
                            .attr('name', 'kind').attr('value', kind)
                            .attr('type', 'submit').text("Configure"));
                btn.attr('data-toggle', 'online-account-' + kind);
                form.collapse('hide');
                btn.on('click', function() { form.collapse('toggle'); });
                self.append(form);
                break;
            }
            case 'link':
                btn.attr('href', json.href);
                break;
            case 'oauth2':
                btn.attr('href', '/me/devices/oauth2/' + kind);
                break;
            default: // discovery or builtin, ignore
                break;
            }
        }

        return self;
    }

    const developerKey = document.body.dataset.developerKey;
    const url = getThingpedia() + '/api/v3/devices/setup?developer_key=' + developerKey;
    $.get(url, function(result) {
        const container = $('#online-account-selector');

        for (let i = 0; i < result.data.length; i += 3) {
            const row = $('<div>').addClass('row');
            container.append(row);

            for (let j = 0; j < Math.min(3, result.data.length - i); j++) {
                const f = result.data[i + j];
                row.append(handleOnlineAccountFactory(f, f.kind, f.text));
            }
        }
    });
});
