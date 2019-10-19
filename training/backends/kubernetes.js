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

const k8s = require('@kubernetes/client-node');
const Tp = require('thingpedia');

const Config = require('../../config');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);
const watcher = new class JobWatcher extends Tp.Helpers.RefCounted {
    constructor() {
        super();

        this._watcher = new k8s.Watch(kc);
        this._req = null;

        this._watchedJobs = new Map;
    }

    watch(jobName, callbacks) {
        this._watchedJobs.set(jobName, callbacks);
        // Number of tries to watch job status. Setting to a negative number will try indefinitely.
        this._numTriesLeft = parseInt(Config.TRAINING_WATCH_NUM_TRIES || 5);
    }

    _computeLabelSelector() {
        const labels = {
            app: 'training-job'
        };
        Object.assign(labels, Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS);

        return Object.keys(labels).map((key) => key + '=' + labels[key]).join(',');
    }

    async _doOpen() {
        this._watchJobs();
    }

    async _watchJobs() {
        if (this._numTriesLeft === 0) {
            console.log('Num tries exceeded');
            for (let [jobName, callback] of this._watchedJobs.entries()) {
                console.error('failed to watch job', jobName);
                callback.reject(new Error('Kubernetes failed to watch ' + jobName));
            }
            return;
        }
        console.log('Watching num jobs:', this._watchedJobs.size,  'with num tries left:', this._numTriesLeft);
        let currentJobs;
        try {
            currentJobs = (await k8sApi.listNamespacedJob(Config.TRAINING_KUBERNETES_NAMESPACE,
                false /* includeUninitialized */,
                false /* pretty */,
                undefined /* _continue */,
                undefined /* fieldSelector */,
                this._computeLabelSelector())).body;
        } catch(err) {
            throw new Error('Failed to list Kubernetes jobs:' +  JSON.stringify(err));
        }
        for (let job of currentJobs.items)
            this._processJob(job);
        this._resourceVersion = currentJobs.metadata.resourceVersion;
        if (this._watchedJobs.size === 0) {
            console.log('Finished processing all jobs from list jobs');
            return;
        }

        const url = `/apis/batch/v1/namespaces/${Config.TRAINING_KUBERNETES_NAMESPACE}/jobs`;
        this._req = this._watcher.watch(url, {
            resourceVersion: this._resourceVersion,
            labelSelector: this._computeLabelSelector(),
            // Setting timeout to a large number (7 days). Even so, we may still see occasional
            // server connection drops. So retrying is necessary.
            timeoutSeconds: 604800
        }, (type, k8sJob) => {
            if (type !== 'ADDED' && type !== 'MODIFIED' && type !== 'DELETED') {
                console.log('Ignored job state change', type, 'for', k8sJob.metadata.name);
                return;
            }
            this._processJob(k8sJob, type);
        }, (err) => {
            console.error('watch jobs error:', err);
            if (this._watchedJobs.size > 0) {
                this._numTriesLeft--;
                this._watchJobs();
            }
        });
    }
    
    _processJob(k8sJob, type) {
        const jobName = k8sJob.metadata.name;
        console.log('processing job', jobName);
        if (!this._watchedJobs.has(jobName)) {
            console.log('not watching job', jobName);
            return;
        }

        const callbacks = this._watchedJobs.get(jobName);
        if (type === 'DELETED') {
          console.log('deleted job', k8sJob.metadata.name);
          // job was either killed or deleted by user
          callbacks.reject(new Error('The kubernetes job was deleted'));
          this._watchedJobs.delete(jobName);
          return;
        }

        if (k8sJob.status.succeeded > 0) {
            console.log('job suceeded');
            k8sApi.deleteNamespacedJob(k8sJob.metadata.name, k8sJob.metadata.namespace,
                undefined /*pretty*/,
                undefined /*body*/,
                undefined /*dryRun*/,
                undefined /*gracePeriodSeconds*/,
                undefined /*orphanDependents*/,
                "Background" /*propagationPolicy*/)
            .catch((err) => {
                console.error('Failed to delete succeeded job:', err);
            });
            callbacks.resolve();
            this._watchedJobs.delete(jobName);
        }
        if (!k8sJob.status.conditions) {
            console.log('wating for job status');
            return;
        }
        for (let condition of k8sJob.status.conditions) {
            if (condition.type === 'Failed' && condition.status === 'True') {
                callbacks.reject(new Error(condition.message || `The Kubernetes Job failed`));
                this._watchedJobs.delete(jobName);
                return;
            }
        }
    }

    async _doClose() {
        if (this._req) this._req.abort();
    }
};

