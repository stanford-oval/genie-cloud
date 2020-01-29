// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    async create(client, job, for_devices) {
        const id = await db.insertOne(client, "insert into training_jobs set ?", [job]);
        await this.addForDevices(client, id, for_devices);

        job.id = id;
        return job;
    },

    async addForDevices(client, jobId, for_devices) {
        // note the "insert ignore" clause to ignore duplicates
        if (for_devices.length > 0)
            await db.insertOne(client, "insert ignore into training_job_for_devices(job_id, schema_id) select ?,id from device_schema where kind in (?)", [jobId, for_devices]);
    },

    async makeForAllDevices(client, jobId) {
        await db.query(client, `delete from training_job_for_devices where job_id = ?`, [jobId]);
        await db.query(client, `update training_jobs set all_devices = true where job_id = ?`, [jobId]);
    },

    async update(client, jobId, job) {
        await db.query(client, `update training_jobs set ? where id = ?`, [job, jobId]);
        job.id = jobId;
        return job;
    },

    async recordTask(client, jobId, taskName, start, end) {
        await db.query(client, `replace into training_job_task_history
            set start_time = ?, end_time = ?, job_id = ?, task_name = ?`,
            [start, end, jobId, taskName]);
    },

    async releaseDependents(client, jobId) {
        await db.query(client, `update training_jobs set depends_on = null where depends_on = ?`, [jobId]);
    },

    /**
      Retrieve all the jobs that depend on the given job.
    */
    async getDependents(client, jobId) {
        return db.selectAll(client, `select * from training_jobs where depends_on = ? for update`, [jobId]);
    },

    getAllInProgress(client, error) {
        return db.selectAll(client, `select * from training_jobs where
            status = 'started' order by id asc for update`);
    },

    getNextJob(client, jobType) {
        return db.selectAll(client, `select * from training_jobs where
            status = 'queued' and job_type = ? and depends_on is null
            order by id asc limit 1 for update`, [jobType]);
    },

    getNextOfType(client, jobType, language, modelTag) {
        if (modelTag === null) {
            return db.selectAll(client, `select * from training_jobs where
                status = 'queued' and job_type = ? and language = ? and model_tag is null
                order by id asc limit 1 for update`, [jobType, language]);
        } else {
            return db.selectAll(client, `select * from training_jobs where
                status = 'queued' and job_type = ? and language = ? and model_tag = ?
                order by id asc limit 1 for update`, [jobType, language, modelTag]);
        }
    },

    async readForDevices(client, jobId) {
        const rows = await db.selectAll(client, `select ds.kind from device_schema ds,
            training_job_for_devices tjfd where tjfd.job_id = ? and ds.id = tjfd.schema_id`, [jobId]);
        return rows.map((r) => r.kind);
    },

    getForUpdate(client, id) {
        return db.selectOne(client, `select * from training_jobs where id = ? for update`, [id]);
    },
    get(client, id) {
        return db.selectOne(client, `select * from training_jobs where id = ?`, [id]);
    },

    getQueue(client) {
        return db.selectAll(client, `select * from training_jobs where
            status in ('started', 'queued') order by id asc`);
    },

    getForDevice(client, language, device) {
        return db.selectAll(client, `
            (select * from training_jobs where language = ? and status in ('started', 'queued') and all_devices)
            union distinct
            (select tj.* from training_jobs tj, training_job_for_devices tjfd, device_schema ds
            where tj.language = ? and tj.id = tjfd.job_id and tjfd.schema_id = ds.id and ds.kind = ?
            and status in ('started', 'queued'))
            order by id asc`, [language, language, device]);
    }
};
