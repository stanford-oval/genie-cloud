
const EngineManagerClient = require('./enginemanagerclient');

async function main() {
    const client = new EngineManagerClient('http://localhost:8080');
    let resp = null;
    resp = await client.startUser('3');
    // resp = await client.isRunning('3');
    // resp = await client.killUser('3');
    // resp = await client.isRunning('3');
    // resp = await client.startUser('3');
    // resp = await client.isRunning('3');
    // resp = await client.getProcessId('3');
    // resp = await client.clearCache('3');
    //  resp = await client.restartUser('3');
    // resp = await client.deleteUser('3');
    // resp = await client.restartUserWithoutCache('3');
    // resp = await client.killAllUsers();

    // resp = await client.startUser('3');
    // const engine = await client.getEngine('3');
    // resp = await engine.getConsent();
    // resp = await engine.recordingWarned();
    // resp = await engine.warnRecording();
    // resp = await engine.recordingWarned();

    console.log(`Response ${JSON.stringify(resp)}`);
    client.stop();
}

main();
