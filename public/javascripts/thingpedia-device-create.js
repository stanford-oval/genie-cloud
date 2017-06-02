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
            examples: {
                type: 'array',
                title: 'Example Commands',
                items: {
                    type: 'string',
                }
            },
            url: {
                type: 'string',
                title: 'API Endpoint URL',
                required: false,
            },
            webhook: {
                type: 'boolean',
                format: 'checkbox',
                title: 'Is it a webhook?',
                required: false,
            },
            'poll-interval': {
                type: 'number',
                title: 'Polling Interval',
                required: false,
            }
        }
    };
    var fullSchema = {
        type: 'object',
        title: "Thing Manifest",
        additionalProperties: {
            type: 'string',
            required: false,
        },
        properties: {
            module_type: {
                type: 'string', title: "Package Type",
                'enum': ['org.thingpedia.v1', 'org.thingpedia.rss', 'org.thingpedia.rest_json', 'org.thingpedia.builtin'],
                options: {
                    enum_titles: ['Custom JavaScript', 'RSS Feed', 'REST+JSON', 'Preloaded']
                }
            },
            name: {
                type: 'string',
                title: "User visible name",
                required: false,
            },
            description: {
                type: 'string',
                title: "User visible description",
                required: false,
            },
            'global-name': {
                type: 'string',
                title: "Global Name",
                required: false
            },
            params: {
                type: 'object',
                title: "Configuration Parameters",
                additionalProperties: {
                    type: 'array',
                    required: false,
                    minItems: 2,
                    maxItems: 2,
                    items: [
                        { type: 'string', title: "Label",
                          headerTemplate: '{{title}}' },
                        { type: 'string', title: "Type",
                          'enum': ['text', 'password', 'email', 'number'],
                          headerTemplate: '{{title}}' }
                    ]
                }
            },
            types: {
                type: 'array',
                format: 'table',
                title: "Thing Types",
                items: { type: 'string' }
            },
            child_types: {
                type: 'array',
                format: 'table',
                title: "Child Thing Types",
                items: { type: 'string' }
            },
            auth: {
                type: 'object',
                title: "Authentication",
                properties: {
                    type: {
                        type: 'string',
                        title: "Auth Type",
                        'enum': ['none', 'oauth2', 'basic', 'builtin', 'discovery']
                    },
                    client_id: {
                        type: 'string',
                        title: "OAuth 2 Client ID",
                        required: false,
                    },
                    client_secret: {
                        type: 'string',
                        title: "OAuth 2 Client Secret",
                        required: false,
                    }
                },

                additionalProperties: {
                    type: 'string',
                    required: false,
                }
            },
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
        display_required_only: true,
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
