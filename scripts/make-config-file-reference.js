#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

process.on('unhandledRejection', (up) => { throw up; });
const fs = require('fs');
const util = require('util');

async function main() {
    const input = (await util.promisify(fs.readFile)(process.argv[2])).toString().split('\n');

    let output = [
`# Cloud Almond Configuration Options Reference`,
''
    ];

    let current_comment = null;
    let comment_closed = true;
    for (let line of input) {
        if (/^\s*\/\*\*/.test(line)) {
            // start of comment
            if (current_comment !== null)
                throw new Error(`nested doc comment or missing configuration directive`);
            current_comment = [];
            comment_closed = false;
        } else if (/^\s*\*+\//.test(line)) {
            // end of comment
            comment_closed = true;
            continue;
        } else if (!comment_closed) {
            if (/\*\//.test(line))
                throw new Error(`comment closing not at beginning of line`);
            current_comment.push(line.substring(2, line.length));
        } else {
            const match = /^\s*module\s*\.\s*exports\s*\.([A-Z0-9a-z_]+)\s*=\s*([^;]+);$/.exec(line);
            if (match !== null) {
                if (current_comment === null)
                    throw new Error(`missing documentation for ${match[1]}`);

                const name = match[1];
                const value = match[2];
                output.push(`## ${name}`);
                output.push(...current_comment);
                output.push('');
                output.push('Default value: `' + value + '`');
                output.push('');

                current_comment = null;
            }
        }
    }

    await util.promisify(fs.writeFile)(process.argv[3], output.join('\n') + '\n');
}
main();
