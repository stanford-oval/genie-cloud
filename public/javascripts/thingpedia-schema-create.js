$(function() {
    var json = JSON.parse($('#device-code').text());
    var element = document.getElementById('json-manifest-placeholder');

    function jsonToManifestInvocation(inv) {
        inv.schema = [];
        var args = [];
        inv.questions = [];
        inv.required = [];
        inv.args.forEach(function(arg) {
            inv.schema.push(arg.type);
            args.push(arg.name);
            inv.questions.push(arg.question);
            inv.required.push(arg.required || false);
        });
        inv.args = args;
    }
    function jsonToManifest(json) {
        for (var name in json.triggers)
            jsonToManifestInvocation(json.triggers[name]);
        for (var name in json.actions)
            jsonToManifestInvocation(json.actions[name]);
        for (var name in (json.queries || {}))
            jsonToManifestInvocation(json.queries[name]);
        return json;
    }
    function manifestToJsonInvocation(inv) {
        var args = [];
        inv.schema.forEach(function(schema, i) {
            args.push({
                type: schema,
                name: inv.params ? inv.params[i] : inv.args[i],
                question: (inv.questions ? inv.questions[i] : '') || '',
                required: (inv.required ? inv.required[i] : false) || false,
            });
        });
        inv.args = args;
        delete inv.schema;
        delete inv.params;
        delete inv.questions;
        delete inv.required;
    }
    function manifestToJson(json) {
        for (var name in json.triggers)
            manifestToJsonInvocation(json.triggers[name]);
        for (var name in json.actions)
            manifestToJsonInvocation(json.actions[name]);
        for (var name in (json.queries || {}))
            manifestToJsonInvocation(json.queries[name]);
        return json;
    }

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
        required_by_default: true,
        disable_array_reorder: true,
        disable_array_delete_last_row: true,
        disable_array_delete_all_rows: true,
        schema: fullSchema,
        startval: manifestToJson(json)
    });

    $('#thing-form').submit(function() {
        $('#device-code').val(JSON.stringify(jsonToManifest(editor.getValue())));
    });
});
