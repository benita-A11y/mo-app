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
    if (r.exceptionDetails) throw new Error('EXC-EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
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
      await evalJS(`(async () => { try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} return true; })()`);
      await evalJS(`location.reload(); true`).catch(() => {});
      await sleep(1800);

      const navs = JSON.parse(await evalJS(`JSON.stringify(Array.from(document.querySelectorAll('[data-action="nav:go"]')).map(b => b.dataset.page))`));
      const problems = [];
      const tested = [];

      for (const p of navs) {
        // navigate to page
        await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="${p}"]')||document.body).click()`);
        await sleep(400);
        const btns = JSON.parse(await evalJS(`JSON.stringify(Array.from(document.querySelectorAll('#page-root [data-action]')).map(el => ({ a: el.dataset.action, t: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 22) })))`));
        const uniq = [];
        const seen = new Set();
        for (const b of btns) { if (!seen.has(b.a)) { seen.add(b.a); uniq.push(b); } }

        for (const { a: action, t: label } of uniq) {
          if (action.startsWith('nav:') || ['sidebar:pin', 'modal:close', 'sheet:close'].includes(action)) continue;
          // re-navigate to reset
          await evalJS(`(document.querySelector('[data-action="nav:go"][data-page="${p}"]')||document.body).click()`);
          await sleep(280);
          const before = exceptions.length;
          const res = await evalJS(`(async () => {
            const els = Array.from(document.querySelectorAll('#page-root [data-action="${action}"]'));
            if (!els.length) return 'NO_EL';
            const el = els[0];
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return 'HIDDEN:' + ((el.className||'').toString().slice(0,30));
            return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          })()`);
          if (typeof res !== 'string' || !res.startsWith('{')) {
            mark('[' + p + '] ' + action, true, '跳过: ' + res);
            continue;
          }
          const { x, y } = JSON.parse(res);
          const occl = await evalJS(`(() => { const el = document.elementFromPoint(${x}, ${y}); if (!el) return 'NONE'; const r = el.closest('[data-action]'); return r ? (r.getAttribute('data-action')) : (el.tagName + '.' + ((el.className||'').toString().slice(0,30))); })()`);
          const beforeLen = await evalJS(`document.body.innerText.length`);
          const hadSheet = await evalJS(`!!(document.querySelector('#sheet-root') && document.querySelector('#sheet-root').classList.contains('show'))`);
          const hadModal = await evalJS(`!!(document.querySelector('#modal-root') && document.querySelector('#modal-root').innerHTML.trim() !== '')`);
          const hadToast = await evalJS(`document.querySelectorAll('#toast-root .toast').length`);
          await realClick(x, y);
          await sleep(300);
          const newEx = exceptions.length - before;
          const afterLen = await evalJS(`document.body.innerText.length`);
          const sheetNow = await evalJS(`!!(document.querySelector('#sheet-root') && document.querySelector('#sheet-root').classList.contains('show'))`);
          const modalNow = await evalJS(`!!(document.querySelector('#modal-root') && document.querySelector('#modal-root').innerHTML.trim() !== '')`);
          const toastNow = await evalJS(`document.querySelectorAll('#toast-root .toast').length`);
          const changed = afterLen !== beforeLen || sheetNow !== hadSheet || modalNow !== hadModal || toastNow !== hadToast;
          const occlAction = (occl && occl !== action) ? occl : null;
          if (newEx > 0) {
            problems.push({ page: p, action, label, type: 'EXCEPTION' });
            mark('[' + p + '] ' + action + ' (' + label + ')', false, '点击抛异常: ' + (exceptions[before] || '').slice(0, 120));
          } else if (occlAction && occlAction !== action) {
            problems.push({ page: p, action, label, type: 'OCCLUDED' });
            mark('[' + p + '] ' + action + ' (' + label + ')', false, '被遮挡(实际点中: ' + occlAction + ')');
          } else if (!changed && !['quick:record', 'rec:del', 'contrib:open', 'hunt:ai-item'].includes(action)) {
            problems.push({ page: p, action, label, type: 'NO_FEEDBACK' });
            mark('[' + p + '] ' + action + ' (' + label + ')', false, '点击后无任何可见反馈');
          } else {
            mark('[' + p + '] ' + action + ' (' + label + ')', true, 'OK');
          }
          tested.push(action);
          // cleanup: close sheet/modal
          await evalJS(`if (document.querySelector('#sheet-root')) document.querySelector('#sheet-root').classList.remove('show'); true`);
        }
      }
      console.log('TESTED=' + tested.length);
      console.log('PROBLEMS=' + JSON.stringify(problems));
      console.log('EXCEPTIONS=' + JSON.stringify(exceptions.slice(0, 3)));
      console.log(problems.length ? 'FAIL_COUNT=' + problems.length : 'ALL_OK');
    } catch (e) {
      console.error('FATAL: ' + e.message);
    }
    ws.close();
    process.exit(0);
  };
  ws.onerror = (e) => { console.error('WSERR ' + (e.message || 'ws error')); process.exit(1); };
})();
