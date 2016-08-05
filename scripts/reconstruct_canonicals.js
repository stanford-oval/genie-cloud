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
const ThingPediaClient = require('../util/thingpedia-client');
const SchemaRetriever = ThingTalk.SchemaRetriever;

var _schemaRetriever = new SchemaRetriever(new ThingPediaClient());

function reconstructCanonical(json) {
    var parsed = JSON.parse(json);

    var buffer = [];
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
            buffer.push('with');
            buffer.push('arg');

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
                else
                    buffer.push('los angeles');
            } else if (arg.type === 'String') {
                buffer.push('"');
                buffer.push(arg.value.value);
                buffer.push('"');
            } else {
                buffer.push(String(arg.value.value));
                if (arg.type === 'Measure')
                    buffer.push(arg.value.unit || arg.unit);
            }
        });

        return buffer.join(' ');
    });
}

function main() {
    var output = fs.createWriteStream(process.argv[2]);

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
        output.end();
    }).done();

    output.on('finish', () => process.exit());
}
main();
