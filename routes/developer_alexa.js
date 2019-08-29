// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const highlightjs = require('highlight.js');
const ThingTalk = require('thingtalk');

const db = require('../util/db');
const alexaModelsModel = require('../model/alexa_model');
const userModel = require('../model/user');
const schemaModel = require('../model/schema');
const user = require('../util/user');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../util/errors');
const { validateTag } = require('../util/validation');
const DatasetUtils = require('../util/dataset');
const { clean } = require('../util/tokenize');
const iv = require('../util/input_validation');
const I18n = require('../util/i18n');
const { makeRandom } = require('../util/random');

const router = express.Router();

router.get('/', user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    db.withTransaction((dbClient) => {
        return alexaModelsModel.getByOwner(dbClient, req.user.developer_org);
    }).then((models) => {
        res.render('dev_alexa', { page_title: req._("Almond Developer Console - Alexa Skills"),
                                  models });
    }).catch(next);
});

router.post('/create', user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ tag: 'string', language: 'string', call_phrase: 'string', anonymous_user: 'string',
                      for_devices: '?string', public: 'boolean' }), (req, res, next) => {
    if (!I18n.get(req.body.language))
        throw new BadRequestError(req._("Unsupported language"));
    const language = I18n.localeToLanguage(req.body.language);
    validateTag(req.body.tag, req.user, user.Role.NLP_ADMIN);

    db.withTransaction(async (dbClient) => {
        try {
            const existing = await alexaModelsModel.getByTagForUpdate(dbClient, language, req.body.tag);
            if (existing && existing.owner !== req.user.developer_org)
                throw new ForbiddenError(req._("A model with this ID already exists."));
        } catch(e) {
            if (e.code !== 'ENOENT')
                throw e;
        }

        const anonymousUser = (await userModel.getByName(dbClient, req.body.anonymous_user))[0];
        if (!anonymousUser)
            throw new BadRequestError(req._("No such user %s").format(req.body.anonymous_user));

        if (req.body.for_devices && !/^[a-zA-Z_][0-9a-zA-Z_.-]*(?:[ ,][a-zA-Z_][0-9a-zA-Z_.-]*)*$/.test(req.body.for_devices))
            throw new BadRequestError(req._("Invalid device list"));

        const devices = req.body.for_devices ? req.body.for_devices.split(/[ ,]/g) : [];
        const missing = await schemaModel.findNonExisting(dbClient, devices, req.user.developer_org);
        if (missing.length > 0)
            throw new BadRequestError(req._("The following devices do not exist or are not visible: %s").format(missing.join(req._(", "))));

        await alexaModelsModel.create(dbClient, {
            language,
            tag: req.body.tag,
            call_phrase: req.body.call_phrase,
            owner: req.user.developer_org,
            access_token: req.body.public ? null : makeRandom(32),
            anonymous_user: anonymousUser.id,
            all_devices: devices.length === 0,
        }, devices);

        res.redirect(303, '/developers/alexa/' + language + '/' + req.body.tag);
    }).catch(next);
});

function ttTypeToAlexaType(type, enums) {
    if (type.isBoolean) {
        return 'org.thingpedia.Boolean';
    } else if (type.isString) {
        return 'AMAZON.SearchQuery';
    } else if (type.isEntity) {
        switch (type.type) {
        case 'tt:stock_id':
            return 'AMAZON.Corporation';
        case 'tt:country':
            return 'AMAZON.Country';
        case 'tt:iso_lang_code':
            return 'AMAZON.Language';

        case 'tt:phone_number':
        case 'tt:email_address':
        case 'tt:contact_name':
            // email_address/phone_number will be looked up in the address book later
            return 'AMAZON.Person';

        case 'tt:username':
            // not great, but better than nothing
            return 'AMAZON.US_FIRST_NAME';

        case 'tt:url':
        case 'tt:picture':
        case 'tt:hashtag':
            // these are not supported
            return null;

        default:
            // everything else is a custom slot
            return 'org.thingpedia.Entity.' + type.type.replace(':', '.');
        }
    } else if (type.isNumber) {
        // the number comes normalized from Alexa
        return 'AMAZON.Number';
    } else if (type.isMeasure && type.unit === 'ms') {
        return 'AMAZON.Duration';
    } else if (type.isEnum) {
        const enumstring = type.entries.join(',');
        if (enums.has(enumstring))
            return 'org.thingpedia.Enum_' + enums.get(enumstring);

        const id = enums.size;
        enums.set(enumstring, id);
        return 'org.thingpedia.Enum_' + id;

    } else if (type.isTime) {
        return 'AMAZON.TIME';
    } else if (type.isDate) {
        return 'AMAZON.DATE';
    } else if (type.isLocation) {
        // FIXME we should recognize different resolutions of Location: city or street address
        return 'AMAZON.US_CITY';
    } else {
        // unsupported
        return null;
    }
}

