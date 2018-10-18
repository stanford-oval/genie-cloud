"use strict";

process.on('unhandledRejection', (up) => { throw up; });
process.env.TEST_MODE = '1';

/*async function par(array) {
    await Promise.all(array.map((fn) => fn()));
}*/
async function seq(array) {
    for (let fn of array) {
        console.log(`Running tests for ${fn}`);
        await require(fn)();
    }
}

seq([
    ('./test_tokenize'),
    ('./test_device_factories'),
    ('./test_binary_search')
]);
