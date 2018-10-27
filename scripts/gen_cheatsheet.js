// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const util = require('util');
const path = require('path');
const Url = require('url');
const child_process = require('child_process');
const Tp = require('thingpedia');

const db = require('../util/db');
const DatasetUtils = require('../util/dataset');
const { clean } = require('../util/tokenize');

const Config = require('../config');

async function genTex(devices, path) {
    let tex;
    tex = '\\documentclass[10pt]{article}\n'
        // we want the base font to be 5pt, but \documentclass{article}
        // does not like that, so we just double the paper size
        + '\\usepackage[paperheight=17in,paperwidth=22in,margin=25px]{geometry}\n'
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
        + '\\begin{multicols}{6}\n';

    const icons = [];
    devices.forEach((d) => {
        if (d.examples.length === 0)
            return;

        icons.push(d.primary_kind);
        tex += formatDeviceName(d);
        for (let ex of d.examples)
            tex += formatExample(ex);

        tex += '\\bigbreak\n\\bigbreak\n';
    });

    tex += '\\end{multicols}\n' + '\\end{document}\n';

    await util.promisify(fs.writeFile)(path + '/cheatsheet.tex', tex);

    return icons;
}

function formatDeviceName(d) {
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

    for (let chunk of ex.utterance_chunks) {
        if (typeof chunk === 'string') {
            buf += chunk;
        } else {
            const [match, param1, param2, ] = chunk;
            if (match === '$$')
              buf += '\\$';
            else
              buf += '\\_\\_\\_\\_ {\\small (' + clean(param1||param2) + ')}';
        }
    }

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

async function safeMkdir(dir, options) {
    try {
         await util.promisify(fs.mkdir)(dir, options);
    } catch(e) {
         if (e.code === 'EEXIST')
             return;
         throw e;
    }
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

async function main() {
    try {
        const language = process.argv[2] || 'en';
        const outputpath = path.resolve(process.argv[3] || './cheatsheet');
        await safeMkdir(outputpath);

        const devices = await DatasetUtils.getCheatsheet(language);
        const icons = await genTex(devices, outputpath);

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

        await execCommand('latexmk',
            ['-pdf', 'cheatsheet.tex'], {
            cwd: outputpath,
            stdio: ['ignore', 'inherit', 'inherit'],
        });
    } finally {
        await db.tearDown();
    }
}
main();
