const http = require('http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getPageWS() {
  return new Promise((res, rej) => {
    http.get('http://127.0.0.1:9223/json', (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        try {
          const tabs = JSON.parse(d);
          const page = tabs.find((t) => t.type === 'page');
          page ? res(page.webSocketDebuggerUrl) : rej(new Error('no page target'));
        } catch (e) { rej(e); }
      });
    }).on('error', rej);
  });
}
(async () => {
  const ws = new WebSocket(await getPageWS());
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result && r.result.value;
  };
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(500);
      const info = await evalJS(`(async () => {
        const res = await fetch('https://benita-A11y.github.io/reliang-shouzhang/js/pages4.js', { cache: 'no-store' });
        const t = await res.text();
        const res2 = await fetch('https://benita-A11y.github.io/reliang-shouzhang/js/ai.js', { cache: 'no-store' });
        const t2 = await res2.text();
        const sw = await fetch('https://benita-A11y.github.io/reliang-shouzhang/sw.js', { cache: 'no-store' });
        const t3 = await sw.text();
        return JSON.stringify({
          p4: { len: t.length, bill: t.includes('nutri:bill'), combo: t.includes('highFreqCombo'), age: res.headers.get('age'), cc: res.headers.get('cache-control'), etag: res.headers.get('etag') },
          ai: { norm: t2.includes('replace(/的/g'), sweet: t2.includes('isSweetDrink') },
          sw: { v7: t3.includes('reliang-v7'), v6: t3.includes('reliang-v6') }
        });
      })()`);
      console.log(info);
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
