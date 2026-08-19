/* ============================================================
   「墨」· 主应用逻辑
   今日 / 目标 / 待办 / 复盘 · AI 气泡 · 设置 · 交互
   ============================================================ */
'use strict';

/* ---------- 小工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const settingsIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></svg>';

/* ---------- 应用状态 ---------- */
const App = {
  tab: 'today',
  reviewTab: 'weekly',
  ocrDraft: null,
  pendingGoal: null,
  longPressTimer: null,
  moodLabels: { '😊': '状态不错', '😐': '一般般', '😔': '有点累' }
};

/* ================= 初始化 ================= */
function init() {
  const store = Store.load();
  applyTheme(store.settings);
  rolloverIfNewDay();
  bindEvents();
  render();
  maybeOnboardSkeleton();
}

/* ================= 日期切换：未完成任务顺延到待办 ================= */
function rolloverIfNewDay() {
  const store = Store.load();
  const today = Store.todayStr();
  if (store.todayDate === today) return;
  const prevDate = store.todayDate;
  // 记录昨天数据
  const doneCount = store.completedLog.filter(e => e.date === prevDate).length;
  const planned = store.today.tasks.length;
  store.dayLog[prevDate] = { done: doneCount, planned, mood: store.today.status || '😐' };
  // 未完成 → 待办
  store.today.tasks.filter(t => !t.done).forEach(t => {
    store.backlog.unshift({ id: Store.uid(), text: t.text, estMin: t.estMin, priority: t.priority, originalDate: prevDate, why: t.why || '' });
  });
  store.today = { status: null, tasks: assembleDay(today) };
  store.todayDate = today;
  Store.save();
}

/* 组装某一天的任务：目标日程任务 + 智能补位（待办里优先件优先） */
function assembleDay(date) {
  const store = Store.load();
  const goalTasks = [];
  store.goals.filter(g => !g.archived).forEach(g => {
    g.tasks.filter(t => t.date === date && !t.done).forEach(t => {
      goalTasks.push({ id: Store.uid(), text: t.text, estMin: t.estMin, priority: false, done: false, goalId: g.id, why: t.why || '' });
    });
  });
  const suggest = AI.suggestTomorrow();
  if (goalTasks.length >= suggest.count) return goalTasks;
  const need = suggest.count - goalTasks.length;
  const pull = store.backlog
    .sort((a, b) => (b.priority - a.priority) || a.originalDate.localeCompare(b.originalDate))
    .slice(0, need)
    .map(b => ({ id: b.id, text: b.text, estMin: b.estMin, priority: b.priority, done: false, goalId: null, why: b.why || '' }));
  pull.forEach(b => { store.backlog = store.backlog.filter(x => x.id !== b.id); });
  return [...goalTasks, ...pull];
}

/* ================= 主题 ================= */
function applyTheme(settings) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.palette = settings.palette;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#FBF8FC';
}

/* ================= 渲染 ================= */
function render() {
  renderHeader();
  renderView();
  renderTabbar();
  if (App.tab === 'today') maybeFragBubble();
}

function renderHeader() {
  const store = Store.load();
  const $h = $('#app-header');
  const today = Store.todayStr();
  if (App.tab === 'today') {
    const h = new Date().getHours();
    const greet = h < 11 ? '☀️ 早安，今天。' : h < 18 ? '☀️ 下午好，今天。' : '🌙 晚上好，今天。';
    const moodBtns = ['😊', '😐', '😔'].map(m =>
      `<button class="mood ${store.today.status === m ? 'on' : ''}" data-action="mood:set" data-val="${m}" title="${App.moodLabels[m]}">${m}</button>`
    ).join('');
    $h.innerHTML = `
      <div class="header-inner">
        <div>
          <div class="greet-title">${greet}</div>
          <div class="greet-date">${Store.fmtMD(today)} · ${Store.fmtDOW(today)}</div>
        </div>
        <div class="header-tools">
          <div class="mood-picker"><span class="mood-label">状态</span>${moodBtns}</div>
          <button class="text-btn" data-action="end:day">结束</button>
          <button class="icon-btn" data-action="settings:open" title="设置" aria-label="设置">${settingsIcon()}</button>
        </div>
      </div>`;
  } else {
    const titles = { goals: '目标', backlog: '待办', review: '复盘' };
    $h.innerHTML = `
      <div class="header-inner">
        <div class="greet-title">${titles[App.tab]}</div>
        <div class="header-tools">
          <button class="icon-btn" data-action="settings:open" title="设置" aria-label="设置">${settingsIcon()}</button>
        </div>
      </div>`;
  }
}

