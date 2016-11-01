// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
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
                var newName = changes[name];
                console.log('Changed name of ' + name + ' in ' + row.id);
                arg.name.id = 'tt:param.' + newName;
                changed = true;
            }
        });
        return changed;
    }
    function processVarRefTarget(from, to) {
        if (!from || !to)
            return false;
        if (from.name.id !== id)
            return false;

        var changed = false;
        to.args.forEach((arg) => {
            if (arg.type !== 'VarRef')
                return;
            var name = arg.value.id.substr('tt:param.'.length);
            if (name in changes) {
                var newName = changes[name];
                console.log('Changed value of ' + arg.name.id.substr('tt:param.') + ' in ' + row.id);
                arg.value.id = 'tt:param.' + newName;
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
        if (parsed.rule.query) {
            if (parsed.rule.trigger)
                changed = processVarRefTarget(parsed.rule.trigger, parsed.rule.query) || changed;
            if (parsed.rule.action)
                changed = processVarRefTarget(parsed.rule.query, parsed.rule.action) || changed;
        } else {
            changed = processVarRefTarget(parsed.rule.trigger, parsed.rule.action) || changed;
        }
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
