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
  const exceptions = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const ex = m.params.exceptionDetails && m.params.exceptionDetails.exception;
      exceptions.push((ex && ex.description) || 'unknown');
    }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('EXC: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text).slice(0, 300));
    return r.result && r.result.value;
  };
  const results = [];
  const check = (name, ok, extra) => { results.push([name, !!ok, extra]); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : '')); };

  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await evalJS(`location.reload(); true`).catch(() => {});
      await sleep(1800);
      const navs = await evalJS(`JSON.stringify(Array.from(document.querySelectorAll('[data-action="nav:go"]')).map(b => b.dataset.page))`);
      const pages = JSON.parse(navs);
      for (const p of pages) {
        await evalJS(`document.querySelector('[data-action="nav:go"][data-page="${p}"]').click()`);
        await sleep(500);
        const title = await evalJS(`(document.querySelector('.page-title')||{}).innerText || (document.querySelector('.page-head')||{}).innerText || 'none'`);
        const hasError = await evalJS(`document.body.innerText.includes('undefined') === false ? 'ok' : 'HAS_UNDEFINED'`);
        check('导航页 ' + p + ' (' + (title || '').trim().slice(0, 12) + ')', hasError === 'ok' && title !== 'none', title.trim().slice(0, 16));
      }
      const failed = results.filter(([, ok]) => !ok);
      console.log('EXCEPTIONS=' + (exceptions.length ? JSON.stringify(exceptions.slice(0, 3)) : 'none'));
      console.log(failed.length ? 'FAIL_COUNT=' + failed.length : 'ALL_OK');
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
