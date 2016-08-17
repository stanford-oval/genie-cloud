// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const byline = require('byline');

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const exampleModel = require('../model/example');
const ThingPediaClient = require('../util/thingpedia-client');
const SchemaRetriever = ThingTalk.SchemaRetriever;

var _schemaRetriever;

// these need to match the grammar tokens that SEMPRE uses
const GRAMMAR_TOKENS = {
    en: {
        'true': 'true',
        'false': 'false',
        'one': 'one',
        'here': 'here',
        'at_work': 'at work',
        'at_home': 'at home',
        'is': 'is',
        'contains': 'contains',
        'has': 'has',
        'is greater than': 'is greater than',
        'is less than': 'is less than',
        'with': 'with',
        'and': 'and',
        'monitor_if': 'monitor if',
        'every_day_at': 'every day at',
        'every': 'every',
        'help': 'help',
        'discover': 'discover',
        'configure': 'configure',
        'devices': 'devices',
        'queries': 'queries',
        'commands': 'commands',
        'list': 'list',
        'yes': 'yes',
        'no': 'no',
        'hello': 'hello',
        'thanks': 'thanks',
        'sorry': 'sorry',
        'cool': 'cool',
        'never_mind': 'never mind'
    },
    it: {
        'true': 'vero',
        'false': 'falso',
        'one': 'uno',
        'here': 'qui',
        'at_work': 'al lavoro',
        'at_home': 'a casa',
        'is': 'è',
        'contains': 'contiene',
        'has': 'ha',
        'is greater than': 'è maggiore di',
        'is less than': 'è minore di',
        'with': 'con',
        'and': 'e',
        'monitor_if': 'osserva se',
        'every_day_at': 'ogni giorno alle',
        'every': 'ogni',
        'help': 'aiuto',
        'discover': 'ricerca',
        'configure': 'configura',
        'devices': 'dispositivi',
        'queries': 'interrogazioni',
        'commands': 'comandi',
        'list': 'lista',
        'yes': 'sì',
        'no': 'no',
        'hello': 'ciao',
        'thanks': 'grazie',
        'sorry': 'scusa',
        'cool': 'figo',
        'never_mind': 'lascia stare'
    },
    zh: {
        'true': "正确",
        'false': "错误",
        'one': "一",
        'here': "这里",
        'at_work': "在 公司",
        'at_home': "在 家",
        'is': "是",
        'contains': "包含",
        'has': "有",
        'is greater than': "大于",
        'is less than': "少于",
        'with': "把",
        'and': "和",
        'monitor_if': "监控 如果",
        'every_day_at': "每天 在",
        'every': "每",
        'help': "帮助",
        'discover': "搜索",
        'configure': "设置",
        'devices': "设备",
        'queries': "查询",
        'commands': "命令",
        'list': "列出",
        'yes': "是",
        'no': "否",
        'hello': "你好",
        'thanks': "谢谢",
        'sorry': "对不起",
        'cool': "酷",
        'never_mind': "算了"
    }
}

const SPECIAL_TO_GRAMMAR = {
    hello: 'hello',
    debug: 'debug',
    help: 'help',
    thankyou: 'thanks',
    sorry: 'sorry',
    cool: 'cool',
    nevermind: 'never_mind',
    failed: 'failuretoparse'
}
const COMMAND_TO_GRAMMAR = {
    device: 'devices',
    query: 'queries',
    command: 'commands'
}

function argToCanonical(grammar, buffer, arg) {
    if (arg.type === 'Location') {
        if (arg.relativeTag === 'rel_current_location')
            buffer.push(grammar.here);
        else if (arg.relativeTag === 'rel_home')
            buffer.push(grammar.home);
        else if (arg.relativeTag === 'rel_work')
            buffer.push(grammar.work);
        else if (arg.latitude === 37.442156 && arg.longitude === -122.1634471)
            buffer.push('palo alto');
        else if (arg.latitude === 34.0543942 && arg.longitude === -118.2439408)
            buffer.push('los angeles');
        else
            buffer.push('some other place');
    } else if (arg.type === 'String') {
        buffer.push('"');
        buffer.push(arg.value.value);
        buffer.push('"');
    } else if (arg.type === 'Boolean') {
        buffer.push(grammar[String(arg.value.value)]);
    } else {
        buffer.push(String(arg.value.value));
        if (arg.type === 'Measure')
            buffer.push(arg.value.unit || arg.unit);
    }
}

