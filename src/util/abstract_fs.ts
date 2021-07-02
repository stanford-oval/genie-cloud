// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';
import * as Stream from 'stream';
import * as Url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as tmpSync from 'tmp';
import * as tmp from 'tmp-promise';

import * as cmd from './command';
import { safeMkdir } from './fsutils';
import * as AWS from 'aws-sdk';

// An abstraction over file system operations, that supports local files and s3:// URIs

const _backends = {
    's3:': {
        mkdirRecursive() {
            // nothing to do, directories don't need to be created in S3 and don't carry
            // metadata anyway
        },

        async download(url : Url.UrlObject, ...extraArgs : string[]) {
            if (url.pathname!.endsWith('/')) { // directory
                // use /var/tmp as the parent directory, to ensure it's on disk and not in a tmpfs
                const { path: dir } = await tmp.dir({
                    mode: 0o700,
                    tmpdir: '/var/tmp',
                    unsafeCleanup: true,
                    prefix: path.basename(url.pathname!) + '.'
                });
                const args = ['s3', 'sync', 's3://' + url.hostname + url.pathname, dir];
                if (extraArgs.length > 0) args.push(...extraArgs);
                await cmd.exec('aws', args);
                return dir;
            } else { // file
                const { path: file } = await tmp.file({
                    mode: 0o600,
                    discardDescriptor: true,
                    tmpdir: '/var/tmp',
                    prefix: path.basename(url.pathname!) + '.'
                });
                await cmd.exec('aws', ['s3', 'cp',  's3://' + url.hostname + url.pathname, file]);
                return file;
            }
        },

        async upload(localpath : string, url : Url.UrlObject, ...extraArgs : string[]) {
            const dest =  's3://' + url.hostname + url.pathname;
            if (fs.lstatSync(localpath).isFile()) {
                await cmd.exec('aws', ['s3', 'cp', localpath, dest]);
                return;
            }
            const args = ['s3', 'sync', localpath, dest];
            if (extraArgs.length > 0) args.push(...extraArgs);
            await cmd.exec('aws', args);
        },

        async removeRecursive(url : Url.UrlObject) {
            return cmd.exec('aws', ['s3', 'rm', '--recursive', 's3://' + url.hostname + url.pathname]);
        },

        async sync(url1 : Url.UrlObject, url2 : Url.UrlObject, ...extraArgs : string[]) {
            const args = ['s3', 'sync',
                's3://' + url1.hostname + url1.pathname,
                's3://' + url2.hostname + url2.pathname,
            ];
            if (extraArgs.length > 0) args.push(...extraArgs);
            return cmd.exec('aws', args);
        },

        createLocalWriteStream(url : Url.UrlObject) {
            const { name: tmpFile, fd: tmpFD } =
                tmpSync.fileSync({ mode: 0o600, tmpdir: '/var/tmp' });
            const stream = fs.createWriteStream(tmpFile, { fd: tmpFD });
            stream.on('finish', async () => {
                await this.upload(tmpFile, url);
                await fs.unlink(tmpFile, (err) => {
                    if (err) throw (err);
                });
            });
            return stream;
        },

        createWriteStream(url : Url.UrlObject, localSpooling : boolean) {
            if (localSpooling)
                return this.createLocalWriteStream(url);

            const s3 = new AWS.S3();
            const stream = new Stream.PassThrough();
            const key = url.pathname!.startsWith('/') ? url.pathname!.substring(1) : url.pathname!;
            s3.upload({
                Bucket: url.hostname!,
                Key: key,
                Body: stream,
            }, (err, data) => {
               if (err) {
                  console.log('upload error:', err);
                  stream.emit('error', err);
                  return;
               }
               console.log('upload success:', data);
            });

            return stream;
        },
        createReadStream(url : Url.UrlObject) {
            const s3 = new AWS.S3();
            const key = url.pathname!.startsWith('/') ? url.pathname!.substring(1) : url.pathname!;
            const download = s3.getObject({
                Bucket: url.hostname!,
                Key: key
            });
            return download.createReadStream();
        },
        async getDownloadLinkOrStream(url : Url.UrlObject) {
            const s3 = new AWS.S3();
            const key = url.pathname!.startsWith('/') ? url.pathname!.substring(1) : url.pathname;
            return s3.getSignedUrlPromise('getObject', {
                Bucket: url.hostname,
                Key: key,
                Expires: 60 // seconds
            });
        },

        async writeFile(url : Url.UrlObject, blob : string|Buffer|NodeJS.ReadableStream, options : { contentType ?: string } = {}) {
            const s3 = new AWS.S3();
            const key = url.pathname!.startsWith('/') ? url.pathname!.substring(1) : url.pathname!;
            const upload = s3.upload({
                Bucket: url.hostname!,
                Key: key,
                Body: blob,
                ContentType: options.contentType
            });
            return upload.promise();
        }
    },

    'file:': {
        async mkdirRecursive(url : Url.UrlObject) {
            const components = path.resolve(url.pathname!).split('/').slice(1);

            let subpath = '';
            for (const component of components) {
                 subpath += '/' + component;
                 await safeMkdir(subpath);
            }
        },

        async download(url : Url.UrlObject, ...extraArgs : string[]) {
            // the file is already local, so we have nothing to do
            // (note that the hostname part of the URL is ignored)

            return path.resolve(url.pathname!);
        },

        async upload(localdir : string, url : Url.UrlObject, ...extraArgs : string[]) {
            let hostname = '';
            if (!url.hostname) {
                if (path.resolve(localdir) === path.resolve(url.pathname!))
                    return;
            } else {
                hostname = url.hostname + ':';
            }
            const args = ['-av', localdir, `${hostname}${url.pathname}`];
            if (extraArgs.length > 0) args.push(...extraArgs);
            await cmd.exec('rsync', args);
        },

        async removeRecursive(url : Url.UrlObject) {
            return cmd.exec('rm', ['-r', url.pathname!]);
        },

        async sync(url1 : Url.UrlObject, url2 : Url.UrlObject, ...extraArgs : string[]) {
            const args = ['-av',
                url1.hostname ? `${url1.hostname}:${url1.pathname}` : url1.pathname!,
                url2.hostname ? `${url2.hostname}:${url2.pathname}` : url2.pathname!,
            ];
            if (extraArgs.length > 0) args.push(...extraArgs);
            return cmd.exec('rsync', args);
        },

        createWriteStream(url : Url.UrlObject) {
            return fs.createWriteStream(url.pathname!);
        },
        createReadStream(url : Url.UrlObject) {
            return fs.createReadStream(url.pathname!);
        },
        getDownloadLinkOrStream(url : Url.UrlObject) {
            return fs.createReadStream(url.pathname!);
        },
        async writeFile(url : Url.UrlObject, blob : string|Buffer|NodeJS.ReadableStream, options ?: { contentType ?: string }) {
            const output = fs.createWriteStream(url.pathname!);
            if (typeof blob === 'string' || blob instanceof Uint8Array)
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
function getBackend(url : string) {
    url = Url.resolve(cwd, url);
    const parsed = Url.parse(url);

    if (parsed.protocol !== 's3:' && parsed.protocol !== 'file:')
        throw new Error(`Unknown URL scheme ${parsed.protocol}`);

    return [parsed, _backends[parsed.protocol!]] as const;
}

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
export function resolve(url : string, ...others : string[]) {
    url = Url.resolve(cwd, url);
    for (const other of others)
        url = Url.resolve(url + '/', other);
    return url;
}

export async function mkdirRecursive(url : string) {
    const [parsed, backend] = getBackend(url);
    return backend.mkdirRecursive(parsed);
}

export async function download(url : string, ...extraArgs : string[]) {
    const [parsed, backend] = getBackend(url);
    return backend.download(parsed, ...extraArgs);
}

export async function upload(localdir : string, url : string, ...extraArgs : string[]) {
    const [parsed, backend] = getBackend(url);
    return backend.upload(localdir, parsed, ...extraArgs);
}

export async function removeRecursive(url : string) {
    const [parsed, backend] = getBackend(url);
    return backend.removeRecursive(parsed);
}

export async function sync(url1 : string, url2 : string, ...extraArgs : string[]) {
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
        await removeTemporary(tmpdir);
}
export function createWriteStream(url : string, localSpooling : boolean) {
    const [parsed, backend] = getBackend(url);
    return backend.createWriteStream(parsed, localSpooling);
}
export function createReadStream(url : string) {
    const [parsed, backend] = getBackend(url);
    return backend.createReadStream(parsed);
}
export function getDownloadLinkOrStream(url : string) {
    const [parsed, backend] = getBackend(url);
    return backend.getDownloadLinkOrStream(parsed);
}
export async function writeFile(url : string, blob : string|Buffer|NodeJS.ReadableStream, options ?: { contentType ?: string }) {
    const [parsed, backend] = getBackend(url);
    return backend.writeFile(parsed, blob, options);
}

export async function removeTemporary(pathname : string) {
    if (!pathname.startsWith('/var/tmp'))
        return;
    await _backends['file:'].removeRecursive({ pathname });
}

export function isLocal(url : string) {
    const [parsed,] = getBackend(url);
    return parsed.protocol === 'file:' && !parsed.hostname;
}
export function getLocalPath(url : string) {
    const [parsed,] = getBackend(url);
    assert(parsed.protocol === 'file:');
    return parsed.pathname;
}
