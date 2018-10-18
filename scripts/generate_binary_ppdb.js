// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

// Convert a PPDB file from text to binary

const byline = require('byline');
const fs = require('fs');

const BinaryPPDB = require('../util/binary_ppdb');

const BLACKLIST = new Set(['tb', 'channel']);

function main() {
    if (process.argv.length < 4) {
        console.error(`Usage: ${process.argv[0]} ${process.argv[1]} PPDB-FILE OUTPUT-FILE`);
        process.exit(1);
    }

    const builder = new BinaryPPDB.Builder();

    let input = fs.createReadStream(process.argv[2]);
    input.setEncoding('utf8');

    input = byline(input);
    input.setEncoding('utf8');

    input.on('data', (line) => {
        line = line.trim();
        let [, word, paraphrase, , , entail] = line.split('|||');
        word = word.trim();
        if (BLACKLIST.has(word))
            return;
        paraphrase = paraphrase.trim();
        // ignore singular/plural relation and verb/gerund
        if (paraphrase === word + 's' || word === paraphrase + 's')
            return;
        if (paraphrase === word + 'ing' || word === paraphrase + 'ing')
            return;

        // don't change the mode of the verb
        if (paraphrase.endsWith('ing') !== word.endsWith('ing'))
            return;
        if (paraphrase.endsWith('ed') !== word.endsWith('ed'))
            return;

        entail = entail.trim();
        // ensure the meaning stays the same)
        if (entail !== 'Equivalence')
            return;
        builder.add(word, paraphrase);
    });

    input.on('end', () => {
        fs.writeFileSync(process.argv[3], builder.serialize());
    });
}
main();
