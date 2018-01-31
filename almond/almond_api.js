// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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
const Formatter = require('almond/lib/formatter');

module.exports = class AlmondApi {
    constructor(engine) {
        this._engine = engine;
        this._sempre = new SempreClient(undefined, engine.platform.locale);
        this._formatter = new Formatter(this._engine);

        this._outputs = new Set;
    }

    _sendWs(obj) {
        let str = JSON.stringify(obj);
        for (let out of this._outputs)
            out.send(str);
    }
    addOutput(out) {
        this._outputs.add(out);
    }
    removeOutput(out) {
        this._outputs.delete(out);
    }

    notify(appId, icon, outputType, outputValue, currentChannel) {
        return this._formatter.formatForType(outputType, outputValue, currentChannel, 'messages').then((messages) => {
            this._sendWs({ result: {
                appId: appId,
                icon: icon ? Config.S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png' : null,
                raw: outputValue,
                type: outputType,
                formatted: messages
            }});
        });
    }

    notifyError(appId, icon, error) {
        this._sendWs({ error: {
            appId: appId,
            icon: icon ? Config.S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png' : null,
            error: error
        }})
    }

    _findPrimaryIdentity() {
        let identities = this._engine.messaging.getIdentities();
        var omletId = null;
        var email = null;
        var phone = null;
        for (var i = 0; i < identities.length; i++) {
            var id = identities[i];
            if (id.startsWith('omlet:') && omletId === null)
                omletId = id;
            else if (id.startsWith('email:') && email === null)
                email = id;
            else if (id.startsWith('phone:') && phone === null)
                phone = id;
        }
        if (phone !== null)
            return phone;
        if (email !== null)
            return email;
        if (omletId !== null)
            return omletId;
        return null;
    }

    createApp(data) {
        let code = data.code;
        let slots = data.slots || {};
        let locations = data.locations || {};
        let devices = data.devices || {};

        let sharedPrefs = this._engine.platform.getSharedPreferences();
        for (let loc in locations) {
            if (loc === 'home' || loc === 'work') {
                let location = Ast.Value.fromJSON(ThingTalk.Type.Location, locations[loc]);
                sharedPrefs.set('context-$context.location.' + loc, location.toJS());
            }
        }

        return ThingTalk.Grammar.parseAndTypecheck(code, this._engine.schemas, true).then((program) => {
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

            // step 2, for each primitive...
            return Promise.all(primitives.map(([primId, prim]) => {
                return Promise.resolve().then(() => {
                    if (prim.selector.principal) {
                        if (prim.selector.principal.type == 'tt:contact_name') {
                            let slot = slots[`principal_${primId}`];
                            if (!slot)
                                throw new TypeError(`missing slot principal_${primId}`);
                            prim.selector.principal = Ast.Value.fromJSON(slot);
                        }
                        let messaging = this._engine.messaging;
                        let principal = prim.selector.principal;
                        if (principal.value.startsWith(messaging.type + '-account:'))
                            return;
                        return messaging.getAccountForIdentity(principal.value).then((account) => {
                            if (account) {
                                let accountPrincipal = messaging.type + '-account:' + account;
                                console.log('Converted ' + principal.value + ' to ' + accountPrincipal);
                                prim.selector.principal = Ast.Value.Entity(accountPrincipal, 'tt:contact', principal.display);
                            }
                            return true;
                        });
                    } else {
                        if (prim.selector.id === null)
                            prim.selector.id = devices[primId];
                        if (typeof prim.selector.id !== 'string')
                            throw new TypeError(`must select a device for primitive ${primId}`);
                        /*if (!this._engine.devices.hasDevice(prim.selector.id)) {
                            throw new TypeError(`invalid device ${prim.selector.id} for primitive ${primId}`);
                        }*/
                    }
                }).then(() => {
                    let [toFill, toConcretize] = ThingTalk.Generate.computeSlots(prim);
                    if (toFill.length > 0)
                        throw new TypeError(`cannot have slots in this API, call /parse first`);
                    for (let slot of toConcretize) {
                        if (slot.value.isLocation && slot.value.value.isRelative) {
                            let relativeTag = slot.value.value.relativeTag;
                            if (relativeTag === 'current_location')
                                slot.value = locations['current_location'] ? Ast.Value.fromJSON(ThingTalk.Type.Location, locations['current_location']) : null;
                            else
                                slot.value = this._resolveUserContext('$context.location.' + relativeTag);
                            if (!slot.value)
                                throw new TypeError(`missing location ${relativeTag} in primitive ${primId}`);
                        }
                    }
                });
            })).then(() => {
                let gettext = this._engine.platform.getCapability('gettext');
                let description = Describe.describeProgram(gettext, program);
                let name = Describe.getProgramName(gettext, program);

                let icon = null;
                for (let [primId, prim] of primitives) {
                    if (prim.selector.kind !== 'org.thingpedia.builtin.thingengine.remote' &&
                        !prim.selector.kind.startsWith('__dyn')
                        && prim.selector.id) {
                        let device = this._engine.devices.getDevice(prim.selector.id);
                        icon = device ? device.kind : null;
                        if (icon) break;
                    }
                }

                let appMeta = slots;
                appMeta.$icon = icon;

                let [newprogram, sendprograms] = ThingTalk.Generate.factorProgram(this._engine.messaging, program);

                let app = null;
                if (newprogram !== null) {
                    let code = Ast.prettyprint(newprogram);
                    app = this._engine.apps.loadOneApp(code, appMeta, undefined, undefined,
                                                       name, description, true);
                } else {
                    app = Promise.resolve(null);
                }

                return app.then((app) => {
                    let identity = this._findPrimaryIdentity();
                    for (let [principal, program] of sendprograms) {
                        //console.log('program: ' + Ast.prettyprint(program));
                        this._engine.remote.installProgramRemote(principal.value, identity, program).catch((e) => {
                            if (app) {
                                app.reportError(e);
                                // destroy the app if the user denied it
                                this._engine.apps.removeApp(app);
                            } else {
                                console.log('Ignored error from permission control request: ' + e.code + ': ' + e.message);
                                console.log(e.stack);
                            }
                        });
                    }

                    // drain the queue of results from the app
                    let results = [];
                    let errors = [];

                    function loop() {
                        if (!app)
                            return;
                        return app.mainOutput.next().then(({ item: next, resolve, reject }) => {
                            if (next.isDone) {
                                resolve();
                                return;
                            }

                            let value;
                            if (next.isNotification) {
                                return this._formatter.formatForType(next.outputType, next.outputValue, next.currentChannel, 'messages').then((messages) => {
                                    results.push({ raw: next.outputValue, type: next.outputType, formatted: messages });
                                    resolve();
                                    return loop.call(this);
                                }).catch((e) => {
                                    reject(e);
                                    return loop.call(this);
                                });
                            } else if (next.isError) {
                                errors.push(next.error);
                            } else if (next.isQuestion) {
                                let e = new Error('User cancelled');
                                e.code = 'ECANCELLED';
                                reject(e);
                            }
                            resolve();
                            return loop.call(this);
                        });
                    }

                    return loop.call(this).then(() => {
                        return {
                            uniqueId: app.uniqueId,
                            description: app.description,
                            code: app.code,
                            icon: app.icon ? Config.S3_CLOUDFRONT_HOST + '/icons/' + app.icon + '.png' : null,
                            slots: slots,
                            results, errors
                        }
                    });
                });
            });
        }).catch((e) => {
            console.error(e.stack);
            if (e instanceof TypeError)
                return { error: e.message };
            else
                throw e;
        });
    }

    _doParse(sentence) {
        return this._sempre.sendUtterance(sentence, null, null).then((candidates) => {
            if (candidates[0].score === 'Infinity')
                candidates = [candidates[0]];
            candidates = candidates.filter((c) => c.prob >= 0.1);
            return candidates;
        });
    }

    parse(sentence, targetJson) {
        return Promise.resolve().then(() => {
            if (targetJson)
                return [{ score: 'Infinity', prob: 1, answer: targetJson }];
            else
                return this._doParse(sentence);
        }).then((candidates) => {
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
                icon: Config.S3_CLOUDFRONT_HOST + '/icons/' + device.kind + '.png',
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
                    selector.device = device;
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
            if (devices.length === 1) {
                selector.device = devices[0];
                selector.id = devices[0].uniqueId;
            }

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

    _resolveUserContext(variable) {
        let sharedPrefs = this._engine.platform.getSharedPreferences();

        switch (variable) {
            case '$context.location.current_location':
                return null;
            case '$context.location.home':
            case '$context.location.work':
                let value = sharedPrefs.get('context-' + variable);
                if (value !== undefined)
                    return Ast.Value.fromJSON(Type.Location, value);
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
                    /*for (let slot of toFill) {
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
                    }*/

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

                    return true;
                });
            })).then((res) => {
                if (res === null || res.some((x) => !x))
                    return [null, null];

                // step 2.5 extract extra info
                let entityValues = [];
                function extractEntityValuesInvocation(prim) {
                    for (let in_param of prim.in_params) {
                        if (in_param.value.isEntity)
                            entityValues.push(in_param.value)
                    }
                    (function filterRecurse(expr) {
                        if (expr.isTrue || expr.isFalse)
                            return
                        if (expr.isAnd || expr.isOr) {
                            expr.operands.forEach(filterRecurse)
                            return
                        }
                        if (expr.isNot) {
                            filterRecurse(expr.expr)
                            return
                        }
                        if (expr.filter.value.isEntity)
                            entityValues.push(expr.filter.value)
                    })(prim.filter)
                }
                primitives.forEach(([primId, prim]) => {
                    extractEntityValuesInvocation(prim);
                });
                let contacts = new Map;
                for (let entity of entityValues) {
                    if (entity.type === 'tt:contact')
                        contacts.set(entity.value, entity.display);
                    else if (entity.type === 'tt:email_address')
                        contacts.set('email:' + entity.value, entity.display);
                    else if (entity.type === 'tt:phone_number')
                        contacts.set('phone:' + entity.value, entity.display);
                }
                contacts = Array.from(contacts.entries());

                const messagingType = this._engine.messaging.type + '-account:'
                return Q.all(contacts.map(([contact, display]) => {
                    return Q.try(() => {
                        if (contact.startsWith(messagingType))
                            return contact.split(':')[1];
                        else
                            return this._engine.messaging.getAccountForIdentity(contact);
                    }).then((account) => {
                        return this._engine.messaging.getUserByAccount(account);
                    }).then((user) => {
                        return this._engine.messaging.getBlobDownloadLink(user.thumbnail).then((thumbnail) => ({
                            contact: contact,
                            omletAccount: user.account,
                            omletName: user.name,
                            display: display,
                            profileUrl: thumbnail
                        })).catch((e) => ({
                            contact: contact,
                            omletAccount: user.account,
                            omletName: user.name,
                            display: display,
                            profileUrl: 'https://openclipart.org/image/2400px/svg_to_png/202776/pawn.png'
                        }));
                    });
                })).then((contacts) => {
                    return [res, contacts];
                });
            }).then(([res, contacts]) => {
                if (res === null)
                    return null;

                // step 3 put everything toghether

                let icon = null;
                for (let [primId, prim] of primitives) {
                    if (prim.selector.kind !== 'org.thingpedia.builtin.thingengine.remote' &&
                        !prim.selector.kind.startsWith('__dyn')
                        && prim.selector.id) {
                        let device = prim.selector.device;//this._engine.devices.getDevice(prim.selector.id);
                        icon = device.kind;
                        break;
                    }
                }
                if (icon === null)
                    icon = 'org.thingpedia.builtin.thingengine.builtin';
                icon = Config.S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png';

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
                    locations: locations,
                    contacts: contacts
                };
            });
        });
    }
}
