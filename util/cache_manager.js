// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Michael Fischer <mfischer@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const Tp = require('thingpedia');
const fs = require('fs');
const tmpfile = require('tmp');
const crypto = require('crypto');

const platform = require('./platform');

let _instance;
let CACHE_DIR;

function downloadImage(url) {
    return Tp.Helpers.Http.getStream(url).then((res) => {
        let extension;
        if (res.headers['content-type']) {
            let contentType = res.headers['content-type'];
            if (contentType.startsWith('image/png'))
                extension = '.png';
            else if (contentType.startsWith('image/jpeg'))
                extension = '.jpg';
            else if (contentType.startsWith('image/gif'))
                extension = '.gif';
            else if (contentType.startsWith('image/svg') || contentType === 'application/svg+xml')
                extension = '.svg';
        }

        return new Promise((resolve, reject) => {
            res.on('error', reject);

            tmpfile.file({ dir: CACHE_DIR, keep: true }, (err, tmppath, fd, cleanup) => {
                console.log('tmppath', tmppath);
                if (err) {
                    res.resume();
                    reject(err);
                    return;
                }

                let filestream = fs.createWriteStream(tmppath, { fd: fd });
                filestream.on('error', (err) => {
                    cleanup();
                    reject(err);
                });

                let hash = crypto.createHash('sha1');
                res.on('data', (buffer) => {
                    hash.update(buffer);
                    filestream.write(buffer);
                });
                res.on('end', () => {
                    filestream.end();
                });
                filestream.on('finish', () => {
                    let filename = hash.digest().toString('hex') + (extension || '');

                    let filepath = CACHE_DIR + '/' + filename;
                    fs.rename(tmppath, filepath, (err) => {
                        if (err) {
                            cleanup();
                            reject(err);
                        }
                        resolve(filename);
                    });
                });
            });
        });
    });
}

module.exports = class ImageCacheManager {
    static get() {
        if (_instance)
            return _instance;
        return _instance = new ImageCacheManager();
    }

    constructor() {
        CACHE_DIR = platform.getCacheDir();
        this._filename = CACHE_DIR + '/index.json';
        this._writeTimeout = 100;
        try {
            this._store = JSON.parse(fs.readFileSync(this._filename));
        } catch(e) {
            if (e.code !== 'ENOENT')
                throw e;
            this._store = {};
        }
    }

    keys() {
        return Object.keys(this._store);
    }

    get(key) {
        return this._store[key];
    }

    cache(key, upstreamUrl) {
        console.log('caching ' + upstreamUrl + ' for ' + key);
        return this._store[key] = downloadImage(upstreamUrl).then((filename) => {
            this._store[key] = filename;
            this._scheduleWrite();

            return filename;
        }, (err) => {
            delete this._store[key];
            this._scheduleWrite();
            throw err;
        });
    }

    flush() {
        if (!this._dirty)
            return Q();
        return Q.nfcall(fs.writeFile, this._filename, JSON.stringify(this._store, undefined, 2));
    }

    _scheduleWrite() {
        this._dirty = true;
        if (this._writeScheduled)
            return;

        setTimeout(() => {
            this._writeScheduled = false;
            this.flush().done();
        }, this._writeTimeout);
    }
};