function *getSampleUtterances(ex, _) {
    for (let preprocessed of ex.preprocessed) {
        // remove the $ marker from slot tokens
        preprocessed = preprocessed.split(' ')
            .map((tok) => tok.startsWith('$') ? tok.substring(1).replace(/:.*\}$/,'}') : tok).join(' ');

        switch (ex.type) {
        case 'query':
            if (!preprocessed.startsWith(',')) {
                yield _("get %s").format(preprocessed);
                yield _("show me %s").format(preprocessed);
                yield _("tell me %s").format(preprocessed);
                yield _("what are %s").format(preprocessed);
                yield _("list %s").format(preprocessed);
                break;
            } else {
                preprocessed = preprocessed.substring(1).trim();
                // fall through
            }
        case 'action':
        case 'program':
            yield preprocessed;
            yield _("please %s").format(preprocessed);
            break;
        }
    }
}

function exampleToCode(example) {
    const clone = example.clone();
    clone.id = -1;
    clone.utterances = [];
    clone.preprocessed = [];
    clone.annotations = {};
    return clone.prettyprint();
}

function intentsToInteractionModel(model, rows, req) {
    const dataset = DatasetUtils.examplesToDataset(model.tag, model.language, rows);
    const parsed = ThingTalk.Grammar.parse(dataset).datasets[0];

    const alexaIntents = [];
    const enums = new Map;
    const gettext = I18n.get(model.language);

    for (let ex of parsed.examples) {
        ex.samples = [];
        ex.target_code = exampleToCode(ex);

        if (ex.type === 'stream') {
            ex.unsupported = true;
            ex.unsupported_reason = req._("Alexa does not support monitoring or notifications");
            continue;
        }

        const slots = [];
        let ok = true;
        for (let arg in ex.args) {
            const type = ttTypeToAlexaType(ex.args[arg], enums);
            if (!type) {
                ok = false;
                ex.unsupported = true;
                ex.unsupported_reason = req._("Unsupported slot %s of type %s").format(arg, ex.args[arg]);
                break;
            }

            slots.push({
                name: arg,
                type
            });
        }
        if (!ok)
            continue;

        ex.samples = Array.from(getSampleUtterances(ex, gettext.gettext));

        alexaIntents.push({
            name: ex.annotations.name,
            slots,
            samples: ex.samples
        });
    }

    const types = [{
        name: 'org.thingpedia.Boolean',
        values: [{
            id: 'true',
            name: {
                value: 'true',
            }
        }, {
            id: 'true',
            name: {
                value: 'yes',
            }
        }, {
            id: 'false',
            name: {
                value: 'false',
            }
        }, {
            id: 'false',
            name: {
                value: 'no',
            }
        }]
    }];

    for (let [enumstring, enumid] of enums) {
        const enumType = {
            name: 'org.thingpedia.Enum_' + enumid,
            values: []
        };
        for (let value of enumstring.split(',')) {
            enumType.values.push({
                id: value,
                name: {
                    value: clean(value)
                }
            });
        }
        types.push(enumType);
    }

    const interactionModel = {
        interactionModel: {
            languageModel: {
                invocationName: model.call_phrase,
                intents: alexaIntents,
                types
            }
        }
    };

    return [parsed.examples, interactionModel];
}

router.get('/:language/:tag', user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    db.withClient(async (dbClient) => {
        const model = await alexaModelsModel.getByTag(dbClient, req.params.language, req.params.tag);
        if (model.owner !== req.user.developer_org)
            throw new NotFoundError();

        const examples = await alexaModelsModel.getIntents(dbClient, model.id);
        const [intents, alexaInteractionModel] = intentsToInteractionModel(model, examples, req);

        res.render('dev_alexa_model', { page_title: req._("Almond Developer Console - Alexa Skills"),
                                        model, intents,
                                        interactionModelJSON: highlightjs.highlight('json', JSON.stringify(alexaInteractionModel, undefined, 2)).value });
    }).catch(next);
});

module.exports = router;
