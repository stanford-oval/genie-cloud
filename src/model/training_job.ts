// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as db from '../util/db';

export type JobStatus = 'queued' | 'started' | 'success' | 'error';

export interface Row {
    id : number;
    depends_on : number|null;
    job_type : string;
    owner : number|null;
    language : string;
    model_tag : string|null;
    all_devices : boolean;
    status : JobStatus;
    task_index : number|null;
    task_name : string|null;
    error : string|null;
    progress : number|null;
    eta : Date|null;
    start_time : Date|null;
    end_time : Date|null;
    config : string|null;
    metrics : string|null;
}
export type OptionalFields = 'depends_on' | 'language' | 'model_tag' | 'all_devices'
    | 'status' | 'task_index' | 'task_name' | 'error' | 'progress' | 'eta' | 'start_time'
    | 'end_time' | 'config' | 'metrics';

export async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client, job : db.WithoutID<T>, for_devices : string[]) : Promise<db.WithID<T>> {
    const id = await db.insertOne(client, "insert into training_jobs set ?", [job]);
    await addForDevices(client, id, for_devices);

    job.id = id;
    return job as db.WithID<T>;
}

export async function addForDevices(client : db.Client, jobId : number, for_devices : string[]) {
    // note the "insert ignore" clause to ignore duplicates
    if (for_devices.length > 0)
        await db.insertOne(client, "insert ignore into training_job_for_devices(job_id, schema_id) select ?,id from device_schema where kind in (?)", [jobId, for_devices]);
}

export async function makeForAllDevices(client : db.Client, jobId : number) {
    await db.query(client, `delete from training_job_for_devices where job_id = ?`, [jobId]);
    await db.query(client, `update training_jobs set all_devices = true where job_id = ?`, [jobId]);
}

export async function update(client : db.Client, jobId : number, job : Partial<Row>) {
    await db.query(client, `update training_jobs set ? where id = ?`, [job, jobId]);
    job.id = jobId;
    return job;
}

export async function recordTask(client : db.Client, jobId : number, taskName : string, start : Date, end : Date) {
    await db.query(client, `replace into training_job_task_history
        set start_time = ?, end_time = ?, job_id = ?, task_name = ?`,
        [start, end, jobId, taskName]);
}

export async function releaseDependents(client : db.Client, jobId : number) {
    await db.query(client, `update training_jobs set depends_on = null where depends_on = ?`, [jobId]);
}

/**
     Retrieve all the jobs that depend on the given job.
*/
export async function getDependents(client : db.Client, jobId : number) : Promise<Row[]> {
    return db.selectAll(client, `select * from training_jobs where depends_on = ? for update`, [jobId]);
}

export async function getRecent(client : db.Client, jobTypes : string[]) : Promise<Row[]> {
    return db.selectAll(client, `select * from training_jobs where job_type in (?)
        and (end_time is null or end_time >= date_sub(now(), interval 1 week))
        order by id asc`, [jobTypes]);
}

export async function getAllInProgress(client : db.Client) : Promise<Row[]> {
    return db.selectAll(client, `select * from training_jobs where
        status = 'started' order by id asc for update`);
}

export async function getNextJob(client : db.Client, jobType : string) : Promise<Row[]> {
    return db.selectAll(client, `select * from training_jobs where
        status = 'queued' and job_type = ? and depends_on is null
        order by id asc limit 1 for update`, [jobType]);
}

export async function getNextOfType(client : db.Client, jobType : string, language : string, modelTag : string|null) : Promise<Row[]> {
    if (modelTag === null) {
        return db.selectAll(client, `select * from training_jobs where
            status = 'queued' and job_type = ? and language = ? and model_tag is null
            order by id asc limit 1 for update`, [jobType, language]);
    } else {
        return db.selectAll(client, `select * from training_jobs where
            status = 'queued' and job_type = ? and language = ? and model_tag = ?
            order by id asc limit 1 for update`, [jobType, language, modelTag]);
    }
}

export async function readForDevices(client : db.Client, jobId : number) : Promise<string[]> {
    const rows = await db.selectAll(client, `select ds.kind from device_schema ds,
        training_job_for_devices tjfd where tjfd.job_id = ? and ds.id = tjfd.schema_id`, [jobId]);
    return rows.map((r) => r.kind);
}

export async function getForUpdate(client : db.Client, id : number) : Promise<Row> {
    return db.selectOne(client, `select * from training_jobs where id = ? for update`, [id]);
}
export async function get(client : db.Client, id : number) : Promise<Row> {
    return db.selectOne(client, `select * from training_jobs where id = ?`, [id]);
}

export async function getQueue(client : db.Client) : Promise<Row[]> {
    return db.selectAll(client, `select * from training_jobs where
        status in ('started', 'queued') order by id asc`);
}

export async function getForDevice(client : db.Client, language : string, device : string) : Promise<Row[]> {
    return db.selectAll(client, `
        (select * from training_jobs where language = ? and status in ('started', 'queued') and all_devices)
        union distinct
        (select tj.* from training_jobs tj, training_job_for_devices tjfd, device_schema ds
        where tj.language = ? and tj.id = tjfd.job_id and tjfd.schema_id = ds.id and ds.kind = ?
        and status in ('started', 'queued'))
        order by id asc`, [language, language, device]);
}
