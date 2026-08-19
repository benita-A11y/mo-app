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
    if (r.exceptionDetails) throw new Error('EXC: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result && r.result.value;
  };
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(300);
      // go record page
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="record"]')||document.body).click()`);
      await sleep(500);
      const diag = await evalJS(`(async () => {
        const els = Array.from(document.querySelectorAll('#page-root [data-action]')).filter(e => ['rec:camera','rec:album','rec:manual','contrib:open'].includes(e.dataset.action));
        const out = [];
        for (const el of els) {
          el.scrollIntoView({ block: 'center' });
          await new Promise(r => setTimeout(r, 120));
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          let chain = [];
          let cur = top;
          while (cur && chain.length < 6) { chain.push(cur.tagName + '.' + ((cur.className||'').toString().split(' ').slice(0,3).join('.')) + ' z=' + getComputedStyle(cur).zIndex + ' pos=' + getComputedStyle(cur).position + (cur===el?'  <<TARGET':'')); cur = cur.parentElement; }
          out.push({ action: el.dataset.action, rect: Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.right)+','+Math.round(r.bottom), topTag: top ? top.tagName + '.' + ((top.className||'').toString().slice(0,40)) : 'NONE', chain });
        }
        return JSON.stringify(out);
      })()`);
      console.log(diag);
      // check overlay elements
      const overlays = await evalJS(`JSON.stringify(Array.from(document.querySelectorAll('body *')).filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && (parseFloat(s.zIndex) >= 5 || e.id.includes('root')); }).map(e => e.id + '|' + e.tagName + '|' + ((e.className||'').toString().slice(0,30)) + '|z=' + getComputedStyle(e).zIndex + '|display=' + getComputedStyle(e).display + '|opacity=' + getComputedStyle(e).opacity).slice(0, 30))`);
      console.log('OVERLAYS=' + overlays);
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
