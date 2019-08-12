
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
const Genie = require('genie-toolkit');
const AWS = require('aws-sdk');
const Config = require('../config');
const cmd = require('../util/command');
const path = require('path');



class GPUTrainingDaemon {
    constructor(region, sqsRequestURL, sqsResponseURL) {
        this._sqsRequestURL = sqsRequestURL;
        this._sqsResponseURL = sqsResponseURL;

        // setup aws sqs
        AWS.config.update({region: region});
        this._sqs = new AWS.SQS({apiVersion: '2012-11-05'});
    }

    async trainLoop() {
        try {
            for (;;) {
                await this._receiveJob();
                await this._setupJob();
                await this._train();
                await this._uploadOutput();
                await this._send('metrics', this._genieJob.metrics);
                await this._send('done', '');
             }
        } catch (err) {
            const errMsg =`Error: ${err}`; 
            console.error(errMsg);
            await this._send('error', errMsg);
        }
    }

    async _receiveJob() {
        const params = {
            QueueUrl: this._sqsRequestURL,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
        };
        for (;;) {
            let data = await this._sqs.receiveMessage(params).promise();
            if (data.Messages === undefined) continue;
            const m = JSON.parse(data.Messages[0].Body);
            // remove message from queue
            const deleteParams = {
                QueueUrl: this._sqsRequestURL,
                ReceiptHandle: data.Messages[0].ReceiptHandle
            };
            this._sqs.deleteMessage(deleteParams, (err, data) => {
                 if (err) throw err;
            });
            this._uid = m.uid;
            this._s3workdir = m.s3workdir;
            this._options = m.options;
            break;
        }
    }

    async _setupJob() {
        console.log(`Setting up job ${this._uid}`);
        const tarfile = `${this._uid}.tar.gz`;
        const s3tarfile = this._s3workdir + path.join( this._uid, tarfile);
        await cmd.exec('aws', ['s3', 'cp', s3tarfile, tarfile]);
        await cmd.exec('tar', ['xvzf', tarfile]);
        await cmd.exec('rm', ['-f', tarfile]);
    }


    async _train() {
        this._genieJob = Genie.Training.createJob(this._options);
        this._genieJob.on('progress', (value) => {
            this._send('progress', value);
        });
        await this._genieJob.train();
    }


    async _uploadOutput() {
        await cmd.exec('aws', ['s3', 'sync',
            this._options.outputdir,
            this._s3workdir + `${this._uid}/outputdir/`]);
    }

    async _send(mtype, m) {
        const msg = JSON.stringify({
            type: mtype,
            uid: this._uid,
            value: JSON.stringify(m),
        });
        console.log(`Sending response: ${msg}`);
        const params = {
            QueueUrl: this._sqsResponseURL,
            MessageBody: msg,
            MessageGroupId: 'almond-gpu-training',
        };
        this._sqs.sendMessage(params, (err, data) => {
            if (err) throw err;
            console.log('Sent response:', data.MessageId);
        });
    }
}

async function main() {
    const daemon = new GPUTrainingDaemon(
        Config.GPU_REGION,
        Config.GPU_SQS_REQUEST_URL,
        Config.GPU_SQS_RESPONSE_URL
    );
    await daemon.trainLoop();
}


main();
