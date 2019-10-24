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
const tmpSync = require('tmp');
const tmp = require('tmp-promise');

const cmd = require('./command');

// An abstraction over file system operations, that supports local files and s3:// URIs

const _backends = {
    's3:': {
        mkdirRecursive() {
            // nothing to do, directories don't need to be created in S3 and don't carry
            // metadata anyway
        },

        async download(url, ...extraArgs) {
            if (url.pathname.endsWith('/')) { // directory
                // use /var/tmp as the parent directory, to ensure it's on disk and not in a tmpfs
                const { path: dir } = await tmp.dir({
                    mode: 0o700,
                    dir: '/var/tmp',
                    unsafeCleanup: true,
                    prefix: path.basename(url.pathname) + '.'
                });
                const args = ['s3', 'sync', 's3://' + url.hostname + url.pathname, dir];
                if (extraArgs.length > 0) args.push(...extraArgs);
                await cmd.exec('aws', args);
                return dir;
            } else { // file
                const { path: file } = await tmp.file({
                    mode: 0o600,
                    discardDescriptor: true,
                    dir: '/var/tmp',
                    prefix: path.basename(url.pathname) + '.'
                });
                await cmd.exec('aws', ['s3', 'cp',  's3://' + url.hostname + url.pathname, file]);
                return file;
            }
        },

        async upload(localdir, url, ...extraArgs) {
            const args = ['s3', 'sync', localdir, 's3://' + url.hostname + url.pathname];
            if (extraArgs.length > 0) args.push(...extraArgs);
            await cmd.exec('aws', args);
        },

        async removeRecursive(url) {
            return cmd.exec('aws', ['s3', 'rm', '--recursive', 's3://' + url.hostname + url.pathname]);
        },

        async sync(url1, url2, ...extraArgs) {
            const args = ['s3', 'sync',
                's3://' + url1.hostname + url1.pathname,
                's3://' + url2.hostname + url2.pathname,
            ];
            if (extraArgs.length > 0) args.push(...extraArgs);
            return cmd.exec('aws', args);
        },

        createLocalWriteStream(url) {
            const { name: tmpFile, fd: tmpFD } =
                tmpSync.fileSync({ mode: 0o600, dir: '/var/tmp' });
            const stream = fs.createWriteStream(tmpFile, { fd: tmpFD });
            stream.on('finish', async () => {
                await this.upload(tmpFile, url);
                await fs.unlink(tmpFile, (err) => { 
                    if (err) throw (err);
                });
            });
            return stream;
        },

        createWriteStream(url, localSpooling) {
            if (localSpooling)
                return this.createLocalWriteStream(url);

            // lazy-load AWS, which is optional
            const AWS = require('aws-sdk');

            const s3 = new AWS.S3();
            const stream = new Stream.PassThrough();
            const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
            s3.upload({
                Bucket: url.hostname,
                Key: key,
                Body: stream,
            },(err, data) => {
               if (err) {
                  console.log('upload error:', err);
                  stream.emit('error', err);
                  return;
               }
               console.log('upload success:', data);
            });

            return stream;
        },
        createReadStream(url) {
            // lazy-load AWS, which is optional
            const AWS = require('aws-sdk');

            const s3 = new AWS.S3();
            const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
            const download = s3.getObject({
                Bucket: url.hostname,
                Key: key
            });
            return download.createReadStream();
        },

        async writeFile(url, blob, options) {
            // lazy-load AWS, which is optional
            const AWS = require('aws-sdk');

            const s3 = new AWS.S3();
            const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
            const upload = s3.upload({
                Bucket: url.hostname,
                Key: key,
                Body: blob,
                ContentType: options.contentType
            });
            return upload.promise();
        }
    },

    'file:': {
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

        async download(url, ...extraArgs) {
            // the file is already local, so we have nothing to do
            // (note that the hostname part of the URL is ignored)

            return path.resolve(url.pathname);
        },

        async upload(localdir, url, ...extraArgs) {
            var hostname = '';
            if (!url.hostname) {
                if (path.resolve(localdir) === path.resolve(url.pathname))
                    return;
            } else {
                hostname = url.hostname + ':';
            }
            const args = ['-av', localdir, `${hostname}${url.pathname}`];
            if (extraArgs.length > 0) args.push(...extraArgs);
            await cmd.exec('rsync', args);
        },

        async removeRecursive(url) {
            return cmd.exec('rm', ['-r', url.pathname]);
        },

        async sync(url1, url2, ...extraArgs) {
            const args = ['-av',
                url1.hostname ? `${url1.hostname}:${url1.pathname}` : url1.pathname,
                url2.hostname ? `${url2.hostname}:${url2.pathname}` : url2.pathname,
            ];
            if (extraArgs.length > 0) args.push(...extraArgs);
            return cmd.exec('rsync', args);
        },

        createWriteStream(url) {
            return fs.createWriteStream(url.pathname);
        },
        createReadStream(url) {
            return fs.createReadStream(url.pathname);
        },
        async writeFile(url, blob, options) {
            let output = fs.createWriteStream(url.pathname);
            if (typeof blob === 'string' || blob instanceof Uint8Array || blob instanceof Buffer)
                output.end(blob);
            else
                blob.pipe(output);
            return new Promise((callback, errback) => {
                output.on('finish', callback);
                output.on('error', errback);
            });
        }
    }
};

