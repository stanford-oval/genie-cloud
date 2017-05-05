$(function() {
    var json = JSON.parse($('#device-code').text());
    var element = document.getElementById('json-manifest-placeholder');

    var ttSchema = {
        type: 'object',
        required: false,
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
                            required: false,
                            format: 'checkbox',
                            title: 'Argument is required'
                        }
                    }
                }
            },
            doc: {
                type: 'string',
                title: 'Doc String',
            },
            confirmation: {
                type: 'string',
                title: 'Local Confirmation String',
            },
            confirmation_remote: {
                type: 'string',
                title: 'Remote Confirmation String',
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
    var fullSchema = {
        type: 'object',
        title: "Type Description",
        properties: {
            triggers: {
                type: 'object',
                title: "Triggers",
                additionalProperties: ttSchema
            },
            actions: {
                type: 'object',
                title: "Actions",
                additionalProperties: ttSchema
            },
            queries: {
                type: 'object',
                title: "Queries",
                additionalProperties: ttSchema
            }
        }
    };
    var editor = new JSONEditor(element, {
        theme: 'bootstrap3',
        iconlib: 'bootstrap3',
        required_by_default: true,
        disable_array_reorder: true,
        disable_array_delete_last_row: true,
        disable_array_delete_all_rows: true,
        schema: fullSchema,
        startval: json
    });

    $('#thing-form').submit(function() {
        $('#device-code').val(JSON.stringify(editor.getValue()));
    });
});
