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
  const mark = (name, ok, extra) => console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : ''));

  ws.onopen = async () => {
    try {
      await send('Runtime.enable', {});
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await evalJS(`location.reload(); true`).catch(() => {});
      await sleep(1800);

      // collect every action across every page
      const all = JSON.parse(await evalJS(`JSON.stringify(
        Array.from(document.querySelectorAll('[data-page] [data-action], .page [data-action]')).map(el => {
          const pg = el.closest('[data-page]');
          return { action: el.dataset.action, page: pg ? pg.dataset.page : '', label: (el.innerText||'').trim().replace(/\\s+/g,' ').slice(0,20) };
        })
      )`));
      const uniq = [];
      const seen = new Set();
      for (const b of all) { const k = b.action + '@' + b.page; if (!seen.has(k)) { seen.add(k); uniq.push(b); } }
      const navs = JSON.parse(await evalJS(`JSON.stringify(Array.from(document.querySelectorAll('[data-action="nav:go"]')).map(b => b.dataset.page))`));

      const go = async (page) => {
        const ok = await evalJS(`(async () => {
          const nav = document.querySelector('[data-action="nav:go"][data-page="${page}"]');
          if (nav) nav.click();
          else {
            const pages = Array.from(document.querySelectorAll('.page'));
            const cur = pages.find(p => p.classList.contains('active'));
            if (cur && cur.dataset.page === '${page}') return true;
            return false;
          }
          await new Promise(r => setTimeout(r, 350));
          const pg = document.querySelector('.page[data-page="${page}"]');
          return !!(pg && pg.classList.contains('active'));
        })()`);
        return ok;
      };

      const problems = [];
      for (const { action, page, label } of uniq) {
        if (!action) continue;
        const reg = await evalJS(`!!(window._ACTIONS && window._ACTIONS['${action}'])`);
        if (!reg) {
          problems.push({ action, page, label, type: 'UNREGISTERED' });
          mark('[' + (page||'?') + '] ' + action, false, 'action 未注册（点击必无反应）: ' + label);
          continue;
        }
        if (action.startsWith('nav:') || action === 'sidebar:pin' || action === 'modal:close' || action === 'sheet:close') {
          continue; // nav/modal helpers tested implicitly
        }
        if (page) { const g = await go(page); if (!g) { mark('[' + page + '] ' + action, false, '导航到页面失败'); continue; } }
        const before = exceptions.length;
        const res = await evalJS(`(async () => {
          const pg = document.querySelector('.page[data-page="${page}"]');
          const scope = pg ? pg : document;
          const els = Array.from(scope.querySelectorAll('[data-action="${action}"]'));
          if (!els.length) return 'NO_EL';
          const el = els[0];
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return 'HIDDEN0:' + (el.tagName||'') + '.' + ((el.className||'').toString().slice(0,30));
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          let top = null;
          try { top = document.elementFromPoint(cx, cy); } catch (e) {}
          if (top && top !== el && !el.contains(top)) {
            const tg = (top.tagName || '').toLowerCase();
            if (tg !== 'body' && tg !== 'html' && tg !== 'main' && tg !== 'nav') {
              return 'OCCLUDED: ' + tg + '.' + ((top.className||'').toString().slice(0,30)) + ' over ' + el.tagName + '.' + ((el.className||'').toString().slice(0,30)) + ' (' + el.innerText.slice(0,12) + ')';
            }
          }
          const before = document.body.innerText.length;
          const hadSheet = !!(document.querySelector('#sheet-root') && document.querySelector('#sheet-root').classList.contains('show'));
          const hadToast = document.querySelectorAll('#toast-root .toast').length;
          el.click();
          await new Promise(r2 => setTimeout(r2, 280));
          const bodyLen = document.body.innerText.length;
          const sheetNow = !!(document.querySelector('#sheet-root') && document.querySelector('#sheet-root').classList.contains('show'));
          const toastNow = document.querySelectorAll('#toast-root .toast').length;
          const changed = bodyLen !== before || sheetNow !== hadSheet || toastNow !== hadToast;
          if (document.querySelector('#sheet-root')) document.querySelector('#sheet-root').classList.remove('show');
          return changed ? 'CHANGED' : 'NO_CHANGE';
        })()`);
        const newEx = exceptions.length - before;
        if (newEx > 0) {
          problems.push({ action, page, label, type: 'EXCEPTION' });
          mark('[' + (page||'?') + '] ' + action + ' (' + label + ')', false, '点击抛异常: ' + (exceptions[before]||'').slice(0,120));
        } else if (typeof res === 'string' && res.startsWith('OCCLUDED')) {
          problems.push({ action, page, label, type: 'OCCLUDED' });
          mark('[' + (page||'?') + '] ' + action + ' (' + label + ')', false, '被遮挡点不到: ' + res);
        } else if (typeof res === 'string' && res === 'NO_CHANGE' && !['quick:record','rec:del','contrib:open','hunt:ai-item'].includes(action)) {
          problems.push({ action, page, label, type: 'NO_FEEDBACK' });
          mark('[' + (page||'?') + '] ' + action + ' (' + label + ')', false, '点击后无任何可见反馈');
        } else if (typeof res === 'string' && (res === 'NO_EL' || res.startsWith('HIDDEN'))) {
          mark('[' + (page||'?') + '] ' + action + ' (' + label + ')', true, '跳过: ' + res);
        } else {
          mark('[' + (page||'?') + '] ' + action + ' (' + label + ')', true, '有反馈');
        }
      }
      console.log('PROBLEMS=' + JSON.stringify(problems));
      console.log('EXCEPTIONS=' + (exceptions.length ? JSON.stringify(exceptions.slice(0,3)) : 'none'));
      console.log(problems.length ? 'FAIL_COUNT=' + problems.length : 'ALL_OK');
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
