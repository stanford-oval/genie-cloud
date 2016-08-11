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
const byline = require('byline');

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const exampleModel = require('../model/example');
const ThingPediaClient = require('../util/thingpedia-client');
const SchemaRetriever = ThingTalk.SchemaRetriever;

var _schemaRetriever = new SchemaRetriever(new ThingPediaClient());

const SPECIAL_TO_CANONICAL = {
    hello: 'hello',
    debug: 'debug',
    help: 'help',
    thankyou: 'thank you',
    sorry: 'sorry',
    cool: 'cool',
    nevermind: 'never mind',
    failed: 'failuretoparse'
}

function argToCanonical(buffer, arg) {
    var match = /^tt[:\.]param\.(.+)$/.exec(arg.name.id);
    if (match === null)
        throw new TypeError('Argument name not in proper format, is ' + arg.name.id);
    var argname = match[1];
    var argcanonical = argname.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
    buffer.push(argcanonical);
    buffer.push(arg.operator);

    if (arg.type === 'Location') {
        if (arg.relativeTag === 'rel_current_location')
            buffer.push('here');
        else if (arg.relativeTag === 'rel_home')
            buffer.push('home');
        else if (arg.relativeTag === 'rel_work')
            buffer.push('work');
        else if (arg.latitude === 37.442156 && arg.longitude === -122.1634471)
            buffer.push('palo alto');
        else if (arg.latitude === 34.0543942 && arg.longitude === -118.2439408)
            buffer.push('los angeles');
        else
            buffer.push('some other place');
    } else if (arg.type === 'String') {
        buffer.push('"');
        buffer.push(arg.value.value);
        buffer.push('"');
    } else {
        buffer.push(String(arg.value.value));
        if (arg.type === 'Measure')
            buffer.push(arg.value.unit || arg.unit);
    }
}

function reconstructCanonical(json) {
    var parsed = JSON.parse(json);

    if (parsed.special)
        return SPECIAL_TO_CANONICAL[parsed.special.id.substr('tt:root.special.'.length)];

    var buffer = [];
    if (parsed.command) {
        buffer.push(parsed.command.type);

        if (parsed.command.value.value === 'generic')
            return buffer.join(' ');

        buffer.push(parsed.command.value.id.substr('tt:device.'.length));
        return buffer.join(' ');
    }
    if (parsed.answer) {
        argToCanonical(buffer, parsed.answer);
        return buffer.join(' ');
    }

    if (parsed.trigger)
        buffer.push('monitor if');

    var name, args, schemaType;
    if (parsed.action) {
        name = parsed.action.name;
        args = parsed.action.args;
        schemaType = 'actions';
    } else if (parsed.query) {
        name = parsed.query.name;
        args = parsed.query.args;
        schemaType = 'queries';
    } else if (parsed.trigger) {
        name = parsed.trigger.name;
        args = parsed.trigger.args;
        schemaType = 'triggers';
    } else {
        throw new TypeError('Not action, query or trigger');
    }

    var match = /^tt:([^\.]+)\.(.+)$/.exec(name.id);
    if (match === null)
        throw new TypeError('Channel name not in proper format');
    var kind = match[1];
    var channelName = match[2];

    return _schemaRetriever.getMeta(kind, schemaType, channelName).then(function(meta) {
        buffer.push(meta.canonical);

        args.forEach(function(arg) {
            buffer.push('with arg');
            argToCanonical(buffer, arg);
        });

        return buffer.join(' ');
    });
}

function main() {
    var output = fs.createWriteStream(process.argv[2]);
    var onlineLearn = process.argv.length >= 4 ? byline(fs.createReadStream(process.argv[3])) : null;
    if (onlineLearn !== null)
        onlineLearn.setEncoding('utf8');

    db.withClient((dbClient) => {
        return exampleModel.getAll(dbClient);
    }).then((examples) => {
        return Q.all(examples.map((ex) => {
            if (ex.is_base)
                return;

            return Q.try(function() {
                return reconstructCanonical(ex.target_json);
            }).then(function(reconstructed) {
                output.write(ex.utterance);
                output.write('\t');
                output.write(reconstructed);
                output.write('\n');
            }).catch((e) => {
                console.error('Failed to handle ' + ex.utterance + ': ' + e.message);
            });
        }));
    }).then(() => {
        if (onlineLearn === null) {
            output.end();
            return;
        }

        var promises = [];
        onlineLearn.on('data', (data) => {
            var line = data.split(/\t/);
            var utterance = line[0];
            var target_json = line[1];
            promises.push(Q.try(function() {
                return reconstructCanonical(target_json);
            }).then(function(reconstructed) {
                output.write(utterance);
                output.write('\t');
                output.write(reconstructed);
                output.write('\n');
            }).catch((e) => {
                console.error('Failed to handle ' + utterance + ': ' + e.message);
            }));
        });
        onlineLearn.on('end', () => {
            Q.all(promises).then(() => {
                output.end();
            });
        });
    }).done();

    output.on('finish', () => process.exit());
}
main();
