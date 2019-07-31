// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const { request, sessionRequest } = require('./scaffold');
const { login, } = require('../login');

const db = require('../../util/db');

async function getAccessToken(session) {
    return JSON.parse(await sessionRequest('/user/token', 'POST', '', session, {
        accept: 'application/json',
    })).token;
}

function makeAlexaRequest(session, accessToken, request) {
    return JSON.stringify({
        version: "1.0",
        session: {
            new: true,
            sessionId: "amzn1.echo-api.session." + session,
            application: {
                applicationId: "amzn1.ask.skill.123456789"
            },
            attributes: {},
            user: {
                userId: "amzn1.ask.account.123456789",
                accessToken: accessToken,
                permissions: {}
            }
        },
        context: {
            // ignored...
        },

        request,
    });
}

async function testAlexa(accessToken) {
    const session1 = '1';
    const response = JSON.parse(await request('/me/api/alexa', 'POST', makeAlexaRequest(session1, accessToken, {
        type: 'IntentRequest',
        requestId: '123456789',
        timestamp: '2019-07-31T19:20:29.876Z',
        dialogState: 'STARTED',
        locale: 'en-US',
        intent: {
            name: 'org.thingpedia.builtin.thingengine.builtin.Hello',
            confirmationStatus: 'NONE',
            slots: {}
        }

    }), {
        dataContentType: 'application/json',
    }));
    assert.deepStrictEqual(response, {
       response: {
         outputSpeech: {
           text: 'Hi!\n',
           type: 'PlainText'
         },
         shouldEndSession: true
       },
       sessionAttributes: {},
       version: '1.0'
     });

     const response2 = JSON.parse(await request('/me/api/alexa', 'POST', makeAlexaRequest(session1, accessToken, {
        type: 'IntentRequest',
        requestId: '123456789',
        timestamp: '2019-07-31T19:20:29.876Z',
        dialogState: 'STARTED',
        locale: 'en-US',
        intent: {
            name: 'org.thingpedia.builtin.thingengine.builtin.OpenUrl',
            confirmationStatus: 'NONE',
            slots: {}
        }

    }), {
        dataContentType: 'application/json',
    }));
    assert.deepStrictEqual(response2, {
       response: {
         outputSpeech: {
           text: 'What URL do you want to open?\n',
           type: 'PlainText'
         },
         shouldEndSession: false
       },
       sessionAttributes: {},
       version: '1.0'
    });

    const response3 = JSON.parse(await request('/me/api/alexa', 'POST', makeAlexaRequest(session1, accessToken, {
        type: 'IntentRequest',
        requestId: '123456789',
        timestamp: '2019-07-31T19:20:29.876Z',
        dialogState: 'STARTED',
        locale: 'en-US',
        intent: {
            name: 'org.thingpedia.builtin.thingengine.builtin.OpenUrl',
            confirmationStatus: 'NONE',
            slots: {
                p_url: {
                    name: 'p_url',
                    value: 'https://google.com',
                    resolutions: {}
                }
            }
        }

    }), {
        dataContentType: 'application/json',
    }));
    assert.deepStrictEqual(response3, {
       response: {
         outputSpeech: {
           text: 'Ok, I\'m going to open https://google.com.\nSorry, that did not work: Opening files is not implemented in this Almond.\n',
           type: 'PlainText'
         },
         shouldEndSession: true
       },
       sessionAttributes: {},
       version: '1.0'
    });

    const session2 = '2';
    const response4 = JSON.parse(await request('/me/api/alexa/@org.thingpedia.alexa.test', 'POST', makeAlexaRequest(session2, accessToken, {
        type: 'IntentRequest',
        requestId: '123456789',
        timestamp: '2019-07-31T19:20:29.876Z',
        dialogState: 'STARTED',
        locale: 'en-US',
        intent: {
            name: 'org.thingpedia.builtin.thingengine.builtin.OpenUrl',
            confirmationStatus: 'NONE',
            slots: {}
        }

    }), {
        dataContentType: 'application/json',
    }));
    assert.deepStrictEqual(response4, {
       response: {
         outputSpeech: {
           text: 'What URL do you want to open?\n',
           type: 'PlainText'
         },
         shouldEndSession: false
       },
       sessionAttributes: {},
       version: '1.0'
    });

    const session3 = '3';
    const response5 = JSON.parse(await request('/me/api/alexa/@org.thingpedia.alexa.test', 'POST', makeAlexaRequest(session3, null, {
        type: 'IntentRequest',
        requestId: '123456789',
        timestamp: '2019-07-31T19:20:29.876Z',
        dialogState: 'STARTED',
        locale: 'en-US',
        intent: {
            name: 'org.thingpedia.builtin.thingengine.builtin.MonitorCurrentLocation',
            confirmationStatus: 'NONE',
            slots: {}
        }

    }), {
        dataContentType: 'application/json',
    }));
    assert.deepStrictEqual(response5, {
       response: {
         outputSpeech: {
           text: 'This user is a demo only, and cannot enable long-running commands. To execute this command, you must register an account for yourself.\n',
           type: 'PlainText'
         },
         card: {
            type: 'LinkAccount',
         },
         shouldEndSession: true
       },
       sessionAttributes: {},
       version: '1.0'
    });
}

async function main() {
    const bob = await login('bob', '12345678');

    // user (web almond) api
    const token = await getAccessToken(bob);
    await testAlexa(token);

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
