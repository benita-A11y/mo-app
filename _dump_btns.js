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
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m.result); }
  };
  const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  ws.onopen = async () => {
    await send('Runtime.enable', {});
    await sleep(300);
    for (const p of ['recipes', 'hunt', 'board', 'nutri']) {
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="${p}"]')||document.body).click()`);
      await sleep(450);
      const info = await evalJS(`JSON.stringify({
        page: '${p}',
        btns: Array.from(document.querySelectorAll('#page-root [data-action]')).map(b => b.dataset.action + '="' + (b.dataset.v||'') + '"(' + (b.innerText||'').trim().replace(/\\s+/g,' ').slice(0,12) + ')').filter((s,i,a) => a.indexOf(s) === i).slice(0, 40)
      })`);
      console.log(info);
    }
    process.exit(0);
  };
})();