function reconstructCanonical(dbClient, grammar, language, json) {
    var parsed = JSON.parse(json);

    if (parsed.special) {
        var token = SPECIAL_TO_GRAMMAR[parsed.special.id.substr('tt:root.special.'.length)]
        if (token === 'failuretoparse' || token === 'debug')
            return token;
        else
            return grammar[token];
    }

    var buffer = [];
    if (parsed.command) {
        buffer.push(grammar[COMMAND_TO_GRAMMAR[parsed.command.type]]);

        if (parsed.command.value.value === 'generic')
            return buffer.join(' ');

        buffer.push(parsed.command.value.id.substr('tt:device.'.length));
        return buffer.join(' ');
    }
    if (parsed.answer) {
        argToCanonical(grammar, buffer, parsed.answer);
        return buffer.join(' ');
    }

    if (parsed.trigger)
        buffer.push(grammar.monitor_if);

    var name, args, schemaType;
    if (parsed.action) {
        name = parsed.action.name;
        args = parsed.action.args;
        schemaType = 'actions';
    } else if (parsed.query) {
        name = parsed.query.name;
        args = parsed.query.args;
        schemaType = 'queries';
    } else if (parsed.trigger) {
        name = parsed.trigger.name;
        args = parsed.trigger.args;
        schemaType = 'triggers';
    } else {
        throw new TypeError('Not action, query or trigger');
    }

    var match = /^tt:([^\.]+)\.(.+)$/.exec(name.id);
    if (match === null)
        throw new TypeError('Channel name not in proper format');
    var kind = match[1];
    var channelName = match[2];

    return _schemaRetriever.getMeta(kind, schemaType, channelName).then(function(meta) {
        buffer.push(meta.canonical);

        return db.selectAll(dbClient, "select argname, canonical from device_schema join device_schema_arguments on"
            + " id = schema_id and version = approved_version where kind = ? and language = ? and channel_name = ?",
            [kind, language, channelName]).then(function(argrows) {
            var argmap = {};
            argrows.forEach(function(arg) {
                argmap[arg.argname] = arg.canonical;
            });

            args.forEach(function(arg) {
                buffer.push(grammar.with);
                buffer.push('arg');

                var match = /^tt[:\.]param\.(.+)$/.exec(arg.name.id);
                if (match === null)
                    throw new TypeError('Argument name not in proper format, is ' + arg.name.id);
                var argname = match[1];

                var argcanonical;
                if (argname in argmap)
                    argcanonical = argmap[argname];
                else
                    argcanonical = argname.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
                buffer.push(argcanonical);

                if (arg.operator === '<')
                    buffer.push(grammar.is_less_than);
                else if (arg.operator === '>')
                    buffer.push(grammar.is_greater_than);
                else
                    buffer.push(grammar[arg.operator]);
                argToCanonical(grammar, buffer, arg);
            });

            return buffer.join(' ');
        });
    });
}

function main() {
    var output = fs.createWriteStream(process.argv[2]);
    var onlineLearn = process.argv.length >= 4 ? byline(fs.createReadStream(process.argv[3])) : null;
    if (onlineLearn !== null)
        onlineLearn.setEncoding('utf8');

    var language = process.argv[4] || 'en';
    var grammar = GRAMMAR_TOKENS[language];
    if (!grammar)
        throw new Error('Invalid language ' + language);
    _schemaRetriever = new SchemaRetriever(new ThingPediaClient(undefined, language));

    db.withClient((dbClient) => {
        return exampleModel.getAllWithLanguage(dbClient, language).then((examples) => {
            return Q.all(examples.map((ex) => {
                if (ex.is_base)
                    return;

                return Q.try(function() {
                    return reconstructCanonical(dbClient, grammar, language, ex.target_json);
                }).then(function(reconstructed) {
                    output.write(ex.utterance);
                    output.write('\t');
                    output.write(reconstructed);
                    output.write('\n');
                }).catch((e) => {
                    console.error('Failed to handle ' + ex.utterance + ': ' + e.message);
                });
            }));
        }).then(() => {
            if (onlineLearn === null) {
                return;
            }

            var promises = [];
            onlineLearn.on('data', (data) => {
                var line = data.split(/\t/);
                var utterance = line[0];
                var target_json = line[1];
                promises.push(Q.try(function() {
                    return reconstructCanonical(dbClient, grammar, language, target_json);
                }).then(function(reconstructed) {
                    output.write(utterance);
                    output.write('\t');
                    output.write(reconstructed);
                    output.write('\n');
                }).catch((e) => {
                    console.error('Failed to handle ' + utterance + ': ' + e.message);
                }));
            });

            return Q.Promise(function(callback, errback) {
                onlineLearn.on('end', () => callback());
                onlineLearn.on('error', errback);
            }).then(function() {
                return Q.all(promises);
            });
        });
    }).finally(() => {
        output.end();
    });

    output.on('finish', () => process.exit());
}
main();
