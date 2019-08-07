// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { applySlotsToProgram } = require('../../routes/bridges/alexa/intent_parser');

const TEST_CASES = [
    [
    `query (p_text : String) := @com.twitter.search(), text =~ p_text;`,
    {
        p_text: {
            name: 'p_text',
            value: "hello world",
            confirmationStatus: 'NONE',
            resolutions: {
                resolutionsByAuthority: []
            }
        }
    },
    `now => (@com.twitter.search()), text =~ "hello world" => notify;`,
    ],

    [
    `query (p_hashtag : Entity(tt:hashtag)) := @com.twitter.search(), contains(hashtags, p_hashtag);`,
    {
        p_hashtag: {
            name: 'p_hashtag',
            value: "funny",
            confirmationStatus: 'NONE',
            resolutions: {
                resolutionsByAuthority: []
            }
        }
    },
    `now => (@com.twitter.search()), contains(hashtags, "funny"^^tt:hashtag) => notify;`,
    ],

    [
    `query (p_location : Location) := @org.thingpedia.weather.current(location=p_location);`,
    {
        p_location: {
            name: 'p_location',
            value: "palo alto california",
            confirmationStatus: 'NONE',
            resolutions: {
                resolutionsByAuthority: []
            }
        }
    },
    `now => @org.thingpedia.weather.current(location=makeLocation("palo alto california")) => notify;`,
    ],

    [
    `query (p_has_motion : Boolean) := @security-camera.current_event(), has_motion == p_has_motion;`,
    {
        p_has_motion: {
            name: 'p_has_motion',
            value: "yes",
            confirmationStatus: 'NONE',
            resolutions: {
                resolutionsPerAuthority: [{
                    authority: 'amzn1.er-authority.echo-sdk.almond.Boolean',
                    status: {
                        code: 'ER_SUCCESS_MATCH'
                    },
                    values: [{
                        value: {
                            value: "yes",
                            id: 'true'
                        }
                    }]
                }]
            }
        }
    },
    `now => (@security-camera.current_event()), has_motion == true => notify;`,
    ],

    [
    `query (p_has_motion : Boolean) := @security-camera.current_event(), has_motion == p_has_motion;`,
    {
        p_has_motion: {
            name: 'p_has_motion',
            value: "no",
            confirmationStatus: 'NONE',
            resolutions: {
                resolutionsPerAuthority: [{
                    authority: 'amzn1.er-authority.echo-sdk.almond.Boolean',
                    status: {
                        code: 'ER_SUCCESS_MATCH'
                    },
                    values: [{
                        value: {
                            value: "no",
                            id: 'false'
                        }
                    }]
                }]
            }
        }
    },
    `now => (@security-camera.current_event()), has_motion == false => notify;`,
    ],

    [
    `action (p_power : Enum(on,off)) := @light-bulb.set_power(power=p_power);`,
    {
        p_power: {
            name: 'p_power',
            value: "off",
            confirmationStatus: 'NONE',
            resolutions: {
                resolutionsPerAuthority: [{
                    authority: 'amzn1.er-authority.echo-sdk.almond.Boolean',
                    status: {
                        code: 'ER_SUCCESS_MATCH'
                    },
                    values: [{
                        value: {
                            value: "off",
                            id: 'off',
                        }
                    }]
                }]
            }
        }
    },
    `now => @light-bulb.set_power(power=enum(off));`,
    ],

    [
    `query (p_date : Date) := @org.thingpedia.weather.sunrise(date=p_date);`,
    {
        p_date: {
            name: 'p_date',
            value: "2019-07-31",
            confirmationStatus: 'NONE',
            resolutions: {
            }
        }
    },
    `now => @org.thingpedia.weather.sunrise(date=makeDate(1564556400000)) => notify;`,
    ],

    [
    `query (p_date : Date) := @org.thingpedia.weather.sunrise(date=p_date);`,
    {
        p_date: {
            name: 'p_date',
            value: "2019-08",
            confirmationStatus: 'NONE',
            resolutions: {
            }
        }
    },
    `now => @org.thingpedia.weather.sunrise(date=makeDate(1564642800000)) => notify;`,
    ],

    [
    `query (p_date : Date) := @org.thingpedia.weather.sunrise(date=p_date);`,
    {
        p_date: {
            name: 'p_date',
            value: "2019",
            confirmationStatus: 'NONE',
            resolutions: {
            }
        }
    },
    `now => @org.thingpedia.weather.sunrise(date=makeDate(1546329600000)) => notify;`,
    ],

    [
    `action (p_interval : Measure(ms)) := @com.spotify.play_seek_seconds(seconds=p_interval);`,
    {
        p_interval: {
            name: 'p_interval',
            value: "P1D",
            confirmationStatus: 'NONE',
            resolutions: {
            }
        }
    },
    `now => @com.spotify.play_seek_seconds(seconds=1day);`,
    ],

    [
    `action (p_interval : Measure(ms)) := @com.spotify.play_seek_seconds(seconds=p_interval);`,
    {
        p_interval: {
            name: 'p_interval',
            value: "P1D1H",
            confirmationStatus: 'NONE',
            resolutions: {
            }
        }
    },
    `now => @com.spotify.play_seek_seconds(seconds=(1day + 1hour));`,
    ],

    [
    `query (p_target_language : Entity(tt:iso_lang_code)) := @com.yandex.translate.translate(target_language=p_target_language);`,
    {
        p_target_language: {
            name: 'p_target_language',
            value: "italian",
            confirmationStatus: 'NONE',
            resolutions: {
            }
        }
    },
    `now => @com.yandex.translate.translate(target_language=null^^tt:iso_lang_code("italian")) => notify;`,
    ],
];

async function testCase(i) {
    console.log(`Test Case #${i+1}`);

    const [code, alexaSlots, expected] = TEST_CASES[i];

    let generated;
    try {
        generated = applySlotsToProgram('en-US', code, alexaSlots);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error', e);
        if (process.env.TEST_MODE)
            throw new Error(`testAlexaIntentParser ${i+1} FAILED`);
        return;
    }
    if (generated !== expected) {
        console.error('Test Case #' + (i+1) + ': does not match what expected');
        console.error('Expected: ' + expected);
        console.error('Generated: ' + generated);
        if (process.env.TEST_MODE)
            throw new Error(`testAlexaIntentParser ${i+1} FAILED`);
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(i);
}
module.exports = main;
if (!module.parent)
    main();
