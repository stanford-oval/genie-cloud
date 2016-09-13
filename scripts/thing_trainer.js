// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const readline = require('readline');

const SempreSyntax = require('../util/sempre_syntax');
const SempreClient = require('./deps/sempreclient');
const ThingPediaClient = require('./deps/http_client');
const SchemaRetriever = require('thingtalk').SchemaRetriever;

const URL = 'https://sabrina-nl.stanford.edu'

class Trainer {
    constructor(sempreUrl) {
        this._sempre = new SempreClient(sempreUrl, 'en-US');
        this._schemaRetriever = new SchemaRetriever(new ThingPediaClient());

        this._raw = null;
    }

    get prompt() {
        if (this._raw === null)
            return 'Command   > ';
        else
            return 'ThingTalk > ';
    }

    ok() {
        console.log('Accepted parse as valid.');
        this._raw = null;
    }

    no() {
        console.log('Ok forget it.');
        this._raw = null;
    }

    handle(text) {
        if (this._raw != null) {
            var sempre = SempreSyntax.toSEMPRE(text);
            var raw = this._raw;
            this._raw = null;
            return SempreSyntax.verify(this._schemaRetriever, sempre).then(() => {
                var json = JSON.stringify(sempre);
                return this._sempre.onlineLearn(raw, json);
            });
        } else {
            return this._sempre.sendUtterance(text, null, []).then((parsed) => {
                if (parsed.length === 0) {
                    console.log('Failed to parse, no candidates.');
                    return;
                }

                var candidate = JSON.parse(parsed[0].answer);
                if (!candidate.rule && !candidate.trigger && !candidate.action && !candidate.query) {
                    console.log('Parsed as something that is not ThingTalk. Use a different tool to train.');
                    return;
                }

                this._raw = text;
                console.log('Parsed.');
                console.log(parsed[0].answer);
                console.log(SempreSyntax.toThingTalk(candidate));
            });
        }
    }
}

function main() {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });


    var sempreUrl = URL;
    if (process.argv[2] !== undefined && process.argv[2].startsWith('--with-sempre='))
        sempreUrl = process.argv[2].substr('--with-sempre='.length);
    var trainer = new Trainer(sempreUrl);
    rl.setPrompt(trainer.prompt);

    function quit() {
        console.log('Bye\n');
        rl.close();
        process.exit();
    }

    function _process(text) {
        Q.try(function() {
            return trainer.handle(text);
        }).catch(function(e) {
            console.error('ERROR: ' + e.message);
            //console.error(e.stack);
        }).then(function() {
            rl.setPrompt(trainer.prompt);
            rl.prompt();
        }).done();
    }

    rl.on('line', function(line) {
        if (line.trim().length === 0) {
            rl.prompt();
            return;
        }
        if (line[0] === '\\') {
            if (line[1] === 'q') {
                quit();
            } else if (line[1] === 'o' && line[2] === 'k') {
                trainer.ok();
                rl.setPrompt(trainer.prompt);
                rl.prompt();
            } else if (line[1] === 'n' && line[2] === 'o') {
                trainer.no();
                rl.setPrompt(trainer.prompt);
                rl.prompt();
            } else {
                console.log('Unknown command ' + line[1]);
                rl.setPrompt(trainer.prompt);
                rl.prompt();
            }
        } else {
            _process(line);
        }
    });
    rl.on('SIGINT', quit);

    rl.prompt();
}

main();
