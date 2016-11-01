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
const mysql = require('mysql');

function main() {
    var output = fs.createWriteStream(process.argv[2]);
    output.setDefaultEncoding('utf8');
    output.write('strict digraph arguments {\n');
    var stats = fs.createWriteStream(process.argv[3]);
    stats.setDefaultEncoding('utf8');

    var dbClient = mysql.createConnection(process.env.DATABASE_URL);
    var q = dbClient.query("select id,target_json from example_utterances where language = 'en' and target_json like '{\"rule\":%'", []);

    var nodes = new Set;
    function maybeAddNode(channel, arg) {
        //var label = channel.substr('tt:'.length) + ':' + arg.substr('tt:param.'.length);
        label = arg.substr('tt:param.'.length);
        var id = label.replace(/[^a-z]/g, '_');

        if (!nodes.has(id)) {
            nodes.add(id);
            output.write(id + ' [label="' + label + '"]\n');
        }
        return id;
    }
    var edges = {};
    function maybeAddEdge(from, to) {
        var edge = from + '+' + to;
        if (edge in edges)
            edges[edge]++;
        else
            edges[edge] = 1;
    }
    q.on('result', (row) => {
        var json = JSON.parse(row.target_json).rule;

        function processInvocation(fromInvocation, toInvocation) {
            toInvocation.args.forEach((arg) => {
                if (arg.type !== 'VarRef')
                    return;

                var from = maybeAddNode(fromInvocation.name.id, arg.value.id);
                var to = maybeAddNode(toInvocation.name.id, arg.name.id);
                maybeAddEdge(from, to);
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
        for (var edge in edges) {
            var [from, to] = edge.split('+');
            output.write(from + ' -> ' + to + ' [label="' + edges[edge] + '"]\n');
            stats.write(from + '+' + to + ',' + edges[edge] + '\n');
        }
        output.write('}\n');
        output.end();
        stats.end();
        dbClient.end();
    });

    //output.on('finish', () => process.exit());
}

main();
