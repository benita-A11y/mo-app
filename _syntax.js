const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = 'd:' + path.sep + '\u70ed\u91cf' + path.sep + 'js';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
let fail = 0;
for (const f of files) {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    new vm.Script(code, { filename: f });
    console.log('OK   ' + f);
  } catch (e) {
    fail++;
    console.log('FAIL ' + f + ' :: ' + e.message.split('\n')[0]);
  }
}
console.log(fail ? 'SYNTAX_FAIL=' + fail : 'ALL_SYNTAX_OK');
process.exit(fail ? 1 : 0);
