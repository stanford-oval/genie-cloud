// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const fs = require('fs');
const byline = require('byline');

function main() {
    var output = fs.createWriteStream(process.argv[2]);
    output.setDefaultEncoding('utf8');
    output.write('strict digraph arguments {\n');
    var stats = fs.createWriteStream(process.argv[3]);
    stats.setDefaultEncoding('utf8');

    var traindata = byline(fs.createReadStream(process.argv[4]));
    traindata.setEncoding('utf8');

    var nodes = new Set;
    function maybeAddNode(label) {
        //var label = channel.substr('tt:'.length) + ':' + arg.substr('tt:param.'.length);
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
    traindata.on('data', (row) => {
        let [,,code] = row.split('\t');

        code = code.split(' ');
        for (let i = 0; i < code.length-2; i++) {
            if (code[i].startsWith('param:') &&
                code[i+1] === '=' &&
                code[i+2].startsWith('param:')) {

                var from = maybeAddNode(code[i+2].substring('param:'.length));
                var to = maybeAddNode(code[i].substring('param:'.length));
                maybeAddEdge(from, to);
            }
        }
    });

    traindata.on('end', () => {
        for (var edge in edges) {
            var [from, to] = edge.split('+');
            output.write(from + ' -> ' + to + ' [label="' + edges[edge] + '"]\n');
            stats.write(from + '+' + to + ',' + edges[edge] + '\n');
        }
        output.write('}\n');
        output.end();
        stats.end();
    });

    //output.on('finish', () => process.exit());
}

main();
