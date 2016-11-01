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

const db = require('../util/db');

function main() {
    var output = fs.createWriteStream(process.argv[2]);
    output.setDefaultEncoding('utf8');
    output.write('strict digraph arguments {\n');

    db.connect(function([dbClient, done]) {
        var q = dbClient.query("select id,target_json from example_utterances where language = 'en' and target_json like '{\"rule\":%'", []);

        var nodes = new Set;
        function maybeAddNode(channel, arg) {
            var label = channel.substr('tt:') + ':' + arg.substr('tt:param.');
            var id = label.replace(/[^a-z]/g, '_');

            if (!nodes.has(id)) {
                nodes.add(id);
                output.write(id + ' [label="' + label + '"]\n');
            }
            return id;
        }
        q.on('result', (row) => {
            var json = JSON.parse(row.target_json);

            function processInvocation(fromInvocation, toInvocation) {
                toInvocation.args.forEach((arg) => {
                    if (arg.type !== 'VarRef')
                        return;

                    var from = maybeAddNode(fromInvocation, value.id);
                    var to = maybeAddNode(toInvocation, arg.name.id);
                    output.write(from + ' -> ' + to + '\n');
                });
            }

            if (json.query) {
                if (json.trigger)
                    processInvocation(json.trigger, json.query);
                if (json.action)
                    processInvocation(json.query, json.action);
            } else {
                processInvocation(json.trigger, json.action);
            }
        });

        q.on('end', () => {
            output.write('}\n');
            output.end();
            done();
        });
    });

    output.on('finish', () => process.exit());
}

main();
main();
