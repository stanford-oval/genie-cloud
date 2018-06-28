// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

require('./polyfill');

const ThingTalk = require('thingtalk');
const SchemaRetriever = ThingTalk.SchemaRetriever;

const ParserClient = require('./parserclient');
const ThingpediaClient = require('./thingpediaclient');
const reconstructCanonical = require('./reconstruct_canonical');

class ThingTalkTrainer {
    constructor() {
        this.parser = new ParserClient('http://crowdie.stanford.edu:8400', 'en-US');

        this._locale = $('body[data-locale]').attr('data-locale');
        this._developerKey = $('body[data-developer-key]').attr('data-developer-key') || null;

        this.thingpedia = new ThingpediaClient(this._developerKey, this._locale);
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        this._raw = null;
        this._entities = null;

        $('#counter').text(localStorage.getItem('counter') || 0);
        $('#sentence-to-code-form').submit(this._formSubmit.bind(this));
        $('#sentence-to-code-done').click(this._codeDone.bind(this));
    }

    _counter() {
        let v = localStorage.getItem('counter') || 0;
        v++;
        localStorage.setItem('counter', v);
        return v;
    }

    _accept(event) {
        event.preventDefault();

        const a = $(event.currentTarget);
        let code = a.attr('data-target');
        console.log('code', code);
        code = code.split(' ');

        var editThingTalk = $('#edit-thingtalk')[0].checked;
        if (editThingTalk) {
            this._toThingTalk(code).then((tt) => {
                $('#thingtalk-editor').removeClass('hidden');
                $('#thingtalk-group').removeClass('has-error');
                $('#thingtalk-error').text('');
                $('#thingtalk').val(tt);
            }).catch((e) => {
                alert(e.message+'\n'+e.stack);
            });
        } else {
            $('#thingtalk-editor').addClass('hidden');
            this._learnNN(code).then((data) => {
                $('#results-container').hide();
                if (data.error)
                    console.log('Error in learning', data.error);
                else
                    $('#counter').text(String(this._counter()));
            });
        }
    }

    // we can't train on a fully negative example, so we just do nothing
    // the sentence has been stored in the log anyway
    _rejectAll(event) {
        event.preventDefault();

        var editThingTalk = $('#edit-thingtalk')[0].checked;
        if (editThingTalk) {
            $('#thingtalk-editor').removeClass('hidden');
            $('#thingtalk-group').removeClass('has-error');
            $('#thingtalk-error').text('');
            $('#thingtalk').val('');
        } else {
            $('#results-container').hide();
            $('#counter').text(String(this._counter()));
        }
    }

    _writeCode(event) {
        event.preventDefault();

        $('#thingtalk-editor').removeClass('hidden');
        $('#thingtalk-group').removeClass('has-error');
        $('#thingtalk-error').text('');
        $('#thingtalk').val('');
    }

    _formSubmit(event) {
        event.preventDefault();

        this._handle($('#utterance').val()).then((candidates) => {
            $('#results-container').show();
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
                    .attr('title', candidate.code.join(' '))
                    .attr('data-target', candidate.code.join(' '))
                    .click(this._accept.bind(this));
                results.append($('<li>').append(link));
            }
            if (prediction === null) {
                $('#prediction').text("Almond is confused and does not know what to do.");
            } else {
                $('#prediction').text(prediction.canonical);

                let link = $('<a href="#">')
                    .text('None of the above')
                    .addClass('result')
                    .click(this._rejectAll.bind(this));
                results.append($('<li>').append(link));
            }

            let link = $('<a href="#">')
                .text('Let me write the ThingTalk code')
                .addClass('result')
                .click(this._writeCode.bind(this));
            results.append($('<li>').append(link));
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

    _codeDone(event) {
        event.preventDefault();

        var tt = $('#thingtalk').val();
        this._learnThingTalk(tt).then((data) => {
            $('#results-container').hide();
            $('#thingtalk-editor').addClass('hidden');
            $('#thingtalk-group').removeClass('has-error');
            $('#thingtalk-error').text('');
            if (data.error)
                console.log('Error in learning', data.error);
            else
                $('#counter').text(String(this._counter()));
        }).catch((e) => {
            $('#thingtalk-group').addClass('has-error');
            $('#thingtalk-error').text(this._formatError(e));
        });
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

    _learnNN(targetCode) {
        return this.parser.onlineLearn(this._raw, targetCode, 'online');
    }

    _learnThingTalk(text) {
        const raw = this._raw;
        return ThingTalk.Grammar.parseAndTypecheck(text, this._schemaRetriever).then((program) => {
            const code = this._toNN(program);
            return this.parser.onlineLearn(raw, code, 'online');
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
}

$(() => {
    new ThingTalkTrainer();
});