function renderTabbar() {
  $$('#tabbar .tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === App.tab));
}

function renderView() {
  const $v = $('#view');
  $v.classList.remove('view-enter');
  void $v.offsetWidth;
  if (App.tab === 'today') $v.innerHTML = renderToday();
  else if (App.tab === 'goals') $v.innerHTML = renderGoals();
  else if (App.tab === 'backlog') $v.innerHTML = renderBacklog();
  else if (App.tab === 'review') $v.innerHTML = renderReview();
  $v.classList.add('view-enter');
  // 异步 AI 个性化（失败自动回退规则版，不影响体验）
  if (App.tab === 'today') { refreshHero(); refreshTomorrowNote(); refreshTimelineAI(); }
  else if (App.tab === 'review') refreshReviewAI();
}

/* ================= 今日页 · 时间线 ================= */

/** 为今日未确认任务补上规则版顺路建议（同步，确保离线也有时间线） */
function ensureRouteSuggestions(store) {
  const slots = AI.buildSlots(Store.todayStr());
  const valid = new Set(slots.map(s => s.key));
  let changed = false;
  store.today.tasks.forEach(t => {
    if (t.done || t.matched) return;
    if (!t.slot || !valid.has(t.slot)) {
      const r = AI.routeSuggestRule(t.text, t.estMin, slots);
      t.slot = r.slot;
      t.routeNote = r.reason;
      changed = true;
    }
  });
  if (changed) Store.save();
}

/** 异步：LLM 优化顺路建议（失败保留规则版） */
let _tlAIBusy = false;
async function refreshTimelineAI() {
  if (_tlAIBusy) return;
  const store = Store.load();
  const need = store.today.tasks.filter(t => !t.done && !t.matched);
  if (!need.length) return;
  _tlAIBusy = true;
  try {
    const r = await AI.routeSuggest(need, Store.todayStr());
    if (!r || !r.length) return;
    const st2 = Store.load();
    let changed = false;
    r.forEach(sug => {
      const t = st2.today.tasks.find(x => x.id === sug.taskId);
      if (t && !t.done && !t.matched && t.slot !== sug.slot) {
        t.slot = sug.slot; t.routeNote = sug.reason; changed = true;
      }
    });
    if (changed) { Store.save(); if (App.tab === 'today') renderView(); }
  } finally { _tlAIBusy = false; }
}

/** 确认单条顺路建议 */
function acceptRoute(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  t.matched = true;
  Store.save();
  render();
  const slot = AI.buildSlots(Store.todayStr()).find(s => s.key === t.slot);
  aiToast('route_accepted', { task: t.text, slot: slot ? slot.label : t.slot }, {
    buttons: [{ label: '🕐 换个时间', action: () => adjustSlot(id) }]
  });
}

/** 一键全确认 */
function acceptAllRoutes() {
  const store = Store.load();
  const list = store.today.tasks.filter(t => !t.done && !t.matched && t.slot);
  if (!list.length) return;
  list.forEach(t => { t.matched = true; });
  Store.save();
  render();
  aiToast('all_routes', { n: list.length });
}

/** 弹出槽位选择器（调整时间） */
function adjustSlot(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const slots = AI.buildSlots(Store.todayStr()).filter(s => s.type !== 'lesson');
  const chips = slots.map(s => `
    <button class="slot-pick ${t.slot === s.key ? 'on' : ''}" data-action="slot:pick" data-slot="${s.key}" data-id="${id}">
      <span class="sp-time">${s.time}</span>
      <span class="sp-label">${s.label}</span>
    </button>`).join('');
  openModal(modalShell('调整时间', '选一个更顺手的时段；也可以直接拖拽卡片调整顺序', `<div class="slot-grid">${chips}</div>`));
}

/** 拖拽排序：把任务移到目标任务所在位置，并跟随其槽位 */
let _dragId = null;
function moveTask(fromId, toId) {
  const store = Store.load();
  const arr = store.today.tasks;
  const i = arr.findIndex(x => x.id === fromId);
  if (i < 0) return;
  const [item] = arr.splice(i, 1);
  item.matched = true;
  const j = arr.findIndex(x => x.id === toId);
  if (j >= 0) item.slot = arr[j].slot;
  arr.splice(j >= 0 ? j : arr.length, 0, item);
  Store.save();
}

function renderToday() {
  const store = Store.load();
  ensureRouteSuggestions(store);
  const undone = store.today.tasks.filter(t => !t.done);
  const doneTasks = store.today.tasks.filter(t => t.done);
  const totalMin = undone.reduce((s, t) => s + t.estMin, 0);
  const budget = 180;
  const freeMin = Math.max(0, budget - totalMin);
  const prioCount = undone.filter(t => t.priority).length;

  const slots = AI.buildSlots(Store.todayStr());
  const slotByKey = {};
  slots.forEach(s => { slotByKey[s.key] = s; });
  const rank = s => slots.findIndex(x => x.key === s);

  // 未完成任务按槽位分组（保持槽位顺序）
  const groups = [];
  const unslotted = [];
  undone.forEach(t => {
    if (t.slot && slotByKey[t.slot]) {
      let g = groups.find(x => x.key === t.slot);
      if (!g) { g = { key: t.slot, label: slotByKey[t.slot].label, time: slotByKey[t.slot].time, hint: slotByKey[t.slot].hint, tasks: [] }; groups.push(g); }
      g.tasks.push(t);
    } else unslotted.push(t);
  });
  groups.sort((a, b) => rank(a.key) - rank(b.key));
  if (unslotted.length) groups.unshift({ key: '_todo', label: '待安排', time: '…', hint: '等你确认后，墨会把它们嵌进你的动线', tasks: unslotted });

  // 时间线任务卡片：点击看详情，复选框标记完成，左滑/长按呼出操作
  const taskRow = (t) => {
    const meta = `${t.estMin}分钟${t.priority ? ' · 🔴 优先任务' : ''}`;
    const sug = !t.done && !t.matched && t.slot && slotByKey[t.slot];
    const frag = AI.isFragTask(t.text, t.estMin) ? '<span class="bolt" title="适合碎片时间">⚡</span>' : '';
    return `
      <li class="task ${t.done ? 'done' : ''}${t.doing ? ' doing' : ''}${sug ? ' has-sug' : ''}" data-action="task:detail" data-id="${t.id}" ${t.done ? '' : 'draggable="true" title="点击查看详情 · 拖拽可调整顺序"'}">
        <span class="check" data-action="task:check" data-id="${t.id}">${t.done ? '🌱' : ''}</span>
        <div class="task-body">
          <span class="task-text">${esc(t.text)}${frag}</span>
          <span class="task-meta">${meta}${t.why ? ` · ${esc(t.why)}` : ''}</span>
          ${sug ? `
            <div class="route-sug"><span class="sug-tag">🛣 顺路</span><span class="sug-txt">${esc(t.routeNote || slotByKey[t.slot].hint || '')}</span></div>
            <div class="route-acts">
              <button class="mini-btn ok" data-action="task:accept-route" data-id="${t.id}">✓ 就这么办</button>
              <button class="mini-btn" data-action="task:adjust-slot" data-id="${t.id}">🕐 调整</button>
            </div>` : ''}
        </div>
        <span class="flag">${t.done ? '已完成' : (t.doing ? '⏳ 进行中' : '')}</span>
        <div class="swipe-acts">
          <button data-action="task:edit" data-id="${t.id}">✏️</button>
          <button data-action="task:to-backlog" data-id="${t.id}">待办</button>
          <button class="danger" data-action="task:del" data-id="${t.id}">🗑</button>
        </div>
      </li>`;
  };

  // 碎片建议卡：时间线空白处（骨架空档）自动出现，每日每任务最多提醒 2 次
  const fragCard = (() => {
    const st2 = Store.load();
    const free = AI.currentFreeSlot();
    if (!free || free.minutes < 5) return '';
    const today = Store.todayStr();
    const cands = AI.fragCandidates(st2).filter(c => (st2.flags.fragRemind[`${today}:${c.id}`] || 0) < 2);
    if (!cands.length) return '';
    const shown = cands.slice(0, 2);
    return `
      <div class="frag-card">
        <div class="frag-head">⏳ 现在有 ${free.minutes} 分钟空闲，可以：</div>
        ${shown.map(c => `
          <div class="frag-item">
            <span class="frag-txt">⚡ ${esc(c.text)}${c.estMin ? `<small>${c.estMin}分钟</small>` : ''}</span>
            <span class="frag-acts">
              <button class="mini-btn ok" data-action="frag:start" data-id="${c.id}" data-from="${c.from}">开始做</button>
              <button class="mini-btn ghost" data-action="frag:ignore" data-id="${c.id}">忽略</button>
            </span>
          </div>`).join('')}
      </div>`;
  })();

  const hero = aiHero();

  // 待办3天未选提醒
  let backlogHint = '';
  const stale3d = store.backlog.filter(b => {
    const days = (new Date(Store.todayStr()) - new Date(b.originalDate + 'T00:00:00')) / 864e5;
    return days >= 3 && days < 7;
  });
  if (stale3d.length && !store.flags.staleShown) {
    backlogHint = stale3d.map(b => `
      <div class="remind-card" style="margin-top:2px">
        <span>${AI.copy('backlog_3d', { task: b.text })}</span>
        <div class="acts">
          <button data-action="backlog:restore" data-id="${b.id}">排进今日</button>
          <button class="ghost" data-action="backlog:discard" data-id="${b.id}">不需要</button>
        </div>
      </div>`).join('');
    store.flags.staleShown = true;
    Store.save();
  }

  const suggest = AI.suggestTomorrow();
  const statsPanel = `
    <div class="stats-panel">
      <div class="card">
        <div class="stats-grid">
          <div class="stat"><div class="v">${doneTasks.length}<small>/${store.today.tasks.length}</small></div><div class="l">今日完成</div></div>
          <div class="stat"><div class="v">${freeMin}<small>分钟</small></div><div class="l">剩余空闲</div></div>
        </div>
        <div class="divider"></div>
        <div class="stat" style="padding:0 2px">
          <div class="l" style="margin-bottom:4px">明日建议</div>
          <div class="v" style="font-size:17px">${suggest.count} 件</div>
          <div class="l" style="margin-top:4px">基于你最近的节奏${suggest.weekend ? ' · 周末' : ''}</div>
          <div id="tomorrow-note" style="margin-top:8px;font-size:13px;line-height:1.7;color:var(--ink)"></div>
        </div>
        ${store.today.status ? `<div class="divider"></div><div style="font-size:13px;color:var(--ink-2)">今日状态：${store.today.status} ${App.moodLabels[store.today.status]}</div>` : ''}
      </div>
    </div>`;

  const pendingCount = undone.filter(t => !t.matched).length;

  // 「今日微调」入口：时间骨架启用且今天有固定安排时，低调出现在标题右侧
  const skn = store.settings.skeleton;
  const dowKey = DOW_KEYS[new Date(Store.todayStr() + 'T00:00:00').getDay()];
  const todaySegs = skn && skn.enabled
    ? (((skn.overrides && skn.overrides[Store.todayStr()]) !== undefined) ? skn.overrides[Store.todayStr()] : (skn.week[dowKey] || []))
    : [];
  const todaySkelBtn = skn && skn.enabled && todaySegs.length
    ? `<button class="mini-btn ghost" data-action="skeleton:today" style="margin-left:auto">今日微调</button>`
    : '';

  return `
    <div class="today-grid">
      <div class="today-stack">
        ${hero}
        <section class="card">
          <div class="card-title">
            <span class="t">时间线</span>
            <span class="meta">${undone.length}件 · 预计${totalMin}分钟</span>
            ${todaySkelBtn}
          </div>
          ${pendingCount ? `
          <div class="timeline-toolbar">
            <span class="tl-hint">🛣 墨已把任务嵌进你的动线</span>
            <button class="mini-btn ok" data-action="task:accept-all">一键全确认</button>
          </div>` : ''}
          ${backlogHint}
          ${fragCard}
          <div class="timeline">
            ${groups.map(g => `
              <div class="tl-group" data-slot="${g.key}">
                <div class="tl-slot"><span class="tl-time">${g.time}</span><span class="tl-label">${g.label}</span>${g.hint ? `<span class="tl-hint-txt">${esc(g.hint)}</span>` : ''}</div>
                <ul class="task-list tl-list">
                  ${g.tasks.map(taskRow).join('')}
                </ul>
              </div>`).join('')}
          </div>
          ${doneTasks.length ? `
            <div class="divider"></div>
            <div class="tl-done-title">✅ 已完成</div>
            <ul class="task-list">${doneTasks.map(taskRow).join('')}</ul>` : ''}
          <div class="divider"></div>
          <div class="today-bottom">
            <button class="backlog-entry" data-action="tab:switch" data-tab="backlog">
              待办 <span class="n">${store.backlog.length}</span> 件 →
            </button>
            <button class="cam-btn" data-action="camera:open">
              <span class="ic">📷</span> <span class="txt">拍照</span>
            </button>
          </div>
        </section>
      </div>
      ${window.innerWidth >= 768 ? statsPanel : ''}
    </div>`;
}

/* AI 英雄气泡（今日页） */
function aiHero() {
  const store = Store.load();
  const undone = store.today.tasks.filter(t => !t.done).length;
  const done = store.today.tasks.filter(t => t.done).length;
  const total = store.today.tasks.length;
  const prio = store.today.tasks.filter(t => t.priority && !t.done).length;
  const h = new Date().getHours();

  let text;
  if (total === 0) return '';
  if (undone === 0 && total > 0) {
    text = AI.copy('all_done');
  } else if (h >= 18) {
    text = AI.copy('evening', { done, total });
  } else {
    text = AI.copy('morning', { total: undone, priorityCount: prio });
  }
  // 连续3天全勤
  const streak = calcStreak();
  if (streak >= 3 && store.flags.streakShownDate !== Store.todayStr()) {
    text = `${text} ${AI.copy('streak3')}`;
    store.flags.streakShownDate = Store.todayStr();
    Store.save();
  }
  return bubble(text, 'left', 'hero-bubble');
}

/* 用 AI 个性化文案刷新英雄气泡（失败时保留规则版） */
async function refreshHero() {
  const b = $('#hero-bubble');
  if (!b) return;
  const store = Store.load();
  const undone = store.today.tasks.filter(t => !t.done).length;
  const done = store.today.tasks.filter(t => t.done).length;
  const total = store.today.tasks.length;
  const prio = store.today.tasks.filter(t => t.priority && !t.done).length;
  const h = new Date().getHours();
  if (total === 0) return;
  let trigger = 'morning';
  if (undone === 0) trigger = 'all_done';
  else if (h >= 18) trigger = 'evening';
  const smart = await AI.copySmart(trigger, { total: undone, done, priorityCount: prio });
  if (smart && b.isConnected) {
    const who = b.querySelector('.who');
    b.innerHTML = esc(smart);
    if (who) b.appendChild(who);
  }
}

/* 复盘 AI 叙事：LLM 基于真实数据生成周/月报个性化复盘 */
async function refreshReviewAI() {
  const store = Store.load();
  const bubbleId = App.reviewTab === 'weekly' ? 'review-week-bubble' : 'review-month-bubble';
  const narration = App.reviewTab === 'weekly'
    ? await AI.weeklyNarration(AI.weeklyReport())
    : await AI.monthlyNarration(AI.monthlyReport());
  if (!narration) return;
  // 更新气泡
  const b = $('#' + bubbleId);
  if (b && b.isConnected) {
    const who = b.querySelector('.who');
    b.innerHTML = esc(narration);
    if (who) b.appendChild(who);
  }
  // 填充 AI 复盘卡片
  const card = $('#ai-insight');
  if (card && card.isConnected) {
    card.style.display = '';
    const body = card.querySelector('.ai-insight-body');
    if (body) body.innerHTML = esc(narration);
  }
}

/* 明日方案（LLM 个性化推荐，失败时隐藏该区块） */
async function refreshTomorrowNote() {
  const box = $('#tomorrow-note');
  if (!box) return;
  const r = await AI.tomorrowPlan();
  if (!r || !box.isConnected) return;
  const planHtml = r.plan.map(p => `
    <div style="display:flex;gap:6px;margin-top:4px">
      <span style="color:var(--leaf,#7FB97A)">🌱</span>
      <span><b style="font-weight:600">${esc(p.text)}</b> ${p.why ? `<span style="color:var(--ink-2)">· ${esc(p.why)}</span>` : ''}</span>
    </div>`).join('');
  box.innerHTML = `
    <div style="padding:10px 12px;background:var(--card);border-radius:16px;border:.5px solid var(--line)">
      ${r.note ? `<div style="font-size:13px;line-height:1.7;color:var(--ink);margin-bottom:6px">${esc(r.note)}</div>` : ''}
      ${planHtml}
    </div>`;
}

function calcStreak() {
  const store = Store.load();
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const rec = store.dayLog[Store.shiftDate(Store.todayStr(), -i)];
    if (rec && rec.done >= 1) n++; else break;
  }
  return n;
}

/* ================= 待办页 ================= */
function renderBacklog() {
  const store = Store.load();
  // 灵感箱（子弹笔记：先接住想法，稍后整理）
  const inboxHtml = store.inbox.length ? store.inbox.map(item => {
    const sug = AI.inboxSuggest(item.text);
    return `
      <div class="inbox-item">
        <span class="inbox-text">${esc(item.text)}</span>
        <div class="inbox-sug">${esc(sug.reason)}</div>
        <div class="inbox-acts">
          <button class="mini-btn ok" data-action="inbox:to-today" data-id="${item.id}">排进今日</button>
          <button class="mini-btn" data-action="inbox:to-backlog" data-id="${item.id}">放待办</button>
          <button class="mini-btn ghost" data-action="inbox:del" data-id="${item.id}">删除</button>
        </div>
      </div>`;
  }).join('') : '<div class="inbox-empty">这里先“接住”你冒出来的想法，等你有空再整理。</div>';

  const inboxCard = `
    <section class="card">
      <div class="card-title">
        <span class="t">✏️ 灵感箱</span>
        <span class="meta">先记下来，稍后由墨帮你归类</span>
      </div>
      <input class="input inbox-input" id="inbox-input" placeholder="冒出什么想法？先写在这里，不用马上分类…">
      <div class="inbox-list">${inboxHtml}</div>
    </section>`;

  // 7天提醒
  const stale7 = store.backlog.filter(b => (new Date(Store.todayStr()) - new Date(b.originalDate + 'T00:00:00')) / 864e5 >= 7);
  const remind = stale7.length ? stale7.map(b => `
    <div class="remind-card">
      <span>${AI.copy('backlog_7d', { task: b.text })}</span>
      <div class="acts">
        <button data-action="backlog:restore" data-id="${b.id}">重新安排</button>
        <button class="ghost" data-action="backlog:delete" data-id="${b.id}">删除</button>
      </div>
    </div>`).join('') : '';

  // 按日期分组
  const groups = {};
  store.backlog.forEach(b => { (groups[b.originalDate] = groups[b.originalDate] || []).push(b); });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const groupHtml = dates.map(d => `
    <div class="date-group-label">📅 来自${Store.fmtMD(d)}</div>
    <div class="card" style="padding:10px">
      <ul class="task-list">
        ${groups[d].map(b => {
          const frag = AI.isFragTask(b.text, b.estMin) ? '<span class="bolt" title="适合碎片时间">⚡</span>' : '';
          return `
          <li class="task" data-action="backlog:detail" data-id="${b.id}" title="点击查看详情 · 左滑或长按可操作">
            <span class="check"></span>
            <div class="task-body">
              <span class="task-text">${esc(b.text)}${frag}${b.priority ? ' <span class="prio-tag">优先</span>' : ''}</span>
              <span class="task-meta">${b.estMin}分钟</span>
            </div>
            <span class="flag"></span>
            <div class="swipe-acts">
              <button data-action="backlog:to-today" data-id="${b.id}">今日</button>
              <button data-action="backlog:edit" data-id="${b.id}">✏️</button>
              <button class="danger" data-action="backlog:del" data-id="${b.id}">🗑</button>
            </div>
          </li>`;
        }).join('')}
      </ul>
    </div>`).join('') || '<div class="card" style="text-align:center;color:var(--ink-2)">待办是空的，今天的计划都可以在纸上完成。</div>';

  return `
    <div class="page-stack">
      ${inboxCard}
      <div style="font-size:13px;color:var(--ink-2);margin-top:6px">共 ${store.backlog.length} 件待办</div>
      ${remind}
      ${groupHtml}
      <div class="hint-line">点击任务 → 查看详情 · 左滑或长按 → 编辑/移动/删除 · ⚡ 适合碎片时间</div>
    </div>`;
}

