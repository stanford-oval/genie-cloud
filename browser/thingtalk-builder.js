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

        // the thingtalk output
        this._thingtalkOutput = $('#thingtalk-output');
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

    _updateThingTalk(e) {
        if (this._currentType === 'stream') {
            this._stream = e;
            $('#thingtalk-when').val(e.target.code.split('=>')[0]);
        } else if (this._currentType === 'query') {
            this._query = e;
            $('#thingtalk-get').val(e.target.code.split('=>')[1]);
        } else if (this._currentType === 'action') {
            this._action = e;
            $('#thingtalk-do').val(e.target.code.split('=>')[1]);
        } else {
            throw new Error('Unexpected type');
        }

        this._thingtalkOutput.val(this._prettyprint());
        $('#thingtalk-select').modal('toggle');
    }

    _prettyprint() {
        let rule, stream, query, action;
        if (!this._stream && !this._query && !this._action)
            return 'Please choose at least one function.';
        if (this._action)
            action = ThingTalk.Grammar.parse(this._action.target.code).rules[0].actions[0];
        else
            action = ThingTalk.Generate.notifyAction();
        if (this._stream)
            stream = ThingTalk.Grammar.parse(this._stream.target.code).rules[0].stream;
        if (this._query)
            query = ThingTalk.Grammar.parse(this._query.target.code).rules[0].table;
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
            slotTypes[name] = String(ex.args[name]);
            slots.push(name);
        }

        let code = newprogram.prettyprint();
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

    $('#thingtalk-search-device').click(async () => {
        const key = $('#thingtalk-search-device-input').val();
        const devices = await builder.searchDevice(key);
        builder.showDevices(devices.data);
    });
});
