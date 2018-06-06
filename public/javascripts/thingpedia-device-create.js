"use strict";
$(function() {
    let json = JSON.parse($('#device-code').text());
    let element = document.getElementById('json-manifest-placeholder');

    let ttSchema = {
        type: 'object',
        required: ['args', 'doc', 'confirmation', 'confirmation_remote', 'canonical', 'formatted', 'poll_interval', 'is_list'],
        properties: {
            args: {
                type: 'array',
                title: 'Arguments',
                items: {
                    type: 'object',
                    title: 'Argument',
                    required: ['name', 'type', 'question', 'is_input', 'required'],
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
                            title: 'Argument is input'
                        },
                        required: {
                            type: 'boolean',
                            title: 'Argument is required'
                        },
                        json_key: {
                            type: 'string',
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
                    required: ['type'],
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['text', 'picture', 'rdl', 'code'],
                            title: "Output Type"
                        },
                        text: {
                            type: 'string',
                            title: "Message"
                        },
                        url: {
                            type: 'string',
                            title: "Picture URL"
                        },
                        callback: {
                            type: 'string',
                            title: "Deep-Link URL"
                        },
                        webCallback: {
                            type: 'string',
                            title: "Link URL"
                        },
                        displayTitle: {
                            type: 'string',
                            title: "Link Title"
                        },
                        displayText: {
                            type: 'string',
                            title: "Link Text"
                        },
                        code: {
                            type: 'string',
                            title: "Formatting Function"
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
                title: 'This function returns multiple results'
            },
            url: {
                type: 'string',
                title: 'API Endpoint URL'
            },
            json_key: {
                type: 'string',
                title: 'Result JSON Property Name'
            },
        }
    };
    let fullSchema = {
        type: 'object',
        title: "Device Manifest",
        required: ['module_type', 'params', 'category', 'subcategory', 'types', 'child_types', 'auth', 'queries', 'actions', 'examples'],
        additionalProperties: {
            type: 'string',
        },
        properties: {
            module_type: {
                type: 'string', title: "Package Type",
                'enum': ['org.thingpedia.v2', 'org.thingpedia.v1', 'org.thingpedia.rss', 'org.thingpedia.builtin', 'org.thingpedia.generic_rest.v1', 'org.thingpedia.embedded'],
                options: {
                    enum_titles: ['Custom JavaScript', 'Legacy JavaScript Module (deprecated)', 'RSS Feed', 'Preloaded', 'Generic REST', 'Embedded in a different package']
                }
            },
            name: {
                type: 'string',
                title: "User visible name"
            },
            description: {
                type: 'string',
                title: "User visible description"
            },
            params: {
                type: 'object',
                title: "Configuration Parameters",
                additionalProperties: {
                    type: 'array',
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
                title: "Device Types",
                items: { type: 'string' }
            },
            child_types: {
                type: 'array',
                title: "Child Device Types",
                items: { type: 'string' }
            },
            auth: {
                type: 'object',
                title: "Authentication",
                required: ['type'],
                properties: {
                    type: {
                        type: 'string',
                        title: "Auth Type",
                        'enum': ['none', 'oauth2', 'basic', 'discovery', 'interactive', 'builtin'],
                        options: {
                            enum_titles: ['None', 'OAuth 1/2', 'Basic (username & password)', 'Local discovery', 'Interactive (in the Almond agent)', 'Disabled (must be configured out of band)']
                        }
                    },
                    client_id: {
                        type: 'string',
                        title: "OAuth 2 Client ID"
                    },
                    client_secret: {
                        type: 'string',
                        title: "OAuth 2 Client Secret"
                    },
                    discoveryType: {
                        type: 'string',
                        title: "Discovery protocol",
                        enum: ['upnp', 'bluetooth']
                    },
                    api_key: {
                        type: 'string',
                        title: "API Key"
                    }
                },
                additionalProperties: {
                    type: 'string'
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

    let options = {
        mode: 'tree',
        modes: ['code', 'tree'], // allowed modes
        schema: fullSchema,
        onError: function (err) {
            alert(err.toString());
        }
    };
    let editor = new JSONEditor(element, options);
    editor.set(json);

    $('#thing-form').submit(function() {
        $('#device-code').val(JSON.stringify(editor.get()));
    });
});
