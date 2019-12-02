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

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const SchemaRetriever = ThingTalk.SchemaRetriever;
const ThingpediaClient = require('./deps/thingpediaclient');

function prettyprintExample(e, full=true) {
    const code = ThingTalk.NNSyntax.fromNN(e.target.code, e.target.entities);
    if (full)
        return code.prettyprint();
    if (e.type === 'stream')
        return code.prettyprint().split('=>')[0];
    if (e.type === 'query' || e.type === 'action')
        return code.prettyprint().split('=>')[1];
    return code;
}

function fromString(type, value) {
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

    get currentExample() {
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

    listExamplesByKind(kind) {
        return this.thingpedia.getExamplesByKinds([kind]);
    }

    showDevices(devices) {
        this._resetDeviceCandidates(false);
        this._resetExampleCandidates();
        for (let d of devices) {
            let candidate = $('<button>').addClass('btn').addClass('btn-default').text(d.name);
            let self = this;
            candidate.click(async () => {
                const dataset = await self.listExamplesByKind(d.primary_kind);
                const allExamples = await this.loadExamples(dataset);
                this.showExamples(allExamples);
            });
            this._deviceCandidates.append(candidate);
        }
        this._deviceSearchHint.text('Do you mean?');
    }

    showExamples(examples) {
        this._resetExampleCandidates(false);
        let examplesOfCurrentType = examples.filter((e) => e.type === this._currentType);
        if (examplesOfCurrentType.length === 0)
            this._exampleListHint.text('No compatible example found for this device.');
        else
            this._exampleListHint.text('Choose the function you want to use:');
        for (let e of examplesOfCurrentType) {
            let candidate = $('<button>').addClass('btn').addClass('btn-default').text(e.utterance);
            candidate.click(() => {
                this._updateThingTalk(e);
            });
            this._exampleCandidates.append(candidate);
        }
    }

    showInputParams() {
        this._resetInputParamCandidates();

        let ex = this.currentExample;
        for (let slot in ex.target.slotTypes)
            this._addInputCandidate(slot, ex.target.slotTypes[slot]);
    }

    async showFilters() {
        let ex = this.currentExample;
        let code = ThingTalk.NNSyntax.fromNN(ex.target.code, ex.target.entities).prettyprint();
        let parsed = await ThingTalk.Grammar.parseAndTypecheck(code, this._schemaRetriever);
        let schema;
        if (this._currentType === 'stream')
            schema = parsed.rules[0].stream.schema;
        else if (this._currentType === 'query')
            schema = parsed.rules[0].table.schema;
        else if (this._currentType === 'action')
            schema = parsed.rules[0].actions[0].schema;
        else
            throw new Error('Unexpected type');

        for (let arg of schema.iterateArguments()) {
            if (arg.is_input)
                continue;
            let row = $('<div>').addClass('row');
            let nameDiv = $('<div>').addClass('col-lg-4');
            nameDiv.append($('<p>').addClass('form-control').text(arg.name));

            let opDiv = $('<div>').addClass('col-lg-3');
            if (arg.type.isNumber) {
                let selector = $('<select>').addClass('form-control').attr('id', `thingtalk-filter-op-${arg.name}`);
                selector.append($('<option>').text('=='));
                selector.append($('<option>').text('>='));
                selector.append($('<option>').text('<='));
                opDiv.append(selector);
            } else if (arg.type.isString) {
                opDiv.append($('<p>').addClass('form-control').text('contains'));
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


    }

    _updateThingTalk(e) {
        if (this._currentType === 'stream') {
            this._stream = e;
            $('#thingtalk-when').val(prettyprintExample(e, false));
        } else if (this._currentType === 'query') {
            this._query = e;
            $('#thingtalk-get').val(prettyprintExample(e, false));
        } else if (this._currentType === 'action') {
            this._action = e;
            $('#thingtalk-do').val(prettyprintExample(e, false));
        } else {
            throw new Error('Unexpected type');
        }

        this._thingtalkOutput.val(this._prettyprint());
        $('#thingtalk-select').modal('toggle');
    }


    _addInputCandidate(name) {
        let row = $('<div>').addClass('row');
        let nameDiv = $('<div>').addClass('col-lg-4');
        nameDiv.append($('<p>').addClass('form-control').text(name));

        let opDiv = $('<div>').addClass('col-lg-3');
        opDiv.append($('<p>').addClass('form-control').text('='));

        let valueDiv = $('<div>').addClass('col-lg-4');
        valueDiv.append($('<input>').addClass('form-control').attr('id', `thingtalk-input-value-${name}`));

        row.append(nameDiv);
        row.append(opDiv);
        row.append(valueDiv);

        this._inputParamsCandidates.append(row);
    }

    updateInput() {
        if (this._currentType === 'stream') {
            let entities = {};
            for (let i = 0; i < this._stream.target.slots.length; i++) {
                let name = this._stream.target.slots[i];
                let value = $(`#thingtalk-input-value-${name}`).val();
                if (value)
                    entities[`SLOT_${i}`] = fromString(this._stream.target.slotTypes[name], value);
            }
            this._stream.target.entities = entities;
            let stream = ThingTalk.NNSyntax.fromNN(this._stream.target.code, entities).prettyprint();
            $('#thingtalk-when').val(stream.split('=>')[0]);
        } else if (this._currentType === 'query') {
            let entities = {};
            for (let i = 0; i < this._query.target.slots.length; i++) {
                let name = this._query.target.slots[i];
                let value = $(`#thingtalk-input-value-${name}`).val();
                if (value)
                    entities[`SLOT_${i}`] = fromString(this._query.target.slotTypes[name], value);
            }
            this._query.target.entities = entities;
            let query = ThingTalk.NNSyntax.fromNN(this._query.target.code, entities).prettyprint();
            $('#thingtalk-get').val(query.split('=>')[1]);
        } else if (this._currentType === 'action') {
            let entities = {};
            for (let i = 0; i < this._action.target.slots.length; i++) {
                let name = this._action.target.slots[i];
                let value = $(`#thingtalk-input-value-${name}`).val();
                if (value)
                    entities[`SLOT_${i}`] = fromString(this._action.target.slotTypes[name], value);
            }
            this._action.target.entities = entities;
            let action = ThingTalk.NNSyntax.fromNN(this._action.target.code, entities).prettyprint();
            $('#thingtalk-do').val(action.split('=>')[1]);
        } else {
            throw new Error('Unexpected type');
        }
        this._thingtalkOutput.val(this._prettyprint());
    }

    async updateFilter() {
        let ex = this.currentExample;
        let code = ThingTalk.NNSyntax.fromNN(ex.target.code, ex.target.entities).prettyprint();
        let parsed = await ThingTalk.Grammar.parseAndTypecheck(code, this._schemaRetriever);
        let ast;
        if (this._currentType === 'stream')
            ast = parsed.rules[0].stream;
        else if (this._currentType === 'query')
            ast = parsed.rules[0].table;
        else
            throw new Error('Unexpected type');

        let entities = {};
        for (let arg of ast.schema.iterateArguments()) {
            if (arg.is_input)
                continue;

            let value = $(`#thingtalk-filter-value-${arg.name}`).val();
            if (!value)
                continue;
            value = fromString(arg.type, value);
            let op = $(`#thingtalk-filter-op-${arg.name}`).val();
            let filter = new Ast.BooleanExpression.Atom(arg.name, op, value);

            if (this._currentType === 'stream') {
                let rule = new Ast.Statement.Rule(
                    new Ast.Stream.Filter(ast, filter, ast.schema),
                    [ThingTalk.Generate.notifyAction()]
                );
                let program = new Ast.Input.Program([], [], [rule]);
                this._stream.target.code = ThingTalk.NNSyntax.toNN(program, {}, {});
                $('#thingtalk-when').val(program.prettyprint().split('=>')[0]);
            } else {
                let command = new Ast.Statement.Command(
                    new Ast.Table.Filter(ast, filter, ast.schema),
                    [ThingTalk.Generate.notifyAction()]
                );
                let program = new Ast.Input.Program([], [], [command]);
                //this._query.target.code = ThingTalk.NNSyntax.toNN(program, {});
                $('#thingtalk-when').val(program.prettyprint().split('=>')[1]);
            }
        }
        this._thingtalkOutput.val(this._prettyprint());
    }

    _prettyprint() {
        let rule, stream, query, action;
        if (!this._stream && !this._query && !this._action)
            return 'Please choose at least one function.';
        if (this._action)
            action = ThingTalk.NNSyntax.fromNN(this._action.target.code, this._action.target.entities).rules[0].actions[0];
        else
            action = ThingTalk.Generate.notifyAction();
        if (this._stream)
            stream = ThingTalk.NNSyntax.fromNN(this._stream.target.code, this._stream.target.entities).rules[0].stream;
        if (this._query)
            query = ThingTalk.NNSyntax.fromNN(this._query.target.code, this._query.target.entities).rules[0].table;
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

    _resetDeviceCandidates(hide=true) {
        if (hide)
            this._deviceDiv.hide();
        else
            this._deviceDiv.show();
        this._deviceCandidates.empty();
    }

    _resetExampleCandidates(hide=true) {
        if (hide)
            this._exampleDiv.hide();
        else
            this._exampleDiv.show();
        this._exampleCandidates.empty();
    }

    _resetInputParamCandidates() {
        this._inputParamsCandidates.empty();
    }


    async loadExamples(dataset, maxCount) {
        const parsed = await ThingTalk.Grammar.parseAndTypecheck(dataset, this._schemaRetriever);
        const parsedDataset = parsed.datasets[0];

        if (maxCount === undefined)
            maxCount = parsedDataset.examples.length;
        else
            maxCount = Math.min(parsedDataset.examples.length, maxCount);
        let output = [];
        for (let i = 0; i < maxCount; i++) {
            const loaded = this._loadOneExample(parsedDataset.examples[i]);
            if (loaded !== null)
                output.push(loaded);
        }
        return output;
    }

    _loadOneExample(ex) {
        // refuse to slot fill pictures
        for (let name in ex.args) {
            let type = ex.args[name];
            // avoid examples such as "post __" for both text and picture (should be "post picture" without slot for picture)
            if (type.isEntity && type.type === 'tt:picture')
                return null;
        }

        // turn the declaration into a program
        let newprogram = ex.toProgram();
        let slots = [];
        let slotTypes = {};
        for (let name in ex.args) {
            slotTypes[name] = ex.args[name];
            slots.push(name);
        }

        let code = ThingTalk.NNSyntax.toNN(newprogram, {});
        let monitorable;
        if (ex.type === 'stream')
            monitorable = true;
        else if (ex.type === 'action')
            monitorable = false;
        else if (ex.type === 'query')
            monitorable = ex.value.schema.is_monitorable;
        else
            monitorable = false;
        return {
            utterance: ex.utterances[0],
            type: ex.type,
            monitorable: monitorable,
            target: {
                example_id: ex.id, code: code, entities: {}, slotTypes: slotTypes, slots: slots
            }
        };
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
        builder.showDevices(devices.data);
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
