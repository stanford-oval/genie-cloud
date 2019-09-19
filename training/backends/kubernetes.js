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

    watch(jobIdTask, callbacks) {
        this._watchedJobs.set(jobIdTask, callbacks);
    }

    _computeLabelSelector() {
        const labels = {
            app: 'training-job'
        };
        Object.assign(labels, Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS);

        return Object.keys(labels).map((key) => key + '=' + labels[key]).join(',');
    }

    async _doOpen() {
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

        const url = `/apis/batch/v1/namespaces/${Config.TRAINING_KUBERNETES_NAMESPACE}/jobs`;
        this._req = this._watcher.watch(url, {
            resourceVersion: this._resourceVersion,
            labelSelector: this._computeLabelSelector()
        }, (type, k8sJob) => {
            if (type !== 'ADDED' && type !== 'MODIFIED')
                return;
            this._processJob(k8sJob);
        }, (err) => {
            console.error('watch jobs error:', err);
        });
    }
    

    _processJob(k8sJob) {
        const jobIdTask = k8sJob.metadata.labels['edu.stanford.almond/job-id-task'];
        console.log('processing job', jobIdTask);
        if (!this._watchedJobs.has(jobIdTask)) {
            console.log('not watching job', jobIdTask);
            return;
        }

        const callbacks = this._watchedJobs.get(jobIdTask);
        if (k8sJob.status.succeeded > 0) {
            console.log('job suceeded');
            k8sApi.deleteNamespacedJob(k8sJob.metadata.name, k8sJob.metadata.namespace).catch((err) => {
                console.error('Failed to delete succeeded job:', err);
            });
            callbacks.resolve();
            this._watchedJobs.delete(jobIdTask);
        }
        if (!k8sJob.status.conditions) {
            console.log('wating for job status');
            return;
	}
        for (let condition of k8sJob.status.conditions) {
            if (condition.type === 'Failed' && condition.status === 'True') {
                callbacks.reject(new Error(condition.message || `The Kubernetes Job failed`));
                this._watchedJobs.delete(jobIdTask);
                return;
            }
        }
    }

    async _doClose() {
        if (this._req) this._req.abort();
    }
};

class KubernetesTaskRunner {
    constructor(jobIdTask, k8sJob) {
        this._jobIdTask = jobIdTask;
        this._k8sJob = k8sJob;
    }

    kill() {
        k8sApi.deleteNamespacedJob(this._k8sJob.metadata.name, this._k8sJob.metadata.namespace).catch((err) => {
            console.error('Failed to kill Kubernetes job:', err);
        });
    }

    async wait() {
        try {
            await  new Promise((resolve, reject) => {
                watcher.watch(this._jobIdTask, { resolve, reject });
                watcher.open().catch(reject);
            });
        } finally {
            watcher.close();
        }
    }
}



module.exports = async function execTask(job, spec) {
    const jobName = Config.TRAINING_KUBERNETES_JOB_NAME_PREFIX + 'training-job-' + job.id + '-' + spec.name;
    const jobIdTask = `${job.id}-${spec.name}`;
    const k8sJob = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            labels: {
                app: 'training-job',
                'edu.stanford.almond/job-id-task': jobIdTask
            },
        },

        spec: {
            completions: 1,
            parallelism: 1,
            backoffLimit: 2,

            template: {
                metadata: {
                    labels: {
                        app: 'training-job',
                        'edu.stanford.almond/job-id-task': jobIdTask
                    },
                    annotations: {
                        'iam.amazonaws.com/role': 'arn:aws:iam::373474209952:role/almond-training-s3-admin'
                    }
                },

                spec: {
                    restartPolicy: 'Never',
                    containers: [
                        {
                            name: 'main',
                            image: Config.TRAINING_KUBERNETES_IMAGE + (spec.requests.gpu > 0 ? '-cuda' : ''),
                            imagePullPolicy: 'Always',
                            args: [
                                'run-training-task',
                                '--task-name', spec.name,
                                '--job-id', `${job.id}`,
                                '--job-directory', job.jobDir
                            ],
                            resources: {
                                requests: {
                                    cpu: spec.cpu,
                                    memory: (Config.TRAINING_MEMORY_USAGE + 100) + 'Mi'
                                }
                            },
                            volumeMounts: [
                                {
                                    name: 'config',
                                    mountPath: '/etc/almond-cloud',
                                    readOnly: true
                                },
                                {
                                    name: 'training-config',
                                    mountPath: '/etc/almond-cloud/training',
                                    readOnly: true
                                },
                            ],
                            securityContext: {
                                capabilities: {
                                    add: [ 'SYS_ADMIN', 'NET_ADMIN']
                                }
                            }
                        }
                    ],
                    volumes: [
                        {
                            name: 'config',
                            secret: { secretName: 'almond-config'}
                        },
                        {
                            name: 'training-config',
                            configMap: { name: 'training-config'}
                        }
                    ],
                    tolerations: []
                }
            },

            ttlSecondsAfterFinished: 600
        }
    };
    for (let key in Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS) {
        k8sJob.metadata.labels[key] = Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS[key];
        k8sJob.spec.template.metadata.labels[key] = Config.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS[key];
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
        k8sJob.spec.template.spec.containers[0].key = Config.TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE[key];

    try {
        const createdJob = (await k8sApi.createNamespacedJob(Config.TRAINING_KUBERNETES_NAMESPACE, k8sJob)).body;

        return new KubernetesTaskRunner(jobIdTask, createdJob);
    } catch(err) {
        throw new Error('Failed to create Kubernetes job:' + JSON.stringify(err));
    }
};
