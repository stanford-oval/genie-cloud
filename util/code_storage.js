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
const sanitize = require('sanitize-filename');

const Config = require('../config');
const platform = require('./platform');
const { InternalError } = require('./errors');

let _backend;

function getDownloadLocation(kind, version, developer) {
    // FIXME: when using the S3 backend, we should generate a signed request
    // if the user is a developer (as the device should not be downloadable
    // freely)

    // Resolve the URL against SERVER_ORIGIN if CDN_HOST is empty
    return Promise.resolve(Url.resolve(Config.SERVER_ORIGIN, `${Config.CDN_HOST}/devices/${kind}-v${version}.zip`));
}

function writeFile(blob, into) {
    let output = fs.createWriteStream(into);
    if (typeof blob === 'string' || blob instanceof Uint8Array || blob instanceof Buffer)
        output.end(blob);
    else
        blob.pipe(output);
    return new Promise((callback, errback) => {
        output.on('finish', callback);
        output.on('error', errback);
    });
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
        storeBlogAsset(blob, name, contentType = 'application/octet-stream') {
            var s3 = new AWS.S3();
            var upload = s3.upload({ Bucket: 'thingpedia2',
                                     Key: 'blog-assets/' + name,
                                     Body: blob,
                                     ContentType: contentType });

            return Q.ninvoke(upload, 'send');
        },
        downloadZipFile(name, version, directory = 'devices') {
            name = sanitize(name);
            var s3 = new AWS.S3();
            var download = s3.getObject({ Bucket: 'thingpedia2',
                                          Key: directory + '/' + name + '-v' + version + '.zip' });
            return download.createReadStream();
        },
        storeZipFile(blob, name, version, directory = 'devices') {
            name = sanitize(name);
            var s3 = new AWS.S3();
            var upload = s3.upload({ Bucket: 'thingpedia2',
                                     Key: directory + '/' + name + '-v' + version + '.zip',
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
            return writeFile(blob, platform.getWritableDir() + '/icons/' + name + '.png');
        },
        storeBackground(blob, name) {
            return writeFile(blob, platform.getWritableDir() + '/backgrounds/' + name + '.png');
        },
        storeBlogAsset(blob, name, contentType = 'application/octet-stream') {
            return writeFile(blob, platform.getWritableDir() + '/blog-assets/' + name);
        },
        downloadZipFile(name, version, directory = 'devices') {
            name = sanitize(name);
            let filename = platform.getWritableDir() + '/' + directory + '/' + name + '-v' + version + '.zip';
            return fs.createReadStream(filename);
        },
        storeZipFile(blob, name, version, directory = 'devices') {
            name = sanitize(name);
            let filename = platform.getWritableDir() + '/' + directory + '/' + name + '-v' + version + '.zip';
            return writeFile(blob, filename);
        },
        getDownloadLocation
    };
} else {
    throw new InternalError('E_INVALID_CONFIG', 'Invalid configuration CDN_HOST');
}

module.exports = _backend;
