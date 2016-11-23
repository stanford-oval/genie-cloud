const SempreSyntax = require('../util/sempre_syntax');

const input = '@twitter.source(), from = $makeUsername("testeralice") => @phone.call(), number = $makePhoneNumber("+16501234567")';

console.log(JSON.stringify(SempreSyntax.toSEMPRE(input)));
