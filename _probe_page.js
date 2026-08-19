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
  const consoleMsgs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 300);
      consoleMsgs.push(m.params.type + ': ' + args);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const ex = m.params.exceptionDetails && m.params.exceptionDetails.exception;
      consoleMsgs.push('EXC: ' + ((ex && ex.description) || '').slice(0, 300));
    }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('EXC-EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result && r.result.value;
  };
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(200);
      const info = await evalJS(`JSON.stringify({
        url: location.href,
        ready: document.readyState,
        actions: Object.keys(window._ACTIONS||{}).length,
        pages: Array.from(document.querySelectorAll('.page[data-page]')).length,
        homeActive: !!(document.querySelector('.page[data-page="home"]') && document.querySelector('.page[data-page="home"]').classList.contains('active')),
        homeBtns: document.querySelectorAll('.page[data-page="home"] [data-action]').length,
        bodyLen: document.body.innerText.length
      })`);
      console.log('INFO=' + info);
      await sleep(1500);
      const info2 = await evalJS(`JSON.stringify({
        ready: document.readyState,
        actions: Object.keys(window._ACTIONS||{}).length,
        pages: Array.from(document.querySelectorAll('.page[data-page]')).length,
        homeActive: !!(document.querySelector('.page[data-page="home"]') && document.querySelector('.page[data-page="home"]').classList.contains('active')),
        homeBtns: document.querySelectorAll('.page[data-page="home"] [data-action]').length,
        bodyLen: document.body.innerText.length
      })`);
      console.log('INFO2=' + info2);
      console.log('CONSOLE=' + JSON.stringify(consoleMsgs.slice(0, 30)));
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
