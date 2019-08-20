
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Jim Deng <jim.deng@alumni.stanford.edu>
//
// See COPYING for details
'use strict';

const cmd = require('../util/command');
const path = require('path');
const AWS = require('aws-sdk');
const BaseTrainingJob = require('genie-toolkit/lib/training/base_training_job');


module.exports = class GPUTrainingJob extends BaseTrainingJob {
    constructor(options, region, cluster, nodegroup, s3workdir, sqsRequestURL, sqsResponseURL) {
        super(options);
        // gpu training clsuter
        this._cluster = cluster;
        // gpu training nodegroup
        this._nodegroup = nodegroup;
        // s3 path for temporary workdir storage
        this._s3workdir = s3workdir.endsWith('/') ? s3workdir : s3workdir + '/';
        // sqs fifo queue for training job requests to gpu node
        this._sqsRequestURL = sqsRequestURL;
        // sqs fifo queue for training job responses from gpu node
        this._sqsResponseURL = sqsResponseURL;
        // generate an id that uniquely idenetifies this training job
        this._uid = `${this.id}-${new Date().getTime()}`;
        // standard training config
        this._config = {};
        if (options.config)
            Object.assign(this._config, options.config);
        // initialize SQS service
        AWS.config.update({region: region});
        this._sqs = new AWS.SQS({apiVersion: '2012-11-05'});
    }

    get config() {
        return this._config;
    }

    get outputdir() {
        return this._s3workdir + `${this._uid}/outputdir/`;
    }

    async train() {
        // perform upload and scale gpu operations in parallel
        await Promise.all([
            this._uploadWorkdir(),
            this._scaleGPUNode(1)
        ]);
        // send request
        const msg = {
            uid: this._uid,
            s3workdir: this._s3workdir,
            options: this._options,
        };
        const requestParams = {
            QueueUrl: this._sqsRequestURL,
            MessageBody: JSON.stringify(msg),
            MessageGroupId: 'almond-gpu-training',
            MessageDeduplicationId: this._uid,
        };
        this._sqs.sendMessage(requestParams, (err, data) => {
            if (err) throw err;
            console.log('Sent training request:', data.MessageId);
        });
        try {
            await this._processResponse();
        } finally {
            if (this._killed !== true)
              await this._scaleGPUNode(0);
        }
    }

    async _uploadWorkdir() {
        const tarfile = `${this._uid}.tar.gz`;
        await cmd.exec('tar', ['cvzf', tarfile, path.join('jobs', `${this.id}`, '/')]);
        await cmd.exec('aws', ['s3', 'cp', tarfile, this._s3workdir + path.join(this._uid, '/')]);
        await cmd.exec('rm', ['-f',  tarfile]);
    }

    async _scaleGPUNode(numNodes) {
         await cmd.exec('eksctl', ['scale', 'nodegroup',
            `--cluster=${this._cluster}`, `--name=${this._nodegroup}`, `--nodes=${numNodes}`]);
    }

    async _processResponse() {
        const responseParams = {
            QueueUrl: this._sqsResponseURL,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
        };
        let done = false;
        while (!done) {
            if (this._killed === true) {
              console.log(`job ${this._uid} has been killed, exiting loop.`);
              return;
            }
            console.log(`${this._uid} waiting for response from gpu node.`);
            const data = await this._sqs.receiveMessage(responseParams).promise();
            if (typeof data.Messages === 'undefined') {
                console.log('timedout waiting for response');
                continue;
            }
            console.log(`Got original body: <${data.Messages[0].Body}>`);
            const m = JSON.parse(data.Messages[0].Body);
            console.log(`Got response: ${m}`);
            // remove message from queue
            const deleteParams = {
                QueueUrl: this._sqsResponseURL,
                ReceiptHandle: data.Messages[0].ReceiptHandle
            };
            this._sqs.deleteMessage(deleteParams, (err, data) => {
                if (err) throw err;
            });
            // process message
            if (m.uid !== this._uid) {
                // this should only happen when a job fails
                console.log('Ignore response from other job:', m);
                continue;
            }
            if (typeof m.value !== 'string') 
                throw Error(`message value is not string: ${m}`);
            
            const value = JSON.parse(m.value);
            switch (m.type) {
                case 'progress':
                    console.log(`${this._uid} received GPU progress ${value}`);
                    this.progress = value;
                    break;
                case 'metrics':
                    console.log(`${this._uid} received metrics ${value}`);
                    this.metrics = value;
                    break;
                case 'done':
                    done = true;
                    console.log(`${this._uid} GPU training done.`);
                    break;
                case 'error':
                    throw new Error(`GPU training error: ${value}`);
                default:
                    throw new Error(`Unable to process GPU response: ${m}`);
            }
        }
    }

    kill() {
        this._killed = true;
        this._scaleGPUNode(0).catch((e) => {
            console.error(`Failed to terminate GPU node: ${e.message}`);
        });
    }
};
