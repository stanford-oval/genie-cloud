// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

const assert = require('assert');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const SchemaRetriever = ThingTalk.SchemaRetriever;
const ThingpediaClient = require('./deps/thingpediaclient');


function fullCanonical(canonical, type) {
    assert(type === 'stream' || type === 'query' || type === 'action');
    if (type === 'action')
        return canonical;

    if (canonical.startsWith('get '))
        canonical = canonical.slice('get '.length);
    if (type === 'query')
        return `get ${canonical}`;
    if (type === 'stream')
        return `when ${canonical} changes`;
}

function prettyprintComponent(ast, type) {
    assert(type === 'stream' || type === 'query' || type === 'action');
    if (type === 'stream') {
        let rule = new Ast.Statement.Rule(ast, [ThingTalk.Generate.notifyAction()]);
        return new Ast.Input.Program([], [], [rule]).prettyprint().split('=>')[0];
    } else if (type === 'query') {
        let command = new Ast.Statement.Command(ast, [ThingTalk.Generate.notifyAction()]);
        return new Ast.Input.Program([], [], [command]).prettyprint().split('=>')[1];
    } else {
        let command = new Ast.Statement.Command(null, [ast]);
        return new Ast.Input.Program([], [], [command]).prettyprint().split('=>')[1];
    }
}

function resolveValue(type, value) {
    if (type.isString)
        return Ast.Value.String(value);
    if (type.isNumber && !isNaN(value))
        return Ast.Value.Number(parseInt(value));
    //TODO: add support for other types
    throw new Error(`Cannot convert ${value} into ${type.toString()}`);
}

class ThingTalkBuilder {
    constructor() {
        this._locale = document.body.dataset.locale || 'en-US';

        this._developerKey = document.body.dataset.developerKey || null;
        this._user = document.body.dataset.cloudId || null;
        this.thingpedia = new ThingpediaClient(this._developerKey, this._locale);
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        this._stream = null;
        this._query = null;
        this._action = null;
        this.command = null;

        // track which type the user is currently editing
        this._currentType = null;

        // the <div> containing all devices matches the search result
        this._deviceDiv = $('#device-result');
        this._deviceCandidates = $('#device-candidates');
        this._deviceSearchHint = $('#search-result-hint');
        // the <div> containing all examples of the chosen device
        this._exampleDiv = $('#example-result');
        this._exampleCandidates = $('#example-candidates');
        this._exampleListHint = $('#example-list-hint');

        // the <div> containing input params of a chosen function
        this._inputParamsCandidates = $('#thingtalk-add-input-edit');

        // the <div> containing filter candidates of a chosen function
        this._filterCandidates = $('#thingtalk-add-filter-edit');

        // the thingtalk output
        this._thingtalkOutput = $('#thingtalk-output');
    }

    get function() {
        if (this._currentType === 'stream')
            return this._stream;
        else if (this._currentType === 'query')
            return this._query;
        else if (this._currentType === 'action')
            return this._action;
        else
            throw new Error('Unexpected type');
    }

    searchDevice(key) {
        return this.thingpedia.searchDevice(key);
    }

    async showDevices(devices) {
        this._resetDeviceCandidates(false);
        this._resetExampleCandidates();
        for (let d of devices) {
            const parsed = ThingTalk.Grammar.parse(await this.thingpedia.getDeviceCode(d.primary_kind));
            const device = parsed.classes[0];
            const candidate = $('<button>').addClass('btn').addClass('btn-default').text(d.name);
            candidate.click(async () => {
                this.showFunctions(device);
            });
            this._deviceCandidates.append(candidate);
        }
        if (devices.length === 0)
            this._deviceSearchHint.text('No device found');
        else
            this._deviceSearchHint.text('Do you mean?');
    }

    showFunctions(deviceClass) {
        assert(this._currentType === 'stream' || this._currentType === 'query' || this._currentType === 'action');

        this._resetExampleCandidates(false);

        const functions = this._currentType === 'action' ? deviceClass.actions : deviceClass.queries;
        for (let f of Object.values(functions)) {
            // skip non-monitorable functions for stream
            if (this._currentType === 'stream' && !f.is_monitorable)
                continue;

            let canonical = f.canonical ? fullCanonical(f.canonical, this._currentType) : f.name;
            let candidate = $('<button>').addClass('btn').addClass('btn-default').text(canonical);
            candidate.click(() => {
                this._updateFunction(deviceClass, f);
            });
            this._exampleCandidates.append(candidate);
        }

        if (this._exampleCandidates.length === 0)
            this._exampleListHint.text('No compatible example found for this device.');
        else
            this._exampleListHint.text('Choose the function you want to use:');
    }

