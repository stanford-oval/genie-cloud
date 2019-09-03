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

const Stream = require('stream');
const Url = require('url');
const fs = require('fs');
const util = require('util');
const path = require('path');
const tmp = require('tmp-promise');

const cmd = require('./command');

// An abstraction over file system operations, that supports local files and s3:// URIs

const _backends = {
    's3': {
        mkdirRecursive() {
            // nothing to do, directories don't need to be created in S3 and don't carry
            // metadata anyway
        },

        async download(url) {
            if (url.pathname.endsWith('/')) { // directory
                // use /var/tmp as the parent directory, to ensure it's on disk and not in a tmpfs
                const dir = await tmp.dir({ mode: 0o700, dir: '/var/tmp',
                    prefix: path.basename(url.pathname) + '.' });
                await cmd.exec('aws', ['s3', 'sync', 's3://' + url.hostname + url.pathname, dir]);
                return dir;
            } else { // file
                const file = await tmp.file({ mode: 0o600, dir: '/var/tmp',
                    prefix: path.basename(url.pathname) + '.' });
                await cmd.exec('aws', ['s3', 'cp',  's3://' + url.hostname + url.pathname, file]);
                return file;
            }
        },

        async upload(localdir, url) {
            await cmd.exec('aws', ['s3', 'sync', localdir, 's3://' + url.hostname + url.pathname]);
        },

        async removeRecursive(url) {
            return cmd.exec('aws', ['s3', 'rm', '--recursive', 's3://' + url.hostname + url.pathname]);
        },

        async sync(url1, url2) {
            return cmd.exec('aws', ['s3',
                's3://' + url1.hostname + url1.pathname,
                's3://' + url2.hostname + url2.pathname,
            ]);
        },

        createWriteStream(url) {
            // lazy-load AWS, which is optional
            const AWS = require('aws-sdk');

            const s3 = new AWS.S3();
            const stream = new Stream.PassThrough();
            const upload = s3.upload({
                Bucket: url.hostname,
                Key: url.pathname,
                Body: stream,
            });
            upload.on('error', (e) => stream.emit('error', e));

            return stream;
        }
    },

    'file': {
        async mkdirRecursive(url) {
            async function safeMkdir(dir, options) {
                try {
                     await util.promisify(fs.mkdir)(dir, options);
                } catch(e) {
                     if (e.code === 'EEXIST')
                         return;
                     throw e;
                }
            }

            const components = path.resolve(url.pathname).split('/').slice(1);

            let subpath = '';
            for (let component of components) {
                 subpath += '/' + component;
                 await safeMkdir(subpath);
            }
        },

        async download(url) {
            // the file is already local, so we have nothing to do
            // (note that the hostname part of the URL is ignored)

            return path.resolve(url.pathname);
        },

        async upload(localdir, url) {
            if (!url.hostname) {
                if (localdir === url.pathname)
                    return;
                await cmd.exec('cp', ['-rT', localdir, url.pathname]);
                return;
            }

            await cmd.exec('rsync', ['-av', localdir,
                `${url.hostname}:${url.pathname}`]);
        },

        async removeRecursive(url) {
            return cmd.exec('rm', ['-r', url.pathname]);
        },

        async sync(url1, url2) {
            return cmd.exec('rsync', ['-av',
                url1.hostname ? `${url1.hostname}:${url1.pathname}` : url1.pathname,
                url2.hostname ? `${url2.hostname}:${url2.pathname}` : url2.pathname,
            ]);
        },

        createWriteStream(url) {
            return fs.createWriteStream(url.pathname);
        }
    }
};

const cwd = 'file:///' + process.cwd() + '/';
function getBackend(url) {
    url = Url.resolve(cwd, url);

    if (!_backends[url.scheme])
        throw new Error(`Unknown URL scheme ${url.scheme}`);

    return [url, _backends[url.scheme]];
}

module.exports = {
    /**
      A path.resolve()-like interface that supports s3:// and file:// URIs correctly.

      Can be called with one argument to make it absolute, or 2 or more arguments
      to perform path resolution.

      Note that path resolution is not the same as URL resolution:
      Url.resolve('file:///foo', 'bar') = 'file://bar'
      path.resolve('/foo', 'bar') = 'foo/bar'
      AbstractFS.resolve('file:///foo', 'bar') = 'file://foo/bar'
      AbstractFS.resolve('/foo', 'bar') = '/foo/bar'
    */
    async resolve(url, ...others) {
        url = Url.resolve(cwd, url);
        for (let other of others)
            url = Url.resolve(url + '/', other);
        return url;
    },

    async mkdirRecursive(url) {
        const [parsed, backend] = getBackend(url);
        return backend.mkdirRecursive(parsed);
    },

    async download(url) {
        const [parsed, backend] = getBackend(url);
        return backend.download(parsed);
    },

    async upload(localdir, url) {
        const [parsed, backend] = getBackend(url);
        return backend.upload(localdir, parsed);
    },

    async removeRecursive(url) {
        const [parsed, backend] = getBackend(url);
        return backend.removeRecursive(parsed);
    },

    async sync(url1, url2) {
        const [parsed1, backend1] = getBackend(url1);
        const [parsed2, backend2] = getBackend(url2);

        if (backend1 === backend2) {
            await backend1.sync(parsed1, parsed2);
            return;
        }

        // download to a temporary directory, then upload
        const tmpdir = await backend1.download(parsed1);
        await backend2.upload(tmpdir, parsed2);
        await this.removeTemporary(tmpdir);
    },

    createWriteStream(url) {
        const [parsed, backend] = getBackend(url);
        return backend.createWriteStream(parsed);
    },

    async removeTemporary(pathname) {
        if (!pathname.startsWith('/var/tmp'))
            return;
        await _backends['file'].removeRecursive({ pathname });
    },

    async isLocal(url) {
        const [, backend] = getBackend(url);
        return backend === 'file';
    }
};
