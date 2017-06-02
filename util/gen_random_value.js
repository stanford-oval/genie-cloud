// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const stream = require('stream');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

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
    ms: [{ value: 2, unit: 'h'}],
    byte: [{ value: 5, unit: 'KB' }, { value: 20, unit: 'MB' }]
};
const BOOLEAN_ARGUMENTS = [true, false];
const LOCATION_ARGUMENTS = [Ast.Location.Relative('current_location'),
                            Ast.Location.Relative('home'),
                            Ast.Location.Relative('work'),
                            Ast.Location.Absolute(37.442156, -122.1634471, 'Palo Alto, CA'),
                            Ast.Location.Absolute(34.0543942, -118.2439408, 'Los Angeles, CA')];
const DATE_ARGUMENTS = ['2017-02-14', '2016-05-04'];
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
    'tt:stock_id': [["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft']],
    'tt:iso_lang_code': [["Italian", 'it'], ["English", 'en'], ["Chinese", 'zh']],
    'tt:device': [["Twitter", 'twitter'], ["Facebook", 'facebook'], ["my scale", 'scale']],
};

function chooseEntity(entityType) {
    if (entityType === 'tt:email_address')
        return EMAIL_ARGUMENTS.map((v) => Ast.Value.Entity(v, entityType, null));
    if (entityType === 'tt:phone_number')
        return PHONE_ARGUMENTS.map((v) => Ast.Value.Entity(v, entityType, null));
    if (entityType === 'tt:username')
        return USERNAME_ARGUMENTS.map((v) => Ast.Value.Entity(v, entityType, null));
    if (entityType === 'tt:hashtag')
        return HASHTAG_ARGUMENTS.map((v) => Ast.Value.Entity(v, entityType, null));
    if (entityType === 'tt:url')
        return URL_ARGUMENTS.map((v) => Ast.Value.Entity(v, entityType, null));
    if (entityType === 'tt:picture')
        return [];

    var choices = ENTITIES[entityType];
    if (!choices) {
        console.log('Unrecognized entity type ' + entityType);
        return [];
    } else {
        return choices.map(([display, value]) => Ast.Value.Entity(value, entityType, display));
    }
}

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

function genValueList(argName, type) {
    if (type.isArray)
        return genValueList(argName, type.elem);
    if (type.isString) {
        if (argName in PARAMS_SPECIAL_STRING)
            return [Ast.Value.String(PARAMS_SPECIAL_STRING[argName])];
        if (argName.endsWith('title'))
            return [Ast.Value.String('news')];
        if (argName.startsWith('label')) // label, labels
            return [Ast.Value.String('work')];
        return STRING_ARGUMENTS.map((s) => Ast.Value.String(s));
    }
    if (type.isNumber) {
        if (argName === 'surge')
            return [Ast.Value.Number(1.5)];
        if (argName === 'heartrate')
            return [Ast.Value.Number(80)];
        if (argName.startsWith('high'))
            return [Ast.Value.Number(20)];
        if (argName.startsWith('low'))
            return [Ast.Value.Number(10)];
        return NUMBER_ARGUMENTS.map((n) => Ast.Value.Number(n));
    }
    if (type.isMeasure) {
        if (argName === 'high')
            return [Ast.Value.Measure(75, 'F')];
        if (argName === 'low')
            return [Ast.Value.Measure(70, 'F')];
        return MEASURE_ARGUMENTS[type.unit].map((m) => Ast.Value.Measure(m.value, m.unit));
    }
    if (type.isDate)
        return DATE_ARGUMENTS.map((d) => Ast.Value.Date(new Date(d)));
    if (type.isBoolean)
        return BOOLEAN_ARGUMENTS.map((b) => Ast.Value.Boolean(b));
    if (type.isLocation) {
        if (argName === 'start')
            return [Ast.Value.Location(Ast.Location.Relative('home'))];
        if (argName === 'end')
            return [Ast.Value.Location(Ast.Location.Relative('work'))];
        return LOCATION_ARGUMENTS.map((l) => Ast.Value.Location(l));
    }
    if (type.isEnum)
        return type.entries.map((e) => Ast.Value.Enum(e));
    if (type.isEntity)
        return chooseEntity(type.type);
    if (type.isTime)
        return [{ hour: 7, minute: 30 }, { hour: 15, minute: 0 }, { hour: 20, minute: 30 }].map((t) => Ast.Value.Time(t.hour, t.minute));
    if (type.isPicture || type.isAny)
        return [];

    console.log('Invalid type ' + type);
    return [];
}

module.exports = genValueList;