class KubernetesTaskRunner {
    constructor(k8sJob) {
        this._k8sJob = k8sJob;
    }

    kill() {
        console.log('killing job', this._k8sJob.metadata.name);
        k8sApi.deleteNamespacedJob(this._k8sJob.metadata.name, this._k8sJob.metadata.namespace,
            undefined /*pretty*/,
            undefined /*body*/,
            undefined /*dryRun*/,
            undefined /*gracePeriodSeconds*/,
            undefined /*orphanDependents*/,
            "Background" /*propagationPolicy*/)
        .catch((err) => {
            console.error('Failed to kill Kubernetes job:', err);
        });
    }

    async wait() {
        try {
            await  new Promise((resolve, reject) => {
                watcher.watch(this._k8sJob.metadata.name, { resolve, reject });
                watcher.open().catch(reject);
            });
        } finally {
            watcher.close();
        }
    }
}


module.exports = async function execTask(job, spec) {
    const jobName = Config.TRAINING_KUBERNETES_JOB_NAME_PREFIX + 'training-job-' + job.id + '-' + spec.name;
    const k8sJob = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            labels: {
                app: 'training-job'
            },
        },

        spec: {
            completions: 1,
            parallelism: 1,
            backoffLimit: 2,

            template: {
                metadata: {
                    labels: {
                        app: 'training-job'
                    }
                },

                spec: {
                    restartPolicy: 'Never',
                    containers: [
                        {
                            name: 'main',
                            image: Config.TRAINING_KUBERNETES_IMAGE + (spec.requests.gpu > 0 ? '-cuda' : ''),
                            imagePullPolicy: 'Always',
                            command: [ '/usr/bin/node',
                                '--max_old_space_size=' + Config.TRAINING_MEMORY_USAGE,
                                '/opt/almond-cloud/main.js',
                                'run-training-task',
                                '--task-name', spec.name,
                                '--job-id', String(job.id),
                                '--job-directory', job.jobDir
                            ],
                            resources: {
                                requests: {
                                    cpu: spec.cpu,
                                    memory: (Config.TRAINING_MEMORY_USAGE + 100) + 'Mi'
                                }
                            },
                            securityContext: {
                                capabilities: {
                                    add: [ 'SYS_ADMIN', 'NET_ADMIN']
                                }
                            }
                        }
                    ],
                    tolerations: []
                }
            },

            // TODO: enable after TTLAfterFinished is out of alpha:
            //    https://github.com/aws/containers-roadmap/issues/255
            // ttlSecondsAfterFinished: 600
        }
    };
    for (let key in Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS) {
        k8sJob.metadata.labels[key] = Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS[key];
        k8sJob.spec.template.metadata.labels[key] = Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS[key];
    }

    for (let key in Config.TRAINING_KUBERNETES_EXTRA_ANNOTATIONS) {
        if (!('annotations' in k8sJob.spec.template.metadata))
           k8sJob.spec.template.metadata.annotations = {};
        k8sJob.spec.template.metadata.annotations[key] = Config.TRAINING_KUBERNETES_EXTRA_ANNOTATIONS[key];
    }

    if (spec.requests.gpu > 0) {
        k8sJob.spec.template.spec.tolerations.push({
            key: 'nvidia.com/gpu',
            operator: 'Exists',
            effect: 'NoSchedule'
        });
        k8sJob.spec.template.spec.containers[0].resources['limits'] = {'nvidia.com/gpu': spec.requests.gpu};
    }

    for (let key in Config.TRAINING_KUBERNETES_POD_SPEC_OVERRIDE)
        k8sJob.spec.template.spec[key] = Config.TRAINING_KUBERNETES_POD_SPEC_OVERRIDE[key];

    for (let key in Config.TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE)
        k8sJob.spec.template.spec.containers[0][key] = Config.TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE[key];

    try {
        const createdJob = (await k8sApi.createNamespacedJob(Config.TRAINING_KUBERNETES_NAMESPACE, k8sJob)).body;

        return new KubernetesTaskRunner(createdJob);
    } catch(err) {
        throw new Error('Failed to create Kubernetes job:' + JSON.stringify(err));
    }
};