    _updateFunction(deviceClass, functionSignature) {
        const invocation = new Ast.Invocation(
            new Ast.Selector.Device(deviceClass.kind, null, null), functionSignature.name, [], functionSignature
        );
        if (this._currentType === 'stream') {
            this._stream = new Ast.Stream.Monitor(
                new Ast.Table.Invocation(invocation, invocation.schema), [], invocation.schema
            );
            this._updateComponent();
        } else if (this._currentType === 'query') {
            this._query = new Ast.Table.Invocation(invocation, invocation.schema);
            this._updateComponent();
        } else if (this._currentType === 'action') {
            this._action = new Ast.Action.Invocation(invocation, invocation.schema);
            this._updateComponent();
        }

        this._thingtalkOutput.val(this._prettyprint());
        $('#thingtalk-select').modal('toggle');
    }

    _updateComponent() {
        if (this._currentType === 'stream')
            $('#thingtalk-when').val(prettyprintComponent(this._stream, 'stream'));
        else if (this._currentType === 'query')
            $('#thingtalk-get').val(prettyprintComponent(this._query, 'query'));
        else if (this._currentType === 'action')
            $('#thingtalk-do').val(prettyprintComponent(this._action, 'action'));
    }


    showInputParams() {
        this._resetInputParamCandidates();

        for (let arg of this.function.schema.iterateArguments()) {
            if (arg.is_input)
                this._addInputCandidate(arg);
        }
    }

    _addInputCandidate(arg) {
        let row = $('<div>').addClass('row');
        let nameDiv = $('<div>').addClass('col-lg-4');
        nameDiv.append($('<p>').addClass('form-control').text(arg.name));

        let opDiv = $('<div>').addClass('col-lg-3');
        opDiv.append($('<p>').addClass('form-control').text('='));

        let valueDiv = $('<div>').addClass('col-lg-4');
        valueDiv.append($('<input>').addClass('form-control').attr('id', `thingtalk-input-value-${arg.name}`));

        row.append(nameDiv);
        row.append(opDiv);
        row.append(valueDiv);

        this._inputParamsCandidates.append(row);
    }

    updateInput() {
        let values = {};
        for (let arg of this.function.schema.iterateArguments()) {
            if (arg.is_input) {
                let value = $(`#thingtalk-input-value-${arg.name}`).val();
                if (value)
                    values[arg.name] = resolveValue(arg.type, value);
            }
        }

        if (Object.keys(values).length > 0) {
            let invocation = this._currentType === 'stream' ? this.function.table.invocation : this.function.invocation;
            for (let name in values) {
                invocation.in_params.push({
                    name, value: values[name]
                });
            }
            this._updateComponent();
            this._thingtalkOutput.val(this._prettyprint());
        }
    }

    showFilters() {
        this._resetFilterCandidates();
        for (let arg of this.function.schema.iterateArguments()) {
            if (!arg.is_input)
                this._addFilterCandidate(arg);
        }
    }

    _addFilterCandidate(arg) {
        let row = $('<div>').addClass('row');
        let nameDiv = $('<div>').addClass('col-lg-4');
        nameDiv.append($('<p>').addClass('form-control').text(arg.name));

        let opDiv = $('<div>').addClass('col-lg-3');
        let selector = $('<select>').addClass('form-control').attr('id', `thingtalk-filter-op-${arg.name}`);
        if (arg.type.isNumber) {
            selector.append($('<option>').text('=='));
            selector.append($('<option>').text('>='));
            selector.append($('<option>').text('<='));
            opDiv.append(selector);
        } else if (arg.type.isString) {
            selector.append($('<option>').text('contains').val('=~'));
            opDiv.append(selector);
        } else {
            //TODO: add support for other types
        }

        let valueDiv = $('<div>').addClass('col-lg-4');
        valueDiv.append($('<input>').addClass('form-control').attr('id', `thingtalk-filter-value-${arg.name}`));

        row.append(nameDiv);
        row.append(opDiv);
        row.append(valueDiv);
        this._filterCandidates.append(row);
    }