/* 灵感箱动作 */
function inboxAdd(text) {
  const store = Store.load();
  store.inbox.unshift({ id: Store.uid(), text: text.trim(), at: new Date().toISOString() });
  Store.save();
  aiToast('inbox_captured');
  render();
}
function inboxToToday(id) {
  const store = Store.load();
  const item = store.inbox.find(x => x.id === id);
  if (!item) return;
  const sug = AI.inboxSuggest(item.text);
  const slots = AI.buildSlots(Store.todayStr());
  const slot = (sug.action === 'today' && slots.some(s => s.key === sug.slot)) ? sug.slot
    : (slots.find(s => s.type !== 'lesson') ? slots.find(s => s.type !== 'lesson').key : 'night');
  const label = slots.find(s => s.key === slot);
  store.today.tasks.push({
    id: Store.uid(), text: item.text, estMin: 15, priority: false, done: false, goalId: null,
    why: '', slot, matched: true, routeNote: sug.reason || ''
  });
  store.inbox = store.inbox.filter(x => x.id !== id);
  Store.save();
  render();
  aiToast('inbox_today', { task: item.text, slot: label ? label.label : slot, reason: sug.reason || '' });
}
function inboxToBacklog(id) {
  const store = Store.load();
  const item = store.inbox.find(x => x.id === id);
  if (!item) return;
  store.backlog.unshift({ id: Store.uid(), text: item.text, estMin: 15, priority: false, originalDate: Store.todayStr(), why: '' });
  store.inbox = store.inbox.filter(x => x.id !== id);
  Store.save();
  render();
  aiToast('inbox_backlog', { task: item.text });
}
function inboxDel(id) {
  const store = Store.load();
  const item = store.inbox.find(x => x.id === id);
  if (!item) return;
  confirmDelete(item.text, () => {
    const st = Store.load();
    st.inbox = st.inbox.filter(x => x.id !== id);
    Store.save();
    render();
    actionToast('已删除', () => {
      const st2 = Store.load();
      st2.inbox.unshift(item);
      Store.save(); render();
    });
  });
}
function inboxCopy(id) {
  const store = Store.load();
  const item = store.inbox.find(x => x.id === id);
  if (!item) return;
  const done = () => toast('已复制，可以粘贴到任何地方。', { ai: true, duration: 2000 });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(item.text).then(done).catch(done);
  } else {
    const ta = document.createElement('textarea');
    ta.value = item.text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    done();
  }
}

/** 选择时间槽：手动调整后视为已确认 */
function pickSlot(id, slotKey) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const slots = AI.buildSlots(Store.todayStr());
  const s = slots.find(x => x.key === slotKey);
  if (!s) return;
  t.slot = s.key;
  t.matched = true;
  t.routeNote = s.hint || '';
  Store.save();
  closeModal();
  render();
  aiToast('route_accepted', { task: t.text, slot: s.label });
}

/* ================= 目标页 ================= */
function renderGoals() {
  const store = Store.load();
  const active = store.goals.filter(g => !g.archived);
  const archived = store.goals.filter(g => g.archived);

  const goalCard = (g) => {
    const done = g.tasks.filter(t => t.done).length;
    const total = g.tasks.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const leftDays = Math.ceil((new Date(g.deadline + 'T00:00:00') - new Date()) / 864e5);
    const isKept = pct >= 100 && (store.flags.archivedIds || []).includes(g.id);
    // 进度灯：每个任务一个灯点，完成 ● 未完成 ○
    const dots = g.tasks.map(t => `<span class="goal-dot ${t.done ? 'on' : ''}"></span>`).join('');
    const remain = total - done;
    return `
      <article class="goal-card ${isKept ? 'done' : ''}" data-action="goal:detail" data-id="${g.id}">
        <div class="goal-progress"><div class="bar" style="width:${pct}%"></div></div>
        <div class="goal-title">${esc(g.title)}</div>
        <div class="goal-sub">${pct}% · 剩余${Math.max(0, leftDays)}天 · 还有${remain}件任务待完成</div>
        ${isKept ? '<div class="goal-kept-tag">已达成 · 暂不归档</div>' : ''}
        <div class="goal-dots">${dots}</div>
      </article>`;
  };

  // 达成100%待归档
  const achieved = active.filter(g => {
    const done = g.tasks.filter(t => t.done).length;
    return done >= g.tasks.length && !store.flags.archivedIds?.includes(g.id);
  });
  let banner = '';
  if (achieved.length) {
    banner = achieved.map(g => `
      <div class="achieve-banner">
        <span>🎯 ${AI.copy('goal_done', { title: g.title })}</span>
        <div class="acts">
          <button class="primary" data-action="goal:archive" data-id="${g.id}">归档</button>
          <button class="ghost" data-action="goal:keep" data-id="${g.id}">再想想</button>
        </div>
      </div>`).join('');
  }

  const goalBubble = () => {
    if (store.flags.goalJustDecomposed) {
      const msg = AI.copy('goal_decomposed');
      const title = store.flags.goalJustDecomposed;
      store.flags.goalJustDecomposed = null;
      Store.save();
      return bubble(msg, 'right');
    }
    return '';
  };

  return `
    <div class="page-stack">
      ${banner}
      ${goalBubble()}
      <button class="new-goal-card" data-action="goal:new">
        <span class="ic">✨</span>
        <div style="text-align:left">
          <div class="nt">新建目标</div>
          <div class="ns">输入目标，AI自动拆解</div>
        </div>
      </button>
      <div class="section-label">进行中</div>
      ${active.map(goalCard).join('') || '<div class="card" style="text-align:center;color:var(--ink-2)">还没有目标，先从一件想完成的事开始。</div>'}
      ${(() => {
        const doneGoals = [
          ...store.archivedGoals.map(g => ({ title: g.title, doneDate: g.doneDate })),
          ...archived.map(g => ({ title: g.title, doneDate: g.doneDate }))
        ];
        if (!doneGoals.length) return '';
        return `
        <div class="goal-done-title">✅ 已完成 <span class="n">（${doneGoals.length}个）</span></div>
        ${doneGoals.map(g => `<div class="card" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:15px;font-weight:500">${esc(g.title)}</span>
          <span style="font-size:12px;color:var(--ink-2)">${Store.fmtMD(g.doneDate)} 归档</span>
        </div>`).join('')}`;
      })()}
    </div>`;
}

/* ================= 复盘页 ================= */
function renderReview() {
  const seg = `
    <div class="seg-control">
      <button class="${App.reviewTab === 'weekly' ? 'on' : ''}" data-action="review:tab" data-val="weekly">周报</button>
      <button class="${App.reviewTab === 'monthly' ? 'on' : ''}" data-action="review:tab" data-val="monthly">月报</button>
    </div>`;

  if (App.reviewTab === 'weekly') {
    const r = AI.weeklyReport();
    const store = Store.load();
    // 本周已完成列表（最近7天，从 completedLog 取）
    const today = Store.todayStr();
    const weekEntries = [];
    for (let i = 0; i < 7; i++) {
      const ymd = Store.shiftDate(today, -i);
      const items = store.completedLog.filter(e => e.date === ymd);
      if (items.length) weekEntries.push({ ymd, items });
    }
    const maxV = Math.max(...r.days.map(d => d.done), 1);
    const spark = `
      <svg class="spark" viewBox="0 0 320 50" fill="none">
        <path d="${r.days.map((d, i) => `${i === 0 ? 'M' : 'L'}${(i / 6) * 320},${46 - (d.done / maxV) * 34}`).join(' ')}" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        ${r.days.map((d, i) => `<circle cx="${(i / 6) * 320}" cy="${46 - (d.done / maxV) * 34}" r="3" fill="var(--accent)"/>`).join('')}
      </svg>
      <div class="spark-labels"><span>${r.days[0].dow}</span><span>${r.days[6].dow}</span></div>`;

    const list = weekEntries.slice().reverse().map(g => `
      <div class="review-day">${Store.fmtMD(g.ymd)} · ${Store.fmtDOW(g.ymd)}</div>
      ${g.items.map(e => `
        <div class="review-task"><span class="mood">${e.mood}</span><span>${esc(e.text)}</span><span style="margin-left:auto;font-size:12px;color:var(--ink-2)">${e.estMin}分钟</span></div>`).join('')}`).join('');

    return `
      <div class="page-stack">
        ${seg}
        ${bubble(`本周完成${r.total}件。状态曲线：${r.curve}。${r.advice}`, 'left', 'review-week-bubble')}
        <div id="ai-insight" class="card ai-insight" style="display:none">
          <div class="card-title"><span class="t">墨的复盘</span><span class="tag-ai">AI</span></div>
          <div class="ai-insight-body"></div>
        </div>
        <div class="big-stat">
          <div class="v">${r.total}</div>
          <div class="l">本周完成（最近7天）</div>
        </div>
        <div class="card">
          <div class="card-title"><span class="t">节奏回顾</span></div>
          <div class="card-sub">每天完成的任务数量</div>
          ${spark}
          <div class="divider"></div>
          <div style="font-size:14px;line-height:1.7;color:var(--ink-2)">${r.curve}。</div>
        </div>
        ${r.fullAttendance ? `<div class="full-attend">🏆 ${AI.copy('streak3')} · 连续${calcStreak()}天全勤</div>` : ''}
        <section class="card">
          <div class="card-title"><span class="t">已完成任务</span></div>
          ${list || '<div class="card-sub">本周还没有完成记录。</div>'}
        </section>
      </div>`;
  }

  // 月报
  const m = AI.monthlyReport();
  const store = Store.load();
  const cellHtml = m.timeline.map(c => {
    const on = c.n > 0 ? 'on' : '';
    const todayD = Number(Store.todayStr().slice(8));
    const isToday = c.day === todayD;
    return `<div class="cell ${on} ${isToday ? 'today' : ''}" title="${c.day}日 · ${c.n}件">${c.day}</div>`;
  }).join('');
  const repeatedText = m.repeated.length
    ? m.repeated.map(r => `“${r.text}”×${r.n}`).join('、')
    : '本月还没有重复出现的灵感';

  return `
    <div class="page-stack">
      ${seg}
      ${bubble(`本月完成${m.total}件。重复出现的灵感有：${repeatedText}。`, 'left', 'review-month-bubble')}
      <div id="ai-insight" class="card ai-insight" style="display:none">
        <div class="card-title"><span class="t">墨的复盘</span><span class="tag-ai">AI</span></div>
        <div class="ai-insight-body"></div>
      </div>
      <div class="big-stat">
        <div class="v">${m.total}</div>
        <div class="l">本月完成</div>
      </div>
      <div class="card">
        <div class="card-title"><span class="t">月度回声墙</span></div>
        <div class="card-sub">把整月的完成串成一条时间线</div>
        <div class="month-timeline">${cellHtml}</div>
      </div>
      ${m.repeated.length ? `<div class="card">
        <div class="card-title"><span class="t">重复出现的灵感</span></div>
        ${m.repeated.map(r => `<div class="review-task"><span>${esc(r.text)}</span><span style="margin-left:auto;font-size:12px;color:var(--ink-2)">出现${r.n}次</span></div>`).join('')}
      </div>` : ''}
    </div>`;
}

