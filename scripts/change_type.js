// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const exampleModel = require('../model/example');

function processOneRow(dbClient, id, changes, row) {
    var parsed = JSON.parse(row.target_json);

    function processInvocation(json) {
        if (!json)
            return false;

        if (json.name.id !== id)
            return false;

        var changed = false;
        json.args.forEach((arg) => {
            var name = arg.name.id.substr('tt:param.'.length);
            if (name in changes) {
                var newType = changes[name];
                if (arg.type === 'VarRef') {
                    console.log('Skipped varref ' + name + ' in  ' + row.id);
                    return;
                }
                if (newType === 'Boolean->Enum') {
                    newType = 'Enum';
                    if (arg.type === newType)
                        return;
                    if (arg.type !== 'Boolean' && arg.type !== 'Bool' && arg.type !== 'Boolean-') {
                        console.log('WARNING: old type of ' + name + ' was not boolean in ' + row.id + ', was ' + arg.type);
                        return;
                    }

                    var value = arg.value.value;
                    arg.value.value = value ? 'on' : 'off';
                } else {
                    if (arg.type === newType)
                        return;
                    if (arg.type !== 'String') {
                        console.log('WARNING: old type of ' + name + ' was not string in ' + row.id + ', was ' + arg.type);
                    }
                }
                console.log('Changed type of ' + name + ' in ' + row.id);
                arg.type = newType;
                changed = true;
            }
        });
        return changed;
    }

    var changed = false;
    changed = processInvocation(parsed.trigger) || changed;
    changed = processInvocation(parsed.action) || changed;
    changed = processInvocation(parsed.query) || changed;
    if (parsed.rule) {
        changed = processInvocation(parsed.rule.trigger) || changed;
        changed = processInvocation(parsed.rule.action) || changed;
        changed = processInvocation(parsed.rule.query) || changed;
    }
    if (!changed)
        return;

    console.log('Updated example ' + row.id + ': ' + row.utterance);
    dbClient.query("update example_utterances set target_json = ? where id = ?", [JSON.stringify(parsed), row.id]);
}

function main() {
    var kind = process.argv[2];
    var channelName = process.argv[3];
    var id = 'tt:' + kind + '.' + channelName;

    var changes = {};
    for (var i = 4; i < process.argv.length; i++) {
        var rename = process.argv[i].split(':');
        changes[rename[0]] = rename[1];
    }

    return db.withTransaction(function(dbClient) {
        return Q.Promise(function(callback, errback) {
            var q = dbClient.query("select eu.id, utterance, target_json from example_utterances eu, device_schema ds where eu.schema_id = ds.id and"
                + " ds.kind = ? union (select eu.id, utterance, target_json from example_utterances eu, example_rule_schema ers, device_schema ds"
                + " where eu.id = ers.example_id and ers.schema_id = ds.id and ds.kind = ?)", [kind, kind]);
            q.on('result', (row) => processOneRow(dbClient, id, changes, row));
            q.on('end', callback);
            q.on('error', errback);
        });
    }).then(() => process.exit()).done();
}

main();
