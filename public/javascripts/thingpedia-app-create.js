$(function() {
    var tagCounter = 0;

    $('.tag-remove').on('click', function() {
        $($(this).attr('data-target')).remove();
    });

    tagCounter = $('.input-tag').length;

    $('#add-tag-input').on('blur', function() {
        var text = $(this).val();
        if (!text)
            return;

        var id = 'tag-' + tagCounter++;
        var tag = $('<span>')
            .addClass('label label-default input-tag')
            .attr('id', id)
            .text(text + ' | ');
        var remove = $('<a>')
            .addClass('tag-remove')
            .attr('aria-label', "Remove tag")
            .append($('<span>').addClass('glyphicon-minus'))
            .on('click', function() {
                $('#' + id).remove();
            });
        var input = $('<input>')
            .attr('type', 'hidden')
            .attr('name', 'tags[]')
            .val(text);
        tag.append(remove);
        tag.append(input);
        $('#tag-container').append(' ').append(tag);
        $(this).val('');
    });

    var json = JSON.parse($('#json-manifest-placeholder').attr('data-manifest'));
    var element = document.getElementById('json-manifest-placeholder');

    var ttSchema = {
        type: 'object',
        title: "App Manifest",
        properties: {
            args: {
                type: 'array',
                title: 'Arguments',
                items: {
                    type: 'object',
                    title: 'Argument',
                    properties: {
                        name: {
                            type: 'string',
                            title: 'Argument Name',
                        },
                        type: {
                            type: 'string',
                            title: 'Argument Type',
                        },
                        question: {
                            type: 'string',
                            title: 'Slot Filling Question',
                        },
                        required: {
                            type: 'boolean',
                            format: 'checkbox',
                            options: {
                                hidden: true
                            }
                        }
                    }
                }
            },
            confirmation: {
                type: 'string',
                title: 'Confirmation String',
            },
            canonical: {
                type: 'string',
                title: 'Canonical Form',
            },
            examples: {
                type: 'array',
                title: 'Example Commands',
                items: {
                    type: 'string',
                }
            }
        }
    };
    var editor = new JSONEditor(element, {
        theme: 'bootstrap3',
        iconlib: 'bootstrap3',
        required_by_default: true,
        display_required_only: true,
        disable_array_reorder: true,
        disable_array_delete_last_row: true,
        disable_array_delete_all_rows: true,
        schema: ttSchema,
        startval: json
    });
});
