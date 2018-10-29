// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const Q = require('q');
const Url = require('url');

const Config = require('../config');
const platform = require('./platform');

let _backend;

function getDownloadLocation(kind, version, developer) {
    // FIXME: when using the S3 backend, we should generate a signed request
    // if the user is a developer (as the device should not be downloadable
    // freely)

    // Resolve the URL against SERVER_ORIGIN if CDN_HOST is empty
    return Promise.resolve(Url.resolve(Config.SERVER_ORIGIN, `${Config.CDN_HOST}/devices/${kind}-v${version}.zip`));
}

if (Config.FILE_STORAGE_BACKEND === 's3') {
    const AWS = require('aws-sdk');

    AWS.config.update({ region: 'us-west-2',
                        logger: process.stdout });

    _backend = {
        storeIcon(blob, name) {
            var s3 = new AWS.S3();
            var upload = s3.upload({ Bucket: 'thingpedia2',
                                     Key: 'icons/' + name + '.png',
                                     Body: blob,
                                     ContentType: 'image/png' });
            return Q.ninvoke(upload, 'send').then(() => {
                console.log('Successfully uploading png file to S3 for ' + name);
            });
        },
        storeBackground(blob, name) {
            var s3 = new AWS.S3();
            var upload = s3.upload({ Bucket: 'thingpedia2',
                                     Key: 'backgrounds/' + name + '.png',
                                     Body: blob,
                                     ContentType: 'image/png' });

            return Q.ninvoke(upload, 'send').then(() => {
                console.log('Successfully uploading png file to S3 for ' + name);
            });
        },
        downloadZipFile(name, version) {
            var s3 = new AWS.S3();
            var download = s3.getObject({ Bucket: 'thingpedia2',
                                          Key: 'devices/' + name + '-v' + version + '.zip' });
            return download.createReadStream();
        },
        storeZipFile(blob, name, version) {
            var s3 = new AWS.S3();
            var upload = s3.upload({ Bucket: 'thingpedia2',
                                     Key: 'devices/' + name + '-v' + version + '.zip',
                                     Body: blob,
                                     ContentType: 'application/zip' });
            return Q.ninvoke(upload, 'send').then(() => {
                console.log('Successfully uploaded zip file to S3 for ' +
                            name + ' v' + version);
            });
        },
        getDownloadLocation
    };
} else if (Config.FILE_STORAGE_BACKEND === 'local') {
    _backend = {
        storeIcon(blob, name) {
            let output = fs.createWriteStream(platform.getWritableDir() + '/icons/' + name + '.png');
            if (typeof blob === 'string' || blob instanceof Uint8Array || blob instanceof Buffer)
                output.end(blob);
            else
                blob.pipe(output);
            return new Promise((callback, errback) => {
                output.on('finish', callback);
                output.on('error', errback);
            });
        },
        storeBackground(blob, name) {
            let output = fs.createWriteStream(platform.getWritableDir() + '/backgrounds/' + name + '.png');
            if (typeof blob === 'string' || blob instanceof Uint8Array || blob instanceof Buffer)
                output.end(blob);
            else
                blob.pipe(output);
            return new Promise((callback, errback) => {
                output.on('finish', callback);
                output.on('error', errback);
            });
        },
        downloadZipFile(name, version) {
            let filename = platform.getWritableDir() + '/devices/' + name + '-v' + version + '.zip';
            return fs.createReadStream(filename);
        },
        storeZipFile(blob, name, version) {
            let filename = platform.getWritableDir() + '/devices/' + name + '-v' + version + '.zip';
            let output = fs.createWriteStream(filename);
            if (typeof blob === 'string' || blob instanceof Uint8Array || blob instanceof Buffer)
                output.end(blob);
            else
                blob.pipe(output);
            return new Promise((callback, errback) => {
                output.on('finish', callback);
                output.on('error', errback);
            });
        },
        getDownloadLocation
    };
} else {
    throw new Error('Invalid configuration CDN_HOST');
}

module.exports = _backend;
