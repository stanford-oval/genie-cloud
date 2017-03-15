// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const csv = require('csv');
const crypto = require('crypto');
const ThingTalk = require('thingtalk');

const db = require('../util/db');
const genRandomRules = require('../util/gen_random_rule');
const reconstruct = require('./deps/reconstruct');
const SchemaRetriever = require('./deps/schema_retriever');
const SempreSyntax = require('../util/sempre_syntax');
const model = require('../model/schema');

const dlg = { _(x) { return x; } };

function sample(distribution) {
    var keys = Object.keys(distribution);
    var sums = new Array(keys.length);
    var rolling = 0;
    for (var i = 0; i < keys.length; i++) {
        sums[i] = rolling + distribution[keys[i]];
        rolling = sums[i];
    }

    var total = sums[keys.length-1];
    var choice = Math.random() * total;

    for (var i = 0; i < keys.length; i++) {
        if (choice <= sums[i])
            return keys[i];
    }
    return keys[keys.length-1];
}

function uniform(array) {
    return array[Math.floor(Math.random()*array.length)];
}

function coin(bias) {
    return Math.random() < bias;
}

const FIXED_KINDS = [
    // 20
    'washington_post', 'sportradar', 'giphy',
    'yahoofinance', 'nasa', 'twitter', 'facebook', 'instagram',
    'linkedin', 'youtube', 'lg_webos_tv', 'light-bulb',
    'thermostat', 'security-camera', 'heatpad', 'phone',
    'omlet', 'slack', 'gmail', 'thecatapi',
    // rest
    'bing', 'bluetooth_speaker', 'scale', 'dropbox', 'giphy', 'github', 
    'google_drive', 'holidays', 'iclaendar', 'imgflip', 'jawbone_up', 
    'builtin', 'onedrive', 'phdcomics', 'reddit_front_page', 
    'wall_street_journal', 'washington_post', 'tumblr', 'tumblr-blog', 
    'uber', 'weatherapi', 'xkcd', 'yahoofinance', 'ytranslate'
];



function makeId() {
    return crypto.randomBytes(8).toString('hex');
}

const STRING_ARGUMENTS = ["i'm happy", "you would never believe what happened", "merry christmas", "love you"];
const USERNAME_ARGUMENTS = ['alice'];
const HASHTAG_ARGUMENTS = ['funny', 'cat', 'lol'];
const URL_ARGUMENTS = ['http://www.abc.def'];
const NUMBER_ARGUMENTS = [42, 7, 14, 11];
const MEASURE_ARGUMENTS = {
    C: [{ value: 73, unit: 'F' }, { value: 22, unit: 'C' }],
    m: [{ value: 1000, unit: 'm' }, { value: 42, unit: 'cm' }],
    kg: [{ value: 82, unit: 'kg' }, { value: 155, unit: 'lb' }],
    kcal: [{ value: 500, unit: 'kcal' }],
    mps: [{ value: 5, unit: 'kmph' }, { value: 25, unit: 'mph' }],
    ms: [{ value: 2, unit: 'h' }],
    byte: [{ value: 5, unit: 'KB' }, { value: 20, unit: 'MB' }]
};
const BOOLEAN_ARGUMENTS = [true, false];
const LOCATION_ARGUMENTS = [{ relativeTag: 'rel_current_location', latitude: -1, longitude: -1 },
                            { relativeTag: 'rel_home', latitude: -1, longitude: -1 },
                            { relativeTag: 'rel_work', latitude: -1, longitude: -1 }];
                            //{ relativeTag: 'absolute', latitude: 37.442156, longitude: -122.1634471 },
                            //{ relativeTag: 'absolute', latitude:    34.0543942, longitude: -118.2439408 }];
const DATE_ARGUMENTS = [{ year: 2017, month: 3, day: 14, hour: -1, minute: -1, second: -1 },
    { year: 2016, month: 5, day: 4, hour: -1, minute: -1, second: -1 }];
const EMAIL_ARGUMENTS = ['bob@stanford.edu'];
const PHONE_ARGUMENTS = ['+16501234567'];

