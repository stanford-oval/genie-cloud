let args = process.argv.slice(2);
let file = args[0];
let name = args[1];
const Config = require(file)
if (!Config[name]) {
    throw Error(`${file} contains no field: ${name}`)
}
console.log(Config[name])
