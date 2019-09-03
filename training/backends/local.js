// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const child_process = require('child_process');
const byline = require('byline');
const path = require('path');

const Config = require('../config');

class TaskRunner {
    constructor(child) {
        this.child = child;
    }

    kill() {
        if (!this.child)
            return;
        this.child.kill();
    }

    wait() {
        return new Promise((resolve, reject) => {
            this.child.on('error', reject);
            this.child.on('exit', (code, signal) => {
                this.child = null;
                if (signal) {
                    if (signal === 'SIGINT' || signal === 'SIGTERM')
                        reject(new Error(`Killed`));
                    else
                        reject(new Error(`Command crashed with signal ${signal}`));
                } else {
                    if (code !== 0)
                        reject(new Error(`Command exited with code ${code}`));
                    else
                        resolve();
                }
            });
        });
    }
}

module.exports = function execTask(job, spec) {
    const nodejs = process.execPath;
    const args = process.execArgv.concat([
        '--max_old_space_size=' + Config.TRAINING_MEMORY_USAGE,
        path.resolve(path.dirname(module.filename), '../main.js'),
        'run-training-task',
        '--task-name', spec.name,
        '--job-id', job.id,
        '--job-directory', job.jobDir,
    ]);

    const stdio = ['ignore', 'pipe', 'pipe'];

    console.log(`${nodejs} ${args.map((a) => "'" + a + "'").join(' ')}`);
    const child = child_process.spawn(nodejs, args, { stdio });

    child.stdio[1].setEncoding('utf-8');
    let stdout = byline(child.stdio[1]);
    stdout.on('data', (line) => {
        process.stdout.write(`job ${job.id}: ${line}\n`);
    });

    child.stdio[2].setEncoding('utf-8');
    let stderr = byline(child.stdio[2]);
    stderr.on('data', (line) => {
        process.stderr.write(`job ${job.id}: ${line}\n`);
    });

    return new TaskRunner(child);
};
