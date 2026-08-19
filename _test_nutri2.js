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
      // 注入 12 条偏好历史（高频：辣的+咸香 / 想吃肉）
      await evalJS(`(async () => {
        PROFILE.preferences = [];
        for (let i = 0; i < 12; i++) PROFILE.preferences.push({ user_id: 'main', timestamp: Date.now() - i * 1000, taste: ['辣的','咸香的'], food_type: ['想吃肉'], meal_type: 'lunch0' });
        PROFILE.tasteCount = 12;
        await saveProfile(PROFILE);
        return true;
      })()`);
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await evalJS(`location.reload(); true`).catch(() => {});
      await sleep(1800);
      await evalJS(`document.querySelector('[data-action="nav:go"][data-page="nutri"]').click()`);
      await sleep(600);
      const st = await evalJS(`JSON.stringify({
        hint: document.body.innerText.includes('已积累 12 次偏好，已为你默认选择'),
        spicyOn: !!document.querySelector('[data-action="nutri:flavor"][data-v="辣的"].on'),
        saltyOn: !!document.querySelector('[data-action="nutri:flavor"][data-v="咸香的"].on'),
        meatOn: !!document.querySelector('[data-action="nutri:ingredient"][data-v="想吃肉"].on'),
        nutriFlavor: JSON.stringify(NUTRI.flavor),
        nutriIng: JSON.stringify(NUTRI.ingredient)
      })`);
      const s = JSON.parse(st);
      check('≥10次提示语变化', s.hint);
      check('默认选中高频味道', s.spicyOn && s.saltyOn, 'flavor=' + s.nutriFlavor);
      check('默认选中高频食材', s.meatOn, 'ing=' + s.nutriIng);

      // 直接推荐应能成功（默认选中免校验）且不新增偏好以外的逻辑
      await evalJS(`document.querySelector('[data-action="nutri:next"]').click()`);
      await sleep(900);
      const rec = await evalJS(`JSON.stringify({
        cards: document.querySelectorAll('.reco-card').length,
        found: (document.body.innerText.match(/为你找到 (\\d+) 个推荐/) || [])[1] || '',
        cnt: PROFILE.tasteCount
      })`);
      const r = JSON.parse(rec);
      check('默认选中后可直接推荐', r.cards >= 1, 'cards=' + r.cards + ' found=' + r.found);
      check('偏好计数继续累计', r.cnt === 13, 'cnt=' + r.cnt);

      // 随便：直达推荐 → 返回第一步后按钮高亮且选择被清空
      await evalJS(`document.querySelector('[data-action="nutri:back"]').click()`);
      await sleep(400);
      await evalJS(`document.querySelector('[data-action="nutri:any"]').click()`);
      await sleep(900);
      const anyRec = await evalJS(`document.querySelectorAll('.reco-card').length`);
      check('随便模式仍出推荐', anyRec >= 1, 'cards=' + anyRec);
      await evalJS(`document.querySelector('[data-action="nutri:back"]').click()`);
      await sleep(400);
      const anyOn = await evalJS(`JSON.stringify({
        on: document.querySelector('.btn.ghost.on') !== null,
        chipsOn: document.querySelectorAll('.chips .chip.on').length
      })`);
      const ao = JSON.parse(anyOn);
      check('随便按钮返回后高亮且清空', ao.on && ao.chipsOn === 0, 'on=' + ao.on + ' chipsOn=' + ao.chipsOn);

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
