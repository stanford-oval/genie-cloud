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
                        },
                        json_key: {
                            type: 'string',
                            required: false,
                            title: 'JSON Property Name'
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
            formatted: {
                type: 'array',
                title: 'Formatted Output',
                items: {
                    title: "Item",
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['text', 'picture', 'rdl', 'code'],
                            title: "Output Type",
                            required: true,
                        },
                        text: {
                            type: 'string',
                            title: "Message",
                            required: false,
                        },
                        url: {
                            type: 'string',
                            title: "Picture URL",
                            required: false,
                        },
                        callback: {
                            type: 'string',
                            title: "Deep-Link URL",
                            required: false,
                        },
                        webCallback: {
                            type: 'string',
                            title: "Link URL",
                            required: false,
                        },
                        displayTitle: {
                            type: 'string',
                            title: "Link Title",
                            required: false,
                        },
                        displayText: {
                            type: 'string',
                            title: "Link Text",
                            required: false,
                        },
                        code: {
                            type: 'string',
                            title: "Formatting Function",
                            format: 'textarea',
                            required: false,
                        }
                    }
                }
            },
            poll_interval: {
                type: 'number',
                title: 'Polling Interval'
            },
            is_list: {
                type: 'boolean',
                format: 'checkbox',
                title: 'This function returns multiple results'
            },
            url: {
                type: 'string',
                title: 'API Endpoint URL',
                required: false,
            },
            json_key: {
                type: 'string',
                title: 'Result JSON Property Name',
                required: false,
            },
        }
    };
    var fullSchema = {
        type: 'object',
        title: "Device Manifest",
        additionalProperties: {
            type: 'string',
            required: false,
        },
        properties: {
            module_type: {
                type: 'string', title: "Package Type",
                'enum': ['org.thingpedia.v2', 'org.thingpedia.v1', 'org.thingpedia.rss', 'org.thingpedia.builtin', 'org.thingpedia.generic_rest.v1'],
                options: {
                    enum_titles: ['Custom JavaScript', 'Legacy JavaScript Module (deprecated)', 'RSS Feed', 'Preloaded', 'Generic REST']
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
            category: {
                type: 'string',
                title: "Category",
                'enum': ['physical', 'online', 'data', 'system'],
                options: {
                    enum_titles: ['Physical Device', 'Online Account', 'Public Data Source', 'System Component']
                }
            },
            subcategory: {
                type: 'string',
                title: "Device Domain",
                'enum': ['service','media','social-network','communication','home','health','data-management'],
                options: {
                    enum_titles: ['Service', 'Media', 'Social Network', 'Communication', 'Home', 'Health & Fitness', 'Data Management']
                }
            },
            types: {
                type: 'array',
                format: 'table',
                title: "Device Types",
                items: { type: 'string' }
            },
            child_types: {
                type: 'array',
                format: 'table',
                title: "Child Device Types",
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
            queries: {
                type: 'object',
                title: "Queries",
                additionalProperties: ttSchema
            },
            actions: {
                type: 'object',
                title: "Actions",
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
