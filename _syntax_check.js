const fs = require('fs');
const vm = require('vm');
const files = ['d:/热量/js/pages4.js', 'd:/热量/js/ai.js', 'd:/热量/js/store.js'];
let ok = true;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try { new vm.Script(src, { filename: f }); console.log('OK  ' + f); }
  catch (e) { ok = false; console.log('FAIL ' + f + ' -> ' + e.message); }
}
process.exit(ok ? 0 : 1);
