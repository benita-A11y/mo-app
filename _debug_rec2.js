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
          const page = tabs.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:8123'));
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
    if (r.exceptionDetails) throw new Error('EXC: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text).slice(0, 300));
    return r.result && r.result.value;
  };
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(400);
      const info = await evalJS(`JSON.stringify((function(){
        const pool = buildNutriPool();
        const wantI = ['想吃肉'];
        const ING_RE = { '想吃肉': /肉|鸡|牛|鱼|虾|猪|羊|鸭|培根|火腿|牛腩|鸡腿/ };
        const byName = pool.filter(x => ING_RE['想吃肉'].test(x.name));
        const byPro15 = pool.filter(x => !ING_RE['想吃肉'].test(x.name) && ((x.macros && x.macros.protein) || 0) >= 15);
        const byPro18 = pool.filter(x => !ING_RE['想吃肉'].test(x.name) && ((x.macros && x.macros.protein) || 0) >= 18);
        const salty = pool.filter(x => (x.flavor||'').includes('咸香'));
        return {
          total: pool.length,
          byName: byName.slice(0, 5).map(x => x.name + '[' + x.flavor + ']p' + (x.macros && x.macros.protein)),
          nameCount: byName.length,
          byPro15: byPro15.slice(0, 5).map(x => x.name + '[' + x.flavor + ']p' + (x.macros && x.macros.protein)),
          pro15Count: byPro15.length,
          pro18Count: byPro18.length,
          saltyCount: salty.length,
          saltySample: salty.slice(0, 5).map(x => x.name + '[' + x.flavor + ']')
        };
      })())`);
      console.log(info);
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
