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
    if (r.exceptionDetails) throw new Error('EXC: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result && r.result.value;
  };
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(500);
      const info = await evalJS(`(() => {
        const mr = document.querySelector('#modal-root');
        // pick first button in page content
        const btn = document.querySelector('#page-root [data-action]');
        if (!btn) return 'NO_BTN';
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        return JSON.stringify({
          btnLabel: btn.innerText.trim().slice(0, 15),
          btnAction: btn.dataset.action,
          btnRect: Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + 'x' + Math.round(r.height),
          atPoint: top ? top.tagName + '#' + top.id + '.' + ((top.className||'').toString().slice(0, 25)) : 'NONE',
          topIsModal: !!(top && (top.id === 'modal-root' || top.closest('#modal-root'))),
          modalLen: mr.innerHTML.length,
          modalPE: getComputedStyle(mr).pointerEvents,
          modalDisplay: getComputedStyle(mr).display,
          vw: window.innerWidth, vh: window.innerHeight
        });
      })()`);
      console.log('INFO=' + info);
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
