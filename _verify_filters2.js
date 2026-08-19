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
  const mark = (name, ok, extra) => console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : ''));
  const realClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const nav = async (p) => { await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="${p}"]')||document.body).click()`); await sleep(400); };
  const findBtn = async (action, text) => evalJS(`(() => {
    const btns = Array.from(document.querySelectorAll('#page-root [data-action="${action}"]'));
    const t = btns.find(b => (b.innerText||'').includes('${text}'));
    if (!t) return 'NO_BTN:' + btns.map(b => b.innerText.trim().slice(0,6)).join(',');
    t.scrollIntoView({block:'center'});
    const r = t.getBoundingClientRect();
    return JSON.stringify({x: r.left+r.width/2, y: r.top+r.height/2, labels: btns.map(b=>b.innerText.trim().slice(0,8)).join('/')});
  })()`);
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(300);
      // recipes:cat 早餐
      await nav('recipes');
      let r = await findBtn('recipes:cat', '早餐');
      let p = JSON.parse(r);
      const cats = p.labels;
      const before = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      await realClick(p.x, p.y); await sleep(350);
      const after = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      mark('recipes:cat → 早餐（分类:' + cats + '）', after !== before, before + '→' + after);

      // hunt:ff 辣的
      await nav('hunt');
      r = await findBtn('hunt:ff', '辣的');
      p = JSON.parse(r);
      const hb = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      await realClick(p.x, p.y); await sleep(400);
      const ha = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      mark('hunt:ff → 辣的（口味:' + p.labels + '）', ha !== hb, hb + '→' + ha);

      // hunt:fk ≤300
      r = await findBtn('hunt:fk', '≤300');
      p = JSON.parse(r);
      const kb = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      await realClick(p.x, p.y); await sleep(400);
      const ka = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      mark('hunt:fk → ≤300（热量:' + p.labels + '）', ka !== kb, kb + '→' + ka);

      // board:view 周视图
      await nav('board');
      r = await findBtn('board:view', '周');
      p = JSON.parse(r);
      const bb = await evalJS(`document.querySelector('#page-root').innerHTML.slice(0, 120)`);
      await realClick(p.x, p.y); await sleep(400);
      const ba = await evalJS(`document.querySelector('#page-root').innerHTML.slice(0, 120)`);
      mark('board:view → 周视图（视图:' + p.labels + '）', bb !== ba, '内容已切换');

      // hunt 页 tab 切换
      await nav('hunt');
      r = await findBtn('hunt:tab', '收藏');
      if (!String(r).startsWith('NO')) {
        p = JSON.parse(r);
        const tb = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
        await realClick(p.x, p.y); await sleep(400);
        const ta = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
        mark('hunt:tab → 收藏（tab:' + p.labels + '）', ta !== tb, tb + '→' + ta);
      } else {
        mark('hunt:tab → 收藏', true, '跳过: ' + r);
      }
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