const cwd = 'file://' + (path.resolve(process.env.THINGENGINE_ROOTDIR || '.')) + '/';
function getBackend(url) {
    url = Url.resolve(cwd, url);
    const parsed = Url.parse(url);

    if (!_backends[parsed.protocol])
        throw new Error(`Unknown URL scheme ${parsed.protocol}`);

    return [parsed, _backends[parsed.protocol]];
}

module.exports = {
    /**
      A path.resolve()-like interface that supports s3:// and file:// URIs correctly.

      Can be called with one argument to make it absolute, or 2 or more arguments
      to perform path resolution.

      Note that path resolution is not the same as URL resolution:
      Url.resolve('file://foo', 'bar') = 'file://bar'
      path.resolve('/foo', 'bar') = 'foo/bar'
      AbstractFS.resolve('file://foo', 'bar') = 'file://foo/bar'
      AbstractFS.resolve('/foo', 'bar') = '/foo/bar'
    */
    resolve(url, ...others) {
        url = Url.resolve(cwd, url);
        for (let other of others)
            url = Url.resolve(url + '/', other);
        return url;
    },

    async mkdirRecursive(url) {
        const [parsed, backend] = getBackend(url);
        return backend.mkdirRecursive(parsed);
    },

    async download(url, ...extraArgs) {
        const [parsed, backend] = getBackend(url);
        return backend.download(parsed, ...extraArgs);
    },

    async upload(localdir, url, ...extraArgs) {
        const [parsed, backend] = getBackend(url);
        return backend.upload(localdir, parsed, ...extraArgs);
    },

    async removeRecursive(url) {
        const [parsed, backend] = getBackend(url);
        return backend.removeRecursive(parsed);
    },

    async sync(url1, url2, ...extraArgs) {
        const [parsed1, backend1] = getBackend(url1);
        const [parsed2, backend2] = getBackend(url2);

        if (backend1 === backend2) {
            await backend1.sync(parsed1, parsed2, ...extraArgs);
            return;
        }
        // download to a temporary directory, then upload
        const tmpdir = await backend1.download(parsed1, ...extraArgs);
        await backend2.upload(tmpdir, parsed2, ...extraArgs);
        // tmpdir is not created for local file
        if (parsed1.protocol !== 'file:')
            await module.exports.removeTemporary(tmpdir);
    },
    createWriteStream(url, localSpooling) {
        const [parsed, backend] = getBackend(url);
        return backend.createWriteStream(parsed, localSpooling);
    },
    createReadStream(url) {
        const [parsed, backend] = getBackend(url);
        return backend.createReadStream(parsed);
    },
    async writeFile(url, blob, options) {
        const [parsed, backend] = getBackend(url);
        return backend.writeFile(parsed, blob, options);
    },

    async removeTemporary(pathname) {
        if (!pathname.startsWith('/var/tmp'))
            return;
        await _backends['file:'].removeRecursive({ pathname });
    },

    async isLocal(url) {
        const [, backend] = getBackend(url);
        return backend === 'file:';
    }
};
