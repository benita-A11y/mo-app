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
  const realClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  ws.onopen = async () => {
    await send('Runtime.enable', {});
    await sleep(300);
    await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="board"]')||document.body).click()`);
    await sleep(450);
    const monthRows = await evalJS(`document.querySelectorAll('#page-root .food-line').length`);
    const r = await evalJS(`(() => { const t = Array.from(document.querySelectorAll('#page-root [data-action="board:view"]')).find(b => b.innerText.includes('周')); t.scrollIntoView({block:'center'}); const r = t.getBoundingClientRect(); return JSON.stringify({x: r.left+r.width/2, y: r.top+r.height/2}); })()`);
    const p = JSON.parse(r);
    await realClick(p.x, p.y);
    await sleep(500);
    const weekRows = await evalJS(`document.querySelectorAll('#page-root .food-line').length`);
    const weekText = await evalJS(`(document.querySelector('#page-root .food-line')||{innerText:''}).innerText.slice(0, 20)`);
    console.log('月视图行数=' + monthRows + ' → 周视图行数=' + weekRows);
    console.log('周视图首行=' + weekText);
    console.log(weekRows === 7 ? 'PASS board:view→周视图' : 'FAIL board:view→周视图');
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
