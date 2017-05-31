// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const fs = require('fs');
const readline = require('readline');

const SempreClient = require('./deps/sempreclient');
const ThingpediaClient = require('./deps/http_client');
const SchemaRetriever = require('thingtalk').SchemaRetriever;

const URL = 'https://sabrina-nl.stanford.edu';

function main() {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    var sempreUrl = URL;
    if (process.argv[2] !== undefined && process.argv[2].startsWith('--with-sempre='))
        sempreUrl = process.argv[2].substr('--with-sempre='.length);
    var sempre = new SempreClient(sempreUrl, 'en-US');

    rl.setPrompt('$ ');

    var learned = fs.createWriteStream('learned.txt', { flags: 'a' });
    learned.setDefaultEncoding('utf8');
    var ignored = fs.createWriteStream('dropped.txt', { flags: 'a' });
    ignored.setDefaultEncoding('utf8');
    var failed = fs.createWriteStream('failed.txt', { flags: 'a' });
    failed.setDefaultEncoding('utf8');

    var finish = 3;
    function maybeFinish() {
        finish --;
        if (finish === 0)
            process.exit();
    }
    learned.on('finish', maybeFinish);
    ignored.on('finish', maybeFinish);
    failed.on('finish', maybeFinish);

    function complete() {
    /*
        console.log('Learned');
        for (var l of learned)
            console.log(l[0] + ' :: ' + l[1]);
        console.log('Ignored');
        for (var i of ignored)
            console.log(i);
        console.log('');
    */
        learned.end();
        ignored.end();
        failed.end();
    }

    function quit() {
        complete();
        console.log('Bye\n');
        rl.close();
        //process.exit();
    }

    var state = 'loading';
    var lines = [];
    var candidates;
    var sentence;
    var id = -1;

    fs.readFile(process.argv[2], function(err, data) {
        if (err)
            throw err;
        lines = data.toString('utf8').split('\n');
        if (lines[lines.length-1].trim().length === 0)
            lines.pop();

        if (process.argv.length > 3) {
            id = parseInt(process.argv[3])-2;
            lines = lines.slice(id+1, lines.length);
        }
        next();
    });

    function next() {
        id++;
        if (lines.length === 0)
            quit();
        state = 'loading';
        sentence = lines.shift();
        sempre.sendUtterance(sentence, null, [], true).then((answer) => {
            state = 'top3';
            candidates = answer;
            if (candidates[0].score === 'Infinity')
                candidates.shift();

            console.log('Sentence #' + (id+1) + ': ' + sentence);
            for (var i = 0; i < 3 && i < candidates.length; i++)
                console.log((i+1) + ') ' + candidates[i].canonical);
            rl.prompt();
        }).done();
    }

    rl.on('line', function(line) {
        if (line.trim().length === 0 || state === 'loading') {
            rl.prompt();
            return;
        }

        if (!isNaN(parseInt(line))) {
            var i = parseInt(line);
            if (i < 1 || i > candidates.length) {
                console.log('Invalid number');
                rl.prompt();
                return;
            }
            i -= 1;
            learned.write(id + '\t' + sentence + '\t' + candidates[i].answer + '\n');
            next();
            return;
        } else if (line === 'n') {
            if (state === 'top3') {
                state = 'full';
                console.log('Sentence #' + (id+1) + ': ' + sentence);
                for (var i = 0; i < candidates.length; i++)
                    console.log((i+1) + ') ' + candidates[i].canonical);
                rl.prompt();
            } else {
                failed.write(id + '\t' + sentence + '\n');
                next();
            }
        } else if (line === 'd') {
            ignored.write(id + '\t' + sentence + '\n');
            next();
        } else {
            console.log('Invalid command');
            rl.prompt();
        }
    });
    rl.on('SIGINT', quit);
    //process.stdin.on('end', quit);
}

main();
