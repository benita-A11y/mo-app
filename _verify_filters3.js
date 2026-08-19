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
  const mark = (name, ok, extra) => console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : ''));
  const realClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const nav = async (p) => { await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="${p}"]')||document.body).click()`); await sleep(400); };
  const clickBy = async (action, text) => {
    const r = await evalJS(`(() => {
      const btns = Array.from(document.querySelectorAll('#page-root [data-action="${action}"]'));
      const t = btns.find(b => (b.innerText||'').trim() === '${text}' || (b.innerText||'').includes('${text}'));
      if (!t) return 'NO:' + btns.map(b => (b.innerText||'').trim().slice(0,6)).join(',');
      t.scrollIntoView({block:'center'});
      const r = t.getBoundingClientRect();
      return JSON.stringify({x: r.left+r.width/2, y: r.top+r.height/2});
    })()`);
    if (String(r).startsWith('NO')) return r;
    const p = JSON.parse(r);
    await realClick(p.x, p.y);
    await sleep(400);
    return 'CLICKED';
  };
  ws.onopen = async () => {
    await send('Runtime.enable', {});
    await sleep(300);
    await nav('recipes');
    const rb = await evalJS(`document.querySelectorAll('#page-root [data-action="food:detail"]').length`);
    let r = await clickBy('recipes:cat', '水果');
    const ra = await evalJS(`document.querySelectorAll('#page-root [data-action="food:detail"]').length`);
    mark('recipes:cat→水果', rb !== ra, rb + '→' + ra + ' 项');

    await nav('hunt');
    const hb = await evalJS(`document.querySelectorAll('#page-root [data-action="hunt:shop"]').length + document.querySelectorAll('#page-root [data-action="hunt:brand"]').length`);
    r = await clickBy('hunt:ff', '辣的');
    const ha = await evalJS(`document.querySelectorAll('#page-root [data-action="hunt:shop"]').length + document.querySelectorAll('#page-root [data-action="hunt:brand"]').length`);
    mark('hunt:ff→辣的', hb !== ha, '店铺数 ' + hb + '→' + ha);

    await nav('hunt');
    const kb = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
    r = await clickBy('hunt:fk', '≤300');
    const ka = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
    mark('hunt:fk→≤300', kb !== ka, kb + '→' + ka);

    await nav('board');
    const bb = await evalJS(`!!document.querySelector('#week-view')`);
    r = await clickBy('board:view', '周');
    const ba = await evalJS(`!!document.querySelector('#week-view')`);
    mark('board:view→周视图', bb !== ba, 'week-view: ' + bb + '→' + ba);
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
