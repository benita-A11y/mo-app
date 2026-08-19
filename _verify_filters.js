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
  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await sleep(300);
      // 1. recipes:cat 切换到「外卖」
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="recipes"]')||document.body).click()`);
      await sleep(400);
      let r = await evalJS(`(() => { const btns = Array.from(document.querySelectorAll('#page-root [data-action="recipes:cat"]')); const t = btns.find(b => b.innerText.includes('外卖')); if (!t) return 'NO_BTN'; const r = t.getBoundingClientRect(); t.scrollIntoView({block:'center'}); return JSON.stringify({x: r.left+r.width/2, y: r.top+r.height/2, text: t.innerText.trim().slice(0,10)}); })()`);
      let p = JSON.parse(r);
      const listBefore = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      await realClick(p.x, p.y);
      await sleep(350);
      const listAfter = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      mark('recipes:cat 切换到「外卖」', listAfter !== listBefore, '列表长度 ' + listBefore + '→' + listAfter);

      // 2. recipes:sort 切换到「🔥 热量」
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="recipes"]')||document.body).click()`);
      await sleep(400);
      r = await evalJS(`(() => { const btns = Array.from(document.querySelectorAll('#page-root [data-action="recipes:sort"]')); const t = btns.find(b => b.innerText.includes('热量')); if (!t) return 'NO_BTN'; const rr = t.getBoundingClientRect(); t.scrollIntoView({block:'center'}); return JSON.stringify({x: rr.left+rr.width/2, y: rr.top+rr.height/2}); })()`);
      p = JSON.parse(r);
      const sBefore = await evalJS(`Array.from(document.querySelectorAll('#page-root [data-action="food:detail"]')).map(e => e.innerText.slice(0,8)).join('|')`);
      await realClick(p.x, p.y);
      await sleep(350);
      const sAfter = await evalJS(`Array.from(document.querySelectorAll('#page-root [data-action="food:detail"]')).map(e => e.innerText.slice(0,8)).join('|')`);
      mark('recipes:sort 切换到「热量」', sBefore !== sAfter, sBefore.slice(0,30) + ' → ' + sAfter.slice(0,30));

      // 3. hunt:fk 切换到「辣」
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="hunt"]')||document.body).click()`);
      await sleep(400);
      r = await evalJS(`(() => { const btns = Array.from(document.querySelectorAll('#page-root [data-action="hunt:fk"]')); const t = btns.find(b => b.innerText.trim() === '辣'); if (!t) return 'NO_BTN'; const rr = t.getBoundingClientRect(); t.scrollIntoView({block:'center'}); return JSON.stringify({x: rr.left+rr.width/2, y: rr.top+rr.height/2}); })()`);
      p = JSON.parse(r);
      const hBefore = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      await realClick(p.x, p.y);
      await sleep(400);
      const hAfter = await evalJS(`document.querySelector('#page-root').innerHTML.length`);
      mark('hunt:fk 切换到「辣」', hAfter !== hBefore, '列表长度 ' + hBefore + '→' + hAfter);

      // 4. board:view 切换到「周视图」
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="board"]')||document.body).click()`);
      await sleep(400);
      r = await evalJS(`(() => { const btns = Array.from(document.querySelectorAll('#page-root [data-action="board:view"]')); const t = btns.find(b => b.innerText.includes('周')); if (!t) return 'NO_BTN'; const rr = t.getBoundingClientRect(); t.scrollIntoView({block:'center'}); return JSON.stringify({x: rr.left+rr.width/2, y: rr.top+rr.height/2, text: t.innerText.trim()}); })()`);
      p = JSON.parse(r);
      const bBefore = await evalJS(`document.querySelector('#page-root').innerHTML.slice(0, 300)`);
      await realClick(p.x, p.y);
      await sleep(400);
      const bAfter = await evalJS(`document.querySelector('#page-root').innerHTML.slice(0, 300)`);
      mark('board:view 切换到「周视图」', bBefore !== bAfter, '内容已变化');

      // 5. rec:camera input 元素存在且可点击（headless 无法弹窗，只验证链路）
      await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="record"]')||document.body).click()`);
      await sleep(400);
      const camInput = await evalJS(`!!document.querySelector('#camera-input') && !!document.querySelector('#album-input')`);
      mark('rec:camera/album 文件输入元素存在', camInput);
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
