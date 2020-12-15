// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
    `@com.twitter.search() filter text =~ "hello world";`,
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
    `@com.twitter.search() filter contains(hashtags, "funny"^^tt:hashtag);`,
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
    `@org.thingpedia.weather.current(location=new Location("palo alto california"));`,
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
    `@security-camera.current_event() filter has_motion == true;`,
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
    `@security-camera.current_event() filter has_motion == false;`,
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
    `@light-bulb.set_power(power=enum off);`,
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
    `@org.thingpedia.weather.sunrise(date=new Date("2019-07-31T07:00:00.000Z"));`,
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
    `@org.thingpedia.weather.sunrise(date=new Date("2019-08-01T07:00:00.000Z"));`,
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
    `@org.thingpedia.weather.sunrise(date=new Date("2019-01-01T08:00:00.000Z"));`,
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
    `@com.spotify.play_seek_seconds(seconds=1day);`,
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
    `@com.spotify.play_seek_seconds(seconds=1day + 1hour);`,
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
    `@com.yandex.translate.translate(target_language=null^^tt:iso_lang_code("italian"));`,
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
