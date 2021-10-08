// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as Url from 'url';
import express from 'express';
import sanitize from 'sanitize-filename';
import * as stream from 'stream';

import * as Config from '../config';
import * as AbstractFS from './abstract_fs';

function getDownloadLocation(kind : string, version : number, developer : boolean) {
    // FIXME: when using the S3 backend, we should generate a signed request
    // if the user is a developer (as the device should not be downloadable
    // freely)

    // Resolve the URL against SERVER_ORIGIN if CDN_HOST is empty

    if (process.env.KUBERNETES_SERVICE_HOST) {
        // running in kubernetes, return the internal URL
        return Promise.resolve(
            Url.resolve(
                "http://frontend:8080",
                `${Config.CDN_HOST}/devices/${kind}-v${version}.zip`
            )
        );
    } else {
        return Promise.resolve(
            Url.resolve(
                Config.SERVER_ORIGIN,
                `${Config.CDN_HOST}/devices/${kind}-v${version}.zip`
            )
        );
    }
}

const writableDirectory = AbstractFS.resolve(Config.FILE_STORAGE_DIR);

export function initFrontend(app : express.Application) {
        // if the user has configured a CDN for downloads, we have nothing to do
        if (Config.CDN_HOST !== '/download')
            return;

        // special case file: URLs to use express.static, which will also do proper caching
        if (writableDirectory.startsWith('file:')) {
            const pathname = Url.parse(writableDirectory).pathname!;
            app.use('/download', express.static(pathname));
        } else {
            app.use('/download', (req, res, next) => {
                if (req.method !== 'GET') {
                    next();
                    return;
                }

                AbstractFS.createReadStream(AbstractFS.resolve(writableDirectory, req.url))
                    .pipe(res);
            });
        }
}

export function storeIcon(blob : string|stream.Readable|Buffer, name : string) {
    return AbstractFS.writeFile(AbstractFS.resolve(writableDirectory, 'icons/' + name + '.png'), blob, {
        contentType: 'image/png'
    });
}
export function storeBlogAsset(blob : string|stream.Readable|Buffer, name : string, contentType = 'application/octet-stream') {
    return AbstractFS.writeFile(AbstractFS.resolve(writableDirectory, 'blog-assets/' + name), blob, {
        contentType
    });
}
export async function storeZipFile(blob : string|NodeJS.ReadableStream|Buffer, name : string, version : number, directory = 'devices') {
    name = sanitize(name);
    const filename = directory + '/' + name + '-v' + version + '.zip';
    await AbstractFS.writeFile(AbstractFS.resolve(writableDirectory, filename), blob, {
        contentType: 'application/zip'
    });
}

export function downloadZipFile(name : string, version : number, directory = 'devices') {
    name = sanitize(name);
    const filename = directory + '/' + name + '-v' + version + '.zip';
    return AbstractFS.createReadStream(AbstractFS.resolve(writableDirectory, filename));
}

export { getDownloadLocation };

