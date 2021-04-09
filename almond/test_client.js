
const EngineManagerClient = require('./enginemanagerclient');

async function main() {
    const client = new EngineManagerClient('http://localhost:8080');
    // const resp = await client.startUser(3);
    // const resp = await client.killUser('3');
    // const resp = await client.killAllUsers();
    const engine = await client.getEngine('3');
    // const resp = await engine.getConsent();
    let resp = await engine.recordingWarned();
    console.log(`Response ${JSON.stringify(resp)}`);
    resp = await engine.warnRecording();
    console.log(`Response ${JSON.stringify(resp)}`);
    resp = await engine.recordingWarned();
    console.log(`Response ${JSON.stringify(resp)}`);
    client.stop();
}

main();