const ENTITIES = {
    'sportradar:eu_soccer_team': [["Juventus", "juv"], ["Barcellona", "bar"], ["Bayern Munchen", "fcb"]],
    'sportradar:mlb_team': [["SF Giants", 'sf'], ["Chicago Cubs", 'chc']],
    'sportradar:nba_team': [["Golden State Warriors", 'gsw'], ["LA Lakers", 'lal']],
    'sportradar:ncaafb_team': [["Stanford Cardinals", 'sta'], ["California Bears", 'cal']],
    'sportradar:ncaambb_team': [["Stanford Cardinals", 'stan'], ["California Bears", 'cal']],
    'sportradar:nfl_team': [["Seattle Seahawks", 'sea'], ["SF 49ers", 'sf']],
    'sportradar:us_soccer_team': [["San Jose Earthquakes", 'sje'], ["Toronto FC", 'tor']],
    'tt:stock_id': [["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft']]
};

// params with special value
const PARAMS_SPECIAL_STRING = {
    'repo_name': 'android_repository',
    'file_name': 'log.txt',
    'old_name': 'log.txt',
    'new_name': 'backup.txt',
    'folder_name': 'archive',
    'purpose': 'research project',
    'fileter': 'lo-fi',
    'query': 'super bowl',
    'summary': 'celebration',
    'category': 'sports',
    'from_name': 'bob',
    'blog_name': 'government secret',
    'camera_used': 'mastcam',
    'description': 'christmas',
    'source_language': 'english',
    'target_language': 'chinese',
    'detected_language': 'english',
    'organizer': 'stanford',
    'user': 'bob',
    'positions': 'ceo',
    'specialties': 'java',
    'industry': 'music',
    'template': 'wtf',
    'text_top': 'ummm... i have a question...',
    'text_bottom': 'wtf?',
    'phase': 'moon'
};

// params should never be assigned unless it's required
const PARAMS_BLACK_LIST = [
    'company_name', 'weather', 'currency_code', 'orbiting_body',
    'home_name', 'away_name', 'home_alias', 'away_alias',
    'watched_is_home', 'scheduled_time', 'game_status',
    'home_points', 'away_points', // should be replaced by watched_points, other_points eventually
    'day',
    'bearing', 'updateTime', //gps
    'deep', 'light', 'rem', 'awakeTime', 'asleepTime', // sleep tracker
    'yield', 'div', 'pay_date', 'ex_div_date', // yahoo finance
    'cloudiness', 'fog',
    'formatted_name', 'headline', // linkedin
    'video_id',
    'uber_type',
    'count',
    'timestamp', //slack
    'last_modified', 'full_path', 'total', // dropbox
    'estimated_diameter_min', 'estimated_diameter_max',
    'translated_text',
    'sunset', 'sunrise',
    'name' //nasa, meme
];

function chooseEntity(entityType) {
    if (entityType === 'tt:email_address')
        return ['EmailAddress', { value: uniform(EMAIL_ARGUMENTS) }];
    if (entityType === 'tt:phone_number')
        return ['PhoneNumber', { value: uniform(PHONE_ARGUMENTS) }];
    if (entityType === 'tt:username')
        return ['Username', { value: uniform(USERNAME_ARGUMENTS) }];
    if (entityType === 'tt:hashtag')
        return ['Hashtag', { value: uniform(HASHTAG_ARGUMENTS) }];
    if (entityType === 'tt:url')
        return ['URL', { value: uniform(URL_ARGUMENTS) }];
    if (entityType === 'tt:picture')
        return [null, null];

    var choices = ENTITIES[entityType];
    if (!choices) {
        console.log('Unrecognized entity type ' + entityType);
        return [null, null];
    }

    var choice = uniform(choices);
    var v = { value: choice[1], display: choice[0] };
    return ['Entity(' + entityType + ')', v];
}

function chooseRandomValue(argName, type) {
    console.log(argName, type, type.isString);
    if (type.isArray)
        return chooseRandomValue(argName, type.elem);
    if (type.isMeasure) {
        if (argName === 'high')
            return ['Measure', { value : 75, unit: 'F' }];
        if (argName === 'low')
            return ['Measure', { value : 70, unit: 'F' }];
        return ['Measure', uniform(MEASURE_ARGUMENTS[type.unit])];
    }
    if (type.isNumber) {
        if (argName === 'surge')
            return ['Number', { value : 1.5 }];
        if (argName === 'heartrate')
            return ['Number', { value : 80 }];
        if (argName.startsWith('high'))
            return ['Number', { value : 20 }];
        if (argName.startsWith('low'))
            return ['Number', { value : 10 }];
        return ['Number', { value: uniform(NUMBER_ARGUMENTS) }];
    }
    if (type.isString) {
        if (argName in PARAMS_SPECIAL_STRING)
            return ['String', { value: PARAMS_SPECIAL_STRING[argName]}];
        if (argName.endsWith('title'))
            return ['String', { value: 'news' }];
        if (argName.startsWith('label')) // label, labels
            return ['String', { value: 'work' }];
        return ['String', { value: uniform(STRING_ARGUMENTS) }];
    }
    if (type.isDate)
        return ['Date', uniform(DATE_ARGUMENTS)];
    if (type.isBoolean)
        return ['Bool', { value: uniform(BOOLEAN_ARGUMENTS) }];
    if (type.isLocation) {
        if (argName === 'start')
            return ['Location', { relativeTag: 'rel_home', latitude: -1, longitude: -1 }];
        if (argName === 'end')
            return ['Location', { relativeTag: 'rel_work', latitude: -1, longitude: -1 }];
        return ['Location', uniform(LOCATION_ARGUMENTS)];
    }
    if (type.isEmailAddress)
        return ['EmailAddress', { value: uniform(EMAIL_ARGUMENTS) }];
    if (type.isPhoneNumber)
        return ['PhoneNumber', { value: uniform(PHONE_ARGUMENTS) }];
    if (type.isUsername)
        return ['Username', { value: uniform(USERNAME_ARGUMENTS) }];
    if (type.isHashtag) {
        if (argName === 'channel')
            return ['Hashtag', { value: 'work'}];
        return ['Hashtag', { value: uniform(HASHTAG_ARGUMENTS) }];
    }
    if (type.isURL)
        return ['URL', { value: uniform(URL_ARGUMENTS) }];
    if (type.isEnum)
        return ['Enum', { value: uniform(type.entries) }];
    if (type.isEntity)
        return chooseEntity(type.type);
    if (type.isPicture || type.isTime || type.isAny)
        return [null, null];

    console.log('Invalid type ' + type);
    return [null, null];
}

function postprocess(str) {
    str = str.replace(/your/g, 'my').replace(/ you /g, ' I ');

    //if (coin(0.1))
    //    str = str.replace(/ instagram /i, ' ig ');
    //if (coin(0.1))
    //    str = str.replace(/ facebook /i, ' fb ');

    return str;
}

var n = 0;

function processOneInvocation(output, schemaRetriever, channelType, kind, channelName, meta) {
    console.log(n++ + ' ' + kind +'.' + channelName);
    var invocation = {
        name: { id: 'tt:' + kind + '.' + channelName },
        args: []
    };
    var program = {};
    program[channelType] = invocation;

    meta.schema.forEach((typestr, i) => {
        var type = ThingTalk.Type.fromString(typestr);
        var argname = meta.args[i];
        var argcanonical = meta.argcanonicals[i];
        var argrequired = channelType === 'action' || meta.required[i];

        if (argname in PARAMS_BLACK_LIST)
            return;
        else if (type.isEntity && type.type == 'tt:picture')
            return;
        else if (type.isTime)
            return;
        else if (!argrequired && !type.isEnum && !coin(0.2))
            return;
        else 
            var [sempreType, value] = chooseRandomValue(argname, type);
        if (!sempreType)
            return;

        invocation.args.push({ name: { id: 'tt:param.' + argname },
            operator: 'is', type: sempreType, value: value });
    });

    return reconstruct(dlg, schemaRetriever, program).then((reconstructed) => {
        output.write([makeId(), SempreSyntax.toThingTalk(program), postprocess(reconstructed)]);
    });
}

function main() {
    var output = csv.stringify();
    var file = fs.createWriteStream(process.argv[2]);
    output.pipe(file);
    var language = process.argv[3] || 'en';

    var promises = [];
    db.withClient((dbClient) => {
        var schemaRetriever = new SchemaRetriever(dbClient, language);
        return model.getMetasByKinds(dbClient, FIXED_KINDS, null, language).then(function(schemas) {
            for (var s of schemas) {
                for (var t in s.triggers)
                    promises.push(processOneInvocation(output, schemaRetriever, 'trigger', s.kind, t, s.triggers[t]));
                for (var q in s.queries)
                    promises.push(processOneInvocation(output, schemaRetriever, 'query', s.kind, q, s.queries[q]));
                for (var a in s.actions)
                    promises.push(processOneInvocation(output, schemaRetriever, 'action',  s.kind, a, s.actions[a]));
            }
        }).then(() => Q.all(promises));
    })
    .then(() => output.end()).done();

    file.on('finish', () => process.exit());
}

main();

