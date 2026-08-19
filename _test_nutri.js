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
      exceptions.push((ex && ex.description) || JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
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
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await evalJS(`location.reload(); true`).catch(() => {});
      await sleep(1800); // 等待应用初始化

      // ---------- 1. 进入营养秘书 ----------
      await evalJS(`(function(){ const b=document.querySelector('[data-action="nav:go"][data-page="nutri"]'); if(!b) return 'NO_NAV'; b.click(); return 'ok'; })()`);
      await sleep(600);
      const step1 = await evalJS(`JSON.stringify({
        title: (document.querySelector('.page-title')||{}).innerText || '',
        hasRemain: document.body.innerText.includes('剩余'),
        hasProtein: document.body.innerText.includes('蛋白缺口'),
        hasCarbs: document.body.innerText.includes('碳水剩余'),
        hasIntake: document.body.innerText.includes('已摄入'),
        flavorChips: document.querySelectorAll('[data-action="nutri:flavor"]').length,
        ingChips: document.querySelectorAll('[data-action="nutri:ingredient"]').length,
        hasAny: !!document.querySelector('[data-action="nutri:any"]'),
        hasNext: !!document.querySelector('[data-action="nutri:next"]')
      })`);
      const s1 = JSON.parse(step1);
      check('进入营养秘书页', s1.title.includes('营养秘书'));
      check('体检报告四项齐全', s1.hasRemain && s1.hasProtein && s1.hasCarbs && s1.hasIntake);
      check('口味选择器 4+4', s1.flavorChips === 4 && s1.ingChips === 4);
      check('随便/推荐按钮', s1.hasAny && s1.hasNext);

      // ---------- 2. 未选口味直接推荐 → 应弹提示 ----------
      await evalJS(`document.querySelector('[data-action="nutri:next"]').click()`);
      await sleep(400);
      const validate = await evalJS(`JSON.stringify({
        toastShown: document.body.innerText.includes('请先选择今天想吃什么口味'),
        stillStep1: !!document.querySelector('[data-action="nutri:next"]')
      })`);
      const v = JSON.parse(validate);
      check('未选口味弹提示且停留第一步', v.toastShown && v.stillStep1, 'toast=' + v.toastShown);

      // ---------- 3. 选择口味 → 推荐 ----------
      const before = await evalJS(`JSON.stringify({ t: PROFILE.tasteCount || 0, n: (PROFILE.preferences||[]).length })`);
      await evalJS(`(function(){ document.querySelectorAll('[data-action="nutri:flavor"]')[0].click(); document.querySelectorAll('[data-action="nutri:ingredient"]')[0].click(); document.querySelector('[data-action="nutri:next"]').click(); })()`);
      await sleep(200);
      const loading = await evalJS(`document.body.innerText.includes('秘书正在为你搭配')`);
      await sleep(700);
      const recResult = await evalJS(`JSON.stringify({
        foundText: (document.body.innerText.match(/为你找到 (\\d+) 个推荐/) || [])[1] || '',
        cards: document.querySelectorAll('.reco-card').length,
        hasRecord: document.querySelectorAll('[data-action="nutri:record"]').length,
        hasBill: document.querySelectorAll('[data-action="nutri:bill"]').length,
        hasBack: !!document.querySelector('[data-action="nutri:back"]'),
        hasLoading: document.body.innerText.includes('秘书正在为你搭配')
      })`);
      const rr = JSON.parse(recResult);
      check('加载动画出现', loading, 'loading@200ms=' + loading);
      check('匹配数量文案', rr.foundText !== '', 'found=' + rr.foundText);
      check('推荐卡片渲染', rr.cards >= 1, 'cards=' + rr.cards);
      check('记录按钮与过把瘾', rr.hasRecord >= 4 && rr.hasBill >= 1, 'record=' + rr.hasRecord + ' bill=' + rr.hasBill);
      check('加载动画已消失', !rr.hasLoading);
      const after = await evalJS(`JSON.stringify({ t: PROFILE.tasteCount || 0, n: (PROFILE.preferences||[]).length, last: (PROFILE.preferences||[])[(PROFILE.preferences||[]).length-1] })`);
      const a = JSON.parse(after);
      const b = JSON.parse(before);
      check('偏好计数+1', a.t === b.t + 1, before + ' -> ' + a.t);
      check('preferences 结构正确', a.n === b.n + 1 && a.last && Array.isArray(a.last.taste) && Array.isArray(a.last.food_type) && a.last.meal_type && a.last.timestamp && a.last.user_id, 'n=' + a.n + ' keys=' + (a.last ? Object.keys(a.last).join(',') : 'none'));

      // ---------- 4. 过把瘾 → 多巴胺账单规格表 ----------
      await evalJS(`document.querySelector('[data-action="nutri:bill"]').click()`);
      await sleep(500);
      const bill = await evalJS(`JSON.stringify({
        specPanel: !!document.querySelector('.spec-panel'),
        billBtn: !!document.querySelector('[data-action="spec:confirm"]')
      })`);
      const bl = JSON.parse(bill);
      check('过把瘾打开规格表', bl.specPanel || bl.billBtn, 'spec=' + bl.specPanel + ' confirm=' + bl.billBtn);
      await evalJS(`(function(){ const c=document.querySelector('[data-action="sheet:close"]')||document.querySelector('[data-action="close"]'); if(c) c.click(); })()`);
      await sleep(400);

      // ---------- 5. 记录按钮 → 记入今日 ----------
      const dayBefore = await evalJS(`(async () => { const r = await getDayStats(todayKey()); return r.count; })()`);
      await evalJS(`document.querySelector('[data-action="nutri:record"]').click()`);
      await sleep(900);
      const afterRecord = await evalJS(`(async () => JSON.stringify({
        stillNutri: (document.querySelector('.page-title')||{}).innerText ? document.querySelector('.page-title').innerText.includes('营养秘书') : false,
        toast: document.body.innerText.includes('已记录'),
        count: await getDayStats(todayKey()).then(r => r.count)
      }))()`);
      const ar = JSON.parse(afterRecord);
      check('记录后留在营养秘书页', ar.stillNutri);
      check('记录成功并刷新', ar.count === dayBefore + 1, dayBefore + ' -> ' + ar.count);

      // ---------- 6. 随便 → 免校验推荐 ----------
      await evalJS(`document.querySelector('[data-action="nutri:back"]').click()`);
      await sleep(400);
      await evalJS(`document.querySelector('[data-action="nutri:any"]').click()`);
      await sleep(900);
      const anyState = await evalJS(`JSON.stringify({
        step2: !!document.querySelector('[data-action="nutri:back"]'),
        cards: document.querySelectorAll('.reco-card').length,
        prefLen: (PROFILE.preferences||[]).length
      })`);
      const as_ = JSON.parse(anyState);
      check('随便免校验直达推荐', as_.step2 && as_.cards >= 1, 'cards=' + as_.cards);
      check('随便不重复记录偏好', as_.prefLen === a.n, 'pref=' + a.n + '->' + as_.prefLen);

      // ---------- 7. 重选口味返回第一步 ----------
      await evalJS(`document.querySelector('[data-action="nutri:back"]').click()`);
      await sleep(400);
      const backToStep1 = await evalJS(`!!document.querySelector('[data-action="nutri:any"]')`);
      check('重选口味返回第一步', backToStep1);

      // ---------- 汇总 ----------
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
