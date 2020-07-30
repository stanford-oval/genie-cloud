// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

const adt = require('adt');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

const ValueCategory = adt.data({
    YesNo: null,
    MultipleChoice: null,

    Number: null,
    Measure: { unit: adt.only(String) },
    RawString: null,
    Password: null,
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
    Command: null,
    More: null
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
    else if (expected === ValueCategory.Password)
        what = 'password';
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
    // internally generated intents that have no thingtalk representation
    Unsupported: { platformData: adt.any },
    Example: { utterance: adt.only(String), targetCode: adt.only(String), platformData: adt.any },
    Failed: { command: adt.only(String, null), platformData: adt.any },

    // bookkeeping intents that require special handling in the dialogues and the dispatcher
    // most of these are obsolete
    Train: { command: adt.only(Object, null), fallbacks: adt.only(Array, null), thingtalk: adt.only(Ast.Input), platformData: adt.any },
    Back: { thingtalk: adt.only(Ast.Input), platformData: adt.any },
    More: { thingtalk: adt.only(Ast.Input), platformData: adt.any },
    Empty: { thingtalk: adt.only(Ast.Input), platformData: adt.any },
    Debug: { thingtalk: adt.only(Ast.Input), platformData: adt.any },
    Maybe: { thingtalk: adt.only(Ast.Input), platformData: adt.any },
    CommandList: { device: adt.only(String, null), category: adt.only(String), thingtalk: adt.only(Ast.Input), platformData: adt.any },
    NeverMind: { thingtalk: adt.only(Ast.Input), platformData: adt.any }, // cancel the current task
    Stop: { thingtalk: adt.only(Ast.Input), platformData: adt.any }, // cancel the current task, quietly
    Help: { thingtalk: adt.only(Ast.Input), platformData: adt.any }, // ask for contextual help, or start a new task
    Make: { thingtalk: adt.only(Ast.Input), platformData: adt.any }, // reset and start a new task
    WakeUp: { thingtalk: adt.only(Ast.Input), platformData: adt.any }, // do nothing and wake up the screen
    Answer: { category: adt.only(ValueCategory), value: adt.only(Ast.Value, Number), thingtalk: adt.only(Ast.Input), platformData: adt.any },

    // thingtalk
    Program: {
        program: adt.only(Ast.Program),
        thingtalk: adt.only(Ast.Input),
        platformData: adt.any
    },
    Predicate: {
        predicate: adt.only(Ast.BooleanExpression),
        thingtalk: adt.only(Ast.Input),
        platformData: adt.any
    },
    PermissionRule: {
        rule: adt.only(Ast.PermissionRule),
        thingtalk: adt.only(Ast.Input),
        platformData: adt.any
    },
    DialogueState: {
        prediction: adt.only(Ast.DialogueState),
        thingtalk: adt.only(Ast.DialogueState),
        platformData: adt.only
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
    stop: Intent.Stop,
    wakeup: Intent.WakeUp,
};

function parseSpecial(thingtalk, context) {
    let intent;
    switch (thingtalk.intent.type) {
    case 'yes':
        intent = new Intent.Answer(ValueCategory.YesNo, new Ast.Value.Boolean(true), thingtalk, context.platformData);
        intent.isYes = true;
        intent.isNo = false;
        break;
    case 'no':
        intent = new Intent.Answer(ValueCategory.YesNo, new Ast.Value.Boolean(false), thingtalk, context.platformData);
        intent.isYes = false;
        intent.isNo = true;
        break;
    case 'failed':
        intent = new Intent.Failed(context.command, context.platformData);
        break;
    case 'train':
        intent = new Intent.Train(context.previousCommand, context.previousCandidates, thingtalk, context.platformData);
        break;
    default:
        if (SPECIAL_INTENT_MAP[thingtalk.intent.type])
            intent = new (SPECIAL_INTENT_MAP[thingtalk.intent.type])(thingtalk, context.platformData);
        else
            intent = new Intent.Failed(context.command, context.platformData);
    }
    return intent;
}

Intent.fromThingTalk = function(thingtalk, context) {
    if (thingtalk.isBookkeeping) {
        if (thingtalk.intent.isSpecial)
            return parseSpecial(thingtalk, context);
        else if (thingtalk.intent.isAnswer)
            return new Intent.Answer(ValueCategory.fromValue(thingtalk.intent.value), thingtalk.intent.value, thingtalk, context.platformData);
        else if (thingtalk.intent.isPredicate)
            return new Intent.Predicate(thingtalk.intent.predicate, thingtalk, context.platformData);
        else if (thingtalk.intent.isCommandList)
            return new Intent.CommandList(thingtalk.intent.device.isUndefined ? null : String(thingtalk.intent.device.toJS()), thingtalk.intent.category, thingtalk, context.platformData);
        else if (thingtalk.intent.isChoice)
            return new Intent.Answer(ValueCategory.MultipleChoice, thingtalk.intent.value, thingtalk, context.platformData);
        else
            throw new TypeError(`Unrecognized bookkeeping intent`);
    } else if (thingtalk.isProgram) {
        return new Intent.Program(thingtalk, thingtalk, context.platformData);
    } else if (thingtalk.isPermissionRule) {
        return new Intent.PermissionRule(thingtalk, thingtalk, context.platformData);
    } else if (thingtalk.isDialogueState) {
        return new Intent.DialogueState(thingtalk, thingtalk, context.platformData);
    } else {
        throw new TypeError(`Unrecognized ThingTalk command: ${thingtalk.prettyprint()}`);
    }
};

Intent.parse = async function parse(json, schemaRetriever, context) {
    if ('program' in json)
        return Intent.fromThingTalk(await ThingTalk.Grammar.parseAndTypecheck(json.program, schemaRetriever, true), context);

    let { code, entities } = json;
    for (let name in entities) {
        if (name.startsWith('SLOT_')) {
            let slotname = json.slots[parseInt(name.substring('SLOT_'.length))];
            let slotType = ThingTalk.Type.fromString(json.slotTypes[slotname]);
            let value = Ast.Value.fromJSON(slotType, entities[name]);
            entities[name] = value;
        }
    }

    const thingtalk = ThingTalk.NNSyntax.fromNN(code, entities);
    await thingtalk.typecheck(schemaRetriever, true);
    return Intent.fromThingTalk(thingtalk, context);
};

Intent.parseThingTalk = async function parseThingTalk(code, schemaRetriever, context) {
    return Intent.fromThingTalk(await ThingTalk.Grammar.parseAndTypecheck(code, schemaRetriever, true), context);
};

module.exports.Intent = Intent;
module.exports.ValueCategory = ValueCategory;
