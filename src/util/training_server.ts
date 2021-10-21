// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>


import * as Tp from 'thingpedia';

import * as db from './db';
import * as trainingJobModel from '../model/training_job';

import * as Config from '../config';

export default class TrainingServer {
    constructor() {
    }

    static get() {
        return _instance;
    }

    async getJobQueue(dbClient : db.Client) {
        const out : Record<string, Array<trainingJobModel.Row & { for_devices ?: string[] }>> = {};
        const jobs = await trainingJobModel.getQueue(dbClient);

        await Promise.all(jobs.map(async (job : trainingJobModel.Row & { for_devices ?: string[] }) => {
            job.for_devices = await trainingJobModel.readForDevices(dbClient, job.id);
        }));

        for (const job of jobs) {
            if (out[job.job_type])
                out[job.job_type].push(job);
            else
                out[job.job_type] = [job];
        }
        return out;
    }

    kill(jobId : number) {
        if (!Config.TRAINING_URL)
            return Promise.resolve({});
        const auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : undefined;
        return Tp.Helpers.Http.post(Config.TRAINING_URL + '/jobs/kill', JSON.stringify({ id: jobId }), {
            dataContentType: 'application/json',
            auth,
        }).catch((err) => {
            // if the server is down eat the error
            if (err.code !== 503 && err.code !== 404 && err.code !== 'EHOSTUNREACH' && err.code !== 'ECONNREFUSED' && err.code !== 'ECONNRESET')
                throw err;
        });
    }

    queue(language : string, forDevices : string[]|null, jobType : string, owner = null, config = null) {
        if (!Config.TRAINING_URL)
            return Promise.resolve();

        const auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : undefined;
        return Tp.Helpers.Http.post(Config.TRAINING_URL + '/jobs/create', JSON.stringify({
            language, forDevices, jobType, owner, config
        }), { auth: auth, dataContentType: 'application/json' }).then((response) => {
            const parsed = JSON.parse(response);
            console.log('Successfully started training job ' + parsed.id);
        }).catch((err) => {
            console.error('Failed to start training job: ' + err.message);
            // if the server is down eat the error
            if (err.code !== 503 && err.code !== 404 && err.code !== 'EHOSTUNREACH' && err.code !== 'ECONNREFUSED' && err.code !== 'ECONNRESET')
                throw err;
        });
    }
}
const _instance = new TrainingServer();
