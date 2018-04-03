// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

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
    Time: null,
    Unknown: null,
    Picture: null,
    Location: null,
    PhoneNumber: null,
    EmailAddress: null,
    Contact: null,
    Predicate: null,
    PermissionResponse: null,
    Command: null
});

ValueCategory.fromValue = function fromValue(value) {
    if (value.isVarRef)
        return ValueCategory.Unknown;

    var type = value.getType();

    if (type.isEntity && type.type === 'tt:picture')
        return ValueCategory.Picture;
    else if (type.isEntity && type.type === 'tt:phone_number')
        return ValueCategory.PhoneNumber;
    else if (type.isEntity && type.type === 'tt:email_address')
        return ValueCategory.EmailAddress;
    else if (type.isEntity && type.type === 'tt:contact')
        return ValueCategory.Contact;
    else if (type.isEntity)
        return ValueCategory.RawString;
    else if (type.isBoolean)
        return ValueCategory.YesNo;
    else if (type.isString)
        return ValueCategory.RawString;
    else if (type.isNumber)
        return ValueCategory.Number;
    else if (type.isMeasure)
        return ValueCategory.Measure(type.unit);
    else if (type.isEnum)
        return ValueCategory.RawString;
    else if (type.isTime)
        return ValueCategory.Time;
    else if (type.isDate)
        return ValueCategory.Date;
    else if (type.isLocation)
        return ValueCategory.Location;
    else
        return ValueCategory.Unknown;
};

ValueCategory.toAskSpecial = function toAskSpecial(expected) {
    let what;
    if (expected === ValueCategory.YesNo)
        what = 'yesno';
    else if (expected === ValueCategory.Location)
        what = 'location';
    else if (expected === ValueCategory.Picture)
        what = 'picture';
    else if (expected === ValueCategory.PhoneNumber)
        what = 'phone_number';
    else if (expected === ValueCategory.EmailAddress)
        what = 'email_address';
    else if (expected === ValueCategory.Contact)
        what = 'contact';
    else if (expected === ValueCategory.Number)
        what = 'number';
    else if (expected === ValueCategory.Date)
        what = 'date';
    else if (expected === ValueCategory.Time)
        what = 'time';
    else if (expected === ValueCategory.RawString)
        what = 'raw_string';
    else if (expected === ValueCategory.MultipleChoice)
        what = 'choice';
    else if (expected === ValueCategory.Command)
        what = 'command';
    else if (expected !== null)
        what = 'generic';
    else
        what = null;
    return what;
};

const Intent = adt.data({
    // internally generated intents
    Failed: { command: adt.only(Object, null) },
    Train: { command: adt.only(Object, null), fallbacks: adt.only(Array, null) },
    Back: null,
    More: null,
    Empty: null,
    Debug: null,
    Maybe: null,
    Example: { utterance: adt.only(String), targetCode: adt.only(String) },
    CommandList: { device: adt.only(String, null), category: adt.only(String) },

    // special entries in the grammar
    NeverMind: null, // cancel the current task
    Help: null, // ask for contextual help, or start a new task
    Make: null, // reset and start a new task
    WakeUp: null, // do nothing and wake up the screen

    // easter eggs
    Hello: null,
    Cool: null,
    ThankYou: null,
    Sorry: null,

    Answer: { category: adt.only(ValueCategory), value: adt.only(Ast.Value, Number) },

    // thingtalk
    Program: {
        program: adt.only(Ast.Program)
    },
    Primitive: {
        primitiveType: adt.only('trigger', 'query', 'action'),
        primitive: adt.only(Ast.RulePart)
    },
    Predicate: {
        predicate: adt.only(Ast.BooleanExpression)
    },
    Setup: {
        program: adt.only(Ast.Program)
    },
    PermissionRule: {
        rule: adt.only(Ast.PermissionRule)
    }
});

const SPECIAL_INTENT_MAP = {
    makerule: Intent.Make,
    empty: Intent.Empty,
    back: Intent.Back,
    more: Intent.More,
    nevermind: Intent.NeverMind,
    debug: Intent.Debug,
    help: Intent.Help,
    maybe: Intent.Maybe,
    hello: Intent.Hello,
    cool: Intent.Cool,
    thankyou: Intent.ThankYou,
    sorry: Intent.Sorry,
    wakeup: Intent.WakeUp,
};

function parseSpecial(special, command, previousCommand, previousCandidates) {
    let intent;
    special = special.substring('special:'.length);
    switch (special) {
    case 'yes':
        intent = new Intent.Answer(ValueCategory.YesNo, Ast.Value.Boolean(true));
        intent.isYes = true;
        intent.isNo = false;
        break;
    case 'no':
        intent = new Intent.Answer(ValueCategory.YesNo, Ast.Value.Boolean(false));
        intent.isYes = false;
        intent.isNo = true;
        break;
    case 'failed':
        intent = new Intent.Failed(command);
        break;
    case 'train':
        intent = new Intent.Train(previousCommand, previousCandidates);
        break;
    default:
        if (!SPECIAL_INTENT_MAP[special])
            throw new Error('Unrecognized special ' + special);
        intent = SPECIAL_INTENT_MAP[special];
    }
    return intent;
}

function parseBookeeping(code, entities, command, previousCommand, previousCandidates) {
    switch (code[1]) {
    case 'special':
        return parseSpecial(code[2], command, previousCommand, previousCandidates);

    case 'answer': {
        const value = ThingTalk.NNSyntax.fromNN(code.slice(1), entities);
        return new Intent.Answer(ValueCategory.fromValue(value), value);
    }
    case 'filter': {
        const predicate = ThingTalk.NNSyntax.fromNN(code.slice(1), entities);
        return new Intent.Predicate(predicate);
    }
    case 'category':
        return new Intent.CommandList(null, code[2]);
    case 'commands':
        return new Intent.CommandList(code[3].substring('device:'.length), code[2]);

    case 'choice':
        return new Intent.Answer(ValueCategory.MultipleChoice, parseInt(code[2]));

    default:
        throw new Error('Unrecognized bookkeeping command ' + code[1]);
    }
}

Intent.parse = function parse(json, schemaRetriever, command, previousCommand, previousCandidates) {
    let { code, entities } = json;
    for (let name in entities) {
        if (name.startsWith('SLOT_')) {
            let slotname = json.slots[parseInt(name.substring('SLOT_'.length))];
            let slotType = ThingTalk.Type.fromString(json.slotTypes[slotname]);
            let value = ThingTalk.Ast.Value.fromJSON(slotType, entities[name]);
            entities[name] = value;
        }
    }

    if (code[0] === 'bookkeeping')
        return Promise.resolve(parseBookeeping(code, entities, command, previousCommand, previousCandidates));

    return Promise.resolve().then(() => {
        let program = ThingTalk.NNSyntax.fromNN(code, entities);
        return ThingTalk.Generate.typeCheckProgram(program, schemaRetriever, true).then(() => program);
    }).then((program) => {
        if (program.principal !== null)
            return new Intent.Setup(program);
        else
            return new Intent.Program(program);
    });
};

Intent.parseProgram = function parseProgram(thingtalk, schemaRetriever) {
    return ThingTalk.Grammar.parseAndTypecheck(thingtalk, schemaRetriever, true).then((prog) => {
        if (prog.principal !== null)
            return new Intent.Setup(prog);
        else
            return new Intent.Program(prog);
    });
};

module.exports.Intent = Intent;
module.exports.ValueCategory = ValueCategory;
