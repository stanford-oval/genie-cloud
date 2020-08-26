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

require('../util/config_init');

const fs = require('fs');
const util = require('util');
const path = require('path');
const Url = require('url');
const child_process = require('child_process');
const Tp = require('thingpedia');
const seedrandom = require('seedrandom');

const db = require('../util/db');
const DatasetUtils = require('../util/dataset');
const { clean } = require('../util/tokenize');
const { choose } = require('../util/random');
const { safeMkdir } = require('../util/fsutils');

const { detokenize } = require('genie-toolkit/lib/i18n/american-english');

const Config = require('../config');
const texOptions = [
    // height is set to a large number since the whitespace will be trimmed afterwards
    { height: 50, width: 22, ncols: 6 }, // dense landscape mode
    { height: 50, width: 9,  ncols: 3 }  // sparse portrait mode
];

const blackList = [
    'org.thingpedia.builtin.thingengine.builtin',
    'com.xkcd',
    'com.phdcomics',
    'com.github',
    'org.thingpedia.rss',
    'org.thingpedia.demo.coffee'
];
const nameMap = {
    'com.yandex.translate': 'Translate',
    'org.thingpedia.weather': 'Weather',
    'gov.nasa': 'NASA',
    'com.lg.tv.webos2': 'LG TV',
    'org.thingpedia.icalendar': 'Calendar',
    'com.fitbit': 'Fitbit'
};

async function getDevices(locale, thingpedia, dataset, sample, rng) {
    const devices = await DatasetUtils.getCheatsheet(locale, { thingpedia, dataset, rng });
    const filteredDevices = devices.filter((d) =>
        thingpedia && dataset ? !blackList.includes(d.primary_kind) && d.examples.length > 0 : d.examples.length > 0
    );
    const sampledDevices = choose(filteredDevices, sample || filteredDevices.length, rng);
    return sampledDevices.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
}

async function genTex(devices, path, suffix='') {
    let tex;
    let options = texOptions[1];
    tex = '\\documentclass[10pt]{article}\n'
        // we want the base font to be 5pt, but \documentclass{article}
        // does not like that, so we just double the paper size
        + `\\usepackage[paperheight=${options.height}in,paperwidth=${options.width}in,margin=25px]{geometry}\n`
        + '\\usepackage{graphicx}\n'
        + '\\usepackage[default]{lato}\n'
        + '\\usepackage{multicol}\n'
        + '\\usepackage[dvipsnames]{xcolor}\n'
        + '\\setlength\\columnsep{25px}\n'
        + '\\setlength\\parindent{0px}\n'
        + '\\newcommand{\\WHEN}[0]{\\textcolor{red}{\\textsc{when: }}}\n'
        + '\\newcommand{\\GET}[0]{\\textcolor[rgb]{1.00, 0.55, 0.00}{\\textsc{get: }}}\n'
        + '\\newcommand{\\DO}[0]{\\textcolor[rgb]{0.05, 0.5, 0.06}{\\textsc{do: }}}\n'
        + '\\begin{document}\n'
        + '\\pagestyle{empty}\n'
        + `\\begin{multicols}{${options.ncols}}\n`;

    devices.forEach((d) => {
        if (d.examples.length === 0)
            return;
        tex += formatDeviceName(d);
        for (let ex of d.examples)
            tex += formatExample(ex);

        tex += '\\bigbreak\n\\bigbreak\n';
    });

    tex += '\\end{multicols}\n' + '\\end{document}\n';

    await util.promisify(fs.writeFile)(path + `/cheatsheet${suffix}.tex`, tex);
}

function formatDeviceName(d) {
    d.name = nameMap[d.primary_kind] || d.name;
    d.name = d.name.replace('account', '');
    d.name = d.name.split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');

    let tex = `\\includegraphics[height=12px]{icons/{${d.primary_kind}}.png} `;
    tex += '{\\bf\\large ' + d.name + '}\n\n';
    tex += '\\vspace{0.1em}';
    return tex;
}

function formatExample(ex) {
    let buf = '\\textbullet ';
    if (ex.type === 'stream')
        buf += '\\WHEN ';
    else if (ex.type === 'query')
        buf += '\\GET ';
    else if (ex.type === 'action')
        buf += '\\DO ';

    let utterance = '';
    for (let chunk of ex.utterance_chunks) {
        if (typeof chunk === 'string') {
            utterance += chunk;
        } else {
            const [match, param1, param2, ] = chunk;

            let param = param1 || param2 ;
            if (param === 'p_picture_url')
                param = 'picture';
            else if (param.endsWith('_id'))
                param = param.substring(0, param.length-3);
            else if (param === 'p_to')
                param = 'recipient';

            if (match === '$$')
              utterance += '\\$';
            else
              utterance += '\\_\\_\\_\\_ {\\small (' + clean(param) + ')}';
        }
    }
    let sentence = '';
    let prevtoken = null;
    for (let token of utterance.split(' ')) {
        sentence = detokenize(sentence, prevtoken, token);
        prevtoken = token;
    }
    buf += sentence;

    buf += '\n\n';
    return buf;
}