    async updateFilter() {
        let atoms = [];
        for (let arg of this.function.schema.iterateArguments()) {
            if (!arg.is_input) {
                let value = $(`#thingtalk-filter-value-${arg.name}`).val();
                if (!value)
                    continue;

                value = resolveValue(arg.type, value);
                let op = $(`#thingtalk-filter-op-${arg.name}`).val();

                atoms.push(new Ast.BooleanExpression.Atom(arg.name, op, value));
            }
        }

        let filter;
        if (atoms.length === 1)
            filter = atoms[0];
        else if (atoms.length > 1)
            filter = new Ast.BooleanExpression.And(atoms);

        if (filter) {
            if (this._currentType === 'stream')
                this._stream = new Ast.Stream.EdgeFilter(this._stream, filter, this._stream.schema);
            else
                this._query = new Ast.Table.Filter(this._query, filter, this._query.schema);
        }

        this._updateComponent();
        this._thingtalkOutput.val(this._prettyprint());
    }


    _prettyprint() {
        let rule;
        if (!this._stream && !this._query && !this._action)
            return 'Please choose at least one function.';
        let stream = this._stream;
        let query = this._query;
        let action = this._action ? this._action : ThingTalk.Generate.notifyAction();
        if (stream && query) {
            rule = new Ast.Statement.Rule(
                new Ast.Stream.Join(stream, query, [], null), [action]
            );
        } else if (stream) {
            rule = new Ast.Statement.Rule(stream, [action]);
        } else {
            rule = new Ast.Statement.Command(query, [action]);
        }
        return new Ast.Input.Program([], [], [rule]).prettyprint();
    }



    reset(type) {
        $('#thingtalk-search-device-input').val('');
        this._currentType = type;
        this._resetDeviceCandidates();
        this._resetExampleCandidates();
    }

    _resetDeviceCandidates(hide = true) {
        if (hide)
            this._deviceDiv.hide();
        else
            this._deviceDiv.show();
        this._deviceCandidates.empty();
    }

    _resetExampleCandidates(hide = true) {
        if (hide)
            this._exampleDiv.hide();
        else
            this._exampleDiv.show();
        this._exampleCandidates.empty();
    }

    _resetInputParamCandidates() {
        this._inputParamsCandidates.empty();
    }

    _resetFilterCandidates() {
        this._filterCandidates.empty();
    }
}


$(() => {
    const builder = new ThingTalkBuilder();

    $('#thingtalk-when-select').click(() => {
        builder.reset('stream');
        $('#thingtalk-select').modal('show');
    });
    $('#thingtalk-get-select').click(() => {
        builder.reset('query');
        $('#thingtalk-select').modal('show');
    });
    $('#thingtalk-do-select').click(() => {
        builder.reset('action');
        $('#thingtalk-select').modal('show');
    });

    $('#thingtalk-when-add-input').click(() => {
        builder.reset('stream');
        $('#thingtalk-add-input').modal('show');
    });
    $('#thingtalk-get-add-input').click(() => {
        builder.reset('query');
        $('#thingtalk-add-input').modal('show');
    });
    $('#thingtalk-do-add-input').click(() => {
        builder.reset('action');
        $('#thingtalk-add-input').modal('show');
    });

    $('#thingtalk-when-add-filter').click(() => {
        builder.reset('stream');
        $('#thingtalk-add-filter').modal('show');
    });
    $('#thingtalk-get-add-filter').click(() => {
        builder.reset('query');
        $('#thingtalk-add-filter').modal('show');
    });
    $('#thingtalk-do-add-filter').click(() => {
        builder.reset('action');
        $('#thingtalk-add-filter').modal('show');
    });


    $('#thingtalk-search-device').click(async () => {
        const key = $('#thingtalk-search-device-input').val();
        const devices = await builder.searchDevice(key);
        await builder.showDevices(devices.data);
    });

    $('#thingtalk-add-input').on('shown.bs.modal', () => {
        builder.showInputParams();
    });

    $('#thingtalk-add-input-submit').click(() => {
        builder.updateInput();
        $('#thingtalk-add-input').modal('toggle');
    });

    $('#thingtalk-add-filter').on('shown.bs.modal', async () => {
        await builder.showFilters();
    });

    $('#thingtalk-add-filter-submit').click(async () => {
        await builder.updateFilter();
        $('#thingtalk-add-filter').modal('toggle');
    });
});
