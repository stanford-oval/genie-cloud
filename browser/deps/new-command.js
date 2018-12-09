// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const SchemaRetriever = ThingTalk.SchemaRetriever;

const ParserClient = require('./parserclient');
const ThingpediaClient = require('./thingpediaclient');
const reconstructCanonical = require('./reconstruct_canonical');

module.exports = class ThingTalkTrainer {
    constructor(options) {
        this._container = options.container;

        this.parser = new ParserClient(options.sempreUrl, 'en-US');

        this._locale = document.body.dataset.locale;
        this._developerKey = document.body.dataset.developerKey || null;
        this._user = document.body.dataset.cloudId || null;

        this.thingpedia = new ThingpediaClient(this._developerKey, this._locale);
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        this._predicted = false;
        this._confirmed = false;
        this._raw = null;
        this._code = null;
        this._entities = null;

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

    // put accepted thingtalk code into editor
    _accept(event) {
        event.preventDefault();

        const a = $(event.currentTarget);
        let code = a.attr('data-target');
        code = code.split(' ');

        this._toThingTalk(code).then((tt) => {
            $('#thingtalk-group').removeClass('has-error');
            $('#thingtalk-error').text('');
            $('#input-command-thingtalk').val(tt);
            $('#results-container').addClass('hidden');
            $('#results-fail').addClass('hidden');
            $('#input-command-confirmation').val(a.attr('utterance'));
            $('#thingtalk-group').show();
            this._predicted = true;
            this._confirmed = true;
        }).catch((e) => {
            alert(e.message+'\n'+e.stack);
        });
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
                previous = candidate.canonical;
                let link = $('<a href="#">')
                    .text(candidate.canonical)
                    .addClass('result')
                    .attr('utterance', candidate.canonical)
                    .attr('title', candidate.code.join(' '))
                    .attr('data-target', candidate.code.join(' '))
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

    _updateConfirmation() {
        return reconstructCanonical(this._schemaRetriever, this._code, this._entities).then((canonical) => {
            $('#input-command-confirmation').val(canonical);
        }).catch((e) => {
            console.log('Failed to reconstruct canonical for ' + this._code);
            console.log(e);
            return null;
        });

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
            this._parseAndTypeCheck(thingtalk).then(() => {
                $('#thingtalk-group').removeClass('has-error');
                $('#thingtalk-error').text('');
                this._updateConfirmation();
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
        } else {
            let thingtalk = $('#input-command-thingtalk').val();
            if (thingtalk.length > 0) {
                Promise.resolve().then(() => {
                    return this._learnThingTalk(thingtalk);
                }).then(() => {
                    $('#thingtalk-group').removeClass('has-error');
                    $('#thingtalk-error').text('');
                    this._updateConfirmation();
                    window.location.href = '/';
                }).catch((e) => {
                    $('#thingtalk-group').addClass('has-error');
                    $('#thingtalk-error').text(this._formatError(e));
                });
            }
        }
    }

    _toProgram(code) {
        let program = ThingTalk.NNSyntax.fromNN(code, this._entities);
        return program.typecheck(this._schemaRetriever, true);
    }

    _toThingTalk(code) {
        return this._toProgram(code).then((program) => program.prettyprint(true));
    }

    _toNN(program) {
        let clone = {};
        Object.assign(clone, this._entities);
        return ThingTalk.NNSyntax.toNN(program, this._tokens, clone);
    }

    _parseAndTypeCheck(text) {
        return Promise.resolve().then(() => {
            return ThingTalk.Grammar.parseAndTypecheck(text, this._schemaRetriever).then((program) => {
                this._code = this._toNN(program);
            });
        });
    }

    _learnThingTalk(text) {
        const raw = this._raw;
        const user = this._user;
        return ThingTalk.Grammar.parseAndTypecheck(text, this._schemaRetriever).then((program) => {
            this._code = this._toNN(program);
            return this.parser.onlineLearn(raw, this._code, 'commandpedia', user);
        });
    }

    _handle(text) {
        return this.parser.sendUtterance(text).then((parsed) => {
            this._raw = text;
            this._tokens = parsed.tokens;
            this._entities = parsed.entities;
            return Promise.all(parsed.candidates.map((candidate) => {
                return reconstructCanonical(this._schemaRetriever, candidate.code, this._entities).then((canonical) => {
                    candidate.canonical = canonical;
                    return candidate;
                }).catch((e) => {
                    console.log('Failed to reconstruct canonical for ' + candidate.code + ': ' + e.message);
                    return null;
                });
            }));
        });
    }
};