async function saveFile(url, file) {
    const input = await Tp.Helpers.Http.getStream(url);
    const output = fs.createWriteStream(file);
    input.pipe(output);

    return new Promise((resolve, reject) => {
        output.on('finish', resolve);
        output.on('error', reject);
    });
}

async function execCommand(command, argv, options) {
    const child = child_process.spawn(command, argv, options);
    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (signal) {
                if (signal === 'SIGINT' || signal === 'SIGTERM')
                    reject(new Error(`Killed`));
                else
                    reject(new Error(`Command crashed with signal ${signal}`));
            } else {
                if (code !== 0)
                    reject(new Error(`Command exited with code ${code}`));
                else
                    resolve();
            }
        });
    });
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('generate-cheatsheet', {
            description: 'Generate a cheatsheet in pdf format.'
        });
        parser.add_argument('-l', '--locale', {
            required: false,
            default: 'en',
            help: 'The language to generate (defaults to \'en\', English)'
        });
        parser.add_argument('-o', '--output', {
            required: false,
            default: './cheatsheet',
            help: 'The output directory for the tex file.'
        });
        parser.add_argument('--thingpedia', {
            required: false,
            help: 'Path to JSON file containing signature, type and mixin definitions.'
        });
        parser.add_argument('--dataset', {
            required: false,
            help: 'Path to file containing primitive templates, in ThingTalk syntax.'
        });
        parser.add_argument('--count', {
            required: false,
            default: 1,
            type: 'int',
            help: 'The number of cheatsheet to generate (when generating from files, the ' +
                'cheatsheet will randomly pick an utterance for each example).'
        });
        parser.add_argument('--sample', {
            required: false,
            type: 'int',
            help: 'The number of devices on the cheatsheet.'
        });
        parser.add_argument('--random-seed', {
            default: 'almond is awesome',
            help: 'Random seed'
        });
        parser.add_argument('--suffix', {
            required: false,
            help: 'The suffix of generated files (for generating domain-specific cheatsheet).'
        });
    },

    async main(args) {
        try {
            const locale = args.locale;
            const outputpath = path.resolve(args.output);
            await safeMkdir(outputpath);

            const rng = seedrandom(args.random_seed);

            for (let i = 0; i < args.count; i++) {
                const devices = await getDevices(locale, args.thingpedia, args.dataset, args.sample, rng);
                const icons = devices.map((d) => d.primary_kind);
                await safeMkdir(`${outputpath}/icons`);

                const baseUrl = Url.resolve(Config.SERVER_ORIGIN, Config.CDN_HOST);
                for (let icon of icons) {
                    const iconfile = `${outputpath}/icons/${icon}.png`;
                    if (fs.existsSync(iconfile))
                        continue;
                    const url = Url.resolve(baseUrl, `/icons/${icon}.png`);
                    try {
                        await saveFile(url, iconfile);
                    } catch(e) {
                        console.error(`Failed to download icon for ${icon}`);
                    }
                }

                const suffix = '-' + (args.suffix ? args.suffix : '') + i;
                await genTex(devices, outputpath, suffix);
                await execCommand('latexmk',
                    ['-pdf', `cheatsheet${suffix}.tex`], {
                    cwd: outputpath,
                    stdio: ['ignore', 'inherit', 'inherit'],
                });
                await execCommand('pdfcrop',
                    ['--margins', '25', `cheatsheet${suffix}.pdf`], {
                    cwd: outputpath,
                    stdio: ['ignore', 'inherit', 'inherit']
                });
                await execCommand('convert',
                    ['-density', '100', `cheatsheet${suffix}-crop.pdf`, `cheatsheet${suffix}.png`], {
                    cwd: outputpath,
                    stdio: ['ignore', 'inherit', 'inherit']
                });
                await execCommand('rm',
                    [`cheatsheet${suffix}.pdf`, `cheatsheet${suffix}.aux`, `cheatsheet${suffix}.fdb_latexmk`, `cheatsheet${suffix}.fls`, `cheatsheet${suffix}.log`], {
                    cwd: outputpath,
                    stdio: ['ignore', 'inherit', 'inherit']
                });
            }
        } finally {
            await db.tearDown();
        }
    }
};
