// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');
const util = require('util');

const Almond = require('almond');
const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const Describe = ThingTalk.Describe;

const Config = require('../config');

// FIXME move this somewhere better
const SempreClient = require('almond/lib/sempreclient');
const Intent = require('almond/lib/semantic').Intent;

module.exports = class AlmondApi {
    constructor(engine) {
        this._engine = engine;
        this._sempre = new SempreClient(undefined, engine.platform.locale);
    }

    parse(sentence) {
        return this._sempre.sendUtterance(sentence, null, null).then((candidates) => {
            if (candidates[0].score === 'Infinity')
                candidates = [candidates[0]];
            candidates = candidates.filter((c) => c.prob >= 0.1);

            return Promise.all(candidates.slice(0, 5).map((candidate) => {
                return this._processCandidate(candidate).then((result) => {
                    return result;
                });
            })).then((programs) => {
                return programs.filter((r) => r !== null);
            });
        }).then((programs) => ({ candidates: programs }));
    }

    _tryConfigureDevice(kind) {
        return this._engine.thingpedia.getDeviceSetup([kind]).then((factories) => {
            var factory = factories[kind];
            if (!factory) {
                // something funky happened or thingpedia did not recognize the kind
                return [null, null];
            }

            if (factory.type === 'none') {
                return this._engine.devices.loadOneDevice({ kind: factory.kind }, true).then((device) => {
                    return [device, null];
                });
            } else if (factory.type === 'link' || factory.type === 'oauth2') {
                let copy = {};
                copy.factoryType = 'link';
                copy.name = factory.text;
                copy.kind = factory.kind;
                copy.href = factory.type === 'link' ? factory.href : '/me/devices/oauth2/' + factory.kind;
                return [null, copy];
            } else {
                let copy = {};
                copy.factoryType = 'other';
                copy.kind = kind;
                copy.fields = factory.fields;
                copy.choices = factory.choices;
                return [null, copy];
            }
        });
    }

    _chooseDevice(selector, primId, devMap) {
        function describeDevice(device) {
            return {
                uniqueId: device.uniqueId,
                name: device.name,
                description: device.description,
                kind: device.kind,
                icon: Config.S3_CLOUDFRONT_HOST + '/' + device.kind + '.png',
            };
        }

        let kind = selector.kind;
        if (selector.id !== null) {
            if (this._engine.devices.hasDevice(selector.id)) {
                devMap[primId] = [describeDevice(this._engine.devices.getDevice(selector.id))];
            } else {
                return false;
            }
        }

        let devices = this._engine.devices.getAllDevicesOfKind(kind);

        if (devices.length === 0) {
            return this._tryConfigureDevice(kind).then(([device, factory]) => {
                if (device) {
                    selector.id = device.uniqueId;
                    devMap[primId] = [describeDevice(device)];
                    return true;
                } else if (factory) {
                    devMap[primId] = factory;
                    return true;
                } else {
                    return true;
                }
            });
        } else {
            if (devices.length === 1)
                selector.id = devices[0].uniqueId;

            devMap[primId] = devices.map((dev) => describeDevice(dev));
            return true;
        }
    }

    _choosePrincipal(prim, primId, slots) {
        let principal = prim.selector.principal;
        if (principal.type === 'tt:contact_name') {
            slots[`principal_${primId}`] = {
                primId: primId,
                name: '__principal',
                type: 'Entity(tt:contact)',
                contact_name: prim.selector.principal.value
            };
            return true;
        } else {
            let messaging = this._engine.messaging;
            if (!messaging.isAvailable)
                return false;
            if (principal.value.startsWith(messaging.type + '-account:'))
                return true;
            return messaging.getAccountForIdentity(principal.value).then((account) => {
                if (account) {
                    let accountPrincipal = messaging.type + '-account:' + account;
                    console.log('Converted ' + principal.value + ' to ' + accountPrincipal);
                    prim.selector.principal = Ast.Value.Entity(accountPrincipal, 'tt:contact', principal.display);
                }
                return true;
            });
        }
    }

    _valueFromJs(category, value) {
        if (category.isLocation)
            return Ast.Value.Location(Ast.Location.Absolute(value.y, value.x, value.display||null));
        else
            return null; // FIXME handle other types when we have more context values
    }

    _resolveUserContext(variable) {
        let sharedPrefs = this._engine.platform.getSharedPreferences();

        switch (variable) {
            case '$context.location.current_location':
                return null;
            case '$context.location.home':
            case '$context.location.work':
                let value = sharedPrefs.get('context-' + variable);
                if (value !== undefined)
                    return this._valueFromJs(category, value);
                else
                    return null;
            default:
                throw new TypeError('Invalid variable ' + variable);
        }
    }

    _processCandidate(candidate) {
        return Intent.parseString(candidate.answer, this._engine.schemas, null, null, null).then((intent) => {
            if (!intent.isProgram && !intent.isPrimitive) {
                return null;
            }

            let program;
            if (intent.isPrimitive)
                program = ThingTalk.Generate.primitiveProgram(intent.primitiveType, intent.primitive);
            else
                program = intent.program;

            // step 1: list the primitives
            let primitives = [];
            program.rules.forEach((rule, i) => {
                if (rule.trigger)
                    primitives.push([`r${i}_t`, rule.trigger]);
                rule.queries.forEach((query, j) => {
                    primitives.push([`r${i}_q${j}`, query]);
                })
                rule.actions.forEach((action, j) => {
                    if (!action.selector.isBuiltin)
                        primitives.push([`r${i}_a${j}`, action]);
                });
            });
            let primMap = {};
            for (let [primId, prim] of primitives)
                primMap[primId] = prim.selector.kind + ':' + prim.channel;

            // step 2, for each primitive...
            let devices = {};
            let slots = {};
            let locations = {};
            let nextSlotId = 0;
            let gettext = this._engine.platform.getCapability('gettext');
            let description = Describe.describeProgram(gettext, program);

            return Promise.all(primitives.map(([primId, prim]) => {
                // step 2.1 choose the principal or device
                return Promise.resolve().then(() => {
                    if (prim.selector.principal !== null) {
                        return this._choosePrincipal(prim, primId, slots);
                    } else {
                        return this._chooseDevice(prim.selector, primId, devices);
                    }
                }).then((ok) => {
                    if (!ok)
                        return false;

                    // step 2.2 slot fill
                    let [toFill, toConcretize] = ThingTalk.Generate.computeSlots(prim);
                    for (let slot of toFill) {
                        let slotId = nextSlotId++;
                        let argname = slot.name;
                        let schema = prim.schema;
                        let type = schema.inReq[argname] || schema.inOpt[argname] || schema.out[argname];
                        if (slot instanceof Ast.Filter && slot.operator === 'contains')
                            type = type.elem;
                        let question;
                        let index = schema.index[argname];
                        if (slot instanceof Ast.InputParam ||
                            (slot instanceof Ast.Filter && slot.operator === '='))
                            question = schema.questions[index];
                        program.params.push({name: '__slot_' + slotId, type: type});
                        slot.value = Ast.Value.VarRef('__slot_' + slotId);
                        slots[slotId] = {
                            primId: primId,
                            name: slot.name,
                            type: String(type),
                            question: question
                        };
                    }

                    for (let slot of toConcretize) {
                        let argname = slot.name;
                        let schema = prim.schema;
                        let type = schema.inReq[argname] || schema.inOpt[argname] || schema.out[argname];
                        if (slot instanceof Ast.Filter && slot.operator === 'contains')
                            type = type.elem;
                        if (slot.value.isEntity && slot.value.type === 'tt:contact_name') {
                            let slotId = nextSlotId++;
                            program.params.push({name: '__slot_' + slotId, type: type});
                            slot.value = Ast.Value.VarRef('__slot_' + slotId);
                            slots[slotId] = {
                                primId: primId,
                                name: slot.name,
                                type: String(type),
                                contact_name: slot.value.value
                            };
                        } else if (slot.value.isLocation && slot.value.value.isRelative) {
                            let value = this._resolveUserContext('$context.location.' + slot.value.value.relativeTag);
                            if (value !== null) {
                                slot.value.value = value;
                                locations[slot.value.value.relativeTag] = true;
                            } else {
                                locations[slot.value.value.relativeTag] = false;
                            }
                        }
                    }
                });
            })).then((res) => {
                if (res === null || res.some((x) => x === null))
                    return null;

                // step 3 put everything toghether

                let icon = null;
                for (let [primId, prim] of primitives) {
                    if (prim.selector.kind !== 'org.thingpedia.builtin.thingengine.remote' &&
                        !prim.selector.kind.startsWith('__dyn')
                        && prim.selector.id) {
                        let device = this._engine.devices.getDevice(prim.selector.id);
                        icon = device.kind;
                        break;
                    }
                }
                if (icon === null)
                    icon = 'org.thingpedia.builtin.thingengine.builtin';
                icon = Config.S3_CLOUDFRONT_HOST + '/' + icon + '.png';

                let commandClass = 'rule';
                if (primitives.length === 1) {
                    let rule = program.rules[0];
                    if (rule.trigger)
                        commandClass = 'trigger';
                    else if (rule.queries.length)
                        commandClass = 'query';
                    else
                        commandClass = 'action';
                }


                let code = Ast.prettyprint(program);

                return {
                    score: candidate.score,
                    code: code,
                    description: description,
                    icon: icon,
                    commandClass: commandClass,
                    primitives: primMap,
                    devices: devices,
                    slots: slots,
                    locations: locations
                };
            });
        });
    }
}
