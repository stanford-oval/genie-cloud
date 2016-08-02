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

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const exampleModel = require('../model/example');

function sum(array) {
    return array.reduce((a, b) => a+b, 0);
}

function findInvocations(parsed) {
    if (parsed.action) {
        return [parsed.action];
    } else if (parsed.query) {
        return [parsed.query];
    } else if (parsed.trigger) {
        return [parsed.trigger];
    } else if (parsed.rule) {
        return [parsed.rule.trigger, (parsed.rule.query ? parsed.rule.query : parsed.rule.action)];
    } else {
        return [];
    }
}

function computeNumArguments(parsed) {
    return sum(findInvocations(parsed).map((i) => i.args.length));
}
function computeStringArguments(parsed) {
    return sum(findInvocations(parsed).map((i) => i.args.filter((a) => a.type === 'String').length));
}

function computeClass(parsed) {
    if (parsed.action)
        return 0;
    if (parsed.query)
        return 1;
    if (parsed.trigger)
        return 2;
    if (parsed.rule)
        return 3;
    return 4;
}
const CLASSES = ['action', 'query', 'trigger', 'rule', 'other'];

function main() {
    var output = fs.createWriteStream(process.argv[2]);

    db.withClient((dbClient) => {
        return exampleModel.getAll(dbClient);
    }).then((examples) => {
        examples = examples.filter((ex) => !ex.is_base);
        examples.forEach(function(ex) {
            ex.target_json = JSON.parse(ex.target_json);

            ex.num_arguments = computeNumArguments(ex.target_json);
            ex.num_string_arguments = computeStringArguments(ex.target_json);
            ex.num_non_string_arguments = ex.num_arguments - ex.num_string_arguments;
            ex._class = computeClass(ex.target_json);
        });

        examples.sort(function(a, b) {
            if (a.num_non_string_arguments != b.num_non_string_arguments)
                return a.num_non_string_arguments - b.num_non_string_arguments;
            if (a.num_string_arguments != b.num_string_arguments)
                return a.num_string_arguments - b.num_string_arguments;
            return a._class - b._class;
        });

        examples.forEach(function(ex) {
            output.write(ex.utterance);
            output.write('\t');
            output.write(String(ex.num_non_string_arguments));
            output.write('\t');
            output.write(String(ex.num_string_arguments));
            output.write('\t');
            output.write(CLASSES[ex._class]);
            output.write('\t');
            output.write(JSON.stringify(ex.target_json));
            output.write('\n');
        });
    }).then(() => {
        output.end();
    }).done();

    output.on('finish', () => process.exit());
}
main();