/* ================= AI 气泡组件 ================= */
function bubble(text, align = 'left', id = '') {
  return `
    <div class="ai-hero ${align}">
      ${align === 'left' ? `<div class="ai-avatar" aria-label="墨"></div>` : ''}
      <div class="ai-bubble" ${id ? `id="${id}"` : ''}>
        ${esc(text)}
        <div class="who"><span class="dot" aria-hidden="true"></span>我</div>
      </div>
    </div>`;
}

function toast(text, opts = {}) {
  const root = $('#toast-root');
  const aiId = Store.uid();
  const buttons = opts.buttons && opts.buttons.length
    ? `<div class="toast-actions">${opts.buttons.map((b, i) =>
        `<button class="ta ${b.kind || ''}" data-tidx="${i}">${esc(b.label)}</button>`).join('')}</div>`
    : '';
  const t = el(`
    <div class="toast ${opts.ai ? 'ai' : ''}" style="pointer-events:auto">
      <div class="ai-bubble" style="max-width:${opts.wide ? '340px' : '300px'};background:${opts.ai ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.7)'};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)">
        <div class="toast-text">${esc(text)}</div>
        ${buttons}
        <div class="who"><span class="dot" aria-hidden="true"></span>我</div>
      </div>
    </div>`);
  root.appendChild(t);
  t.dataset.aiId = aiId;
  const log = Store.load();
  log.aiLog.push({ id: aiId, t: new Date().toTimeString().slice(0, 5), text });
  Store.save();
  const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 400); };
  if (buttons) {
    t.querySelectorAll('.ta').forEach((b, i) => {
      b.addEventListener('click', () => {
        clearTimeout(t._timer);
        const fn = opts.buttons[i] && opts.buttons[i].action;
        if (typeof fn === 'function') fn();
        dismiss();
      });
    });
    t._timer = setTimeout(dismiss, (opts.duration ?? 5000) + 4000);
  } else {
    t._timer = setTimeout(dismiss, opts.duration ?? 5000);
  }
  return t;
}

/* 个性化话术 toast：先显示规则版兜底，LLM 返回后无缝替换为 AI 生成版 */
async function aiToast(trigger, ctx = {}, opts = {}) {
  const rule = AI.copy(trigger, ctx) || opts.fallback || '…';
  const t = toast(rule, opts);
  const smart = await AI.copySmart(trigger, ctx);
  if (!smart || smart === rule || !t.isConnected) return;
  const txt = t.querySelector('.toast-text');
  if (txt) txt.textContent = smart;
  const log = Store.load();
  const item = log.aiLog.find(x => x.id === t.dataset.aiId);
  if (item) item.text = smart;
  Store.save();
}

