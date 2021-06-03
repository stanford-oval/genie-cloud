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


import * as events from 'events';

import * as trainingJobModel from '../model/training_job';
import * as modelsModel from '../model/nlp_models';
import * as db from '../util/db';

import Tasks from './tasks';
import JobSpecs from './job_specs';

class Task extends events.EventEmitter {
    constructor(jobId, jobDir, name) {
        super();
        this.jobId = jobId;
        this.jobDir = jobDir;
        this.name = name;

        // this is the base value of progress (from previous tasks)
        // used to convert task progress to job progress
        this._baseJobProgress = 0;
        this._progressUpdates = [];

        this.killed = false;
    }

    get language() {
        return this.info.language;
    }

    async load() {
        await db.withTransaction(async (dbClient) => {
            this.info = await trainingJobModel.get(dbClient, this.jobId);
            this.config = JSON.parse(this.info.config);

            const jobspec = JobSpecs[this.info.job_type];
            for (let task of jobspec) {
                if (task.name === this.name) {
                    this.spec = task;
                    break;
                }

                this._baseJobProgress += task.progress;
            }

            this.modelInfo = null;
            if (this.info.model_tag !== null) {
                this.modelInfo = (await modelsModel.getByTag(dbClient, this.language, this.info.model_tag))[0];
                if (!this.modelInfo) {
                    // the model was deleted since the job was scheduled, or some other weirdness
                    throw new Error('The model this job refers to no longer exists');
                }
            }

            this.forDevices = await trainingJobModel.readForDevices(dbClient, this.jobId);
        }, 'serializable', 'read only');
    }

    kill() {
        this.killed = true;
        this.emit('killed');
    }

    handleKill() {
        this.on('killed', () => {
            // die quietly if killed
            process.exit(0);
        });
    }

    async _save(keys) {
        await db.withClient((dbClient) => {
            const toSave = {};
            keys.forEach((k) => toSave[k] = this.info[k]);
            return trainingJobModel.update(dbClient, this.info.id, toSave);
        });
    }

    _updateEta(progress) {
        const now = new Date;
        this._progressUpdates.push([now, progress]);
        if (this._progressUpdates.length > 3)
            this._progressUpdates.shift();
        if (this._progressUpdates.length === 3) {
            let speedSum = 0;
            for (let i = 1; i < this._progressUpdates.length; i++) {
                const timeDelta = this._progressUpdates[i][0].getTime() - this._progressUpdates[i-1][0].getTime();
                const stepDelta = this._progressUpdates[i][1] - this._progressUpdates[i-1][1];
                const speed = stepDelta / timeDelta;
                speedSum += speed;
            }
            const avgSpeed = speedSum / 2;

            let eta = Math.ceil(now.getTime() + (1 - progress) / avgSpeed);

            // add 10 minutes to account for validation, uploading, etc.
            eta += 10 * 60 * 1000;

            this.info.eta = new Date(eta);
        }
    }

    async setProgress(value) {
        // rescale task progress to job progress
        value = this._baseJobProgress + value * this.spec.progress;

        // log only when the rounded value changes
        if (Math.floor(value*100) > Math.floor(this.info.progress*100))
            console.log(`Progress for job ${this.jobId}: ${Math.floor(value*100)}`);

        this.info.progress = value;
        if (this.spec.computeEta) {
            this._updateEta(value);
            await this._save(['progress', 'eta']);
        } else {
            await this._save(['progress']);
        }
    }
    async setMetrics(metrics) {
        this.info.metrics = JSON.stringify(metrics);
        return this._save(['metrics']);
    }
}

export function initArgparse(subparsers) {
    const parser = subparsers.add_parser('run-training-task', {
        help: 'Run a training task',
    });

    parser.add_argument('-t', '--task-name', {
        help: 'The name of the task to run',
        choices: Object.keys(Tasks),
        required: true
    });

    parser.add_argument('--job-id', {
        help: 'The ID of the job to run',
        type: Number,
        required: true
    });
    parser.add_argument('--job-directory', {
        help: 'The directory where to save job specific files',
        required: true
    });

    parser.add_argument('--debug', {
        action: 'store_true',
        help: 'Enable debugging.',
        default: false
    });
    parser.add_argument('--no-debug', {
        action: 'store_false',
        dest: 'debug',
        help: 'Disable debugging.',
    });
}

export async function main(argv) {
    const task = new Task(argv.job_id, argv.job_directory, argv.task_name);
    await task.load();
    await task.setProgress(0);
    process.on('SIGINT', () => task.kill());
    process.on('SIGTERM', () => task.kill());

    await Tasks[argv.task_name](task, argv);

    await task.setProgress(1);
    await db.tearDown();
}
