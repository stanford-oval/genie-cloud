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
const watcher = new class JobWatcher extends Tp.RefCounted {
    constructor() {
        super();

        this._watcher = new k8s.Watch(kc);
        this._req = null;

        this._watchedJobs = new Map;
    }

    watch(jobId, callbacks) {
        this._watchedJobs.set(jobId, callbacks);
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
            currentJobs = (await k8sApi.listNamespacedJob(Config.TRAINING_KUBERNETES_NAMESPACE.
                false /* includeUninitialized */,
                false /* pretty */,
                undefined /* _continue */,
                undefined /* fieldSelector */,
                this._computeLabelSelector())).body;
        } catch(res) {
            throw new Error(`Failed to list Kubernetes jobs: ${res.response.body.message}`);
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
        });
    }

    _processJob(k8sJob) {
        const jobId = Number(k8sJob.metadata['edu.stanford.almond/job-id']);
        if (!this._watchedJobs.has(jobId))
            return;

        const callbacks = this._watchedJobs.get(jobId);
        if (k8sJob.status.succeeded > 0) {
            callbacks.resolve();
            this._watchedJobs.delete(jobId);
        }
        for (let condition of k8sJob.status.conditions) {
            if (condition.type === 'Failed' && condition.status === 'True') {
                callbacks.reject(new Error(condition.message || `The Kubernetes Job failed`));
                this._watchedJobs.delete(jobId);
                return;
            }
        }
    }

    async _doClose() {
        this._req.abort();
    }
};

class KubernetesTaskRunner {
    constructor(jobId, k8sJob) {
        this._jobId = jobId;
        this._k8sJob = k8sJob;
    }

    kill() {
        k8sApi.deleteNamespacedJob(this._k8sJob.metadata.namespace, this._k8sJob.metadata.name).catch((res) => {
            console.error(`Failed to kill Kubernetes job: ${res.response.body.message}`);
        });
    }

    async wait() {
        try {
            await  new Promise((resolve, reject) => {
                watcher.watch(this._jobId, { resolve, reject });
                watcher.open().catch(reject);
            });
        } finally {
            watcher.close();
        }
    }
}

module.exports = async function execTask(job, spec) {
    const k8sJob = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: Config.TRAINING_KUBERNETES_JOB_NAME_PREFIX + 'training-job-' + job.jobId + '-' + spec.name,
            labels: {
                app: 'training-job',
                'edu.stanford.almond/job-id': job.id
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
                        'edu.stanford.almond/job-id': job.id
                    }
                },

                spec: {
                    restartPolicy: 'Never',
                    containers: [
                        {
                            name: 'main',
                            image: Config.TRAINING_KUBERNETES_IMAGE + (spec.gpu > 0 ? '-cuda' : ''),
                            imagePullPolicy: 'Always',
                            args: [
                                'run-training-task',
                                '--task-name', spec.name,
                                '--job-id', job.id,
                                '--job-directory', job.jobDir
                            ],
                            resources: {
                                requests: {
                                    cpu: spec.cpu,
                                    memory: (Config.TRAINING_MEMORY_USAGE + 100) + 'Mi'
                                }
                            },
                            volumeMounts: {}
                        }
                    ],
                    volumes: [],
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
        k8sJob.spec.template.spec.containers[0].resources.requests['nvidia.com/gpu'] = spec.requests.gpu;
    }

    for (let key in Config.TRAINING_KUBERNETES_POD_SPEC_OVERRIDE)
        k8sJob.spec.template.spec[key] = Config.TRAINING_KUBERNETES_POD_SPEC_OVERRIDE[key];
    for (let key in Config.TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE)
        k8sJob.spec.template.spec.containers[0].key = Config.TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE[key];

    try {
        const createdJob = (await k8sApi.createNamespacedJob(Config.TRAINING_KUBERNETES_NAMESPACE, k8sJob)).body;

        return new KubernetesTaskRunner(createdJob);
    } catch(res) {
        throw new Error(`Failed to create Kubernetes job: ${res.response.body.message}`);
    }
};
