#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

process.on('unhandledRejection', (up) => { throw up; });
const fs = require('fs');
const util = require('util');
const yaml = require('js-yaml');

function stringEscape(str) {
    return "'" + str.replace(/['"\\]/g, '\\$0') + "'";
}

class Index {
    async load(filename) {
        this._index = yaml.safeLoad((await util.promisify(fs.readFile)(filename)).toString(), { filename });
    }

    _collectPages(section) {
        const pages = [];
        for (let page of section.pages) {
            pages.push(page);
            if (section.subpages && page in section.subpages)
                pages.push(...section.subpages[page]);
        }
        return pages;
    }

    _doPage(page, prefix) {
        if (page in this._index.links) {
            const tgt = this._index.links[page];
            if (tgt.url.startsWith('/thingpedia')) {
                this._buffer.push(prefix + `if Config.WITH_THINGPEDIA === 'embedded'`);
                prefix += '  ';
            }
            if (tgt.url.startsWith('/luinet')) {
                this._buffer.push(prefix + `if Config.WITH_LUINET === 'embedded'`);
                prefix += '  ';
            }

            this._buffer.push(prefix + `li(class=(currentPage === ${stringEscape(page)} ? 'current' : ''))`);
            this._buffer.push(prefix + `  a(href=${stringEscape(tgt.url)}) ${tgt.title}`);
        } else if (page in this._index.pages) {
            const title = this._index.pages[page];
            this._buffer.push(prefix + `li(class=(currentPage === ${stringEscape(page)} ? 'current' : ''))`);
            this._buffer.push(prefix + `  a(href='/doc/${page}.md') ${title}`);
        } else {
            throw new Error(`Invalid page ${page}`);
        }
    }

    build() {
        this._buffer = [];

        for (let section of this._index.sections) {
            this._buffer.push(`li(class=([${this._collectPages(section).map(stringEscape).join(', ')}].indexOf(currentPage) >= 0 ? 'current' : ''))`);
            this._buffer.push(`  a.doc-sidebar-subtitle ${section.title}`);
            this._buffer.push(`  ul`);

            for (let page of section.pages) {
                this._doPage(page, '    ');

                if (section.subpages && page in section.subpages) {
                    this._buffer.push(`      ul`);

                    for (let subpage of section.subpages[page])
                        this._doPage(subpage, '        ');
                }
            }
        }

        return this._buffer.join('\n') + '\n';
    }
}

async function main() {
    const index = new Index();
    await index.load(process.argv[2]);

    await util.promisify(fs.writeFile)(process.argv[3], index.build());
}
main();
