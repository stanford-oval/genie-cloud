// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Sabrina
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');
const adt = require('adt');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

const ValueCategory = adt.data({
    YesNo: null,
    MultipleChoice: null,

    Number: null,
    Measure: { unit: adt.only(String) },
    RawString: null,
    Date: null,
    Unknown: null,
    Picture: null,
    Location: null,
    PhoneNumber: null,
    EmailAddress: null,
    Contact: null,
    Command: null
});

function parseDate(form) {
    var now = new Date;
    var year = form.year;
    if (year < 0)
        year = now.getFullYear();
    var month = form.month;
    if (month < 0)
        month = now.getMonth() + 1;
    var day = form.day;
    if (day < 0)
        day = now.getDate();
    var hour = 0, minute = 0, second = 0;
    hour = form.hour;
    if (hour < 0)
        hour = now.getHours();
    minute = form.minute;
    if (minute < 0)
        minute = now.getMinutes();
    second = form.second;
    if (second < 0)
        second = now.getSeconds();

    return new Date(year, month-1, day, hour, minute, second);
}

function parseTime(form) {
    var year = form.year;
    var month = form.month;
    var day = form.day;
    if (year >= 0 || month >= 0 || day >= 0)
        throw new TypeError('Invalid time ' + form);
    var hour = form.hour;
    if (hour < 0)
        hour = now.getHours();
    var minute = form.minute;
    if (minute < 0)
        minute = now.getMinutes();
    return [hour, minute];
}

function parseLocation(loc) {
    if (loc.relativeTag === 'absolute')
        return Ast.Value.Location(loc.longitude, loc.latitude);
    else
        return Ast.Value.VarRef('$context.location.' + loc.relativeTag.substr('rel_'.length));
}
function displayLocation(loc) {
    if (loc.relativeTag === 'absolute')
        return '[Latitude: ' + Number(loc.latitude).toFixed(3) + ' deg, Longitude: ' + Number(loc.longitude).toFixed(3) + ' deg]';
    else
        return loc.relativeTag.substr('rel_'.length);
}

function valueToCategoryAndValue(value) {
    switch(value.type) {
    case 'List':
        return value.value.map(valueToCategoryAndValue);
    case 'Measure':
        var ttVal = Ast.Value.Measure(value.value.value, value.value.unit);
        // obtaining the type will normalize the unit to the base unit
        var type = Ast.typeForValue(ttVal);
        return ttVal;
    case 'Number':
        return Ast.Value.Number(value.value.value);
    case 'String':
        return Ast.Value.String(value.value.value);
    case 'Enum':
        return Ast.Value.Enum(value.value.value);
    case 'URL':
        return Ast.Value.URL(value.value.value);
    case 'Username':
        return Ast.Value.Username(value.value.value);
    case 'Hashtag':
        return Ast.Value.Hashtag(value.value.value);
    case 'Picture':
        return Ast.Value.Picture(value.value.value);
    case 'Time':
        var time = parseTime(value.value);
        return Ast.Value.Time(time[0], time[1]);
    case 'Date':
        var date = parseDate(value.value);
        return Ast.Value.Date(date);
    case 'Bool':
        return Ast.Value.Boolean(value.value.value);
    case 'PhoneNumber':
        return Ast.Value.PhoneNumber(value.value.value);
    case 'EmailAddress':
        return Ast.Value.EmailAddress(value.value.value);
    case 'Contact':
        return Ast.Value.VarRef('$contact(' + value.value.value + ')');
    case 'Location':
        return parseLocation(value.value);
    case 'VarRef':
        var name = handleName(value.value);
        if (name.startsWith('tt:param.'))
            name = name.substr('tt:param.'.length);
        return Ast.Value.VarRef(name);
    default:
        throw new Error('Invalid value type ' + value.type);
    }
}

function mapArguments(args) {
    return args.map((arg) => {
        var name = handleName(arg.name);
        if (name.startsWith('tt:param.'))
            name = name.substr('tt:param.'.length);
        var value = valueToCategoryAndValue(arg);
        return {
            name: name,
            value: value,
            operator: arg.operator,
            assigned: false,
        };
    });
}

