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
      await sleep(1200);
      // 1. 空态渲染
      const emptyHtml = await evalJS(`renderNutriEmpty({ note: '' })`);
      check('空态含调整提示', emptyHtml.includes('没有找到完全匹配的推荐'));
      check('空态含通用建议', emptyHtml.includes('通用建议'));
      // 2. 平台池构建
      const pool = await evalJS(`JSON.stringify((function(){ const p = buildNutriPool(); return { total: p.length, user: p.filter(x=>x._src==='user').length, platform: p.filter(x=>x._src==='platform').length, fallback: p.filter(x=>x._src==='fallback').length, hasShop: p.filter(x=>x.shopId).slice(0,3).map(x=>x.shop+'/'+x.shopId) }; })())`);
      const p = JSON.parse(pool);
      check('平台池构建(食谱+平台+兜底)', p.total > 50 && p.platform > 0 && p.fallback > 0, 'user=' + p.user + ' platform=' + p.platform + ' fallback=' + p.fallback);
      check('平台项带真实店铺', p.hasShop.length >= 3, p.hasShop.join(' , '));
      check('新档案无食谱库属正常', p.user === 0, 'user=' + p.user);
      // 3. highFreqCombo 组合统计
      await evalJS(`(async () => { PROFILE.preferences = [ {user_id:'main',timestamp:1,taste:['辣的'],food_type:['想吃肉'],meal_type:'lunch0'}, {user_id:'main',timestamp:2,taste:['辣的','咸香的'],food_type:['想吃肉','想吃主食'],meal_type:'dinner0'}, {user_id:'main',timestamp:3,taste:['辣的','咸香的'],food_type:['想吃肉'],meal_type:'lunch0'} ]; PROFILE.tasteCount=3; await saveProfile(PROFILE); return true; })()`);
      const hf = await evalJS(`JSON.stringify(highFreqCombo())`);
      const h = JSON.parse(hf);
      check('高频组合统计', JSON.stringify(h.flavor.sort()) === JSON.stringify(['咸香的','辣的']) && JSON.stringify(h.ingredient.sort()) === JSON.stringify(['想吃肉']), JSON.stringify(h));
      // 4. 推荐带 shop 名称（平台池可见）
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await evalJS(`location.reload(); true`).catch(() => {});
      await sleep(1500);
      await evalJS(`document.querySelector('[data-action="nav:go"][data-page="nutri"]').click()`);
      await sleep(400);
      await evalJS(`document.querySelector('[data-action="nutri:any"]').click()`);
      await sleep(1000);
      const hasShopText = await evalJS(`JSON.stringify({
        withShop: Array.from(document.querySelectorAll('.reco-card')).filter(c => (c.querySelector('.reco-name .muted')||{}).innerText && c.querySelector('.reco-name .muted').innerText.trim().length > 0).length,
        sample: Array.from(document.querySelectorAll('.reco-name .muted')).slice(0,3).map(el => el.innerText)
      })`);
      const ht = JSON.parse(hasShopText);
      check('推荐卡片含店铺名', ht.withShop >= 1, JSON.stringify(ht.sample));

      const failed = results.filter(([, ok]) => !ok);
      console.log('EXCEPTIONS=' + (exceptions.length ? JSON.stringify(exceptions) : 'none'));
      console.log(failed.length ? 'FAIL_COUNT=' + failed.length : 'ALL_OK');
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