/* ================= 弹窗 ================= */
function openModal(html) {
  const root = $('#modal-root');
  const ov = el(`<div class="overlay">${html}</div>`);
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
  root.innerHTML = '';
  root.appendChild(ov);
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function modalShell(title, sub, body, actions = '') {
  return `
    <div class="modal">
      <button class="close-x" data-action="modal:close">✕</button>
      <h3>${title}</h3>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      ${body}
      ${actions}
    </div>`;
}

/* ================= 轻量浮层 / 底部操作条 / 二次确认 ================= */

/* 毛玻璃轻量浮层：点击遮罩外关闭；data-sheet 按钮自动接管 */
function openSheet(html) {
  const root = $('#sheet-root');
  const ov = el(`<div class="sheet-overlay">${html}</div>`);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelectorAll('[data-sheet]').forEach(b => {
    b.addEventListener('click', () => { const a = b.dataset.sheet, id = b.dataset.id; ov.remove(); runSheetAction(a, id); });
  });
  root.appendChild(ov);
  return ov;
}

/* 浮层按钮分发 */
function runSheetAction(a, id) {
  switch (a) {
    case 'task:check': toggleTask(id); break;
    case 'task:instant': openInstantReview(id); break;
    case 'task:edit': openTaskEdit(id, 'today'); break;
    case 'task:del': taskDelToday(id); break;
    case 'task:to-backlog': taskToBacklog(id); break;
    case 'backlog:to-today': restoreToToday(id); break;
    case 'backlog:edit': openTaskEdit(id, 'backlog'); break;
    case 'backlog:del': doBacklogDelete(id); break;
    case 'achieve:archive': archiveGoal(id); break;
    case 'achieve:keep': keepGoal(id); break;
  }
}

/* 任务详情浮层：点击任务卡片弹出（毛玻璃，不跳转页面） */
function openTaskDetail(id, source) {
  const store = Store.load();
  const arr = source === 'today' ? store.today.tasks : store.backlog;
  const t = arr.find(x => x.id === id);
  if (!t) return;
  const isToday = source === 'today';
  const sug = isToday && t.slot ? AI.buildSlots(Store.todayStr()).find(s => s.key === t.slot) : null;
  const frag = AI.isFragTask(t.text, t.estMin);
  const rows = `
    <div class="ds-row"><span class="ds-k">预计</span><span class="ds-v">${t.estMin} 分钟</span></div>
    ${t.priority ? '<div class="ds-row"><span class="ds-k">标记</span><span class="ds-v">🔴 优先任务</span></div>' : ''}
    ${frag ? '<div class="ds-row"><span class="ds-k">碎片</span><span class="ds-v">⚡ 适合在空隙里顺手完成</span></div>' : ''}
    ${sug ? `<div class="ds-row"><span class="ds-k">顺路</span><span class="ds-v">${esc(sug.label)}${t.routeNote ? ` · ${esc(t.routeNote)}` : ''}</span></div>` : ''}
    ${isToday && t.doing ? '<div class="ds-row"><span class="ds-k">状态</span><span class="ds-v">⏳ 正在进行中</span></div>' : ''}`;
  const acts = isToday
    ? (t.done
      ? `<button class="btn-primary" data-sheet="task:check" data-id="${t.id}">🌱 重新打开</button>
         <button class="btn-ghost" data-sheet="task:instant" data-id="${t.id}">记录心情</button>`
      : `<button class="btn-primary" data-sheet="task:check" data-id="${t.id}">✓ 标记完成</button>
         <button class="btn-ghost" data-sheet="task:edit" data-id="${t.id}">✏️ 编辑</button>
         <button class="btn-ghost" data-sheet="task:to-backlog" data-id="${t.id}">移到待办</button>
         <button class="btn-danger" data-sheet="task:del" data-id="${t.id}">删除</button>`)
    : `<button class="btn-primary" data-sheet="backlog:to-today" data-id="${t.id}">排进今日</button>
       <button class="btn-ghost" data-sheet="backlog:edit" data-id="${t.id}">✏️ 编辑</button>
       <button class="btn-danger" data-sheet="backlog:del" data-id="${t.id}">删除</button>`;
  openSheet(`
    <div class="sheet">
      <div class="sheet-title">${esc(t.text)}</div>
      <div class="sheet-body">${rows}</div>
      <div class="sheet-acts">${acts}</div>
    </div>`);
}

/* 长按/右键操作菜单 */
function openTaskMenu(id, source) {
  const store = Store.load();
  const arr = source === 'today' ? store.today.tasks : store.backlog;
  const t = arr.find(x => x.id === id);
  if (!t) return;
  const isToday = source === 'today';
  const info = `${t.estMin}分钟${t.priority ? ' · 🔴 优先' : ''}${AI.isFragTask(t.text, t.estMin) ? ' · ⚡ 碎片' : ''}`;
  openModal(modalShell(
    esc(t.text), info,
    `<div class="menu-list">
      ${isToday
        ? `<button class="menu-item" data-action="${t.done ? 'task:instant' : 'task:edit'}" data-id="${id}" data-src="today">${t.done ? '📝 记录心情' : '✏️ 编辑任务'}</button>
           <button class="menu-item" data-action="task:to-backlog" data-id="${id}" data-src="today">↩ 移到待办</button>`
        : `<button class="menu-item" data-action="backlog:to-today" data-id="${id}">📅 排进今日</button>
           <button class="menu-item" data-action="backlog:edit" data-id="${id}">✏️ 编辑任务</button>`}
      <button class="menu-item danger" data-action="${isToday ? 'task:del' : 'backlog:del'}" data-id="${id}">🗑 删除任务</button>
    </div>`
  ));
}

/* 编辑任务弹窗 */
function openTaskEdit(id, source) {
  const store = Store.load();
  const arr = source === 'today' ? store.today.tasks : store.backlog;
  const t = arr.find(x => x.id === id);
  if (!t) return;
  openModal(modalShell(
    '编辑任务', '修改任务内容与预计用时。',
    `<input class="input" id="edit-text" value="${esc(t.text)}">
     <div style="font-size:12px;color:var(--ink-2);margin:10px 2px 6px">预计用时（分钟）</div>
     <input class="input" type="number" id="edit-min" min="1" max="300" value="${t.estMin || 15}">
     <div class="chips" style="margin-top:10px">
       <button class="chip ${t.priority ? 'on' : ''}">🔴 优先任务</button>
     </div>`,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="modal:close">取消</button>
      <button class="btn-primary" data-action="edit:save" data-id="${id}" data-src="${source}">保存</button>
    </div>`
  ));
}

/* 保存编辑（支持撤销） */
function saveTaskEdit(id, source) {
  const store = Store.load();
  const arr = source === 'today' ? store.today.tasks : store.backlog;
  const t = arr.find(x => x.id === id);
  if (!t) return;
  const old = { text: t.text, estMin: t.estMin, priority: t.priority };
  const text = $('#edit-text').value.trim();
  const min = clamp(Number($('#edit-min').value) || 15, 1, 300);
  const prio = !!$('#modal-root .chip.on');
  if (!text) { toast('任务内容不能为空。'); return; }
  t.text = text; t.estMin = min; t.priority = prio;
  Store.save();
  closeModal();
  render();
  actionToast('已保存修改', () => {
    const st = Store.load();
    const tt = (source === 'today' ? st.today.tasks : st.backlog).find(x => x.id === id);
    if (tt) { tt.text = old.text; tt.estMin = old.estMin; tt.priority = old.priority; }
    Store.save(); render();
  });
}

/* 删除的二次确认（毛玻璃、语气温和） */
function confirmDelete(text, onOk) {
  const ov = openSheet(`
    <div class="sheet confirm-sheet">
      <div class="sheet-title">确定要删除“${esc(text)}”吗？</div>
      <div class="sheet-sub">删掉后就找不回来了，先想清楚哦。</div>
      <div class="sheet-acts">
        <button class="btn-ghost sheet-cancel">再想想</button>
        <button class="btn-danger sheet-ok">删除</button>
      </div>
    </div>`);
  ov.querySelector('.sheet-cancel').addEventListener('click', () => ov.remove());
  ov.querySelector('.sheet-ok').addEventListener('click', () => { ov.remove(); onOk(); });
}

/* 底部轻提示 + 撤销（4 秒淡出，给足反应时间） */
function actionToast(msg, undoFn) {
  const root = $('#action-toast-root');
  const t = el(`
    <div class="action-toast">
      <span class="at-msg">${esc(msg)}</span>
      ${typeof undoFn === 'function' ? '<button class="at-undo">撤销</button>' : ''}
    </div>`);
  root.appendChild(t);
  const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  if (typeof undoFn === 'function') {
    t.querySelector('.at-undo').addEventListener('click', () => { clearTimeout(t._timer); undoFn(); dismiss(); });
  }
  t._timer = setTimeout(dismiss, 4000);
}

/* ================= 碎片时间 ================= */

/* 碎片任务「开始做」：进入执行状态（doing），可从待办带入今日 */
function fragStart(id, from) {
  const store = Store.load();
  const today = Store.todayStr();
  const key = `${today}:${id}`;
  store.flags.fragRemind[key] = (store.flags.fragRemind[key] || 0) + 1;
  if (from === 'backlog') {
    const b = store.backlog.find(x => x.id === id);
    if (!b) return;
    const nt = { id: Store.uid(), text: b.text, estMin: b.estMin, priority: b.priority, done: false, goalId: null, why: b.why || '', doing: true, slot: '', matched: false, routeNote: '' };
    store.today.tasks.push(nt);
    store.backlog = store.backlog.filter(x => x.id !== id);
    Store.save();
    render();
    aiToast('frag_started', { task: b.text });
    actionToast(`已把"${b.text}"放进今天`, () => {
      const st = Store.load();
      st.today.tasks = st.today.tasks.filter(x => x.id !== nt.id);
      st.backlog.unshift({ id: b.id, text: b.text, estMin: b.estMin, priority: b.priority, originalDate: b.originalDate || today, why: b.why || '' });
      Store.save(); render();
    });
  } else {
    const t = store.today.tasks.find(x => x.id === id);
    if (!t) return;
    t.doing = true;
    Store.save();
    render();
    aiToast('frag_started', { task: t.text });
    actionToast(`"${t.text}"正在进行中`, () => {
      const st = Store.load();
      const tt = st.today.tasks.find(x => x.id === id);
      if (tt) tt.doing = false;
      Store.save(); render();
    });
  }
}

/* 碎片任务「忽略」：今天不再提醒 */
function fragIgnore(id) {
  const store = Store.load();
  store.flags.fragRemind[`${Store.todayStr()}:${id}`] = 2;
  Store.save();
  render();
}

function closeFragBubble() {
  const b = $('.frag-bubble');
  if (b) b.remove();
}

/* 右下角气泡：今天碎片时段较多时提示一次，不反复推送 */
function maybeFragBubble() {
  if ($('.frag-bubble')) return;
  const store = Store.load();
  const today = Store.todayStr();
  if (store.flags.fragBubbleShownDate === today) return;
  const n = AI.countFragSlots(today);
  if (n < 2) return;
  store.flags.fragBubbleShownDate = today;
  Store.save();
  const b = el(`
    <div class="frag-bubble">
      <div class="ai-bubble">今天有 ${n} 段碎片时间，可以完成一些小事。<div class="who"><span class="dot" aria-hidden="true"></span>我</div></div>
      <button class="mini-btn ghost frag-bubble-close" data-action="frag:close">知道了</button>
    </div>`);
  $('#bubble-host').appendChild(b);
}

/* ================= 目标相关 ================= */

/* ================= 目标相关 ================= */

/* 新建目标 */
function openNewGoal() {
  openModal(modalShell(
    '✨ 新建目标', '输入你想完成的事，墨会帮你拆成每天能打勾的小步。',
    `<input class="input" id="goal-input" placeholder="例如：8月内写一篇公众号文章" autofocus>
     <div class="chips" id="deadline-chips">
       <button class="chip on" data-days="10">10天</button>
       <button class="chip" data-days="14">两周</button>
       <button class="chip" data-days="21">三周</button>
       <button class="chip" data-days="30">一个月</button>
     </div>`,
    `<div class="modal-actions"><button class="btn-primary" data-action="goal:decompose">让墨拆解</button></div>`
  ));
  let selected = 10;
  $('#deadline-chips').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    selected = Number(b.dataset.days);
    $$('#deadline-chips .chip').forEach(c => c.classList.toggle('on', c === b));
  });
  const input = $('#goal-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doDecompose(input.value, selected); });
}

async function doDecompose(inputText, days) {
  if (!inputText.trim()) return;
  const store = Store.load();
  const deadline = Store.shiftDate(Store.todayStr(), days);
  // AI 生成加载态
  openModal(modalShell('✨ 墨正在拆解…', '结合你的目标与性格，生成温柔可行的每日任务。',
    `<div class="loading-card"><div class="spin"></div><div style="color:var(--ink-2);font-size:14px">墨正在思考怎么帮你走得稳…</div></div>`));
  const plan = await AI.goalDecompose(inputText.trim(), deadline);
  // 展示拆解结果
  const milestones = plan.milestones.map(m => `
    <div class="milestone"><span class="m-dot"></span><div class="m-title">${m}<div class="m-why">里程碑 · 一段完成，就走完三分之一</div></div></div>`).join('');
  const taskRows = plan.tasks.map((t, i) => `
    <div class="decomp-task">
      <span class="d-date">${Store.fmtMD(t.date)}</span>
      <div>
        ${esc(t.text)} <span style="color:var(--ink-2);font-size:11px">· ${t.estMin}分钟</span>
        <span class="d-why">为什么：${esc(t.why)}</span>
      </div>
      <select data-idx="${i}" class="d-date-sel"></select>
    </div>`).join('');

  openModal(modalShell(
    '目标已拆解完成', '总任务估算 ' + plan.estimate + ' · 可用工作日 ' + plan.workdays + ' 天 · 每天工作量 ' + plan.daily,
    `${milestones}${taskRows}
     <div style="font-size:12px;color:var(--ink-2);margin-top:10px">可以调整每个任务的日期，或直接确认。每天最多3件，多了墨会帮你移到待办。</div>`,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="modal:close">再想想</button>
      <button class="btn-primary" data-action="goal:confirm">确认创建</button>
    </div>`
  ));

  // 日期下拉：可选工作日
  const weekdays = Store.listWeekdays(Store.todayStr(), plan.tasks.length + 3);
  $$('.d-date-sel').forEach(sel => {
    const idx = Number(sel.dataset.idx);
    weekdays.forEach((d, di) => {
      const o = document.createElement('option');
      o.value = d; o.textContent = Store.fmtMD(d);
      if (d === plan.tasks[idx].date) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      plan.tasks[idx].date = sel.value;
      const label = sel.closest('.decomp-task').querySelector('.d-date');
      if (label) label.textContent = Store.fmtMD(sel.value);
    });
  });

  App.pendingGoal = { title: inputText.trim(), deadline, plan };
}

/* 目标详情 */
function openGoalDetail(id) {
  const store = Store.load();
  const g = store.goals.find(x => x.id === id);
  if (!g) return;
  const done = g.tasks.filter(t => t.done).length;
  const total = g.tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const leftDays = Math.ceil((new Date(g.deadline + 'T00:00:00') - new Date()) / 864e5);

  const groups = {};
  g.tasks.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  const body = `
    <div class="goal-progress" style="margin:14px 0 4px"><div class="bar" style="width:${pct}%"></div></div>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:14px">${pct}% · 剩余${Math.max(0, leftDays)}天 · ${done}/${total} 件完成</div>
    ${dates.map(d => `
      <div class="date-group-label">${Store.fmtMD(d)} ${Store.fmtDOW(d)}</div>
      <div class="card" style="padding:8px">
        ${groups[d].map(t => `
          <div class="decomp-task" data-action="goal:task" data-tid="${t.id}">
            <span class="check" style="${t.done ? 'background:var(--leaf,#7FB97A);border-color:var(--leaf,#7FB97A);color:#fff' : ''}">${t.done ? '🌱' : ''}</span>
            <div style="flex:1">
              ${esc(t.text)} <span style="color:var(--ink-2);font-size:11px">· ${t.estMin}分钟</span>
              <span class="d-why">为什么：${esc(t.why)}</span>
            </div>
          </div>`).join('')}
      </div>`).join('')}
    <div class="modal-actions">
      <button class="btn-ghost" data-action="modal:close">知道了</button>
      ${pct >= 100 ? `<button class="btn-primary" data-action="goal:archive" data-id="${g.id}">已达成，归档</button>` : ''}
    </div>`;
  openModal(modalShell(esc(g.title), '目标详情 · 完成任务即可点亮进度灯', body));
}

/* ================= OCR 拍照 ================= */
function openCamera() {
  const input = $('#camera-input');
  input.value = '';
  input.click();
}

function handlePhoto(file) {
  if (!file) return;
  // 模拟识别过程（真实实现：上传至百度OCR手写版API）
  openModal(modalShell('📷 正在识别…', '拍清楚就好，拍完可以手动修改',
    `<div class="loading-card"><div class="spin"></div><div style="color:var(--ink-2);font-size:14px">墨正在读你的手写计划…</div></div>`));
  setTimeout(() => {
    App.ocrDraft = AI.ocrSimulate();
    renderOcrConfirm();
  }, 1400);
}

function renderOcrConfirm() {
  const draft = App.ocrDraft;
  if (!draft) return;
  const lines = draft.lines.map((l, i) => `
    <div class="ocr-line" data-idx="${i}">
      <span class="txt"><span class="t-view">${esc(l.text)}</span></span>
      <button class="edit-btn" data-action="ocr:edit" data-idx="${i}" title="编辑">✏️</button>
      <button class="edit-btn" data-action="ocr:copy" data-idx="${i}" title="复制">📋</button>
    </div>`).join('');

  openModal(modalShell(
    '识别结果', '只做文字提取：不自动修正、不联想、不分类。识别有误可点击 ✏️ 修改，全部内容归你掌控。',
    lines,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="ocr:copy-all">复制全部</button>
      <button class="btn-ghost" data-action="ocr:discard">取消</button>
      <button class="btn-primary" data-action="ocr:today">加入今日</button>
      <button class="btn-primary" style="background:var(--card);border:.5px solid var(--line);color:var(--ink)" data-action="ocr:backlog">加入待办</button>
    </div>`
  ));
}

function startOcrEdit(idx) {
  const l = App.ocrDraft.lines[idx];
  const view = $(`.ocr-line[data-idx="${idx}"] .t-view`);
  const inp = el(`<input value="${esc(l.text)}" autofocus>`);
  view.replaceWith(inp);
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
  const commit = () => {
    const val = inp.value.trim();
    if (val) l.text = val;   // 只改用户自己改的内容，绝不自动补全/修正
    renderOcrConfirm();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
}

function ocrCopy(idx) {
  const l = App.ocrDraft.lines[idx];
  if (!l) return;
  copyText(l.text, '已复制这一行。');
}
function ocrCopyAll() {
  const draft = App.ocrDraft;
  if (!draft) return;
  copyText(draft.lines.map(l => l.text).join('\n'), '已复制全部文本。');
}
function copyText(text, okMsg) {
  const done = () => toast(okMsg || '已复制。', { ai: true, duration: 2200 });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    done();
  }
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('contextmenu', e => {
    const task = e.target.closest('.task');
    if (task && (task.dataset.action === 'task:detail' || task.dataset.action === 'backlog:detail')) {
      e.preventDefault();
      openTaskMenu(task.dataset.id, task.dataset.action === 'task:detail' ? 'today' : 'backlog');
    }
  });

  const input = $('#camera-input');
  input.addEventListener('change', () => handlePhoto(input.files[0]));

  // 灵感箱：回车快速捕捉（事件委托，避免重复绑定）
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target && e.target.id === 'inbox-input') {
      const v = e.target.value.trim();
      if (v) { inboxAdd(v); e.target.value = ''; }
    }
  });

  // 时间线拖拽排序（桌面端；手机端用"调整"按钮）
  document.addEventListener('dragstart', e => {
    const li = e.target.closest('.task');
    if (li && li.dataset.action === 'task:detail' && !li.classList.contains('done')) {
      _dragId = li.dataset.id;
      li.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    }
  });
  document.addEventListener('dragover', e => {
    const li = e.target.closest('.task');
    if (li && _dragId && li.dataset.id !== _dragId) e.preventDefault();
  });
  document.addEventListener('drop', e => {
    const li = e.target.closest('.task');
    if (!li || !_dragId || li.dataset.id === _dragId) return;
    e.preventDefault();
    moveTask(_dragId, li.dataset.id);
    _dragId = null;
    render();
  });
  document.addEventListener('dragend', e => {
    const li = e.target.closest('.task');
    if (li) li.classList.remove('dragging');
    _dragId = null;
  });

  // 深色模式跟随系统
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const store = Store.load();
    if (store.settings.theme === 'system') applyTheme(store.settings);
  });
  window.addEventListener('resize', debounce(() => { if (App.tab === 'today') renderView(); }, 300));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let touchTarget = null;
let touchStartX = 0;
function onTouchStart(e) {
  touchTarget = e.target.closest('.task');
  touchStartX = e.touches ? e.touches[0].clientX : 0;
  if (!touchTarget) return;
  if (touchTarget.classList.contains('swiped')) return; // 已滑开，先处理按钮
  const act = touchTarget.dataset.action;
  if (act !== 'task:detail' && act !== 'backlog:detail' && act !== 'task:instant') return;
  App.longPressTimer = setTimeout(() => {
    const id = touchTarget.dataset.id;
    if (act === 'task:detail' || act === 'backlog:detail') openTaskMenu(id, act === 'task:detail' ? 'today' : 'backlog');
    else openInstantReview(id);
    navigator.vibrate && navigator.vibrate(15);
  }, 550);
}
function onTouchMove(e) {
  clearTimeout(App.longPressTimer);
  if (touchTarget) {
    const dx = e.touches[0].clientX - touchStartX;
    if (dx < -50) touchTarget.classList.add('swiped');
    else if (dx > 50) touchTarget.classList.remove('swiped');
  }
}
function onTouchEnd() { clearTimeout(App.longPressTimer); touchTarget = null; }

function onClick(e) {
  // 点击任务外区域 → 收起所有左滑按钮
  if (!e.target.closest('.task')) {
    $$('.task.swiped').forEach(x => x.classList.remove('swiped'));
  }
  // 点击已滑开任务的卡片主体 → 先收起，避免误触详情
  const swTask = e.target.closest('.task.swiped');
  if (swTask && !e.target.closest('.swipe-acts')) {
    swTask.classList.remove('swiped');
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  const id = btn.dataset.id;

  // 时间骨架「复制到其他日期」的目标日期多选
  if (btn.classList.contains('chip')) { btn.classList.toggle('on'); return; }

  switch (act) {
    case 'tab:switch': App.tab = btn.dataset.tab; render(); break;
    case 'settings:open': openSettings(); break;
    case 'modal:close': closeModal(); break;
    case 'mood:set': setMood(btn.dataset.val); break;
    case 'task:check': toggleTask(id); break;
    case 'task:detail': openTaskDetail(id, 'today'); break;
    case 'task:edit': openTaskEdit(id, 'today'); break;
    case 'task:del': taskDelToday(id); break;
    case 'task:to-backlog': taskToBacklog(id); break;
    case 'task:instant': openInstantReview(id); break;
    case 'end:day': endDay(); break;
    case 'camera:open': openCamera(); break;
    case 'backlog:detail': openTaskDetail(id, 'backlog'); break;
    case 'backlog:edit': openTaskEdit(id, 'backlog'); break;
    case 'backlog:del': doBacklogDelete(id); break;
    case 'backlog:to-today': restoreToToday(id); break;
    case 'backlog:restore': restoreToToday(id); break;
    case 'backlog:delete': doBacklogDelete(id); break;
    case 'backlog:discard': doBacklogDiscard(id); break;
    case 'goal:new': openNewGoal(); break;
    case 'goal:decompose': doDecompose($('#goal-input').value, getSelectedDays()); break;
    case 'goal:confirm': confirmGoal(); break;
    case 'goal:detail': openGoalDetail(id); break;
    case 'goal:task': toggleGoalTask(btn.dataset.tid); break;
    case 'goal:archive': archiveGoal(id); break;
    case 'goal:keep': keepGoal(id); break;
    case 'review:tab': App.reviewTab = btn.dataset.val; renderView(); break;
    case 'review:save': saveReview(); break;
    case 'ocr:edit': startOcrEdit(Number(btn.dataset.idx)); break;
    case 'ocr:copy': ocrCopy(Number(btn.dataset.idx)); break;
    case 'ocr:copy-all': ocrCopyAll(); break;
    case 'ocr:today': commitOcr('today'); break;
    case 'ocr:backlog': commitOcr('backlog'); break;
    case 'ocr:discard': closeModal(); App.ocrDraft = null; break;
    case 'history:open': openHistory(); break;
    case 'settings:palette': setPalette(btn.dataset.val); break;
    case 'settings:theme': setTheme(btn.dataset.val); break;
    case 'settings:reset': resetAll(); break;
    case 'settings:ai-test': testAi(); break;
    case 'skeleton:edit': openSkeletonDay(btn.dataset.day); break;
    case 'skeleton:add': addSkeletonRow(); break;
    case 'skeleton:del': delSkeletonRow(Number(btn.dataset.idx)); break;
    case 'skeleton:save': saveSkeletonDay(btn.dataset.day); break;
    case 'skeleton:template': applyTemplate(btn.dataset.tpl); break;
    case 'skeleton:today': openSkeletonDay('today'); break;
    case 'skeleton:reset-today': resetTodaySkeleton(); break;
    case 'skeleton:copy-toggle': toggleCopyTargets(); break;
    case 'skeleton:copy-do': copySkeletonToDays(); break;
    case 'skeleton:onboard': onboardSkeleton(btn.dataset.tpl); break;
    case 'skeleton:onboard-skip': onboardSkip(); break;
    case 'task:accept-route': acceptRoute(id); break;
    case 'task:accept-all': acceptAllRoutes(); break;
    case 'task:adjust-slot': adjustSlot(id); break;
    case 'slot:pick': pickSlot(btn.dataset.id, btn.dataset.slot); break;
    case 'inbox:to-today': inboxToToday(id); break;
    case 'inbox:to-backlog': inboxToBacklog(id); break;
    case 'inbox:del': inboxDel(id); break;
    case 'inbox:copy': inboxCopy(id); break;
    case 'edit:save': saveTaskEdit(id, btn.dataset.src); break;
    case 'frag:start': fragStart(id, btn.dataset.from); break;
    case 'frag:ignore': fragIgnore(id); break;
    case 'frag:close': closeFragBubble(); break;
  }
}

function getSelectedDays() {
  const on = $('.chip.on');
  return on ? Number(on.dataset.days) : 10;
}

/* ================= 动作实现 ================= */

function setMood(m) {
  const store = Store.load();
  store.today.status = store.today.status === m ? null : m;
  Store.save();
  if (m === '😔' && store.today.status === '😔') {
    // 移1件到待办
    const undone = store.today.tasks.filter(t => !t.done);
    if (undone.length > 1) {
      const moved = undone[undone.length - 1];
      store.backlog.unshift({ id: Store.uid(), text: moved.text, estMin: moved.estMin, priority: moved.priority, originalDate: Store.todayStr(), why: moved.why || '' });
      store.today.tasks = store.today.tasks.filter(t => t.id !== moved.id);
      Store.save();
      aiToast('task_moved_out', { task: moved.text });
    } else {
      aiToast('mood_low');
    }
  }
  render();
}

function toggleTask(id, opts = {}) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const wasDone = t.done;
  t.done = !t.done;
  t.doing = false;
  if (t.done) {
    store.completedLog.push({ id: Store.uid(), text: t.text, date: Store.todayStr(), doneAt: new Date().toISOString(), estMin: t.estMin, actualMin: t.estMin, mood: '😐', note: '' });
    // 联动目标进度
    if (t.goalId) {
      const g = store.goals.find(x => x.id === t.goalId);
      if (g) { const gt = g.tasks.find(x => x.text === t.text && !x.done); if (gt) gt.done = true; }
    }
    // 时间预估修正
    adjustEstimate(t);
    const doneCount = store.today.tasks.filter(x => x.done).length;
    const total = store.today.tasks.length;
    const remaining = total - doneCount;
    Store.save();
    if (!opts.silent) {
      actionToast('已标记为完成', () => toggleTask(id, { silent: true }));
      if (remaining === 0) {
        setTimeout(() => aiToast('all_done'), 400);
        if (total >= 5) setTimeout(() => aiToast('over_done', { total }, { wide: true }), 1800);
      } else if (doneCount === 1 && total >= 4) {
        setTimeout(() => aiToast('only_one', {}, { wide: true }), 800);
      }
    }
  } else {
    // 取消完成：移除今日完成记录，目标进度回退
    const i = store.completedLog.findIndex(e => e.text === t.text && e.date === Store.todayStr());
    if (i >= 0) store.completedLog.splice(i, 1);
    if (t.goalId) {
      const g = store.goals.find(x => x.id === t.goalId);
      if (g) { const gt = g.tasks.find(x => x.text === t.text && x.done); if (gt) gt.done = false; }
    }
    Store.save();
    if (!opts.silent) actionToast('已取消完成', () => toggleTask(id, { silent: true }));
  }
  render();
}

/* 时间预估修正：同一任务连续3次实际用时偏离 → 自动调整 */
function adjustEstimate(t) {
  const store = Store.load();
  const key = t.text;
  const s = store.stats[key] || { n: 0, totalMin: 0 };
  s.n++; s.totalMin += t.estMin;
  s.avg = Math.round(s.totalMin / s.n);
  store.stats[key] = s;
  if (s.n === 3 && !store.flags.adjustedShown[key]) {
    store.flags.adjustedShown[key] = true;
    const newEst = s.avg;
    store.today.tasks.filter(x => x.text === key).forEach(x => { x.estMin = newEst; });
    Store.save();
    aiToast('adjust_estimate', { task: key, avg: newEst });
  }
}

function openInstantReview(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const moods = ['😊', '😐', '😔', '💪', '😮‍💨'];
  openModal(modalShell(
    `这件任务做完了，感觉如何？`,
    `“${esc(t.text)}” · 预计${t.estMin}分钟`,
    `<div class="chips" style="justify-content:center">${moods.map(m => `<button class="chip mood" data-mood="${m}">${m}</button>`).join('')}</div>
     <textarea class="input" id="review-note" placeholder="想说点什么（可选）"></textarea>
     <div style="font-size:12px;color:var(--ink-2);margin:8px 2px">实际用时（分钟，可选）</div>
     <input class="input" type="number" id="review-min" min="1" max="300" placeholder="${t.estMin}">`,
    `<div class="modal-actions"><button class="btn-ghost" data-action="modal:close">跳过</button>
     <button class="btn-primary" data-action="review:save" data-id="${id}">记录</button></div>`
  ));
  let mood = '😐';
  $$('#modal-root .mood').forEach(b => b.addEventListener('click', () => {
    mood = b.dataset.mood;
    $$('#modal-root .mood').forEach(x => x.classList.toggle('on', x === b));
  }));
  App.pendingReview = { id, mood };
}

function saveReview() {
  const store = Store.load();
  const pr = App.pendingReview;
  App.pendingReview = null;
  if (!pr) return;
  const t = store.today.tasks.find(x => x.id === pr.id);
  if (!t) return;
  const note = $('#review-note')?.value || '';
  const min = Number($('#review-min')?.value);
  const entry = store.completedLog.find(e => e.text === t.text && e.date === Store.todayStr());
  if (entry) { entry.mood = pr.mood; entry.note = note; if (min) entry.actualMin = min; }
  // 更新用时统计
  if (min) {
    const s = store.stats[t.text] || { n: 0, totalMin: 0 };
    s.n++; s.totalMin += min; s.avg = Math.round(s.totalMin / s.n);
    store.stats[t.text] = s;
  }
  Store.save();
  closeModal();
  aiToast('review_saved', {}, { fallback: '记录好了。完成本身就是意义。' });
}

function endDay() {
  const store = Store.load();
  const view = $('#view');
  view.classList.add('ending');
  setTimeout(() => {
    // 记录今天的完成数据
    const doneCount = store.completedLog.filter(e => e.date === Store.todayStr()).length;
    store.dayLog[store.todayDate] = { done: doneCount, planned: store.today.tasks.length, mood: store.today.status || '😐' };
    // 未完成 → 待办
    store.today.tasks.filter(t => !t.done).forEach(t => {
      store.backlog.unshift({ id: Store.uid(), text: t.text, estMin: t.estMin, priority: t.priority, originalDate: store.todayDate, why: t.why || '' });
    });
    // 显示结束动画
    const ov = el(`
      <div class="day-end-overlay">
        <div class="txt">今日已完成。明天见。${doneCount > 0 ? `<div class="sub">今天你为自己做了 ${doneCount} 件事</div>` : ''}</div>
      </div>`);
    document.body.appendChild(ov);
    Store.save();
    setTimeout(() => {
      ov.remove();
      store.todayDate = Store.shiftDate(store.todayDate, 1);
      store.today = { status: null, tasks: assembleDay(store.todayDate) };
      Store.save();
      view.classList.remove('ending');
      render();
      setTimeout(() => aiToast('morning', { total: store.today.tasks.length, priorityCount: 0 }), 500);
    }, 1900);
  }, 700);
}

function restoreToToday(id) {
  const store = Store.load();
  const b = store.backlog.find(x => x.id === id);
  if (!b) return;
  const nt = { id: Store.uid(), text: b.text, estMin: b.estMin, priority: b.priority, done: false, goalId: null, why: b.why || '' };
  store.today.tasks.push(nt);
  store.backlog = store.backlog.filter(x => x.id !== id);
  store.flags.staleShown = false;
  Store.save();
  aiToast('backlog_restored', { task: b.text });
  render();
  actionToast(`已把"${b.text}"排进今日`, () => {
    const st = Store.load();
    st.today.tasks = st.today.tasks.filter(x => x.id !== nt.id);
    st.backlog.unshift({ id: b.id, text: b.text, estMin: b.estMin, priority: b.priority, originalDate: b.originalDate, why: b.why || '' });
    Store.save(); render();
  });
}

function doBacklogDelete(id) {
  const store = Store.load();
  const b = store.backlog.find(x => x.id === id);
  if (!b) return;
  confirmDelete(b.text, () => {
    const st = Store.load();
    const idx = st.backlog.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [removed] = st.backlog.splice(idx, 1);
    Store.save();
    render();
    aiToast('backlog_deleted');
    actionToast(`已删除"${removed.text}"`, () => {
      const st2 = Store.load();
      st2.backlog.splice(Math.min(idx, st2.backlog.length), 0, removed);
      Store.save(); render();
    });
  });
}

function doBacklogDiscard(id) {
  const store = Store.load();
  const b = store.backlog.find(x => x.id === id);
  if (!b) return;
  const idx = store.backlog.indexOf(b);
  store.backlog = store.backlog.filter(x => x.id !== id);
  store.flags.staleShown = false;
  Store.save();
  aiToast('backlog_deleted');
  render();
  actionToast(`已把"${b.text}"从提醒中移除`, () => {
    const st = Store.load();
    st.backlog.splice(Math.min(idx, st.backlog.length), 0, b);
    Store.save(); render();
  });
}

/* 删除今日任务（二次确认 + 撤销） */
function taskDelToday(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const idx = store.today.tasks.indexOf(t);
  confirmDelete(t.text, () => {
    const st = Store.load();
    const i = st.today.tasks.findIndex(x => x.id === id);
    if (i < 0) return;
    const [removed] = st.today.tasks.splice(i, 1);
    Store.save(); render();
    actionToast(`已删除"${removed.text}"`, () => {
      const st2 = Store.load();
      st2.today.tasks.splice(Math.min(i, st2.today.tasks.length), 0, removed);
      Store.save(); render();
    });
  });
}

/* 今日任务移回待办（可撤销） */
function taskToBacklog(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const nbId = Store.uid();
  const snap = { id, text: t.text, estMin: t.estMin, priority: t.priority, done: t.done, goalId: t.goalId || null, why: t.why || '', slot: t.slot || '', matched: t.matched || false, routeNote: t.routeNote || '', doing: false };
  store.backlog.unshift({ id: nbId, text: t.text, estMin: t.estMin, priority: t.priority, originalDate: Store.todayStr(), why: t.why || '' });
  store.today.tasks = store.today.tasks.filter(x => x.id !== id);
  Store.save();
  render();
  actionToast(`已把"${t.text}"移回待办`, () => {
    const st = Store.load();
    st.backlog = st.backlog.filter(x => x.id !== nbId);
    st.today.tasks.push({ ...snap });
    Store.save(); render();
  });
}

/* 目标 */
function confirmGoal() {
  const p = App.pendingGoal;
  App.pendingGoal = null;
  if (!p) return;
  const store = Store.load();
  const g = {
    id: Store.uid(), title: p.title, createdAt: Store.todayStr(), deadline: p.deadline,
    archived: false, milestones: p.plan.milestones, tasks: p.plan.tasks
  };
  store.goals.push(g);
  store.flags.goalJustDecomposed = p.title;
  Store.save();
  closeModal();
  render();
  aiToast('goal_created', {}, { fallback: '已创建目标。任务会按日期自动出现在“今日”。' });
}

function toggleGoalTask(tid) {
  const store = Store.load();
  let gt, g;
  store.goals.forEach(x => {
    x.tasks.forEach(t => { if (t.id === tid) { gt = t; g = x; } });
  });
  if (!gt) return;
  gt.done = !gt.done;
  if (gt.done) {
    store.completedLog.push({ id: Store.uid(), text: gt.text, date: Store.todayStr(), doneAt: new Date().toISOString(), estMin: gt.estMin, actualMin: gt.estMin, mood: '😐', note: '' });
    // 同步今日任务
    const todayTask = store.today.tasks.find(t => t.goalId === g.id && t.text === gt.text);
    if (todayTask) todayTask.done = true;
  } else {
    // 取消完成：回退今日完成记录
    const i = store.completedLog.findIndex(e => e.text === gt.text && e.date === Store.todayStr());
    if (i >= 0) store.completedLog.splice(i, 1);
    const todayTask = store.today.tasks.find(t => t.goalId === g.id && t.text === gt.text);
    if (todayTask) todayTask.done = false;
  }
  Store.save();
  openGoalDetail(g.id);
  const pct = g.tasks.filter(t => t.done).length / g.tasks.length;
  if (pct === 1 && !(store.flags.archivedIds || []).includes(g.id)) {
    setTimeout(() => openAchieveConfirm(g), 500);
  }
}

/* 目标达成 100%：自动弹出归档确认（毛玻璃，温和语气） */
function openAchieveConfirm(g) {
  openSheet(`
    <div class="sheet confirm-sheet">
      <div class="sheet-title">🎯 已达成：${esc(g.title)}。要归档吗？</div>
      <div class="sheet-sub">归档后目标会移入「已完成」列表，也可以先留在这里。</div>
      <div class="sheet-acts">
        <button class="btn-ghost" data-sheet="achieve:keep" data-id="${g.id}">暂不归档</button>
        <button class="btn-primary" data-sheet="achieve:archive" data-id="${g.id}">归档</button>
      </div>
    </div>`);
}

function archiveGoal(id) {
  const store = Store.load();
  const g = store.goals.find(x => x.id === id);
  if (!g) return;
  g.archived = true;
  g.doneDate = Store.todayStr();
  store.flags.archivedIds = store.flags.archivedIds || [];
  store.flags.archivedIds.push(id);
  Store.save();
  aiToast('goal_archived');
  render();
}

function keepGoal(id) {
  const store = Store.load();
  store.flags.archivedIds = store.flags.archivedIds || [];
  store.flags.archivedIds.push(id);
  Store.save();
  render();
}

/* OCR 提交 */
function commitOcr(target) {
  const draft = App.ocrDraft;
  App.ocrDraft = null;
  if (!draft) return;
  const store = Store.load();
  const today = Store.todayStr();
  draft.lines.forEach(l => {
    if (target === 'today') {
      store.today.tasks.push({ id: Store.uid(), text: l.text, estMin: 15, priority: false, done: false, goalId: null, why: '', slot: '', matched: false, routeNote: '' });
    } else {
      store.backlog.unshift({ id: Store.uid(), text: l.text, estMin: 15, priority: false, originalDate: today, why: '' });
    }
  });
  Store.save();
  closeModal();
  aiToast('ocr_committed', { n: draft.lines.length }, {
    fallback: target === 'today'
      ? `已把 ${draft.lines.length} 件任务加入今日。`
      : `已把 ${draft.lines.length} 件任务放入待办。`
  });
  render();
}

/* 历史消息 */
function openHistory() {
  const store = Store.load();
  const items = store.aiLog.slice().reverse().map(m => `
    <div class="history-item">
      <div class="h-time">${esc(m.t)}</div>
      <div class="h-bubble">${esc(m.text)}</div>
    </div>`).join('') || '<div style="color:var(--ink-2);text-align:center;padding:30px 0">还没有历史消息。</div>';
  openModal(modalShell('💬 历史消息', '墨说过的每一句话', items));
}

/* 设置 */
const PALETTES = {
  lavender: ['💜', '薰衣草紫', '#FBF8FC', '#D4B8D9', '#B8A0C8'],
  peach: ['🧡', '蜜桃橘', '#FDF8F5', '#E8C4B8', '#DBA28D'],
  matcha: ['💚', '抹茶绿', '#F8FAF6', '#C5D4C0', '#A8BFA0'],
  osmanthus: ['💛', '桂花黄', '#FDF9F2', '#E8DDC0', '#D4C8A8'],
  sakura: ['💗', '樱花粉', '#FDF6F8', '#F0D4DC', '#DDB8C8']
};

function openSettings() {
  const store = Store.load();
  const paletteBtns = Object.entries(PALETTES).map(([k, v]) => `
    <div class="palette-item ${store.settings.palette === k ? 'on' : ''}" data-action="settings:palette" data-val="${k}">
      <div class="sw" style="background:linear-gradient(135deg,${v[2]},${v[4]})"></div>
      <div class="pn">${v[0]} ${v[1]}</div>
    </div>`).join('');
  const themeModes = [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']];

  const ai = store.settings.ai || {};
  const prov = LLM.PROVIDERS[ai.provider] || LLM.PROVIDERS.deepseek;
  const aiOn = !!(ai.enabled && ai.apiKey);

  openModal(modalShell('设置', '选择你喜欢的样子，墨陪你更久。', `
    <div class="setting-row"><div><div class="sl">色盘</div><div class="sd">莫兰迪马卡龙色</div></div></div>
    <div class="palette-grid">${paletteBtns}</div>
    <div class="setting-row" style="margin-top:10px"><div><div class="sl">深色模式</div><div class="sd">跟随系统自动切换</div></div></div>
    <div class="chips">${themeModes.map(([k, label]) => `<button class="chip ${store.settings.theme === k ? 'on' : ''}" data-action="settings:theme" data-val="${k}">${label}</button>`).join('')}</div>

    <div class="setting-row" style="margin-top:10px;border-bottom:none">
      <div><div class="sl">AI 个性化</div><div class="sd">开启后，墨会结合你的性格（ISFJ · 天秤座）与行为数据，用大模型为你生成专属话术、每日方案与复盘。输入内容会发送至所选服务。</div></div>
    </div>
    <div class="ai-status ${aiOn ? 'on' : ''}"><span class="ai-status-dot"></span>${aiOn ? 'AI 已连接 · 个性化已开启' : 'AI 未配置 · 当前使用内置温柔话术'}</div>
    <label class="ai-toggle"><input type="checkbox" data-ai="enabled" ${ai.enabled ? 'checked' : ''}> 启用 AI 个性化</label>
    <div class="chips" style="margin-top:8px">
      ${Object.entries(LLM.PROVIDERS).map(([k, v]) => `<button class="chip ${(ai.provider || 'deepseek') === k ? 'on' : ''}" data-ai-provider="${k}">${v.name}</button>`).join('')}
    </div>
    <input class="input" data-ai="apiKey" type="password" placeholder="${esc(prov.tip)}" value="${esc(ai.apiKey || '')}" style="margin-top:8px">
    <input class="input" data-ai="model" placeholder="模型（留空用服务商默认；豆包填 ep-… 接入点）" value="${esc(ai.model || '')}" style="margin-top:8px">
    <input class="input" data-ai="baseUrl" placeholder="Base URL（留空用服务商默认）" value="${esc(ai.baseUrl || '')}" style="margin-top:8px">

    <div class="setting-row" style="margin-top:14px">
      <div><div class="sl">🗓 我的时间骨架</div><div class="sd">先定下每周固定被占用的时间（上课、工作、午休…），墨就会避开它们，把顺路的事嵌进空档。设置一次，长期生效。</div></div>
    </div>
    <div class="skeleton-tools">
      <button class="mini-btn" data-action="skeleton:template" data-tpl="work">🧑‍💻 全职工作</button>
      <button class="mini-btn" data-action="skeleton:template" data-tpl="student">🎓 学生</button>
    </div>
    <label class="ai-toggle"><input type="checkbox" data-sked="enabled" ${store.settings.skeleton.enabled ? 'checked' : ''}> 启用时间骨架匹配动线</label>
    <div class="week-editor">
      ${WEEK_DAYS.map(([key, label]) => `
        <div class="week-row">
          <span class="day">${label}</span>
          <button class="week-edit" data-action="skeleton:edit" data-day="${key}">${(store.settings.skeleton.week[key] || []).length ? `${store.settings.skeleton.week[key].length} 段` : '未设置'}</button>
        </div>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" data-action="settings:ai-test">测试连接</button>
      <button class="btn-ghost" data-action="settings:reset">重置演示数据</button>
      <button class="btn-primary" data-action="modal:close">完成</button>
    </div>`));

  // AI 配置自动保存
  $$('#modal-root [data-ai]').forEach(inp => {
    inp.addEventListener('change', () => {
      const s = Store.load();
      s.settings.ai = s.settings.ai || {};
      s.settings.ai[inp.dataset.ai] = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
      Store.save();
    });
  });
  // 服务商切换
  $$('#modal-root [data-ai-provider]').forEach(c => c.addEventListener('click', () => {
    const s = Store.load();
    s.settings.ai = s.settings.ai || {};
    s.settings.ai.provider = c.dataset.aiProvider;
    Store.save();
    openSettings();
  }));
  // 时间骨架开关
  $$('#modal-root [data-sked]').forEach(inp => {
    inp.addEventListener('change', () => {
      const s = Store.load();
      s.settings.skeleton = s.settings.skeleton || { enabled: false, week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, overrides: {} };
      s.settings.skeleton.enabled = inp.checked;
      Store.save();
      aiToast(inp.checked ? 'skeleton_saved' : 'skeleton_off', {}, { fallback: inp.checked ? '时间骨架已启用，我会把顺路的事嵌进空档。' : '已关闭时间骨架，改用默认时段安排。' });
    });
  });
}

/* ================= 时间骨架编辑 ================= */
const WEEK_DAYS = [
  ['mon', '周一'], ['tue', '周二'], ['wed', '周三'], ['thu', '周四'],
  ['fri', '周五'], ['sat', '周六'], ['sun', '周日']
];
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SKELETON_TEMPLATES = {
  work: [
    { start: '09:00', end: '12:00', tag: '工作' },
    { start: '12:00', end: '13:00', tag: '午休' },
    { start: '13:00', end: '18:00', tag: '工作' }
  ],
  student: [
    { start: '08:00', end: '12:00', tag: '上课' },
    { start: '12:00', end: '14:00', tag: '午休' },
    { start: '14:00', end: '17:00', tag: '上课' }
  ]
};

/** 套用模板：填入周一至周五，周六日不动 */
function applyTemplate(tpl) {
  const store = Store.load();
  const t = SKELETON_TEMPLATES[tpl];
  if (!t) return;
  const name = tpl === 'work' ? '全职工作' : '学生';
  const hasAny = WEEK_DAYS.some(([k]) => (store.settings.skeleton.week[k] || []).length > 0);
  const doApply = () => {
    WEEK_DAYS.slice(0, 5).forEach(([k]) => {
      store.settings.skeleton.week[k] = t.map(x => ({ id: Store.uid(), start: x.start, end: x.end, tag: x.tag }));
    });
    store.settings.skeleton.enabled = true;
    Store.save();
    aiToast('skeleton_templated', { tpl: name }, { fallback: `已按「${name}」搭好周一至周五的时间骨架，可在下面微调。` });
    openSettings();
  };
  if (hasAny) toast(`套用「${name}」会覆盖周一至周五已有的时间骨架，继续吗？`, {
    buttons: [{ label: '继续', kind: 'primary', action: doApply }, { label: '取消' }]
  });
  else doApply();
}

/** 打开某天（或今日覆盖）的时间骨架编辑器 */
function openSkeletonDay(day) {
  const store = Store.load();
  const sk = store.settings.skeleton;
  const isToday = day === 'today';
  const dow = isToday ? DOW_KEYS[new Date(Store.todayStr() + 'T00:00:00').getDay()] : day;
  const list = isToday
    ? (((sk.overrides && sk.overrides[Store.todayStr()]) !== undefined) ? sk.overrides[Store.todayStr()] : (sk.week[dow] || []))
    : (sk.week[day] || []);
  const dayName = isToday ? '今天' : WEEK_DAYS.find(d => d[0] === day)[1];
  const rows = list.map((c, i) => `
    <div class="srow" data-idx="${i}">
      <input class="input s-time" data-f="start" placeholder="开始 如09:00" value="${esc(c.start || '')}">
      <input class="input s-time" data-f="end" placeholder="结束 如12:00" value="${esc(c.end || '')}">
      <input class="input s-name" data-f="tag" placeholder="标签 如上课/工作/午休" value="${esc(c.tag || '')}">
      <button class="mini-btn ghost" data-action="skeleton:del" data-idx="${i}">删</button>
    </div>`).join('');
  openModal(modalShell(
    `${dayName}·时间骨架`,
    isToday ? '今天临时有变化？在这里单独调整，只覆盖今天，不影响其他日期。' : '填固定被占用的时间段，墨会避开它们，把顺路的事嵌进空档。',
    `<div class="sched-editor" id="sched-editor" data-day="${day}">
      ${rows}
      <button class="mini-btn" data-action="skeleton:add" style="margin-top:8px">+ 添加时间段</button>
      ${isToday ? '' : `
      <div class="copy-box">
        <button class="mini-btn ghost" data-action="skeleton:copy-toggle" style="margin-top:10px">📋 复制到其他日期</button>
        <div class="copy-targets" id="copy-targets" style="display:none">
          <div class="chips" style="margin-top:8px">
            ${WEEK_DAYS.filter(d => d[0] !== day).map(([k, label]) => `<button class="chip" data-copy-day="${k}">${label}</button>`).join('')}
          </div>
          <button class="mini-btn ok" data-action="skeleton:copy-do" style="margin-top:8px">复制到所选日期</button>
        </div>
      </div>`}
    </div>`,
    `<div class="modal-actions">
      ${isToday ? `<button class="btn-ghost" data-action="skeleton:reset-today">恢复本周默认</button>` : ''}
      <button class="btn-ghost" data-action="modal:close">取消</button>
      <button class="btn-primary" data-action="skeleton:save" data-day="${day}">保存</button>
    </div>`
  ));
}

function addSkeletonRow() {
  const box = $('#sched-editor');
  const add = box.querySelector('[data-action="skeleton:add"]');
  const row = el(`<div class="srow">
      <input class="input s-time" data-f="start" placeholder="开始 如09:00">
      <input class="input s-time" data-f="end" placeholder="结束 如12:00">
      <input class="input s-name" data-f="tag" placeholder="标签 如上课/工作/午休">
      <button class="mini-btn ghost" data-action="skeleton:del" data-idx="-1">删</button>
    </div>`);
  box.insertBefore(row, add);
}

function delSkeletonRow(idx) {
  const box = $('#sched-editor');
  const rows = [...box.querySelectorAll('.srow')];
  const target = rows[idx];
  if (target) target.remove();
  // 修正剩余行 data-idx
  [...box.querySelectorAll('.srow')].forEach((r, i) => { r.dataset.idx = i; });
}

/** 收集编辑器中的时间段（按开始时间排序） */
function collectSkeletonRows() {
  const rows = [...$$('#sched-editor .srow')];
  const list = [];
  rows.forEach(r => {
    const start = r.querySelector('[data-f="start"]').value.trim();
    const end = r.querySelector('[data-f="end"]').value.trim();
    const tag = r.querySelector('[data-f="tag"]').value.trim();
    if (start || end || tag) list.push({ id: Store.uid(), start, end, tag: tag || '已占用' });
  });
  list.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return list;
}

function saveSkeletonDay(day) {
  const store = Store.load();
  const list = collectSkeletonRows();
  const isToday = day === 'today';
  if (isToday) {
    store.settings.skeleton.overrides[Store.todayStr()] = list;
    Store.save();
    closeModal();
    aiToast('skeleton_override', {}, { fallback: `今天已单独调整（${list.length ? list.length + ' 段' : '今日无固定安排'}），其他日期不受影响。` });
  } else {
    store.settings.skeleton.week[day] = list;
    Store.save();
    closeModal();
    aiToast('skeleton_saved', {}, { fallback: `${WEEK_DAYS.find(d => d[0] === day)[1]}已保存（${list.length} 段）。` });
  }
  render();
}

function resetTodaySkeleton() {
  const store = Store.load();
  delete store.settings.skeleton.overrides[Store.todayStr()];
  Store.save();
  closeModal();
  aiToast('skeleton_reset', {}, { fallback: '今天已恢复本周默认的时间骨架。' });
  render();
}

function toggleCopyTargets() {
  const box = $('#copy-targets');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? '' : 'none';
}

function copySkeletonToDays() {
  const store = Store.load();
  const list = collectSkeletonRows();
  const targets = [...$$('#copy-targets .chip.on')].map(c => c.dataset.copyDay);
  if (!targets.length) { toast('先点选要复制到的日期'); return; }
  targets.forEach(k => { store.settings.skeleton.week[k] = list.map(x => ({ ...x })); });
  Store.save();
  aiToast('skeleton_copied', {}, { fallback: `已复制到 ${targets.map(k => WEEK_DAYS.find(d => d[0] === k)[1]).join('、')}。` });
}

/* ================= 首次使用引导 ================= */
function maybeOnboardSkeleton() {
  const store = Store.load();
  if (store.flags.skeletonShown) return;
  const sk = store.settings.skeleton;
  const hasAny = WEEK_DAYS.some(([k]) => (sk.week[k] || []).length > 0) || (sk.overrides && Object.keys(sk.overrides).length > 0);
  if (hasAny) { store.flags.skeletonShown = true; Store.save(); return; }
  openModal(modalShell(
    '🗓 先搭好你的时间骨架',
    '告诉我每周哪些时间固定被占用（上课、工作、午休…），墨就会避开它们，把任务顺路嵌进空档。设置一次，长期生效，也可以随时在设置里改。',
    `<div class="skeleton-tools">
      <button class="mini-btn" data-action="skeleton:onboard" data-tpl="work">🧑‍💻 我是上班族</button>
      <button class="mini-btn" data-action="skeleton:onboard" data-tpl="student">🎓 我是学生</button>
      <button class="mini-btn ghost" data-action="skeleton:onboard" data-tpl="custom">✏️ 我自己来</button>
    </div>`,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="skeleton:onboard-skip">先跳过</button>
    </div>`
  ));
}

function onboardSkeleton(tpl) {
  const store = Store.load();
  store.flags.skeletonShown = true;
  if (tpl === 'custom') {
    store.settings.skeleton.enabled = true;
    Store.save();
    closeModal();
    openSkeletonDay('mon');
    return;
  }
  const t = SKELETON_TEMPLATES[tpl];
  if (t) {
    WEEK_DAYS.slice(0, 5).forEach(([k]) => {
      store.settings.skeleton.week[k] = t.map(x => ({ id: Store.uid(), start: x.start, end: x.end, tag: x.tag }));
    });
    store.settings.skeleton.enabled = true;
    Store.save();
  }
  closeModal();
  aiToast('skeleton_onboard', {}, { fallback: `已按「${tpl === 'work' ? '上班族' : '学生'}」搭好时间骨架，可随时在设置里微调。` });
  render();
}

function onboardSkip() {
  const store = Store.load();
  store.flags.skeletonShown = true;
  Store.save();
  closeModal();
  aiToast('skeleton_onboard', {}, { fallback: '好的。需要时，随时在设置里搭时间骨架。' });
}

/* AI 连接测试 */
async function testAi() {
  toast('正在测试连接…', { ai: true });
  const ok = await LLM.test();
  if (ok) aiToast('ai_connected', {}, { fallback: '连接成功。之后墨说的每句话，都会为你的节奏量身而写。' });
  else aiToast('ai_failed', {}, { fallback: '连接失败。请检查 API Key、模型或网络，稍后再试。' });
}

function setPalette(p) {
  const store = Store.load();
  store.settings.palette = p;
  Store.save();
  applyTheme(store.settings);
  openSettings();
}

function setTheme(t) {
  const store = Store.load();
  store.settings.theme = t;
  Store.save();
  applyTheme(store.settings);
  openSettings();
}

function resetAll() {
  const store = Store.reset();
  applyTheme(store.settings);
  App.tab = 'today';
  render();
  closeModal();
}

/* ================= 启动 ================= */
document.addEventListener('DOMContentLoaded', init);

/* ================= PWA：注册 Service Worker，支持离线使用 ================= */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => {
        if (window.console) console.log('[墨] 已注册 Service Worker，开启离线模式');
      })
      .catch((err) => {
        if (window.console) console.warn('[墨] Service Worker 注册失败：', err);
      });
  });
}
