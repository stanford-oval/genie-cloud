// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Silei Xu <silei@cs.stanford.edu>
"use strict";

const ThingTalk = require('thingtalk');
const SchemaRetriever = ThingTalk.SchemaRetriever;

const ParserClient = require('./parserclient');
const ThingpediaClient = require('./thingpediaclient');
const ThingTalkUtils = require('./thingtalkutils');
const reconstructCanonical = require('./reconstruct_canonical');

module.exports = class ThingTalkTrainer {
    constructor(options) {
        this._container = options.container;

        this._locale = document.body.dataset.locale || 'en-US';

        this._parserUrl = document.body.dataset.nlServerUrl;
        this._developerKey = document.body.dataset.developerKey || null;
        this.parser = new ParserClient(this._parserUrl, this._locale, this._developerKey);
        this._user = document.body.dataset.cloudId || null;

        this.thingpedia = new ThingpediaClient(this._developerKey, this._locale);
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        $('#input-command-utterance').change(() => {
            this._predicted = false;
            $('#submit').text('Add');
        });
        $('#input-command-thingtalk').change((event) => {
            this._confirmed = false;
            this._codeDone(event);
            $('#submit').text('Add');
        });
        $('#suggest-command-no-thingtalk').click((event) => {
            this._suggestCommand(event);
        });
        $('#results-fail-write-thingtalk').click((event) => {
            this._rejectAll(event);
        });
        $('#form-new-command').submit(this._submit.bind(this));
    }

    init() {
        $('#input-command-utterance').val('');
        $('#input-command-thingtalk').val('');
        $('#input-command-confirmation').val('');
        $('#thingtalk-error').text('');
        $('#thingtalk-group').removeClass('has-error');

        $('#utterance-group').removeClass('hidden');
        $('#submit').removeClass('hidden');

        $('#results-container').addClass('hidden');
        $('#results-fail').addClass('hidden');
        $('#add-to-commandpedia-success').hide();

        this._predicted = false;
        this._confirmed = false;
        this._raw = null;
        this._code = null;
        this._entities = null;
    }

    _hideAll() {
        $('#utterance-group').addClass('hidden');
        $('#thingtalk-group').hide();
        $('#confirmation-group').addClass('hidden');
        $('#submit').addClass('hidden');
    }

    // put accepted thingtalk code into editor
    _accept(event) {
        event.preventDefault();

        const a = $(event.currentTarget);
        const code = a.attr('data-target');

        $('#thingtalk-group').removeClass('has-error');
        $('#thingtalk-error').text('');
        $('#input-command-thingtalk').val(code);
        $('#results-container').addClass('hidden');
        $('#results-fail').addClass('hidden');
        $('#input-command-confirmation').val(a.attr('utterance'));
        $('#thingtalk-group').show();
        this._predicted = true;
        this._confirmed = true;
    }

    // hide predictions and let user type thingtalk code
    _rejectAll(event) {
        event.preventDefault();
        $('#results-container').addClass('hidden');
        $('#results-fail').addClass('hidden');
        $('#thingtalk-group').show();
    }

    _predict(event) {
        event.preventDefault();

        this._handle($('#input-command-utterance').val()).then((candidates) => {
            let results = $('#results');
            results.empty();

            let previous = null;
            let prediction = null;
            for (let candidate of candidates) {
                if (candidate === null)
                    continue;
                if (prediction === null)
                    prediction = candidate;
                if (candidate.canonical === previous)
                    continue;

                const code = candidate.program.prettyprint().replace(/\n/g, ' ');
                previous = candidate.canonical;
                let link = $('<a href="#">')
                    .text(candidate.canonical)
                    .addClass('result')
                    .attr('utterance', candidate.canonical)
                    .attr('title', code)
                    .attr('data-target', code)
                    .click(this._accept.bind(this));
                results.append($('<li>').append(link));
            }
            let link = $('<a href="#">')
                .text('None of the above')
                .addClass('none-of-above')
                .click(this._rejectAll.bind(this));
            results.append($('<li >').append(link));
            if (prediction !== null) {
                $('#results-container').removeClass('hidden');
                $('#results-fail').addClass('hidden');
            } else {
                $('#results-container').addClass('hidden');
                $('#results-fail').removeClass('hidden');
            }
        });
    }

    _updateConfirmation(program) {
        const canonical = reconstructCanonical(program);
        $('#input-command-confirmation').val(canonical);
    }

    _formatError(e) {
        var err;
        if (typeof e === 'string') {
            err = e;
        } else if (e.name === 'SyntaxError') {
            if (e.location)
                err = "Syntax error at line " + e.location.start.line + " column " + e.location.start.column + ": " + e.message;
            else
                err = "Syntax error at " + e.fileName + " line " + e.lineNumber + ": " + e.message;
        } else if (e.message) {
            err = e.message;
        } else {
            err = String(e);
        }
        return err;
    }

    _suggestCommand(event) {
        event.preventDefault();

        let utterance = this._raw;
        Promise.resolve($.ajax('/thingpedia/commands/suggest', {
            method: 'POST',
            data: { description: utterance,
                    _csrf: $('body[data-csrf-token]').attr('data-csrf-token') }
        })).catch((e) => {
            console.error(`Failed to store suggestion: ${e}`);
        }).then(() => {
            window.location.href = '/';
        });
    }

    _codeDone(event) {
        event.preventDefault();

        let thingtalk = $('#input-command-thingtalk').val();
        if (thingtalk.length > 0) {
            this._parseAndTypeCheck(thingtalk).then((program) => {
                $('#thingtalk-group').removeClass('has-error');
                $('#thingtalk-error').text('');
                this._updateConfirmation(program);
            }).catch((e) => {
                $('#thingtalk-group').addClass('has-error');
                $('#thingtalk-error').text(this._formatError(e));
            });
        }
    }

    _submit(event) {
        event.preventDefault();

        if (!this._predicted) {
            this._predict(event);
        } else if (!this._confirmed) {
            $('#confirmation-group').show();
            $('#submit').text('Confirm');
            this._confirmed = true;
        } else {
            let thingtalk = $('#input-command-thingtalk').val();
            if (thingtalk.length > 0) {
                Promise.resolve().then(() => {
                    return this._learnThingTalk(thingtalk);
                }).then((program) => {
                    $('#thingtalk-group').removeClass('has-error');
                    $('#thingtalk-error').text('');
                    this._updateConfirmation(program);
                    window.location.href = '/';
                }).catch((e) => {
                    $('#thingtalk-group').addClass('has-error');
                    $('#thingtalk-error').text(this._formatError(e));
                }).finally(() => {
                    this._hideAll();
                    $('#add-to-commandpedia-success').show();
                });
            }
        }
    }

    _parseAndTypeCheck(text) {
        return Promise.resolve().then(() => {
            return ThingTalkUtils.parse(text, this._schemaRetriever).then((program) => {
                this._code = ThingTalkUtils.serializePrediction(program, this._tokens, this._entities);
                return program;
            });
        });
    }

    _learnThingTalk(text) {
        const raw = this._raw;
        const user = this._user;
        return ThingTalkUtils.parse(text, this._schemaRetriever).then((program) => {
            this._code = ThingTalkUtils.serializePrediction(program, this._tokens, this._entities);
            return this.parser.onlineLearn(raw, this._code, 'commandpedia', user).then(() => program);
        });
    }

    _handle(text) {
        return this.parser.sendUtterance(text).then((parsed) => {
            this._raw = text;
            this._tokens = parsed.tokens;
            this._entities = parsed.entities;
            return Promise.all(parsed.candidates.map((candidate) => {
                return ThingTalkUtils.parsePrediction(candidate.code, this._entities, this._schemaRetriever, true).then((program) => {
                    if (program instanceof ThingTalk.Ast.DialogueState) {
                        if (program.dialogueAct !== 'execute')
                            throw new Error(`Not an executable command`);
                        program = new ThingTalk.Ast.Program(null, [], [], [program.history[0].stmt]);
                    }
                    candidate.program = program;
                    candidate.canonical = reconstructCanonical(program);
                    return candidate;
                }).catch((e) => {
                    console.log('Failed to reconstruct canonical for ' + candidate.code + ': ' + e.message);
                    return null;
                });
            }));
        });
    }
};
