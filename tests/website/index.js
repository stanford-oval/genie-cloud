"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');
process.env.TEST_MODE = '1';

const Config = require('../../config');

/*async function par(array) {
    await Promise.all(array.map((fn) => fn()));
}*/
async function seq(array) {
    for (let fn of array) {
        if (fn === null)
            continue;
        console.log(`Running tests for ${fn}`);
        await require(fn)();
    }
}

seq([
    ('./test_public_endpoints'),
    ('./test_register'),
    ('./test_sso'),
    ('./test_me'),
    ('./test_my_api'),
    ('./test_admin'),
    Config.WITH_THINGPEDIA === 'embedded' ? ('./test_oauth') : null,
    Config.WITH_THINGPEDIA === 'embedded' ? ('./test_string_entities') : null,

    // only test alexa with embedded thingpedia, so we know what intents are available
    //Config.WITH_THINGPEDIA === 'embedded' ? ('./test_alexa') : null,

    Config.WITH_THINGPEDIA === 'embedded' ? ('./test_mturk') : null,
]);
