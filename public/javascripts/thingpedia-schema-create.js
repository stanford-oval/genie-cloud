$(function() {
    var json = JSON.parse($('#device-code').text());
    var element = document.getElementById('json-manifest-placeholder');

    var ttSchema = {
        type: 'object',
        required: false,
            additionalProperties: {
                type: 'any',
                required: false
            },
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
                        is_input: {
                            type: 'boolean',
                            format: 'checkbox',
                            title: 'Argument is input'
                        },
                        required: {
                            type: 'boolean',
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
            is_monitorable: {
                type: 'boolean',
                format: 'checkbox',
                title: 'This function can be monitored'
            },
            is_list: {
                type: 'boolean',
                format: 'checkbox',
                title: 'This function returns multiple results'
            },
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
            },
            examples: {
                type: 'array',
                title: 'Example Commands',
                items: {
                    type: 'object',
                    title: 'Example',
                    properties: {
                        utterance: {
                            type: 'string',
                            title: 'Utterance'
                        },
                        program: {
                            type: 'string',
                            title: 'Program'
                        }
                    }
                }
            },
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
