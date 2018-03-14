"use strict";

const fs = require('fs');
const ThingTalk = require('thingtalk');
const db = require('../util/db');

const exampleModel = require('../model/example');
const deviceModel = require('../model/device');

function findInvocation(parsed, id) {
    if (parsed.type === 'action')
        return parsed.value;
    else if (parsed.type)
        return findInvocation(parsed.value, id);
    if (parsed.isMonitor)
        return findInvocation(parsed.table, id);
    if (parsed.isFilter)
        return findInvocation(parsed.table || parsed.stream, id);
    if (parsed.isEdgeFilter)
        return findInvocation(parsed.stream, id);
    if (parsed.isInvocation)
        return parsed.invocation;
    throw new Error(id + ' not action query or trigger, is ' + parsed);
}

function get_examples() {
    return db.withClient((dbClient) => {
        var deviceMap = {};

        return deviceModel.getAll(dbClient).then((devices) => {
            devices.forEach((d) => {
                if (!d.approved_version)
                    return;
                if (d.primary_kind === 'org.thingpedia.demo.coffee' || d.primary_kind === 'org.thingpedia.builtin.thingengine.home')
                    return;
                deviceMap[d.primary_kind] = {
                    name: d.name,
                    primary_kind: d.primary_kind,
                    id: d.id,
                    triggers: [],
                    queries: [],
                    actions: []
                };
            });
        }).then(() => {
            return exampleModel.getBaseByLanguage(dbClient, 'en');
        }).then((examples) => {
            const kindMap = {
                'thermostat': 'com.nest',
                'light-bulb': 'com.hue',
                'security-camera': 'com.nest',
                'car': 'com.tesla',
                'speaker': 'org.thingpedia.bluetooth.speaker.a2dp',
                'scale': 'com.bodytrace.scale',
                'heatpad': 'com.parklonamerica.heatpad',
                'activity-tracker': 'com.jawbone.up',
                'fitness-tracker': 'com.jawbone.up',
                'heartrate-monitor': 'com.jawbone.up',
                'sleep-tracker': 'com.jawbone.up',
                'tumblr-blog': 'com.tumblr'
            };

            var dupes = new Set;

            examples.forEach((ex) => {
                if (dupes.has(ex.target_code) || !ex.target_code)
                    return;

                dupes.add(ex.target_code);
                var parsed = ThingTalk.Grammar.parse(ex.target_code);
                if (!parsed.declarations.length)
                    return;
                var invocation = findInvocation(parsed.declarations[0], ex.id);
                if (!invocation)
                    return;
                var kind = invocation.selector.kind;

                if (kind in kindMap)
                    kind = kindMap[kind];
                if (!(kind in deviceMap)) {
                    // ignore what we don't recognize
                    //console.log('Unrecognized kind ' + kind);
                } else {
                    var sentence = ex.utterance.replace(/\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/g, '____');
                    if (parsed.declarations[0].type === 'stream')
                        deviceMap[kind].triggers.push(sentence);
                    if (parsed.declarations[0].type === 'table')
                        deviceMap[kind].queries.push(sentence);
                    if (parsed.declarations[0].type === 'action')
                        deviceMap[kind].actions.push(sentence);
                }
            });

            var devices = Object.keys(deviceMap).map((k) => deviceMap[k]);
            return devices;
        });
    });
}

function gen_tex(devices, path) {
    let tex;
    tex = '\\documentclass[10pt]{article}\n'
        + '\\usepackage[paperheight=1080px,paperwidth=1920px,margin=25px]{geometry}\n'
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
        + '\\begin{multicols}{8}\n';

    devices.forEach((d) => {
        if (d.triggers.length + d.queries.length + d.actions.length === 0)
            return;
        tex += foramtDeviceName(d);
        d.triggers.forEach((t) => {
            tex += formatExample(t, 'trigger') + '\n\n';
        })
        d.queries.forEach((q) => {
            tex += formatExample(q, 'query') + '\n\n';
        })
        d.actions.forEach((a) => {
            tex += formatExample(a, 'action') + '\n\n';
        })
        tex += '\\bigbreak\n\\bigbreak\n'
    })

    tex += '\\end{multicols}\n' + '\\end{document}\n';

    fs.writeFile(path + '/cheatsheet.tex', tex, (err) => {
        if (err) return console.error(err);
        console.log('saved');        
    })

}

function foramtDeviceName(d) {
    let tex = `\\includegraphics[height=12px]{icons/{${d.primary_kind}}.png} `;
    tex += '{\\bf\\large ' + d.name + '}\n\n';
    return tex;
}

function formatExample(ex, type) {
    if (type === 'trigger')
        ex = '\\WHEN ' + ex;
    else if (type === 'query')
        ex = '\\GET ' + ex;
    else if (type === 'action')
        ex = '\\DO ' + ex;
    ex = '\\textbullet ' + ex
    return ex.replace(/____/g, '\\_\\_\\_\\_');
}


function main() {
    const path = process.argv[2] || './cheatsheet/'
    get_examples().then((devices) => {
        gen_tex(devices, path);
    }).done();

}

main();