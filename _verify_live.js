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
          const page = tabs.find((t) => t.type === 'page');
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
      await send('Page.enable', {});
      await send('Page.navigate', { url: 'https://benita-A11y.github.io/reliang-shouzhang/' });
      await sleep(4500);
      const loaded = await evalJS(`JSON.stringify({ sw: navigator.serviceWorker ? 'yes' : 'no', title: document.title, navs: document.querySelectorAll('[data-action="nav:go"]').length, swState: (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'controlled' : 'uncontrolled' })`);
      const l = JSON.parse(loaded);
      check('线上站点加载', l.navs >= 7, JSON.stringify(l));
      // 确认 SW 缓存版本为 v7
      const cacheInfo = await evalJS(`(async () => { try { const keys = await caches.keys(); return JSON.stringify(keys); } catch (e) { return 'none'; } })()`);
      check('SW 缓存存在', cacheInfo.length > 2, cacheInfo);
      // 清掉旧 SW 缓存并从 CDN 拉最新代码
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await send('Page.reload', {});
      await sleep(4000);
      const clickNutri = await evalJS(`(function(){ const b=document.querySelector('[data-action="nav:go"][data-page="nutri"]'); if(!b) return 'NO_BTN'; b.click(); return 'ok'; })()`);
      check('导航到营养秘书', clickNutri === 'ok', clickNutri);
      await sleep(800);
      const st = await evalJS(`JSON.stringify({
        title: (document.querySelector('.page-title')||{}).innerText || '',
        remain: document.body.innerText.includes('剩余'),
        intake: document.body.innerText.includes('已摄入'),
        flavor: document.querySelectorAll('[data-action="nutri:flavor"]').length
      })`);
      const s = JSON.parse(st);
      check('线上营养秘书页正常', s.title.includes('营养秘书') && s.remain && s.intake && s.flavor === 4, JSON.stringify(s));
      await evalJS(`document.querySelector('[data-action="nutri:any"]').click()`);
      await sleep(1200);
      const rec = await evalJS(`JSON.stringify({ cards: document.querySelectorAll('.reco-card').length, found: (document.body.innerText.match(/为你找到 (\\d+) 个推荐/) || [])[1] || '', bill: document.querySelectorAll('[data-action="nutri:bill"]').length })`);
      const r = JSON.parse(rec);
      check('线上推荐闭环正常', r.cards >= 1 && r.found !== '' && r.bill >= 1, JSON.stringify(r));

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
