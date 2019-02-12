"use strict";

process.on('unhandledRejection', (up) => { throw up; });
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
]);