function handleName(name) {
    if (typeof name === 'string')
        return name;

    if (typeof name !== 'object' || name === null)
        throw new TypeError('Invalid name');

    if (typeof name.id === 'string')
        return name.id;

    if (typeof name.value === 'string')
        return name.value;

    throw new TypeError('Invalid name');
}

const EASTER_EGGS = new Set(['tt:root.special.hello', 'tt:root.special.cool', 'tt:root.special.sorry', 'tt:root.special.thankyou']);

module.exports = class SemanticAnalyzer {
    constructor(json) {
        this.root = json;

        this.isSpecial = false;
        this.isEasterEgg = false;
        this.isFailed = false;
        this.isFallback = false;
        this.isAction = false;
        this.isTrigger = false;
        this.isQuery = false;
        this.isQuestion = false;
        this.isRule = false;
        this.isYes = false;
        this.isNo = false;
        this.isAnswer = false;
        this.isDiscovery = false;
        this.isConfigure = false;
        this.isHelp = false;
        this.isList = false;
        this.isSetting = false;
        this.isTrain = false;
        this.isMake = false;

        if ('example_id' in this.root)
            this.exampleId = this.root.example_id;

        if ('action' in this.root) {
            this.isAction = true;

            var parsed = this._handleSelector(action.name);
            this.kind = parsed[0];
            this.channel = parsed[1];
            this.args = mapArguments(action.args);
            if (Array.isArray(action.slots))
                this.slots = new Set(action.slots);
            else
                this.slots = new Set();
        } else if ('trigger' in this.root) {
            this.isTrigger = true;

            var trigger = this._handleSelector(this.root.trigger.name);
            this.kind = trigger[0];
            this.channel = trigger[1];
            this.args = mapArguments(this.root.trigger.args);
            if (Array.isArray(this.root.trigger.slots))
                this.slots = new Set(this.root.trigger.slots);
            else
                this.slots = new Set();
        } else if ('query' in this.root) {
            this.isQuery = true;

            var query = this._handleSelector(this.root.query.name);
            this.kind = query[0];
            this.channel = query[1];
            this.args = mapArguments(this.root.query.args);
            if (Array.isArray(this.root.query.slots))
                this.slots = new Set(this.root.query.slots);
            else
                this.slots = new Set();
        } else if ('rule' in this.root) {
            this.isRule = true;

            if (this.root.rule.trigger) {
                var trigger = this._handleSelector(this.root.rule.trigger.name);
                this.trigger = {
                    isTrigger: true,
                    kind: trigger[0],
                    channel: trigger[1],
                    id: null,
                    device: null,
                    args: mapArguments(this.root.rule.trigger.args)
                };
                if (Array.isArray(this.root.rule.trigger.slots))
                    this.trigger.slots = new Set(this.root.rule.trigger.slots);
                else
                    this.trigger.slots = new Set();
            } else {
                this.trigger = null;
            }
            if (this.root.rule.query) {
                var query = this._handleSelector(this.root.rule.query.name);
                this.query = {
                    isQuery: true,
                    kind: query[0],
                    channel: query[1],
                    id: null,
                    device: null,
                    args: mapArguments(this.root.rule.query.args)
                };
                if (Array.isArray(this.root.rule.query.slots))
                    this.query.slots = new Set(this.root.rule.query.slots);
                else
                    this.query.slots = new Set();
            } else {
                this.query = null;
            }
            if (this.root.rule.action) {
                var action = this._handleSelector(this.root.rule.action.name);
                this.action = {
                    isAction: true,
                    kind: action[0],
                    channel: action[1],
                    id: null,
                    device: null,
                    args: mapArguments(this.root.rule.action.args)
                };
                if (Array.isArray(this.root.rule.action.slots))
                    this.action.slots = new Set(this.root.rule.action.slots);
                else
                    this.action.slots = new Set();
            } else {
                this.action = null;
            }
        } else {
            throw new TypeError('Invalid top-level, was ' + JSON.stringify(this.root));
        }
    }

    _handleSelector(sel) {
        sel = handleName(sel);

        var match = /^tt:([a-z0-9A-Z_\-]+)\.([a-z0-9A-Z_]+)$/.exec(sel);
        if (match === null)
            throw new TypeError('Invalid selector ' + sel);

        return [match[1], match[2]];
    }
}
module.exports.ValueCategory = ValueCategory;
