// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const child_process = require('child_process');
const byline = require('byline');
const path = require('path');

const Config = require('../../config');

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
        path.resolve(path.dirname(module.filename), '../../main.js'),
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
