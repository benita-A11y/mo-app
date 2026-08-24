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
  timelineView: 'week',       // 时间轴：today / week / month
  timelineDate: Store ? Store.todayStr() : '',
  todayViewDate: Store ? Store.todayStr() : '', // 今日页当前查看日期
  timelineSelectedDate: '',   // 时间轴（月视图）中选中的日期（展开任务列表）
  timelineWeekSelectedDate: '', // 周视图中展开的日期
  timelineWeekSelect: false,  // 周选择器是否展开
  timelineMonthSelect: false, // 月（年/月）选择器是否展开
  timelineFocusTab: 'focus',  // 重点/总结：focus | summary
  catCollapsed: {},            // 今天视图分类区折叠状态 { tag: bool }
  ocrDraft: null,
  pendingGoal: null,
  longPressTimer: null,
  doneExpanded: false,        // 今日页「已完成」折叠
  doneGoalsExpanded: false,   // 目标页「已完成」折叠
  reviewDoneExpanded: false,  // 复盘页「已完成明细」折叠
  moodLabels: { '😊': '状态不错', '😐': '一般般', '😔': '有点累' },
  inboxTag: '',               // 灵感箱当前手动选中的标签
  inboxTagRec: '',            // 灵感箱AI推荐的标签
  backlogFilter: ''           // 待办页标签筛选
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
  /* 清理已过期的「明日增量」标记 */
  if (store.flags.tomorrowBoost && store.flags.tomorrowBoost < today) delete store.flags.tomorrowBoost;
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
  /* 状态签到联动：😊 明日任务量 +1 件 */
  let count = suggest.count;
  if (store.flags.tomorrowBoost === date) count = Math.min(count + 1, 5);
  if (goalTasks.length >= count) return goalTasks;
  const need = count - goalTasks.length;
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
}

function renderHeader() {
  const store = Store.load();
  const $h = $('#app-header');
  const today = Store.todayStr();
  if (App.tab === 'today') {
    const h = new Date().getHours();
    const undoneN = store.today.tasks.filter(t => !t.done).length;
    const greet = h < 11 ? '早安，今天。' : h < 18 ? '下午好，今天。' : '晚上好，今天。';
    $h.innerHTML = `
      <div class="header-inner">
        <div class="greet-row">
          <div class="greet-title">${greet}</div>
          <div class="greet-date">${Store.fmtMD(today)} · ${Store.fmtDOW(today)}</div>
        </div>
        <div class="header-tools">
          <button class="mood-single" data-action="mood:open" title="点我签到今日状态">${store.today.status || '😊'}</button>
          <button class="icon-btn" data-action="settings:open" title="设置" aria-label="设置">${settingsIcon()}</button>
        </div>
      </div>`;
  } else {
    const titles = { goals: '目标', backlog: '待办', timeline: '时间轴', review: '复盘' };
    // 副标题：每个页面第一眼的总览
    let sub = '';
    if (App.tab === 'goals') {
      const active = store.goals.filter(g => !g.archived).length;
      const done = store.goals.filter(g => g.archived).length + (store.archivedGoals || []).length;
      sub = `进行中 ${active} 个 · 已完成 ${done} 个`;
    } else if (App.tab === 'backlog') {
      sub = `共 ${store.backlog.length} 件`;
    } else if (App.tab === 'timeline') {
      sub = App.timelineView === 'week' ? '周视图 · 拖动待办到日期' : '月视图 · 任务密度';
    } else if (App.tab === 'review') {
      sub = App.reviewTab === 'weekly' ? '每周回顾' : '每月回顾';
    }
    $h.innerHTML = `
      <div class="header-inner centered">
        <div class="greet-title">${titles[App.tab]}</div>
        <div class="greet-sub">${sub}</div>
        <div class="header-tools">
          <button class="icon-btn" data-action="settings:open" title="设置" aria-label="设置">${settingsIcon()}</button>
        </div>
      </div>`;
  }
}

function renderTabbar() {
  const store = Store.load();
  $$('#tabbar .tab-btn').forEach(b => {
    const isOn = b.dataset.tab === App.tab;
    b.classList.toggle('on', isOn);
    // 有更新小点：只在非当前页显示，进入后自然消失
    let dot = false;
    if (b.dataset.tab === 'today') dot = store.today.tasks.some(t => !t.done && !t.matched);
    else if (b.dataset.tab === 'goals') dot = store.goals.some(g => !g.archived && g.tasks.length && g.tasks.every(t => t.done));
    else if (b.dataset.tab === 'backlog') dot = !!(store.flags.tabDots && store.flags.tabDots.backlog);
    b.classList.toggle('dot', dot && !isOn);
  });
}

let _lastViewKey = '';
function renderView() {
  const $v = $('#view');
  // 仅 tab 切换时重放入场动画；数据刷新不再强制 reflow，避免点击卡顿
  const key = App.tab + (App.tab === 'review' ? ':' + App.reviewTab : '');
  const replay = key !== _lastViewKey;
  _lastViewKey = key;
  if (replay) $v.classList.remove('view-enter');
  if (App.tab === 'today') $v.innerHTML = renderToday();
  else if (App.tab === 'goals') $v.innerHTML = renderGoals();
  else if (App.tab === 'backlog') $v.innerHTML = renderBacklog();
  else if (App.tab === 'timeline') $v.innerHTML = renderTimeline();
  else if (App.tab === 'review') $v.innerHTML = renderReview();
  if (replay) { void $v.offsetWidth; $v.classList.add('view-enter'); }
  // 异步 AI 个性化：防抖合并调度，避免每次点击都触发多个网络请求
  scheduleAIRefresh();
}

/* AI 个性化刷新：短时间内的多次渲染合并为一次请求，降低响应延迟 */
let _aiRefreshTimer = null;
function scheduleAIRefresh() {
  clearTimeout(_aiRefreshTimer);
  _aiRefreshTimer = setTimeout(() => {
    _aiRefreshTimer = null;
    if (App.tab === 'today') { refreshHero(); refreshTomorrowNote(); refreshTimelineAI(); }
    else if (App.tab === 'review') refreshReviewAI();
  }, 400);
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

/** 「调整」按钮：系统自动匹配其他时间并给出原因（无需手动挑选） */
function adjustSlot(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  const slots = AI.buildSlots(Store.todayStr()).filter(s => s.type !== 'lesson');
  if (!slots.length) return;
  const cur = slots.findIndex(s => s.key === t.slot);
  const next = slots[(cur + 1) % slots.length];
  t.slot = next.key;
  t.matched = true;
  if (t.doing) t.doing = false;
  Store.save();
  render();
  const reason = next.hint || '这个时间更顺手';
  aiToast('slot_rematched', { task: t.text, slot: next.label, reason });
}

/** 拖拽排序：把任务移到目标任务所在位置，并跟随其槽位 */
let _dragId = null;
let _dragPoolId = null;     // 待办池拖拽中的任务 id
let _dragPoolFrom = '';     // 来源：backlog / today / day
let _dragTlId = null;       // 时间轴任务卡片拖拽中的 id
let _dragTlDate = '';       // 时间轴任务卡片所在日期
let _dragTlFrom = '';       // 来源：day
let _dragBoxId = null;      // 今天视图：收集箱/分类任务拖拽中的 id
let _dragBoxFrom = '';      // 来源：inbox / backlog / today / day
let _dragBoxDate = '';      // 来源日期（day 来源时）
let _dragBoxTag = '';       // 来源标签
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
  // 当前查看的日期（顶部日期导航条切换）。今天用 store.today，其他日期用 dayTasks
  const viewDate = App.todayViewDate || Store.todayStr();
  App.todayViewDate = viewDate;
  const tasksForDate = (d) => {
    if (d === Store.todayStr()) return store.today.tasks;
    return (store.dayTasks && store.dayTasks[d]) || [];
  };
  const viewTasks = tasksForDate(viewDate);
  const undone = viewTasks.filter(t => !t.done);
  const doneTasks = viewTasks.filter(t => t.done);
  const totalMin = undone.reduce((s, t) => s + (t.estMin || 0), 0);
  const budget = 180;
  const freeMin = Math.max(0, budget - totalMin);

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
    const sug = !t.done && !t.matched && t.slot && slotByKey[t.slot];
    const frag = AI.isFragTask(t.text, t.estMin);
    const minTxt = t.estMin ? `${t.estMin}分钟` : '';
    // 信息只出现一次：优先/顺路/碎片标签 + 预计用时（顺路/碎片标签自带用时）
    let tags = '';
    if (t.priority) tags += '<span class="tag priority">⭐ 优先</span>';
    if (sug) tags += `<span class="tag green">🚶 顺路${minTxt ? ` · ${minTxt}` : ''}</span>`;
    else if (frag) tags += `<span class="tag frag">✨ 碎片${minTxt ? ` · ${minTxt}` : ''}</span>`;
    else if (minTxt) tags += `<span class="time">${minTxt}</span>`;
    // 第二行右侧：顺路显示动线描述，否则显示原因（都不重复出现）
    const note = sug ? (t.routeNote || slotByKey[t.slot].hint || '') : (t.why || '');
    const tagDot = t.tag ? `<span class="tag-dot ${t.tag}" title="${AI.TAGS[t.tag] ? AI.TAGS[t.tag].name : ''}"></span>` : '';
    return `
      <li class="task ${t.done ? 'done' : ''}${t.doing ? ' doing' : ''}${sug ? ' has-sug' : ''}" data-action="task:detail" data-id="${t.id}" ${t.done ? '' : 'draggable="true" title="点击查看详情 · 拖拽可调整顺序"'}">
        <span class="check" data-action="task:check" data-id="${t.id}">${t.done ? '🌱' : ''}</span>
        <div class="task-body">
          <span class="task-text">${tagDot}${esc(t.text)}</span>
          <span class="task-meta">${tags}${note ? `<span class="hint">${esc(note)}</span>` : ''}</span>
          ${sug ? `
            <div class="route-acts">
              <button class="mini-btn ok" data-action="task:accept-route" data-id="${t.id}">✓ 就这么办</button>
              <button class="mini-btn" data-action="task:adjust-slot" data-id="${t.id}">🕐 调整</button>
            </div>` : ''}
        </div>
        <span class="flag">${t.done ? '已完成' : (t.doing ? '⏳ 进行中' : '')}</span>
        <div class="swipe-acts">
          <button data-action="task:edit" data-id="${t.id}">编辑</button>
          <button data-action="task:to-backlog" data-id="${t.id}">移动</button>
          <button class="danger" data-action="task:del" data-id="${t.id}">删除</button>
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

  // ② 今日核心目标：只显示1件最重要的事，柔和底色聚焦执行
  const prioUndone = undone.filter(t => t.priority);
  const p0 = prioUndone[0];
  const p0Card = `
    <section class="card p0-card${p0 ? '' : ' p0-empty'}">
      <div class="card-title"><span class="t">⭐ 今日核心目标</span></div>
      ${p0 ? `
        <div class="p0-item">
          <button class="p0-check" data-action="task:check" data-id="${p0.id}" aria-label="完成"></button>
          <div class="p0-body">
            <span class="p0-text">${esc(p0.text)}</span>
            ${p0.why ? `<span class="p0-why">${esc(p0.why)}</span>` : ''}
          </div>
          ${p0.estMin ? `<span class="p0-min">${p0.estMin}分钟</span>` : ''}
        </div>` : `
        <div class="p0-empty-txt">今天没有标记优先的事，挑一件最想先完成的就好。</div>`}
    </section>`;

  // ⑥ ISFJ 舒适区：当天未完成任务超过 3 件时温和提醒（不催促，给选择权）
  const COMFORT_MAX = 3;
  const comfortTip = (isTodayView && undone.length > COMFORT_MAX)
    ? `<div class="comfort-tip">今天有 ${undone.length} 件，超过舒服的 3 件啦。挑最顺手的先做，其余可以顺延到待办，没关系的。</div>`
    : '';

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

  // ③ 今日概览：总量一行（X件·预计X分钟·剩余空闲X分钟），聚焦执行
  const overviewBar = `
    <div class="task-bar task-bar-tl">
      <div class="stats"><strong>${undone.length}件</strong> · 预计 ${totalMin} 分钟 · 剩余空闲 ${freeMin} 分钟</div>
      ${todaySkelBtn}
    </div>`;

  // ⑦ 已完成区块（默认折叠，点击展开）
  const doneSection = doneTasks.length ? `
    <div class="completed-section">
      <button class="completed-head" data-action="done:toggle">
        <span class="lb">✅ 已完成 ${doneTasks.length} 件</span>
        <span class="chev">${App.doneExpanded ? '▾' : '▸'}</span>
      </button>
      ${App.doneExpanded ? `<ul class="task-list">${doneTasks.map(taskRow).join('')}</ul>` : ''}
    </div>` : '';

  // 灵感箱 / 待办 / 目标进度已分别归属「待办页 / 目标页」；今日页只聚焦「今天要做什么」

  // 顶部日期导航条：本周 周一~周日，可前后翻周；选中日期切换当日视图
  const navStart = Store.startOfWeek(viewDate);
  const navDays = Store.weekDates(viewDate).map(d => {
    const isToday = d === Store.todayStr();
    const isSel = d === viewDate;
    const dt = new Date(d + 'T00:00:00');
    const dd = dt.getDate();
    const tasks = tasksForDate(d);
    const doneN = tasks.filter(t => t.done).length;
    const totalN = tasks.length;
    return `<button class="dn-day${isSel ? ' on' : ''}${isToday ? ' today' : ''}" data-action="today:date" data-date="${d}">
        <span class="dn-dow">${Store.fmtDOW(d)}</span>
        <span class="dn-date">${dd}</span>
        <span class="dn-count">${totalN ? `${doneN}/${totalN}` : '·'}</span>
      </button>`;
  }).join('');
  const dateNav = `
    <div class="date-nav">
      <button class="dn-arrow" data-action="today:week" data-dir="-1" aria-label="上一周">‹</button>
      <div class="dn-days">${navDays}</div>
      <button class="dn-arrow" data-action="today:week" data-dir="1" aria-label="下一周">›</button>
    </div>
    <div class="date-nav-sub">
      <button class="dn-today${viewDate === Store.todayStr() ? ' on' : ''}" data-action="today:date" data-date="${Store.todayStr()}">回到今天</button>
      <span class="dn-viewing">${viewDate === Store.todayStr() ? '今天' : Store.fmtMD(viewDate)} · ${undone.length} 件待办</span>
    </div>`;

  const isTodayView = viewDate === Store.todayStr();

  // 自由日：本周任务最少的一天自动成为自由日（每7天1天），当天不强制安排
  let freeDayTip = '';
  if (isTodayView) {
    const freeDate = AI.freeDayCheck(Store.todayStr());
    const isFree = freeDate === Store.todayStr();
    if (isFree && undone.length <= 1) {
      freeDayTip = `<div class="free-day-tip">🌿 今天没有安排，可以自由呼吸。补点进度，或者就好好休息，都行。</div>`;
    }
  }

  return `
    <div class="today-stack">

      ${hero}

      ${dateNav}

      ${freeDayTip}

      ${p0Card}

      ${overviewBar}

      ${comfortTip}

      ${isTodayView && pendingCount ? `
        <div class="confirm-all">
          <span class="label">🛣 墨已把任务放进你的动线</span>
          <button class="btn" data-action="task:accept-all">一键全确认</button>
        </div>` : ''}

      <div class="timeline">
        ${groups.map(g => `
          <div class="timeline-block" data-slot="${g.key}">
            <div class="time-label">
              <span class="time">${g.time}</span>
              <span class="label">${g.label}</span>
              ${g.hint ? `<span class="sub">${esc(g.hint)}</span>` : ''}
            </div>
            <ul class="task-list tl-list">
              ${g.tasks.map(taskRow).join('')}
            </ul>
          </div>`).join('')}
      </div>

      ${isTodayView ? fragCard : ''}

      ${doneSection}

      ${isTodayView ? `<button class="end-day-ghost" data-action="day:end">🌙 今天做完了？结束今天</button>` : ''}

      ${isTodayView ? `
      <div class="today-bottom">
        <button class="backlog-entry" data-action="tab:switch" data-tab="backlog">
          📋 待办 <span class="n">${store.backlog.length}</span> 件
        </button>
        <button class="quick-ic" data-action="history:open" title="历史消息" aria-label="历史消息">
          <span class="qi-ic">💬</span><span class="qi-lb">消息</span>
        </button>
        <button class="quick-ic" data-action="camera:open" title="拍照识别" aria-label="拍照识别">
          <span class="qi-ic">📷</span><span class="qi-lb">拍照</span>
        </button>
      </div>` : ''}

      <div class="end-note">${isTodayView ? '✦ 今天做完这些就够了 ✦' : '✦ 这是你选定的某一天 ✦'}</div>
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
let _heroBusy = false;
async function refreshHero() {
  if (_heroBusy) return;
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
  _heroBusy = true;
  try {
    const smart = await AI.copySmart(trigger, { total: undone, done, priorityCount: prio });
    if (smart && b.isConnected) {
      const txt = b.querySelector('.text');
      if (txt) txt.innerHTML = hlText(smart);
      else b.innerHTML = hlText(smart);
    }
  } finally { _heroBusy = false; }
}

/* 复盘 AI 叙事：LLM 基于真实数据生成周/月报个性化复盘 */
let _reviewBusy = false;
async function refreshReviewAI() {
  if (_reviewBusy) return;
  const store = Store.load();
  const bubbleId = App.reviewTab === 'weekly' ? 'review-week-bubble' : 'review-month-bubble';
  _reviewBusy = true;
  try {
    const narration = App.reviewTab === 'weekly'
      ? await AI.weeklyNarration(AI.weeklyReport())
      : await AI.monthlyNarration(AI.monthlyReport());
    if (!narration) return;
    // 更新气泡
    const b = $('#' + bubbleId);
    if (b && b.isConnected) {
      const txt = b.querySelector('.text');
      if (txt) txt.innerHTML = hlText(narration);
      else b.innerHTML = hlText(narration);
    }
    // 填充 AI 复盘卡片
    const card = $('#ai-insight');
    if (card && card.isConnected) {
      card.style.display = '';
      const body = card.querySelector('.ai-insight-body');
      if (body) body.innerHTML = esc(narration);
    }
  } finally { _reviewBusy = false; }
}

/* 明日方案（LLM 个性化推荐，失败时隐藏该区块） */
let _noteBusy = false;
async function refreshTomorrowNote() {
  if (_noteBusy) return;
  const box = $('#tomorrow-note');
  if (!box) return;
  _noteBusy = true;
  try {
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
  } finally { _noteBusy = false; }
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

/* ================= 时间轴页（周视图 + 月视图 + 拖拽待办池） ================= */

/* 取某一天的全部已排任务（今日用 store.today；其他日期用 dayTasks） */
function dayTaskList(date) {
  const store = Store.load();
  if (date === Store.todayStr()) return store.today.tasks;
  return (store.dayTasks && store.dayTasks[date]) || [];
}
function scheduledCount(date) { return dayTaskList(date).length; }

/** 把任务安排到指定日期：来自待办池 / 今日 / 其他日 */
function moveTaskToDate(id, date, from) {
  const store = Store.load();
  const t = Store.todayStr();
  // 先从来源处取出任务对象（再移除，避免找不到）
  let taskObj = null;
  const pull = arr => { const i = arr.findIndex(x => x.id === id); if (i >= 0) { taskObj = arr[i]; arr.splice(i, 1); return true; } return false; };
  if (from === 'backlog') pull(store.backlog);
  else if (from === 'today' || (from === 'day' && date === t)) pull(store.today.tasks);
  else if (from === 'day') {
    if (store.dayTasks && store.dayTasks[date]) pull(store.dayTasks[date]);
  }
  // 兜底：若来源未知，全局查找
  if (!taskObj) {
    const findIn = arr => { const x = arr.find(y => y.id === id); if (x) taskObj = x; };
    findIn(store.backlog); findIn(store.today.tasks);
    if (store.dayTasks) Object.values(store.dayTasks).forEach(findIn);
    if (taskObj) { // 找到就从原处删
      const rm = arr => { const i = arr.findIndex(x => x.id === id); if (i >= 0) arr.splice(i, 1); };
      rm(store.backlog); rm(store.today.tasks);
      if (store.dayTasks) Object.values(store.dayTasks).forEach(rm);
    }
  }
  if (!taskObj) return;
  if (date === t) {
    taskObj.slot = taskObj.slot || 'night';
    taskObj.matched = true;
    store.today.tasks.push(taskObj);
  } else {
    store.dayTasks = store.dayTasks || {};
    store.dayTasks[date] = store.dayTasks[date] || [];
    store.dayTasks[date].push(taskObj);
  }
  Store.save();
  render();
}

/** 打开"安排到哪一天"的底部浮层（移动端无拖拽时的备选） */
function openAssignSheet(id, from) {
  const store = Store.load();
  const start = Store.startOfWeek(Store.todayStr());
  const days = Store.weekDates(Store.todayStr()).map(d => {
    const isT = d === Store.todayStr();
    return `<button class="sheet-day" data-action="assign:pick" data-id="${id}" data-from="${from}" data-date="${d}">
      <span>${isT ? '今天' : Store.fmtDOW(d)}</span><small>${Store.fmtMD(d)}</small>
      <em>${scheduledCount(d)}件</em></button>`;
  }).join('');
  openSheet(`
    <div class="sheet">
      <div class="sheet-head">安排到哪一天</div>
      <div class="sheet-days">${days}</div>
      <button class="sheet-cancel" data-action="modal:close">取消</button>
    </div>`);
}

function saveMonthNote(mk) {
  const store = Store.load();
  store.monthNotes = store.monthNotes || {};
  store.monthNotes[mk] = store.monthNotes[mk] || { focus: '', summary: '' };
  const el = $('#month-summary-input');
  if (el) store.monthNotes[mk].summary = el.value || '';
  Store.save();
}

/* 时间轴：星期颜色索引（0=周一） */
const DOW_COLORS = ['blue', 'default', 'pink', 'purple', 'blue', 'pink', 'gold'];
function dowColorClass(date) {
  const idx = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
  return 'dow-' + DOW_COLORS[idx];
}
function dowColor(date) {
  const map = {
    blue:   '#4A8CFF',
    pink:   '#FD79A8',
    purple: '#A29BFE',
    gold:   '#FF9F43',
    default:'var(--ink-2)'
  };
  return map[DOW_COLORS[(new Date(date + 'T00:00:00').getDay() + 6) % 7]] || map.default;
}

/* 渲染时间轴页面（今天 / 本周 / 本月 三视图） */
function renderTimeline() {
  const store = Store.load();
  const view = App.timelineView || 'week';
  const base = App.timelineDate || Store.todayStr();

  let title = '时间轴';
  if (view === 'today') {
    const d = base;
    title = `今天 · ${Store.fmtMD(d)} ${Store.fmtDOW(d)}`;
  } else if (view === 'week') {
    const days = Store.weekDates(base);
    title = `本周 · ${Store.fmtMD(days[0])} - ${Store.fmtMD(days[6])} 第${Store.weekNumber(base)}周`;
  } else {
    const pm = Store.parseYMD(base);
    title = `${pm.y}年${pm.m}月`;
  }

  const header = `
    <div class="timeline-toolbar">
      <div class="tl-views">
        <button class="tl-view ${view === 'today' ? 'on' : ''}" data-action="timeline:view" data-view="today">📅 今天</button>
        <button class="tl-view ${view === 'week' ? 'on' : ''}" data-action="timeline:view" data-view="week">📆 本周</button>
        <button class="tl-view ${view === 'month' ? 'on' : ''}" data-action="timeline:view" data-view="month">🗓️ 本月</button>
      </div>
      ${view === 'month'
        ? `<div class="tl-nav">
             <button class="tl-tool" data-action="timeline:page" data-dir="-1">‹</button>
             <button class="tl-tool" data-action="timeline:page" data-dir="1">›</button>
           </div>`
        : ''}
    </div>`;

  let body = '';
  if (view === 'today') body = renderTodayBody(store, base);
  else if (view === 'week') body = renderWeekBody(store, base);
  else body = renderMonthBody(store, base);

  return `<div class="timeline-page" data-view="${view}">${header}${body}</div>`;
}

/* 今天视图主体：可展开/收起月历 + 每日重点/总结 + 标签分类 + 收集箱 */
function renderTodayBody(store, base) {
  const d = App.todayViewDate || base;
  const isT = d === Store.todayStr();
  const open = !!App.todayCalOpen;

  /* ---------- 月历 ---------- */
  const pm = Store.parseYMD(d);
  const monthTitle = `${pm.m}月`;
  const calOpen = open ? '▲' : '▼';

  // 构建日期格
  function miniCell(ymd) {
    if (!ymd) return `<div class="mini-cell empty"></div>`;
    const has = scheduledCount(ymd) > 0;
    const isCur = ymd === Store.todayStr();
    const isSel = ymd === d;
    return `<div class="mini-cell${isCur ? ' cur' : ''}${isSel ? ' sel' : ''}${has ? ' has' : ''}" data-action="cal:date" data-date="${ymd}">
      <span class="mc-num">${Number(ymd.split('-')[2])}</span>
      ${has ? '<span class="mc-dot"></span>' : ''}
    </div>`;
  }

  let calBody;
  if (open) {
    // 整月：7列×6行
    const yr = pm.y, mo = pm.m;
    const firstDow = (new Date(yr, mo - 1, 1).getDay() + 6) % 7; // 周一=0
    const dim = Store.monthDays(yr, mo);
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let dd = 1; dd <= dim; dd++) cells.push(`${yr}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows = [];
    for (let r = 0; r < cells.length / 7; r++) {
      rows.push('<div class="mini-row">' + cells.slice(r * 7, r * 7 + 7).map(miniCell).join('') + '</div>');
    }
    calBody = `<div class="mini-grid">${rows.join('')}</div>`;
  } else {
    // 当前周7天
    const wk = Store.weekDates(d);
    calBody = `<div class="mini-row">${wk.map(miniCell).join('')}</div>`;
  }

  const cal = `
    <div class="mini-cal">
      <button class="mini-month" data-action="cal:toggle">${monthTitle} ${calOpen}</button>
      <div class="mini-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      ${calBody}
    </div>`;

  /* ---------- 每日重点 + 每日总结（并排） ---------- */
  const hi = (store.dayHighlights && store.dayHighlights[d]) || [];
  const focusRow = `
    <div class="today-focus-row">
      <div class="today-focus-card">
        <div class="tfc-title">📌 每日重点</div>
        <div class="hl-dropzone ${hi.length ? 'has' : ''}" data-action="today:highlight" data-date="${d}">
          ${hi.length
            ? hi.map(h => `<div class="hl-chip" data-action="today:unhighlight" data-date="${d}" data-hid="${h.id}">${esc(h.text)}<span class="hl-x">×</span></div>`).join('')
            : '<span class="hl-tip">将任务拖到这里即可关联</span>'}
        </div>
      </div>
      <div class="today-focus-card">
        <div class="tfc-title">✏️ 每日总结</div>
        <textarea class="tf-input" id="today-summary-input" placeholder="今天过得怎么样？写一句话吧…" data-action="today:summary" data-date="${d}">${esc((store.todaySummary && store.todaySummary[d]) || '')}</textarea>
      </div>
    </div>`;

  /* ---------- 标签分类（6色 · 手动归类容器）----------
     融合设计：分类本身复用墨已有的 6 色 tag 字段。
     - 收集箱里的任务拖进来 → 写入 tag=该色（手动归类，无自动分类）。
     - 只有被手动拖进来的任务才显示在该分类下（空容器时显示「拖任务到此」）。
     - 已归类但尚未安排日期(date=='')的任务，在分类区顶部「待安排」提示行，
       让用户的归类不被漏看（ISFJ「被看见」）。
     - 已归类且已安排(date!='')的任务，带日期徽标，证明它已接入时间轴闭环。 */
  const TAGS = AI.TAGS;
  const collapsed = App.catCollapsed || {};
  const catItems = {};
  Object.keys(TAGS).forEach(k => catItems[k] = []);
  // 仅从 backlog 取任务按 tag 归类（today/dayTasks 里的任务已在本日时间线，不重复占分类位）
  store.backlog.forEach(t => {
    if (t.tag && catItems[t.tag]) catItems[t.tag].push(t);
  });

  const catBlocks = Object.keys(TAGS).map(k => {
    const all = catItems[k] || [];
    const arranged = all.filter(t => t.date);   // 已安排日期（带徽标）
    const unsched = all.filter(t => !t.date);    // 已归类但未安排（待安排提示）
    const dot = `<span class="tag-dot ${k}"></span>`;
    const isCol = !!collapsed[k];
    // 待安排提示行（仅在该分类内有未安排任务时显示）
    const unschedRow = unsched.length
      ? `<div class="cat-unsched">⏳ 待安排 ${unsched.length} 件 · 拖到日历即可排入</div>` : '';
    const listHtml = arranged.length
      ? arranged.map(t => `
        <div class="cat-item" draggable="true" data-action="cat:task" data-id="${t.id}" data-from="backlog" data-date="${t.date}" data-tag="${k}">
          <span class="ci-check">${t.done ? '✓' : ''}</span>
          <span class="ci-text">${esc(t.text)}</span>
          <span class="ci-date" title="已安排到${Store.fmtMD(t.date)}">${Store.fmtMD(t.date)}</span>
        </div>`).join('')
      : (isCol ? '' : '<div class="cat-empty">拖任务到此归类</div>');
    return `
      <div class="cat-block" data-tag="${k}">
        <div class="cat-head" data-action="cat:toggle" data-tag="${k}">
          ${dot}<span>${TAGS[k].name}</span>
          <em>${all.length}</em>
          <span class="cat-fold">${isCol ? '▸' : '▾'}</span>
        </div>
        ${isCol ? '' : `<div class="cat-list">${unschedRow}${listHtml}</div>`}
      </div>`;
  }).join('');

  /* ---------- 收集箱（未分类 + 未安排）----------
     融合设计：收集箱 = backlog 中 tag=='' 且 date=='' 的任务。
     - 按 originalDate 录入时间倒序（最新在上）。
     - 已有分类的任务不出现在这里（它们已在左侧分类区）。
     - inbox 灵感箱仍归「待办」页管理，避免两个"未分类入口"混淆。 */
  const boxTasks = store.backlog
    .filter(t => !t.tag && !t.date)
    .sort((a, b) => String(b.originalDate || '').localeCompare(String(a.originalDate || '')));
  const boxHtml = boxTasks.length
    ? boxTasks.map(o => `
      <div class="box-item" draggable="true" data-action="box:task" data-id="${o.id}" data-from="backlog">
        <span class="ci-check"></span>
        <span class="ci-text">${esc(o.text)}</span>
      </div>`).join('')
    : '<div class="cat-empty">收集箱是空的，去「待办」页记点想法吧 ✨</div>';

  const cols = `
    <div class="today-cols">
      <div class="today-cat">
        <div class="col-title">🏷️ 分类 <span class="col-sub">拖任务进来即归类</span></div>
        <div class="cat-blocks">${catBlocks}</div>
      </div>
      <div class="today-box">
        <div class="col-title">📦 收集箱 <em>${boxTasks.length}</em> <span class="col-sub">未分类·未安排</span></div>
        <div class="box-dropzone" data-action="box:drop">${boxHtml}</div>
      </div>
    </div>`;

  // 欠安排提醒：已归类但还没排入任何日期的任务总数（不让用户的归类被漏看）
  const unschedTotal = Object.keys(catItems).reduce((s, k) => s + (catItems[k] || []).filter(t => !t.date).length, 0);
  const unschedTip = unschedTotal
    ? `<div class="today-tip">💜 有 ${unschedTotal} 件已归类、还没排入日期，拖到日历即可安放，不急。</div>`
    : '';

  return `
    <div class="today-mode">
      ${cal}
      ${focusRow}
      ${cols}
      ${unschedTip}
    </div>`;
}

/* 周选择器：展开月历网格，按周分行，点击某周行切换 */
function weekSelectorHtml(store, base) {
  const wk = Store.weekKey(base);
  const wn = Store.weekNumber(base);
  const d0 = new Date(base + 'T00:00:00');
  const yr = d0.getFullYear(), mo = d0.getMonth();
  const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7;
  const dim = Store.monthDays(yr, mo + 1);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(`${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const open = !!App.timelineWeekSelect;
  const rows = [];
  for (let r = 0; r < cells.length / 7; r++) {
    const row = cells.slice(r * 7, r * 7 + 7);
    const monday = row.find(Boolean);
    if (!monday) { rows.push(`<div class="wk-row empty"></div>`); continue; }
    const rk = Store.weekKey(monday);
    const isCur = rk === wk;
    const nums = row.map(d => d ? `<span class="${d === Store.todayStr() ? 'md-today' : ''}">${Number(d.split('-')[2])}</span>` : '<span class="md-blank"></span>').join('');
    rows.push(`<div class="wk-row${isCur ? ' cur' : ''}" data-action="week:select" data-week="${rk}" data-base="${monday}">
      <span class="wk-num">W${Store.weekNumber(monday)}</span>${nums}</div>`);
  }
  return `
    <div class="week-selector">
      <button class="wk-toggle" data-action="cal:week">W${wn}，本周 ${open ? '▲' : '▼'}</button>
      ${open ? `<div class="wk-grid"><div class="wk-weekdays"><span></span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>${rows.join('')}</div>` : ''}
    </div>`;
}

/* 周视图主体（修正版）：顶部周选择器 + 左本周重点/总结 + 右7天横向 + 点击展开日任务 */
function renderWeekBody(store, base) {
  const days = Store.weekDates(base);
  const wk = Store.weekKey(base);
  const wn = store.weekNotes[wk] || { focus: '', summary: '', items: [] };
  if (!wn.items) wn.items = [];

  const sel = App.timelineWeekSelectedDate || null;

  // 左侧：本周重点（可拖拽设重点）
  const focusCard = `
    <div class="focus-card week-focus">
      <div class="fc-title">📌 本周重点</div>
      <div class="hl-dropzone ${wn.items.length ? 'has' : ''}" data-action="week:highlight" data-week="${wk}">
        ${wn.items.length
          ? wn.items.map(h => `<div class="hl-chip" data-action="week:unhighlight" data-week="${wk}" data-hid="${h.id}">${esc(h.text)}<span class="hl-x">×</span></div>`).join('')
          : '<span class="hl-tip">可拖拽任务到此设为本周重点</span>'}
      </div>
    </div>`;

  const summary = `
    <div class="focus-card week-summary">
      <div class="fc-title">✏️ 本周总结</div>
      <textarea class="fc-input" id="week-summary-input" placeholder="本周总结" data-action="week:summary" data-week="${wk}">${esc(wn.summary)}</textarea>
    </div>`;

  // 右侧：一周7天横向
  const dayCols = days.map(d => {
    const list = dayTaskList(d);
    const isT = d === Store.todayStr();
    const isSel = d === sel;
    const color = dowColorClass(d);
    const n = list.length;
    const dot = n ? `<span class="wk-dot">●${n > 3 ? '3+' : n}</span>` : '';
    return `<div class="wk-day ${color}${isT ? ' today' : ''}${isSel ? ' sel' : ''}" data-action="week:day" data-date="${d}">
      <span class="wk-dow">${Store.fmtDOW(d)}</span>
      <span class="wk-num2">${Number(d.split('-')[2])}</span>
      ${dot}
    </div>`;
  }).join('');

  let expandHtml = '';
  if (sel) {
    const list = dayTaskList(sel);
    const isT = sel === Store.todayStr();
    expandHtml = `
      <div class="wk-expand">
        <div class="we-head"><span>${Store.fmtDOW(sel)} · ${Store.fmtMD(sel)}</span><button data-action="day:add" data-date="${sel}">+</button></div>
        <div class="we-list">
          ${list.length ? list.map(t => timelineTaskItem(t, sel)).join('') : `<div class="we-empty">这天还没有任务</div>`}
        </div>
        <button class="we-goto" data-action="today:date" data-date="${sel}">${isT ? '进入今天' : '在今日页查看'}</button>
      </div>`;
  }

  return `
    <div class="week-mode week-revised">
      ${weekSelectorHtml(store, base)}
      <div class="week-layout">
        <div class="week-left">
          ${focusCard}
          ${summary}
        </div>
        <div class="week-right">
          <div class="week-days">${dayCols}</div>
          ${expandHtml}
        </div>
      </div>
    </div>`;
}

/* 月选择器：标题"2026/8" + 月份切换箭头（点击展开年月选择器） */
function monthSelectorHtml(store, base) {
  const d0 = new Date(base + 'T00:00:00');
  const yr = d0.getFullYear(), mo = d0.getMonth();
  const open = !!App.timelineMonthSelect;
  const years = [yr - 1, yr, yr + 1];
  const yrHtml = years.map(y => `<div class="ym-year${y === yr ? ' on' : ''}" data-action="month:year" data-year="${y}">${y}</div>`).join('');
  const moHtml = Array.from({ length: 12 }, (_, i) => `<div class="ym-month${i === mo ? ' on' : ''}" data-action="month:month" data-month="${i}">${i + 1}月</div>`).join('');
  return `
    <div class="month-selector">
      <div class="ms-row">
        <button class="ms-nav" data-action="timeline:page" data-dir="-1">‹</button>
        <button class="ms-title" data-action="cal:month">${yr}/${String(mo + 1).padStart(2, '0')}</button>
        <button class="ms-nav" data-action="timeline:page" data-dir="1">›</button>
      </div>
      ${open ? `<div class="ym-picker"><div class="ym-years">${yrHtml}</div><div class="ym-months">${moHtml}</div></div>` : ''}
    </div>`;
}

/* 月视图主体（修正版）：月份选择器 + 本月重点/总结 + 标准月历7×6 + AI自动拆解 */
function renderMonthBody(store, base) {
  const d0 = new Date(base + 'T00:00:00');
  const yr = d0.getFullYear(), mo = d0.getMonth();
  const mk = `${yr}-${String(mo + 1).padStart(2, '0')}`;
  const mn = store.monthNotes[mk] || { focus: '', summary: '', items: [] };
  if (!mn.items) mn.items = [];

  const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7;
  const daysInMonth = Store.monthDays(yr, mo + 1);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows = [];
  for (let r = 0; r < cells.length / 7; r++) {
    rows.push(cells.slice(r * 7, r * 7 + 7));
  }

  // 本月重点：拖拽目标到此设为本月核心目标（带 AI 自动拆解按钮）
  const focusCard = `
    <div class="focus-card month-focus">
      <div class="fc-title">📌 本月重点 ${mn.items.length ? `<button class="fc-ai" data-action="month:auto" data-month="${mk}">✦ AI 拆解</button>` : ''}</div>
      <div class="hl-dropzone ${mn.items.length ? 'has' : ''}" data-action="month:highlight" data-month="${mk}">
        ${mn.items.length
          ? mn.items.map(h => `<div class="hl-chip" data-action="month:unhighlight" data-month="${mk}" data-hid="${h.id}">${esc(h.text)}<span class="hl-x">×</span></div>`).join('')
          : '<span class="hl-tip">可拖拽目标至此设为当月核心</span>'}
      </div>
    </div>`;

  const gridRows = rows.map(row => {
    const hasSel = row.some(d => d === App.timelineSelectedDate);
    const cellsHtml = row.map(d => {
      if (!d) return `<div class="month-cell empty"></div>`;
      const list = dayTaskList(d);
      const n = list.length;
      const done = list.filter(t => t.done).length;
      const isT = d === Store.todayStr();
      const isSel = d === App.timelineSelectedDate;
      const color = dowColorClass(d);
      const dens = AI.monthDensity(n);
      const dot = n && dens.size
        ? `<span class="mc-dot" style="width:${dens.size}px;height:${dens.size}px;background:${dens.color}"></span>`
        : '';
      return `<div class="month-cell ${color}${isT ? ' today' : ''}${isSel ? ' selected' : ''}${n ? ' has-task' : ''}" data-date="${d}" data-action="today:date" data-date="${d}">
        <span class="mc-date">${Number(d.split('-')[2])}</span>
        <span class="mc-count">${n ? done + '/' + n : ''}</span>
        ${dot}
      </div>`;
    }).join('');

    let expandHtml = '';
    if (hasSel) {
      const d = App.timelineSelectedDate;
      const list = dayTaskList(d);
      const isT = d === Store.todayStr();
      expandHtml = `
        <div class="month-expand">
          <div class="me-head"><span>${Store.fmtDOW(d)} · ${Store.fmtMD(d)}</span><button data-action="day:add" data-date="${d}">+</button></div>
          <div class="me-list">
            ${list.length ? list.map(t => timelineTaskItem(t, d)).join('') : `<div class="me-empty">这天还没有任务</div>`}
          </div>
          <button class="me-goto" data-action="today:date" data-date="${d}">${isT ? '进入今天' : '在今日页查看'}</button>
        </div>`;
    }

    return `<div class="month-row">${cellsHtml}</div>${expandHtml}`;
  }).join('');

  const monthTotal = cells.filter(Boolean).reduce((s, d) => s + scheduledCount(d), 0);
  const freeDays = cells.filter(Boolean).filter(d => scheduledCount(d) === 0).length;
  const busyDay = cells.filter(Boolean).reduce((best, d) => { const n = scheduledCount(d); return n > best.n ? { d, n } : best; }, { d: '', n: 0 });

  let advise = AI.copy('month_summary_light');
  if (monthTotal >= 26) advise = AI.copy('month_summary_heavy');
  else if (monthTotal >= 11) advise = AI.copy('month_summary_medium');
  if (busyDay.n >= 5) advise += ' ' + AI.copy('month_busy_day', { date: busyDay.d ? Store.fmtMD(busyDay.d) : '', n: busyDay.n });
  else if (busyDay.n === 0 && freeDays > 0) { /* 无最忙日 */ }
  if (freeDays >= 3) {
    const rel = cells.filter(Boolean).reduce((best, d) => {
      const n = scheduledCount(d); return n < best.n ? { d, n } : best;
    }, { d: busyDay.d, n: 99 });
    if (rel.n <= 1 && rel.d) advise += ` ${Store.fmtMD(rel.d)}相对空闲，可以安排一些碎片任务。`;
  }

  const summary = `
    <div class="focus-card month-summary-card">
      <div class="fc-title">✏️ 本月总结</div>
      <textarea class="fc-input" id="month-summary-input" placeholder="这个月过得怎么样？写几句话吧…" data-action="month:summary" data-month="${mk}">${esc(mn.summary)}</textarea>
    </div>`;

  return `
    <div class="month-mode month-revised">
      ${monthSelectorHtml(store, base)}
      ${focusCard}
      <div class="month-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      <div class="month-grid">${gridRows}</div>
      <div class="month-summary">
        <div class="ms-total">本月总任务：<strong>${monthTotal}</strong> 件 · 最忙的一天：<strong>${busyDay.d ? Store.fmtMD(busyDay.d).replace('月','日') + '（' + busyDay.n + '件）' : '无'}</strong></div>
        <div class="ms-advise">${advise || '节奏刚刚好，记得给自己留点空白。'}</div>
      </div>
      ${summary}
    </div>`;
}

/* 待办池 */
function renderPool(store) {
  const items = store.backlog.length ? store.backlog.map(b => {
    const tagDot = b.tag ? `<span class="tag-dot ${b.tag}"></span>` : '';
    return `<div class="pool-item" draggable="true" data-action="pool:pick" data-id="${b.id}" data-from="backlog">
      ${tagDot}
      <span class="pool-check" data-action="backlog:to-today" data-id="${b.id}"></span>
      <span class="pool-text">${esc(b.text)}</span>
      <button class="pool-assign" data-action="pool:assign" data-id="${b.id}" data-from="backlog">安排</button>
    </div>`;
  }).join('') : '<div class="pool-empty">待办池空了，去灵感箱加点想法吧 ✨</div>';

  return `
    <div class="pool">
      <div class="pool-title">📥 待办池 · 长按任务可拖拽到日期</div>
      <div class="pool-list">${items}</div>
    </div>`;
}

/* 单个任务项（时间轴用） */
function timelineTaskItem(t, date) {
  const tag = t.tag || '';
  const tagDot = tag && AI.TAGS[tag] ? `<span class="tag-dot ${tag}" title="${AI.TAGS[tag].name}"></span>` : '';
  const color = dowColorClass(date);
  return `<div class="tl-task${t.done ? ' done' : ''}"${t.done ? '' : ' draggable="true"'} data-action="timeline:task" data-id="${t.id}" data-date="${date}">
    <span class="tl-check ${color}" data-action="day:check" data-id="${t.id}" data-date="${date}">${t.done ? '✓' : ''}</span>
    ${tagDot}<span class="tl-text">${esc(t.text)}</span>
    <button class="tl-more" data-action="day:more" data-id="${t.id}" data-date="${date}">⋮</button>
  </div>`;
}

/* 打开某一天的任务详情浮层（周/月视图通用） */
function openDaySheet(date) {
  const store = Store.load();
  const list = dayTaskList(date);
  const isT = date === Store.todayStr();
  const title = isT ? `今天 · ${Store.fmtMD(date)}` : `${Store.fmtDOW(date)} · ${Store.fmtMD(date)}`;
  const items = list.length ? list.map(t => {
    const tag = t.tag || '';
    const tagDot = tag && AI.TAGS[tag] ? `<span class="tag-dot ${tag}"></span>` : '';
    return `<div class="ds-task${t.done ? ' done' : ''}">
      <span class="ds-check" data-action="day:check" data-id="${t.id}" data-date="${date}">${t.done ? '✓' : ''}</span>
      ${tagDot}<span class="ds-text">${esc(t.text)}</span>
      <button class="ds-more" data-action="day:more" data-id="${t.id}" data-date="${date}">⋮</button>
    </div>`;
  }).join('') : `<div class="ds-empty">这天还没有安排任务<br><small>从下方待办池拖过来，或点 + 快速添加</small></div>`;

  const actions = `
    <div class="ds-actions">
      <button class="btn-ghost" data-action="day:add" data-date="${date}">+ 快速添加</button>
      ${isT ? `<button class="btn-primary" data-action="day:enter-today">进入今日执行</button>` : `<button class="btn-primary" data-action="today:date" data-date="${date}">在今日页查看</button>`}
    </div>`;

  openSheet(`
    <div class="sheet day-sheet">
      <div class="sheet-head">${title}<span class="ds-count">${list.filter(t => t.done).length}/${list.length}</span></div>
      <div class="ds-list">${items}</div>
      ${actions}
      <button class="sheet-cancel" data-action="modal:close">关闭</button>
    </div>`);
}

function getDayArr(date) {
  const store = Store.load();
  if (date === Store.todayStr()) return store.today.tasks;
  store.dayTasks = store.dayTasks || {};
  store.dayTasks[date] = store.dayTasks[date] || [];
  return store.dayTasks[date];
}

function dayCheck(date, id) {
  const arr = getDayArr(date);
  const t = arr.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) {
    const rec = Store.load().dayLog[date] || { done: 0, planned: Math.max(1, arr.length), mood: '😐' };
    rec.done = (rec.done || 0) + 1;
    Store.load().dayLog[date] = rec;
  }
  Store.save();
  render();
  // 如果弹层还在，刷新它
  setTimeout(() => { if ($('.day-sheet')) openDaySheet(date); }, 0);
}

function dayDelete(date, id) {
  const arr = getDayArr(date);
  const idx = arr.findIndex(x => x.id === id);
  if (idx < 0) return;
  const t = arr[idx];
  arr.splice(idx, 1);
  Store.save();
  render();
  setTimeout(() => { if ($('.day-sheet')) openDaySheet(date); }, 0);
  actionToast(`已删除"${t.text}"`, () => {
    const st = Store.load();
    const a = getDayArr(date);
    a.splice(Math.min(idx, a.length), 0, t);
    Store.save(); render();
    setTimeout(() => { if ($('.day-sheet')) openDaySheet(date); }, 0);
  });
}

function dayToBacklog(date, id) {
  const arr = getDayArr(date);
  const t = arr.find(x => x.id === id);
  if (!t) return;
  arr.splice(arr.indexOf(t), 1);
  const store = Store.load();
  store.backlog.unshift({ ...t, originalDate: Store.todayStr() });
  Store.save();
  render();
  setTimeout(() => { if ($('.day-sheet')) openDaySheet(date); }, 0);
  aiToast('task_moved_to_date', { task: t.text, date: '待办池' });
}

function dayAdd(date) {
  const text = prompt(`给 ${Store.fmtMD(date)} 添加任务：`) || '';
  if (!text.trim()) return;
  const tag = AI.autoTag(text).tag || '';
  const task = {
    id: Store.uid(), text: text.trim(), estMin: 15, priority: false, done: false,
    goalId: null, why: '', slot: '', matched: false, routeNote: '', tag
  };
  if (date === Store.todayStr()) {
    task.slot = 'night';
    task.matched = true;
    Store.load().today.tasks.push(task);
  } else {
    Store.load().dayTasks = Store.load().dayTasks || {};
    Store.load().dayTasks[date] = Store.load().dayTasks[date] || [];
    Store.load().dayTasks[date].push(task);
  }
  if (tag) AI.recordTag(text, tag);
  Store.save();
  render();
  setTimeout(() => { if ($('.day-sheet')) openDaySheet(date); }, 0);
}

function saveWeekFocus(wk) {
  const store = Store.load();
  store.weekNotes = store.weekNotes || {};
  store.weekNotes[wk] = store.weekNotes[wk] || {};
  store.weekNotes[wk].focus = ($('#week-focus-input') || {}).value || '';
  Store.save();
}

function saveWeekSummary(wk) {
  const store = Store.load();
  store.weekNotes = store.weekNotes || {};
  store.weekNotes[wk] = store.weekNotes[wk] || {};
  store.weekNotes[wk].summary = ($('#week-summary-input') || {}).value || '';
  Store.save();
}

/* 今日重点 / 总结 存储 */
function saveTodaySummary(d) {
  const store = Store.load();
  store.todaySummary = store.todaySummary || {};
  store.todaySummary[d] = ($('#today-summary-input') || {}).value || '';
  Store.save();
}

/** 把任务设为某日「今日重点」（拖拽入 dropzone） */
function addDayHighlight(d, taskObj) {
  if (!taskObj) return;
  const store = Store.load();
  store.dayHighlights = store.dayHighlights || {};
  store.dayHighlights[d] = store.dayHighlights[d] || [];
  if (store.dayHighlights[d].some(h => h.id === taskObj.id)) return;
  store.dayHighlights[d].push({ id: taskObj.id, text: taskObj.text, from: taskObj.from || 'task' });
  Store.save();
  render();
}

function removeDayHighlight(d, hid) {
  const store = Store.load();
  store.dayHighlights = store.dayHighlights || {};
  if (store.dayHighlights[d]) store.dayHighlights[d] = store.dayHighlights[d].filter(h => h.id !== hid);
  Store.save();
  render();
}

/** 把任务设为本周重点项 */
function addWeekHighlight(wk, taskObj) {
  if (!taskObj) return;
  const store = Store.load();
  store.weekNotes = store.weekNotes || {};
  store.weekNotes[wk] = store.weekNotes[wk] || { focus: '', summary: '', items: [] };
  if (!store.weekNotes[wk].items) store.weekNotes[wk].items = [];
  if (store.weekNotes[wk].items.some(h => h.id === taskObj.id)) return;
  store.weekNotes[wk].items.push({ id: taskObj.id, text: taskObj.text, from: taskObj.from || 'task' });
  Store.save();
  render();
}

function removeWeekHighlight(wk, hid) {
  const store = Store.load();
  store.weekNotes = store.weekNotes || {};
  if (store.weekNotes[wk] && store.weekNotes[wk].items) {
    store.weekNotes[wk].items = store.weekNotes[wk].items.filter(h => h.id !== hid);
  }
  Store.save();
  render();
}

/** 把目标/任务设为当月重点项 */
function addMonthHighlight(mk, taskObj) {
  if (!taskObj) return;
  const store = Store.load();
  store.monthNotes = store.monthNotes || {};
  store.monthNotes[mk] = store.monthNotes[mk] || { focus: '', summary: '', items: [] };
  if (!store.monthNotes[mk].items) store.monthNotes[mk].items = [];
  if (store.monthNotes[mk].items.some(h => h.id === taskObj.id)) return;
  store.monthNotes[mk].items.push({ id: taskObj.id, text: taskObj.text, from: taskObj.from || 'task' });
  Store.save();
  render();
}

function removeMonthHighlight(mk, hid) {
  const store = Store.load();
  store.monthNotes = store.monthNotes || {};
  if (store.monthNotes[mk] && store.monthNotes[mk].items) {
    store.monthNotes[mk].items = store.monthNotes[mk].items.filter(h => h.id !== hid);
  }
  Store.save();
  render();
}

/**
 * AI 自动拆解（月视图）：识别「本月重点」任务，自动拆解为 4 个周任务，
 * 每个周任务再拆解为每日任务（附「为什么做」），结果自动进入本周视图与今日页。
 * 同时把本月重点继承进「本周重点」。
 */
function doMonthAutoDecompose(mk) {
  const store = Store.load();
  store.monthNotes = store.monthNotes || {};
  const mn = store.monthNotes[mk];
  if (!mn || !mn.items || !mn.items.length) {
    aiToast('month_no_highlight');
    return;
  }
  const today = Store.todayStr();
  const monthStart = (mk + '-01');
  const monthEnd = Store.toYMD(new Date(Number(mk.split('-')[0]), Number(mk.split('-')[1]), 0));
  // 取第一个本月重点任务作为拆解对象
  const top = mn.items[0];

  // 1) 本月重点 → 本周重点继承
  const wk = Store.weekKey(today);
  store.weekNotes = store.weekNotes || {};
  store.weekNotes[wk] = store.weekNotes[wk] || { focus: '', summary: '', items: [] };
  if (!store.weekNotes[wk].items) store.weekNotes[wk].items = [];
  if (!store.weekNotes[wk].items.some(h => h.id === top.id)) {
    store.weekNotes[wk].items.push({ id: top.id, text: top.text, from: 'month' });
  }

  // 2) 拆 4 个周任务（围绕重点，给why），落到未来4周（每周一）的 weekNotes.focus
  const mondays = [];
  let cur = new Date(Store.startOfWeek(today) + 'T00:00:00');
  if (cur < new Date(today + 'T00:00:00')) cur.setDate(cur.getDate() + 7);
  for (let i = 0; i < 4; i++) {
    const md = Store.toYMD(cur);
    if (md <= monthEnd) { mondays.push(md); }
    cur.setDate(cur.getDate() + 7);
  }
  while (mondays.length < 4) { cur.setDate(cur.getDate() + 7); mondays.push(Store.toYMD(cur)); }
  const weekPlans = [
    { text: `规划「${top.text}」的节奏`, why: '先想清楚月球什么， weekly 才有底气' },
    { text: `推进「${top.text}」核心部分`, why: '趁状态好把最难的一步做了' },
    { text: `打磨「${top.text}」的细节`, why: '好成果是改出来的' },
    { text: `收尾并复盘「${top.text}」`, why: '闭环，让下个月更好' }
  ];
  mondays.forEach((md, i) => {
    const rk = Store.weekKey(md);
    store.weekNotes[rk] = store.weekNotes[rk] || { focus: '', summary: '', items: [] };
    if (!store.weekNotes[rk].items) store.weekNotes[rk].items = [];
    const id = Store.uid();
    if (!store.weekNotes[rk].items.some(h => h.text === weekPlans[i].text)) {
      store.weekNotes[rk].items.push({ id, text: weekPlans[i].text, from: 'auto' });
    }
  });

  // 3) 本周 → 今日任务自动生成（把本周重点项生成到今日页，附带why）
  store.today.tasks = store.today.tasks || [];
  const todayItem = store.weekNotes[wk].items.find(h => h.text === weekPlans[0].text);
  if (todayItem && !store.today.tasks.some(t => t.text === todayItem.text)) {
    store.today.tasks.push({
      id: todayItem.id, text: todayItem.text, estMin: 30,
      priority: true, done: false, goalId: null,
      why: weekPlans[0].why, slot: 'night', matched: false, routeNote: ''
    });
  }

  Store.save();
  // 跳到本周视图，让用户立刻看到结果
  App.timelineView = 'week';
  App.timelineDate = today;
  App.timelineWeekSelectedDate = today;
  render();
  aiToast('month_auto_done', { task: top.text, weeks: 4 });
}

/** 从任意来源（待办池/任务卡片）取出任务对象，供拖拽设重点 */
function pickTaskObject(id, from, date) {
  const store = Store.load();
  if (from === 'backlog') return store.backlog.find(t => t.id === id) ? { id, text: store.backlog.find(t => t.id === id).text, from: 'backlog' } : null;
  if (from === 'today' || (from === 'day' && date === Store.todayStr())) {
    const t = store.today.tasks.find(x => x.id === id); return t ? { id, text: t.text, from: 'today' } : null;
  }
  if (from === 'day') {
    const arr = (store.dayTasks && store.dayTasks[date]) || [];
    const t = arr.find(x => x.id === id); return t ? { id, text: t.text, from: 'day' } : null;
  }
  // 目标任务
  for (const g of store.goals) {
    const t = g.tasks.find(x => x.id === id);
    if (t) return { id, text: t.text, from: 'goal' };
  }
  // 灵感箱来源
  const inbox = (store.inbox || []).find(x => x.id === id);
  if (inbox) return { id, text: inbox.text, from: 'inbox' };
  return null;
}

/** 给任务更换标签（分类区拖到另一个标签头） */
function setTaskTag(id, from, date, newTag) {
  const store = Store.load();
  const arr = from === 'today' ? store.today.tasks
    : from === 'day' ? (store.dayTasks && store.dayTasks[date]) || []
    : store.backlog;
  const t = (arr || []).find(x => x.id === id);
  if (!t) return;
  if (newTag === 'none') { t.tag = ''; }
  else t.tag = newTag;
  Store.save();
  render();
}

/** 把任务移回收集箱（取消分类 / 取消安排），成为未分类未安排状态 */
function moveToInbox(id, from, date) {
  const store = Store.load();
  let taskObj = null;
  const rm = (arr, k) => { const i = (arr || []).findIndex(x => x.id === id); if (i >= 0) { taskObj = arr[i]; arr.splice(i, 1); } };
  if (from === 'today') rm(store.today.tasks);
  else if (from === 'day') { if (store.dayTasks && store.dayTasks[date]) rm(store.dayTasks[date]); }
  else rm(store.backlog);
  if (!taskObj) return;
  // 进入收集箱：加入 backlog 并清除 date（inbox 灵感箱项则删除 inbox 记录）
  if (from === 'inbox') {
    store.inbox = (store.inbox || []).filter(x => x.id !== id);
  } else {
    taskObj.date = '';
    taskObj.tag = taskObj.tag || '';
    store.backlog = store.backlog || [];
    store.backlog.unshift(taskObj);
  }
  Store.save();
  render();
}

function openDayTaskMenu(date, id) {
  const arr = getDayArr(date);
  const t = arr.find(x => x.id === id);
  if (!t) return;
  openSheet(`
    <div class="sheet">
      <div class="sheet-head">${esc(t.text)}</div>
      <div class="sheet-days" style="grid-template-columns:1fr 1fr">
        <button class="sheet-day" data-action="timeline:task" data-id="${id}" data-date="${date}">查看详情</button>
        <button class="sheet-day" data-action="day:to-backlog" data-id="${id}" data-date="${date}">移到待办池</button>
        <button class="sheet-day" data-action="day:delete" data-id="${id}" data-date="${date}">删除</button>
        <button class="sheet-day" data-action="modal:close">取消</button>
      </div>
    </div>`);
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
  }).join('') : '<div class="inbox-empty">想法存下后会自动收进下面的待办 ✨</div>';

  // 灵感箱存入时的标签选择：AI 推荐 + 手动覆盖
  const recTag = App.inboxTagRec || (App.inboxTag ? AI.autoTag('').tag : '');
  const sel = App.inboxTag || App.inboxTagRec || '';
  const tagChips = Object.keys(AI.TAGS).map(k => {
    const t = AI.TAGS[k];
    const on = sel === k;
    const isRec = App.inboxTagRec === k && !App.inboxTag;
    return `<button class="tag-chip ${k}${on ? ' on' : ''}${isRec ? ' rec' : ''}" data-action="inbox:tag" data-tag="${k}">
      <span class="dot"></span>${t.name}${isRec ? '<span class="rec-badge">AI推荐</span>' : ''}
    </button>`;
  }).join('');

  const inboxCard = `
    <section class="card inbox-card">
      <div class="card-title">
        <span class="t">✨ 灵感箱</span>
        <span class="meta">记下来，不打断当下</span>
      </div>
      <div class="inbox-row">
        <input class="input inbox-input" id="inbox-input" placeholder="冒出什么想法？先写在这里…">
        <button class="btn inbox-save" data-action="inbox:add">存入</button>
      </div>
      <div class="tag-select-tip">存入时选择分类（${sel ? '已选：' + (AI.TAGS[sel] ? AI.TAGS[sel].name : '') : '留空则由 AI 稍后推荐'}）</div>
      <div class="tag-row">${tagChips}</div>
      <div class="inbox-list">${inboxHtml}</div>
    </section>`;

  // 待办存放提醒：3天未排 / 7天未动（从今日页移来，避免在今日页干扰执行）
  const ageOf = b => (new Date(Store.todayStr()) - new Date(b.originalDate + 'T00:00:00')) / 864e5;
  const stale7 = store.backlog.filter(b => ageOf(b) >= 7);
  const stale3 = store.backlog.filter(b => ageOf(b) >= 3 && ageOf(b) < 7);
  const remind = [
    ...stale7.map(b => `
    <div class="remind-card">
      <span>${AI.copy('backlog_7d', { task: b.text })}</span>
      <div class="acts">
        <button data-action="backlog:restore" data-id="${b.id}">重新安排</button>
        <button class="ghost" data-action="backlog:delete" data-id="${b.id}">删除</button>
      </div>
    </div>`),
    ...stale3.map(b => `
    <div class="remind-card" style="background:rgba(212,184,217,.08)">
      <span>${AI.copy('backlog_3d', { task: b.text })}</span>
      <div class="acts">
        <button data-action="backlog:restore" data-id="${b.id}">排进今日</button>
        <button class="ghost" data-action="backlog:delete" data-id="${b.id}">放下</button>
      </div>
    </div>`)
  ].join('');

  // 标签筛选切换栏
  const filterChips = ['', ...Object.keys(AI.TAGS)].map(k => {
    const name = k === '' ? '全部' : AI.TAGS[k].name;
    const on = App.backlogFilter === k;
    return `<button class="filter-chip${k ? ' ' + k : ''}${on ? ' on' : ''}" data-action="backlog:filter" data-tag="${k}">
      ${k ? `<span class="dot"></span>` : ''}${name}</button>`;
  }).join('');

  // 按日期分组（先按当前筛选过滤）
  const filtered = App.backlogFilter ? store.backlog.filter(b => (b.tag || '') === App.backlogFilter) : store.backlog;
  const groups = {};
  filtered.forEach(b => { (groups[b.originalDate] = groups[b.originalDate] || []).push(b); });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const groupHtml = dates.map(d => `
    <div class="date-group-label">📅 ${d === Store.todayStr() ? `今天（${Store.fmtMD(d)}）` : Store.fmtMD(d)}</div>
    <div class="card backlog-group">
      <ul class="task-list">
        ${groups[d].map(b => {
          const frag = AI.isFragTask(b.text, b.estMin) ? '<span class="bolt" title="适合碎片时间">⚡</span>' : '';
          const tagDot = b.tag ? `<span class="tag-dot ${b.tag}" title="${AI.TAGS[b.tag] ? AI.TAGS[b.tag].name : ''}"></span>` : '';
          return `
          <li class="task" data-action="backlog:detail" data-id="${b.id}" title="点击查看详情 · 左滑或长按可操作">
            <span class="check"></span>
            <div class="task-body">
              <span class="task-text">${tagDot}${esc(b.text)}${frag}${b.originalDate !== Store.todayStr() ? ' <span class="roll-tag">🍃 顺延</span>' : ''}${b.priority ? ' <span class="prio-tag">优先</span>' : ''}</span>
              <span class="task-meta">${b.estMin ? `${b.estMin}分钟` : '未估时'}</span>
            </div>
            <span class="flag"></span>
            <div class="swipe-acts">
              <button data-action="backlog:edit" data-id="${b.id}">编辑</button>
              <button data-action="backlog:to-today" data-id="${b.id}">移动</button>
              <button class="danger" data-action="backlog:del" data-id="${b.id}">删除</button>
            </div>
          </li>`;
        }).join('')}
      </ul>
    </div>`).join('') || '<div class="card" style="text-align:center;color:var(--ink-2)">这个分类下还没有待办，换个标签看看？</div>';

  return `
    <div class="page-stack backlog-page">
      ${inboxCard}
      ${remind}
      <div class="filter-bar">${filterChips}</div>
      ${groupHtml}
      <div class="tip-line">左滑 → 编辑 / 移动 / 删除 · 长按 → 更多操作</div>
      <div class="end-line">—— 没有更多了 ——</div>
      <button class="fab" data-action="inbox:focus" title="添加想法" aria-label="添加想法">＋</button>
    </div>`;
}

/* 灵感箱动作 */
function focusInbox() {
  const inp = $('#inbox-input');
  if (!inp) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  inp.focus({ preventScroll: true });
}
function inboxAdd(text) {
  const store = Store.load();
  const txt = String(text || '').trim();
  if (!txt) return;
  // AI 自动标签：用户未手动选时给出推荐，存入后记录
  const tag = App.inboxTag || (AI.autoTag(txt).tag || '');
  // 灵感箱 → 待办联动：存入即自动收进待办列表（今天分组）
  store.backlog.unshift({ id: Store.uid(), text: txt, estMin: 15, priority: false, originalDate: Store.todayStr(), why: '', tag });
  if (tag) AI.recordTag(txt, tag);
  store.flags.tabDots = { ...(store.flags.tabDots || {}), backlog: true };
  App.inboxTag = '';
  App.inboxTagRec = '';
  Store.save();
  if (tag) aiToast('tag_saved', { task: txt, tag: AI.TAGS[tag] ? AI.TAGS[tag].name : '' });
  else aiToast('inbox_captured');
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
  // 进行中目标按进度从高到低排列（先看到接近完成的，有成就感）
  const pctOf = g => g.tasks.length ? Math.round(g.tasks.filter(t => t.done).length / g.tasks.length * 100) : 0;
  const active = store.goals.filter(g => !g.archived).slice().sort((a, b) => pctOf(b) - pctOf(a));
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
    // 三阶段状态点 + 当前阶段名
    let stageHtml = '';
    let curPhaseName = '';
    if (g.phases && g.phases.length) {
      const undone = g.tasks.filter(t => !t.done);
      const curPi = undone.length ? (undone[0].phase || 0) : g.phases.length - 1;
      curPhaseName = g.phases[curPi] ? g.phases[curPi].name : '';
      stageHtml = `<div class="goal-stages">${g.phases.map((p, pi) => {
        const all = g.tasks.filter(t => (t.phase === undefined ? pi === 0 : t.phase === pi));
        const pd = all.filter(t => t.done).length;
        const st = all.length && pd >= all.length ? 'done' : (pd > 0 ? 'going' : 'todo');
        return `<span class="gs ${st}" title="${esc(p.name)}">${pi + 1}</span>`;
      }).join('')}</div>`;
    }
    return `
      <article class="goal-card ${isKept ? 'done' : ''}" data-action="goal:detail" data-id="${g.id}">
        <div class="goal-progress"><div class="bar" style="width:${pct}%"></div></div>
        <div class="goal-title">${esc(g.title)}</div>
        <div class="goal-sub">${pct}% · 剩余${Math.max(0, leftDays)}天 · 还有${remain}件任务待完成${curPhaseName ? ` · ${esc(curPhaseName)}` : ''}</div>
        ${stageHtml}
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
        <div class="goal-done-block">
          <button class="goal-done-head" data-action="goals-done:toggle">
            <span class="lb">✅ 已完成 <span class="n">${doneGoals.length} 个</span></span>
            <span class="chev">${App.doneGoalsExpanded ? '▾' : '▸'}</span>
          </button>
          ${App.doneGoalsExpanded ? doneGoals.map(g => `<div class="card goal-done-item">
            <span class="gt">${esc(g.title)}</span>
            <span class="gd">${Store.fmtMD(g.doneDate)} 归档</span>
          </div>`).join('') : ''}
        </div>`;
      })()}
    </div>`;
}

/* ================= 复盘页 ================= */
function reviewOpener(r) {
  if (r.fullAttendance) return AI.copy('streak3');
  if (r.total === 0) return AI.copy('weekly_opener') + ' 这一周你走得很轻，没关系，存在本身就有意义。';
  return AI.copy('weekly_opener');
}
function monthOpener(m) {
  if (m.total === 0) return AI.copy('monthly_opener') + ' 这个月你走得很轻，没关系，休养也是进度。';
  return AI.copy('monthly_opener');
}
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

    const list = weekEntries.map(g => `
      <div class="review-day">${Store.fmtMD(g.ymd)} · ${Store.fmtDOW(g.ymd)}</div>
      ${g.items.map(e => `
        <div class="review-task"><span class="mood">${e.mood}</span><span>${esc(e.text)}</span><span style="margin-left:auto;font-size:12px;color:var(--ink-2)">${e.estMin}分钟</span></div>`).join('')}`).join('');
    const mx = Math.max(...r.days.map(d => d.done), 0);
    const mnDays = r.days.filter(d => d.done > 0);
    const mn = mnDays.length ? Math.min(...mnDays.map(d => d.done)) : 0;

    return `
      <div class="page-stack">
        ${seg}
        <div class="review-opener">${reviewOpener(r)}</div>
        <div class="big-stat">
          <div class="v">${r.total}</div>
          <div class="l">本周完成（最近7天）</div>
          <div class="s">周最高 ${mx} 件 · 周最低 ${mn} 件</div>
        </div>
        <div class="card">
          <div class="card-title"><span class="t">节奏回顾</span></div>
          <div class="card-sub">每天完成的任务数量</div>
          ${spark}
          <div class="divider"></div>
          <div style="font-size:14px;line-height:1.7;color:var(--ink-2)">${r.curve}。${r.advice}</div>
        </div>
        ${r.fullAttendance ? `<div class="full-attend">🏆 ${AI.copy('streak3')} · 连续${calcStreak()}天全勤</div>` : ''}
        <div id="ai-insight" class="card ai-insight" style="display:none">
          <div class="card-title"><span class="t">墨的复盘</span><span class="tag-ai">AI</span></div>
          <div class="ai-insight-body"></div>
        </div>
        ${list ? `
          <section class="card completed-fold">
            <button class="review-done-head" data-action="review-done:toggle">
              <span class="lb">✅ 查看本周全部已完成（${r.total}件）</span>
              <span class="chev">${App.reviewDoneExpanded ? '▾' : '▸'}</span>
            </button>
            ${App.reviewDoneExpanded ? `<div class="review-done-list">${list}</div>` : ''}
          </section>` : ''}
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
  const avg = m.total ? Math.round(m.total / Math.max(1, new Date().getDate()) * 10) / 10 : 0;
  // 本月已完成明细（默认折叠，从近到远）
  const monPrefix = Store.todayStr().slice(0, 7);
  const monEntries = store.completedLog.filter(e => e.date.startsWith(monPrefix)).sort((a, b) => b.date.localeCompare(a.date));
  const monGroups = {};
  monEntries.forEach(e => { (monGroups[e.date] = monGroups[e.date] || []).push(e); });
  const monDates = Object.keys(monGroups).sort((a, b) => b.localeCompare(a));
  const monList = monDates.map(d => `
    <div class="review-day">${Store.fmtMD(d)} · ${Store.fmtDOW(d)}</div>
    ${monGroups[d].map(e => `
      <div class="review-task"><span class="mood">${e.mood}</span><span>${esc(e.text)}</span><span style="margin-left:auto;font-size:12px;color:var(--ink-2)">${e.estMin}分钟</span></div>`).join('')}`).join('');

  return `
    <div class="page-stack">
      ${seg}
      <div class="review-opener">${monthOpener(m)}</div>
      <div class="big-stat">
        <div class="v">${m.total}</div>
        <div class="l">本月完成</div>
        <div class="s">日均 ${avg} 件 · 重复灵感：${repeatedText}</div>
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
      <div id="ai-insight" class="card ai-insight" style="display:none">
        <div class="card-title"><span class="t">墨的复盘</span><span class="tag-ai">AI</span></div>
        <div class="ai-insight-body"></div>
      </div>
      ${monList ? `
        <section class="card completed-fold">
          <button class="review-done-head" data-action="review-done:toggle">
            <span class="lb">✅ 查看本月全部已完成（${monEntries.length}件）</span>
            <span class="chev">${App.reviewDoneExpanded ? '▾' : '▸'}</span>
          </button>
          ${App.reviewDoneExpanded ? `<div class="review-done-list">${monList}</div>` : ''}
        </section>` : ''}
    </div>`;
}

/* ================= AI 气泡组件 ================= */
/* 数字/关键词强调色：把「3件事」「15分钟」等数字单位包成高亮 */
function hlText(text) {
  return esc(text).replace(/(\d+(?:\.\d+)?)(件|个|分钟|小时|天|步|公里|km|次)/g, '<span class="highlight">$1$2</span>');
}

function bubble(text, align = 'left', id = '') {
  return `
    <div class="ai-hero ${align}">
      ${align === 'left' ? `<div class="ai-avatar" aria-label="墨"></div>` : ''}
      <div class="ai-bubble" ${id ? `id="${id}"` : ''}>
        <div class="text">${hlText(text)}</div>
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
        <div class="toast-text">${hlText(text)}</div>
        ${buttons}
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
    case 'day:to-today': dayToToday(id, btn.dataset.date); break;
    case 'day:edit': openTaskEdit(id, 'day:' + btn.dataset.date); break;
    case 'day:del': dayDelete(id, btn.dataset.date); break;
    case 'achieve:archive': archiveGoal(id); break;
    case 'achieve:keep': keepGoal(id); break;
  }
}

/* 任务详情浮层：点击任务卡片弹出（毛玻璃，不跳转页面） */
function openTaskDetail(id, source) {
  const store = Store.load();
  let arr, isToday = false, isDay = false, dayDate = '';
  if (source === 'today') { arr = store.today.tasks; isToday = true; }
  else if (source && source.indexOf('day:') === 0) { dayDate = source.slice(4); arr = (store.dayTasks && store.dayTasks[dayDate]) || []; isDay = true; }
  else { arr = store.backlog; }
  const t = arr.find(x => x.id === id);
  if (!t) return;
  const sug = isToday && t.slot ? AI.buildSlots(Store.todayStr()).find(s => s.key === t.slot) : null;
  const frag = AI.isFragTask(t.text, t.estMin);
  const rows = `
    <div class="ds-row"><span class="ds-k">预计</span><span class="ds-v">${t.estMin ? `${t.estMin} 分钟` : '未填写'}</span></div>
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
    : isDay
      ? `<button class="btn-primary" data-sheet="day:to-today" data-id="${t.id}" data-date="${dayDate}">排进今日</button>
         <button class="btn-ghost" data-sheet="day:edit" data-id="${t.id}" data-date="${dayDate}">✏️ 编辑</button>
         <button class="btn-danger" data-sheet="day:del" data-id="${t.id}" data-date="${dayDate}">删除</button>`
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
  const info = `${t.estMin ? `${t.estMin}分钟` : '未估时'}${t.priority ? ' · 🔴 优先' : ''}${AI.isFragTask(t.text, t.estMin) ? ' · ⚡ 碎片' : ''}`;
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
  actionToast('已进入编辑模式');
  const store = Store.load();
  let arr, dayDate = '';
  if (source === 'today') arr = store.today.tasks;
  else if (source && source.indexOf('day:') === 0) { dayDate = source.slice(4); arr = (store.dayTasks && store.dayTasks[dayDate]) || []; }
  else arr = store.backlog;
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
  let arr, dayDate = '';
  if (source === 'today') arr = store.today.tasks;
  else if (source && source.indexOf('day:') === 0) { dayDate = source.slice(4); arr = (store.dayTasks && store.dayTasks[dayDate]) || []; }
  else arr = store.backlog;
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
    let tt;
    if (source === 'today') tt = st.today.tasks.find(x => x.id === id);
    else if (source && source.indexOf('day:') === 0) tt = ((st.dayTasks && st.dayTasks[dayDate]) || []).find(x => x.id === id);
    else tt = st.backlog.find(x => x.id === id);
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

/* ================= 目标相关 ================= */

/* 新建目标：输入 + 人生阶段 + 周期 + 难度 */
function openNewGoal(prefill) {
  const stages = Object.values(GoalKB.LIFE_STAGES);
  const diffs = Object.values(GoalKB.DIFFICULTIES);
  App.goalForm = App.goalForm || { stage: 'starter', cycleDays: 14, difficulty: 'medium' };
  openModal(modalShell(
    '✨ 新建目标', '输入一个目标，墨会用本地知识库拆成每天能打勾的小步。',
    `<input class="input" id="goal-input" placeholder="例如：写一篇公众号文章" value="${esc(prefill || '')}" autofocus>
     <div class="gf-label">你正处于人生的哪个阶段？</div>
     <div class="gf-chips" id="gf-stage">
       ${stages.map(s => `<button class="chip ${s.id === App.goalForm.stage ? 'on' : ''}" data-val="${s.id}">${s.name}</button>`).join('')}
     </div>
     <div class="gf-label">计划用多久完成？</div>
     <div class="gf-chips" id="gf-cycle">
       ${GoalKB.CYCLES.map(c => `<button class="chip ${c.days === App.goalForm.cycleDays ? 'on' : ''}" data-days="${c.days}">${c.label}</button>`).join('')}
     </div>
     <div class="gf-label">难度</div>
     <div class="gf-chips" id="gf-diff">
       ${diffs.map(d => `<button class="chip ${d.id === App.goalForm.difficulty ? 'on' : ''}" data-val="${d.id}">${d.name}</button>`).join('')}
     </div>`,
    `<div class="modal-actions"><button class="btn-primary" data-action="goal:decompose">✨ 帮我拆解</button></div>`
  ));
  bindChips('#gf-stage', v => { App.goalForm.stage = v; });
  bindChips('#gf-cycle', v => { App.goalForm.cycleDays = Number(v); });
  bindChips('#gf-diff', v => { App.goalForm.difficulty = v; });
  const input = $('#goal-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doDecompose(input.value); });
  setTimeout(() => input.focus(), 60);
}

/* 胶囊单选绑定 */
function bindChips(sel, cb) {
  const root = $(sel);
  if (!root) return;
  root.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    root.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
    cb(b.dataset.val !== undefined ? b.dataset.val : b.dataset.days);
  });
}

/* 本地知识库拆解：不依赖任何外部 API */
function doDecompose(inputText) {
  if (!inputText.trim()) return;
  const store = Store.load();
  const plan = GoalKB.decompose(inputText.trim(), {
    cycleDays: App.goalForm.cycleDays || 14,
    lifeStage: App.goalForm.stage || 'starter',
    difficulty: App.goalForm.difficulty || 'medium'
  });
  App.pendingPlan = plan;
  store.flags.goalInputLast = inputText.trim();
  Store.save();

  const phasesHtml = plan.phases.map(p => `
    <div class="phase-card">
      <div class="phase-head">
        <span class="phase-name">${esc(p.name)}</span>
        <span class="phase-dur">${p.duration}</span>
      </div>
      <div class="phase-milestone">🏁 ${esc(p.milestone)}</div>
      <div class="phase-tasks">
        ${p.tasks.map(t => `<div class="ptask"><span class="ptask-day">Day ${t.day}</span><span class="ptask-text">${esc(t.text)}</span></div>`).join('')}
      </div>
    </div>`).join('');
  const freeDays = plan.freeDays.map(d => `Day ${d}`).join('、');
  const first = plan.daily.find(d => d.tasks.length);
  const second = plan.daily.find(d => d.day > (first ? first.day : 0) && d.tasks.length);

  openModal(modalShell(
    '目标拆解结果',
    `${esc(plan.title)} · ${plan.cycleLabel} · ${plan.difficultyName}难度`,
    `
    <div class="decomp-hero">
      <div class="goal-progress"><div class="bar" style="width:0%"></div></div>
      <div class="decomp-meta">共 ${plan.totalTasks} 件 · 每天≤${plan.maxDailyTasks}件 · 平均约 ${plan.avgMin} 分钟/天 · 自由日：${freeDays || '无'}</div>
    </div>
    ${phasesHtml}
    ${first ? `
    <div class="decomp-today">
      <div class="dt-title">Day ${first.day} · 开始执行后的第一件任务</div>
      ${first.tasks.map(t => `<div class="decomp-task"><span class="check"></span><div>${esc(t.text)} <span class="d-why">为什么：${esc(t.why || '让这一步更轻松')}</span></div></div>`).join('')}
    </div>` : ''}
    ${second ? `
    <div class="decomp-next">
      <div class="dt-title dim">Day ${second.day} · 第二件</div>
      ${second.tasks.map(t => `<div class="decomp-task"><span class="check"></span><div>${esc(t.text)}</div></div>`).join('')}
    </div>` : ''}
    <div class="gf-tip">💜 每天≤3件、任务具体可执行、每件都写清「为什么」。自由日当天不安排任务，可以补进度或休息。</div>`,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="goal:reselect">调整分配</button>
      <button class="btn-primary" data-action="goal:confirm">确认，开始执行</button>
    </div>`
  ));
}

/* 目标详情：三阶段 + 进度 + 今日/明日预览 */
function openGoalDetail(id) {
  const store = Store.load();
  const g = store.goals.find(x => x.id === id);
  if (!g) return;
  const done = g.tasks.filter(t => t.done).length;
  const total = g.tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const leftDays = Math.ceil((new Date(g.deadline + 'T00:00:00') - new Date()) / 864e5);

  /* 三阶段概览 */
  let phasesHtml = '';
  if (g.phases && g.phases.length) {
    phasesHtml = g.phases.map((p, pi) => {
      const all = g.tasks.filter(t => (t.phase === undefined ? pi === 0 : t.phase === pi));
      const pd = all.filter(t => t.done).length;
      const donePct = all.length ? Math.round(pd / all.length * 100) : 0;
      const st = donePct >= 100 ? '✅ 已完成' : (pd > 0 ? '🔄 进行中' : '⏳ 未开始');
      return `
        <div class="phase-card sm">
          <div class="phase-head">
            <span class="phase-name">${esc(p.name)}</span>
            <span class="phase-dur">${p.duration || ''}</span>
            <span class="phase-st">${st}</span>
          </div>
          <div class="phase-milestone">🏁 ${esc(p.milestone || '')}</div>
          <div class="phase-progress"><div class="bar" style="width:${donePct}%"></div></div>
        </div>`;
    }).join('');
  }

  /* 今日 / 明日预览（基于 startDate） */
  let todayHtml = '';
  if (g.startDate) {
    const diff = Math.round((new Date(Store.todayStr() + 'T00:00:00') - new Date(g.startDate + 'T00:00:00')) / 864e5) + 1;
    const todayDay = diff;
    const freeDays = g.freeDays || [];
    if (todayDay >= 1 && todayDay <= g.cycleDays) {
      if (freeDays.includes(todayDay)) {
        todayHtml = `<div class="decomp-today"><div class="dt-title">Day ${todayDay} · 自由日</div><div class="gf-tip">今天没有安排，可以补进度或者休息。</div></div>`;
      } else {
        const todayTasks = g.tasks.filter(t => t.day === todayDay);
        if (todayTasks.length) {
          todayHtml = `<div class="decomp-today"><div class="dt-title">Day ${todayDay} · 今日任务</div>
            ${todayTasks.map(t => `
              <div class="decomp-task" data-action="goal:task" data-tid="${t.id}">
                <span class="check" style="${t.done ? 'background:var(--leaf,#7FB97A);border-color:var(--leaf,#7FB97A);color:#fff' : ''}">${t.done ? '🌱' : ''}</span>
                <div style="flex:1">${esc(t.text)} <span class="d-why">为什么：${esc(t.why || '')}</span></div>
              </div>`).join('')}</div>`;
        }
      }
      const nextDay = todayDay + 1;
      if (!freeDays.includes(nextDay) && nextDay <= g.cycleDays) {
        const nextTasks = g.tasks.filter(t => t.day === nextDay);
        if (nextTasks.length) {
          todayHtml += `<div class="decomp-next"><div class="dt-title dim">Day ${nextDay} · 明日预览</div>
            ${nextTasks.map(t => `<div class="decomp-task"><span class="check"></span><div>${esc(t.text)}</div></div>`).join('')}</div>`;
        }
      }
    }
  }

  const groups = {};
  g.tasks.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  const body = `
    <div class="goal-progress" style="margin:14px 0 4px"><div class="bar" style="width:${pct}%"></div></div>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:14px">${pct}% · 剩余${Math.max(0, leftDays)}天 · ${done}/${total} 件完成</div>
    ${phasesHtml}
    ${todayHtml}
    <div class="date-group-label" style="margin-top:6px">全部任务</div>
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
      <span class="txt" data-action="ocr:edit" data-idx="${i}" title="点击编辑">${ocrWordsHtml(l)}</span>
      <button class="edit-btn" data-action="ocr:copy" data-idx="${i}" title="复制">📋</button>
    </div>`).join('');

  openModal(modalShell(
    '识别结果',
    '拍照识别的原始文字，未做修正、联想或分类。带浅灰下划线的词置信度偏低，点击任意文字即可修改。',
    lines,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="ocr:copy-all">复制全部</button>
      <button class="btn-ghost" data-action="ocr:discard">取消</button>
      <button class="btn-primary" data-action="ocr:backlog">加入待办</button>
    </div>`
  ));
}

/* 逐词渲染：置信度 < 80% 的词加浅灰下划线；用户已编辑过的行按纯文本显示 */
function ocrWordsHtml(l) {
  if (l.edited || !Array.isArray(l.words) || !l.words.length) return esc(l.text);
  return l.words.map(w => w.c < 80
    ? `<span class="low-conf" title="识别置信度 ${w.c}%，请检查">${esc(w.t)}</span>`
    : esc(w.t)).join('');
}

function startOcrEdit(idx) {
  const l = App.ocrDraft && App.ocrDraft.lines[idx];
  if (!l) return;
  const txtEl = $(`.ocr-line[data-idx="${idx}"] .txt`);
  if (!txtEl) return;
  const inp = el(`<input class="ocr-input" value="${esc(l.text)}" autofocus>`);
  txtEl.replaceWith(inp);
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
  const commit = () => {
    const val = inp.value.trim();
    if (val) { l.text = val; l.edited = true; } // 只保留用户自己的修改，绝不补全/修正
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
    if (e.key !== 'Enter' || !e.target) return;
    if (e.target.id === 'inbox-input') {
      const v = e.target.value.trim();
      if (v) { inboxAdd(v); e.target.value = ''; }
    } else if (e.target.id === 'home-inbox-input') {
      const v = e.target.value.trim();
      if (v) { inboxAdd(v); e.target.value = ''; }
    }
  });
  // 灵感箱：输入时实时给 AI 推荐标签（用户未手动选时）
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'inbox-input') {
      const v = e.target.value.trim();
      const next = v ? AI.autoTag(v) : { tag: '' };
      if (App.inboxTag) return; // 手动选了就别覆盖
      if (App.inboxTagRec !== next.tag) {
        App.inboxTagRec = next.tag;
        // 仅刷新灵感箱卡片区域，避免整页重绘打断输入
        const card = document.querySelector('.inbox-card');
        if (card) {
          const store = Store.load();
          const inboxHtml = store.inbox.length ? '' : '<div class="inbox-empty">想法存下后会自动收进下面的待办 ✨</div>';
          // 复用 renderBacklog 局部：用 innerHTML 替换 tag-row 与 tip
          const sel = App.inboxTag || App.inboxTagRec || '';
          const tagChips = Object.keys(AI.TAGS).map(k => {
            const t = AI.TAGS[k];
            const on = sel === k;
            const isRec = App.inboxTagRec === k && !App.inboxTag;
            return `<button class="tag-chip ${k}${on ? ' on' : ''}${isRec ? ' rec' : ''}" data-action="inbox:tag" data-tag="${k}"><span class="dot"></span>${t.name}${isRec ? '<span class="rec-badge">AI推荐</span>' : ''}</button>`;
          }).join('');
          const tip = card.querySelector('.tag-select-tip');
          const row = card.querySelector('.tag-row');
          if (tip) tip.textContent = `存入时选择分类（${sel ? '已选：' + (AI.TAGS[sel] ? AI.TAGS[sel].name : '') : '留空则由 AI 稍后推荐'}）`;
          if (row) row.innerHTML = tagChips;
        }
      }
    }
    if (e.target && e.target.id === 'week-focus-input') {
      saveWeekFocus(e.target.dataset.week);
    }
    if (e.target && e.target.id === 'week-summary-input') {
      saveWeekSummary(e.target.dataset.week);
    }
    if (e.target && e.target.id === 'month-summary-input') {
      saveMonthNote(e.target.dataset.month);
    }
    if (e.target && e.target.id === 'today-summary-input') {
      saveTodaySummary(e.target.dataset.date);
    }
  });

  // 时间线拖拽：任务卡片/待办池 → 日期安排 / 重点区设重点
  document.addEventListener('dragstart', e => {
    const li = e.target.closest('.task');
    if (li && li.dataset.action === 'task:detail' && !li.classList.contains('done')) {
      _dragId = li.dataset.id;
      li.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      return;
    }
    // 时间轴任务卡片：可拖到日期或重点区
    const tl = e.target.closest('.tl-task');
    if (tl && !tl.classList.contains('done')) {
      _dragTlId = tl.dataset.id;
      _dragTlDate = tl.dataset.date || '';
      _dragTlFrom = 'day';
      tl.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tl.dataset.id); }
      return;
    }
    // 待办池任务拖到周视图的日期卡片或月视图的日期格 / 重点区
    const pool = e.target.closest('.pool-item');
    if (pool) {
      _dragPoolId = pool.dataset.id;
      _dragPoolFrom = pool.dataset.from;
      pool.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', pool.dataset.id); }
      return;
    }
    // 今天视图：收集箱任务 / 分类任务（可拖到日期/标签/重点/收集箱）
    const box = e.target.closest('.box-item');
    if (box) {
      _dragBoxId = box.dataset.id;
      _dragBoxFrom = box.dataset.from;
      box.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', box.dataset.id); }
      return;
    }
    const cat = e.target.closest('.cat-item');
    if (cat && !cat.classList.contains('done')) {
      _dragBoxId = cat.dataset.id;
      _dragBoxFrom = cat.dataset.from;
      _dragBoxDate = cat.dataset.date || '';
      _dragBoxTag = cat.dataset.tag || '';
      cat.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cat.dataset.id); }
    }
  });
  document.addEventListener('dragover', e => {
    const li = e.target.closest('.task');
    if (li && _dragId && li.dataset.id !== _dragId) { e.preventDefault(); return; }
    const dt = e.target.closest('.day-col') || e.target.closest('.month-cell') || e.target.closest('.mini-cell');
    if (dt && (_dragPoolId || _dragTlId || _dragBoxId) && dt.dataset.date) {
      e.preventDefault();
      dt.classList.add('drop-hot');
    }
    const dz = e.target.closest('.hl-dropzone');
    if (dz && (_dragPoolId || _dragTlId || _dragBoxId)) {
      e.preventDefault();
      dz.classList.add('drop-hot');
    }
    const ch = e.target.closest('.cat-head');
    if (ch && _dragBoxId && (_dragBoxTag !== ch.dataset.tag)) {
      e.preventDefault();
      ch.classList.add('drop-hot');
    }
    const bx = e.target.closest('.box-dropzone');
    if (bx && _dragBoxId) {
      e.preventDefault();
      bx.classList.add('drop-hot');
    }
  });
  document.addEventListener('drop', e => {
    const li = e.target.closest('.task');
    if (li && _dragId && li.dataset.id !== _dragId) {
      e.preventDefault();
      moveTask(_dragId, li.dataset.id);
      _dragId = null;
      render();
      return;
    }
    // 重点区：设为今日/本周/本月重点
    const dz = e.target.closest('.hl-dropzone');
    if (dz && (_dragPoolId || _dragTlId || _dragBoxId)) {
      e.preventDefault();
      const id = _dragTlId || _dragPoolId || _dragBoxId;
      const from = _dragTlId ? _dragTlFrom : (_dragPoolId ? _dragPoolFrom : _dragBoxFrom);
      const date = _dragTlId ? _dragTlDate : '';
      const obj = pickTaskObject(id, from, date);
      dz.classList.remove('drop-hot');
      if (dz.dataset.action === 'today:highlight') addDayHighlight(dz.dataset.date, obj);
      else if (dz.dataset.action === 'week:highlight') addWeekHighlight(dz.dataset.week, obj);
      else if (dz.dataset.action === 'month:highlight') {
        addMonthHighlight(dz.dataset.month, obj);
        aiToast('month_highlight_set', { task: obj ? obj.text : '' });
      }
      _dragPoolId = null; _dragPoolFrom = ''; _dragTlId = null; _dragTlDate = ''; _dragTlFrom = '';
      _dragBoxId = null; _dragBoxFrom = ''; _dragBoxDate = ''; _dragBoxTag = '';
      return;
    }
    // 换标签（分类区拖到另一个标签头）
    const ch = e.target.closest('.cat-head');
    if (ch && _dragBoxId) {
      e.preventDefault();
      ch.classList.remove('drop-hot');
      const newTag = ch.dataset.tag;
      setTaskTag(_dragBoxId, _dragBoxFrom, _dragBoxDate, newTag);
      toast(`已归入${AI.TAGS[newTag] ? AI.TAGS[newTag].name : '未分类'}`);
      _dragBoxId = null; _dragBoxFrom = ''; _dragBoxDate = ''; _dragBoxTag = '';
      return;
    }
    // 移回收集箱（取消分类/安排）
    const bx = e.target.closest('.box-dropzone');
    if (bx && _dragBoxId) {
      e.preventDefault();
      bx.classList.remove('drop-hot');
      moveToInbox(_dragBoxId, _dragBoxFrom, _dragBoxDate);
      toast('已移至收集箱');
      _dragBoxId = null; _dragBoxFrom = ''; _dragBoxDate = ''; _dragBoxTag = '';
      return;
    }
    // 日期安排
    const target = e.target.closest('.day-col') || e.target.closest('.month-cell') || e.target.closest('.mini-cell');
    if (target && (_dragPoolId || _dragTlId || _dragBoxId) && target.dataset.date) {
      e.preventDefault();
      const date = target.dataset.date;
      const id = _dragTlId || _dragPoolId || _dragBoxId;
      const from = _dragTlId ? _dragTlFrom : (_dragPoolId ? _dragPoolFrom : _dragBoxFrom);
      const isBox = !!_dragBoxId;
      document.querySelectorAll('.day-col.drop-hot, .month-cell.drop-hot, .mini-cell.drop-hot').forEach(c => c.classList.remove('drop-hot'));
      const c = AI.dragConflict(date, 1);
      if (c && c.level === 'block') { toast('这天已经排满了，换一天吧。', { ai: true }); _dragPoolId = null; _dragPoolFrom = ''; _dragTlId = null; _dragTlDate = ''; _dragTlFrom = ''; _dragBoxId = null; _dragBoxFrom = ''; _dragBoxDate = ''; _dragBoxTag = ''; return; }
      App.timelineSelectedDate = date;
      App.todayViewDate = date;
      if (isBox && from === 'inbox') {
        // 灵感箱项直接安排到该日：转为正式任务
        const store = Store.load();
        const inboxItem = (store.inbox || []).find(x => x.id === id);
        if (inboxItem) {
          store.inbox = (store.inbox || []).filter(x => x.id !== id);
          store.dayTasks = store.dayTasks || {};
          store.dayTasks[date] = store.dayTasks[date] || [];
          store.dayTasks[date].push({ id: inboxItem.id, text: inboxItem.text, estMin: 15, tag: '', done: false, why: '' });
          Store.save();
        }
      } else {
        moveTaskToDate(id, date, from);
      }
      if (c && c.level === 'warn') toast('这天任务有点多，记得留点空隙。', { ai: true });
      else aiToast('task_moved_to_date', { task: '', date: Store.fmtMD(date) });
      _dragPoolId = null; _dragPoolFrom = ''; _dragTlId = null; _dragTlDate = ''; _dragTlFrom = '';
      _dragBoxId = null; _dragBoxFrom = ''; _dragBoxDate = ''; _dragBoxTag = '';
      return;
    }
  });
  document.addEventListener('dragend', e => {
    const li = e.target.closest('.task');
    if (li) li.classList.remove('dragging');
    const pool = e.target.closest('.pool-item');
    if (pool) pool.classList.remove('dragging');
    const tl = e.target.closest('.tl-task');
    if (tl) tl.classList.remove('dragging');
    const box = e.target.closest('.box-item');
    if (box) box.classList.remove('dragging');
    const cat = e.target.closest('.cat-item');
    if (cat) cat.classList.remove('dragging');
    document.querySelectorAll('.day-col.drop-hot, .month-cell.drop-hot, .mini-cell.drop-hot, .hl-dropzone.drop-hot, .cat-head.drop-hot, .box-dropzone.drop-hot').forEach(c => c.classList.remove('drop-hot'));
    _dragId = null; _dragPoolId = null; _dragPoolFrom = ''; _dragTlId = null; _dragTlDate = ''; _dragTlFrom = '';
    _dragBoxId = null; _dragBoxFrom = ''; _dragBoxDate = ''; _dragBoxTag = '';
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

const SWIPE_W = 180; // 左滑露出 3 个按钮的总宽度（60×3）
let touchTarget = null;
let touchStartX = 0;
let touchStartY = 0;
let swipeMoved = false;
let timelineSwipeStart = false;
function onTouchStart(e) {
  const el = e.target.closest('.task');
  touchStartX = e.touches ? e.touches[0].clientX : 0;
  touchStartY = e.touches ? e.touches[0].clientY : 0;
  swipeMoved = false;
  timelineSwipeStart = !el && !!e.target.closest('.timeline-page');
  // 点击已滑开卡片的非按钮区域：先收回，不触发详情
  if (el && el.classList.contains('swiped')) {
    if (e.target.closest('.swipe-acts')) { touchTarget = el; return; }
    el.classList.remove('swiped');
    touchTarget = null;
    return;
  }
  touchTarget = el;
  if (!el) return;
  const act = el.dataset.action;
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
  if (!touchTarget) return;
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  // 纵向位移占主导时交给页面滚动
  if (!swipeMoved && Math.abs(dy) > Math.abs(dx)) return;
  if (Math.abs(dx) < 8) return;
  swipeMoved = true;
  const el = touchTarget;
  const open = el.classList.contains('swiped');
  const x = open ? Math.max(-SWIPE_W, Math.min(0, -SWIPE_W + dx)) : Math.max(-SWIPE_W, Math.min(0, dx));
  el.style.transform = `translateX(${x}px)`;
  el.style.transition = 'none';
}
function onTouchEnd(e) {
  clearTimeout(App.longPressTimer);
  if (touchTarget) {
    const el = touchTarget;
    const m = el.style.transform.match(/-?\d+(\.\d+)?/);
    const x = m ? parseFloat(m[0]) : 0;
    el.style.transform = '';
    el.style.transition = '';
    if (x < -SWIPE_W / 2) el.classList.add('swiped');
    else el.classList.remove('swiped');
  }
  touchTarget = null;
  swipeMoved = false;

  // 时间轴页面左右滑动翻页
  if (timelineSwipeStart && e.changedTouches && e.changedTouches[0]) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const dir = dx < 0 ? 1 : -1;
      if (App.timelineView === 'today') {
        const base = App.todayViewDate || Store.todayStr();
        if (App.todayCalOpen) {
          const d = new Date(base + 'T00:00:00');
          d.setMonth(d.getMonth() + dir);
          App.todayViewDate = Store.toYMD(d);
        } else {
          App.todayViewDate = Store.shiftDate(Store.startOfWeek(base), dir * 7);
        }
      } else {
        const base = App.timelineDate || Store.todayStr();
        if (App.timelineView === 'month') {
          const d = new Date(base + 'T00:00:00');
          d.setMonth(d.getMonth() + dir);
          App.timelineDate = Store.toYMD(d);
        } else {
          App.timelineDate = Store.shiftDate(Store.startOfWeek(base), dir * 7);
        }
      }
      render();
    }
  }
  timelineSwipeStart = false;
}

function onClick(e) {
  // 点击任务外区域 → 收起所有左滑按钮
  if (!e.target.closest('.task')) {
    const sw = $('.task.swiped');
    if (sw) sw.classList.remove('swiped');
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
    case 'tab:switch':
      // 进入待办页后清除「新想法」小点
      if (btn.dataset.tab === 'backlog') {
        const st = Store.load();
        if (st.flags.tabDots && st.flags.tabDots.backlog) { st.flags.tabDots.backlog = false; Store.save(); }
      }
      App.tab = btn.dataset.tab; render(); break;
    case 'settings:open': openSettings(); break;
    case 'modal:close': closeModal(); break;
    case 'mood:open': openMoodPicker(); break;
    case 'mood:set': setMood(btn.dataset.val); break;
    case 'task:check': toggleTask(id); break;
    case 'task:detail': openTaskDetail(id, 'today'); break;
    case 'task:edit': openTaskEdit(id, 'today'); break;
    case 'task:del': taskDelToday(id); break;
    case 'task:to-backlog': taskToBacklog(id); break;
    case 'task:instant': openInstantReview(id); break;
    case 'camera:open': openCamera(); break;
    case 'backlog:detail': openTaskDetail(id, 'backlog'); break;
    case 'backlog:edit': openTaskEdit(id, 'backlog'); break;
    case 'backlog:del': doBacklogDelete(id); break;
    case 'backlog:to-today': restoreToToday(id); break;
    case 'backlog:restore': restoreToToday(id); break;
    case 'backlog:delete': doBacklogDelete(id); break;
    case 'backlog:discard': doBacklogDiscard(id); break;
    case 'goal:new': openNewGoal(); break;
    case 'goal:reselect': closeModal(); openNewGoal(Store.load().flags.goalInputLast || ''); break;
    case 'goal:decompose': doDecompose($('#goal-input').value); break;
    case 'goal:confirm': confirmGoal(); break;
    case 'goal:detail': openGoalDetail(id); break;
    case 'goal:task': toggleGoalTask(btn.dataset.tid); break;
    case 'goal:archive': archiveGoal(id); break;
    case 'goal:keep': keepGoal(id); break;
    case 'review:tab': App.reviewTab = btn.dataset.val; render(); break;
    case 'review:save': saveReview(); break;
    case 'ocr:edit': startOcrEdit(Number(btn.dataset.idx)); break;
    case 'ocr:copy': ocrCopy(Number(btn.dataset.idx)); break;
    case 'ocr:copy-all': ocrCopyAll(); break;
    case 'ocr:backlog': commitOcr(); break;
    case 'ocr:discard': closeModal(); App.ocrDraft = null; break;
    case 'history:open': openHistory(); break;
    case 'settings:palette': setPalette(btn.dataset.val); break;
    case 'settings:theme': setTheme(btn.dataset.val); break;
    case 'settings:clear-demo': confirmClearDemo(); break;
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
    case 'inbox:focus': focusInbox(); break;
    case 'inbox:tag': {
      const t = btn.dataset.tag;
      if (App.inboxTag === t) { App.inboxTag = ''; App.inboxTagRec = ''; }
      else { App.inboxTag = t; }
      render();
      break;
    }
    case 'backlog:filter': {
      const t = btn.dataset.tag || '';
      App.backlogFilter = (App.backlogFilter === t) ? '' : t;
      render();
      break;
    }
    case 'day:end': endToday(); break;
    case 'today:date': App.todayViewDate = btn.dataset.date || Store.todayStr(); App.tab = 'today'; render(); break;
    case 'today:week': {
      const dir = Number(btn.dataset.dir) || 0;
      const base = App.todayViewDate || Store.todayStr();
      App.todayViewDate = Store.shiftDate(Store.startOfWeek(base), dir * 7);
      render();
      break;
    }
    case 'timeline:view': App.timelineView = btn.dataset.view || 'week'; render(); break;
    case 'cal:toggle': App.todayCalOpen = !App.todayCalOpen; render(); break;
    case 'cal:date': {
      App.todayViewDate = btn.dataset.date || Store.todayStr();
      App.todayCalOpen = false;
      render();
      break;
    }
    case 'cal:week': App.timelineWeekSelect = !App.timelineWeekSelect; render(); break;
    case 'week:select': {
      const wk = btn.dataset.week, base = btn.dataset.base;
      App.timelineDate = base || Store.todayStr();
      App.timelineWeekSelect = false;
      App.timelineWeekSelectedDate = '';
      render();
      break;
    }
    case 'week:day': {
      const d = btn.dataset.date;
      App.timelineWeekSelectedDate = (App.timelineWeekSelectedDate === d) ? '' : d;
      render();
      break;
    }
    case 'cal:month': App.timelineMonthSelect = !App.timelineMonthSelect; render(); break;
    case 'month:year': {
      const y = Number(btn.dataset.year);
      const base = App.timelineDate || Store.todayStr();
      const d0 = new Date(base + 'T00:00:00');
      App.timelineDate = Store.toYMD(new Date(y, d0.getMonth(), 1));
      App.timelineMonthSelect = true;
      render();
      break;
    }
    case 'month:month': {
      const m = Number(btn.dataset.month);
      const base = App.timelineDate || Store.todayStr();
      const d0 = new Date(base + 'T00:00:00');
      App.timelineDate = Store.toYMD(new Date(d0.getFullYear(), m, 1));
      App.timelineMonthSelect = false;
      render();
      break;
    }
    case 'cat:task': {
      const id = btn.dataset.id, from = btn.dataset.from, date = btn.dataset.date || '';
      openTaskDetail(id, from === 'today' ? 'today' : (from === 'day' ? 'day:' + date : 'backlog'));
      break;
    }
    case 'box:task': {
      const id = btn.dataset.id, from = btn.dataset.from;
      if (from === 'inbox') {
        const store = Store.load();
        const it = (store.inbox || []).find(x => x.id === id);
        if (it) toast('灵感箱里的想法：' + it.text + '（拖到标签或日期即可安放）');
      } else {
        openTaskDetail(id, 'backlog');
      }
      break;
    }
    case 'cat:toggle': {
      const k = btn.dataset.tag;
      App.catCollapsed = App.catCollapsed || {};
      App.catCollapsed[k] = !App.catCollapsed[k];
      render();
      break;
    }
    case 'cat:tag': {
      // 移动端无拖拽时的备选：点击标签头提示可拖拽
      toast('长按任务拖到这里即可归入「' + (AI.TAGS[btn.dataset.tag] || {}).name + '」');
      break;
    }
    case 'timeline:menu': aiToast('hello'); break;
    case 'timeline:gift': toast('礼物中心筹备中 🎁', { ai: true }); break;
    case 'timeline:search': toast('全局搜索即将上线 🔍', { ai: true }); break;
    case 'timeline:more': toast('更多设置敬请期待 ✨', { ai: true }); break;
    case 'timeline:page': {
      const dir = Number(btn.dataset.dir) || 0;
      const base = App.timelineDate || Store.todayStr();
      if (App.timelineView === 'month') {
        const d = new Date(base + 'T00:00:00');
        d.setMonth(d.getMonth() + dir);
        App.timelineDate = Store.toYMD(d);
      } else {
        App.timelineDate = Store.shiftDate(Store.startOfWeek(base), dir * 7);
      }
      render();
      break;
    }
    case 'timeline:day': {
      const d = btn.dataset.date;
      App.todayViewDate = d;
      App.tab = 'today';
      render();
      break;
    }
    case 'focus:tab': {
      App.timelineFocusTab = btn.dataset.tab || 'focus';
      render();
      break;
    }
    case 'today:summary': saveTodaySummary(btn.dataset.date); break;
    case 'today:unhighlight': removeDayHighlight(btn.dataset.date, btn.dataset.hid); break;
    case 'week:focus': saveWeekFocus(btn.dataset.week); break;
    case 'week:summary': saveWeekSummary(btn.dataset.week); break;
    case 'week:unhighlight': removeWeekHighlight(btn.dataset.week, btn.dataset.hid); break;
    case 'month:summary': saveMonthNote(btn.dataset.month); break;
    case 'month:unhighlight': removeMonthHighlight(btn.dataset.month, btn.dataset.hid); break;
    case 'month:auto': doMonthAutoDecompose(btn.dataset.month); break;
    case 'timeline:task': {
      const d = btn.dataset.date, id = btn.dataset.id;
      openTaskDetail(id, d === Store.todayStr() ? 'today' : 'day:' + d);
      break;
    }
    case 'day:check': {
      const d = btn.dataset.date, id = btn.dataset.id;
      dayCheck(d, id);
      break;
    }
    case 'day:more': {
      const d = btn.dataset.date, id = btn.dataset.id;
      openDayTaskMenu(d, id);
      break;
    }
    case 'day:add': {
      const d = btn.dataset.date;
      dayAdd(d);
      break;
    }
    case 'day:enter-today': {
      closeModal();
      App.todayViewDate = Store.todayStr();
      App.tab = 'today';
      render();
      break;
    }
    case 'day:delete': {
      const d = btn.dataset.date, id = btn.dataset.id;
      dayDelete(d, id);
      break;
    }
    case 'day:to-backlog': {
      const d = btn.dataset.date, id = btn.dataset.id;
      dayToBacklog(d, id);
      break;
    }
    case 'pool:pick': {
      const id = btn.dataset.id, from = btn.dataset.from;
      App._dragPoolFrom = from;
      break;
    }
    case 'pool:assign': {
      const id = btn.dataset.id, from = btn.dataset.from;
      openAssignSheet(id, from);
      break;
    }
    case 'assign:pick': {
      const id = btn.dataset.id, from = btn.dataset.from, d = btn.dataset.date;
      const c = AI.dragConflict(d, 1);
      if (c && c.level === 'block') { toast('这天已经排满了，换一天吧。', { ai: true }); return; }
      moveTaskToDate(id, d, from);
      if (c && c.level === 'warn') toast('这天任务有点多，记得留点空隙。', { ai: true });
      else aiToast('task_moved_to_date', { task: '', date: Store.fmtMD(d) });
      break;
    }
    case 'modal:close': closeModal(); break;
    case 'home-inbox:add': {
      const hinp = $('#home-inbox-input');
      if (hinp && hinp.value.trim()) { inboxAdd(hinp.value); hinp.value = ''; }
      break;
    }
    case 'inbox:add': {
      const inp = $('#inbox-input');
      if (inp && inp.value.trim()) { inboxAdd(inp.value); inp.value = ''; }
      break;
    }
    case 'done:toggle': App.doneExpanded = !App.doneExpanded; render(); break;
    case 'goals-done:toggle': App.doneGoalsExpanded = !App.doneGoalsExpanded; render(); break;
    case 'review-done:toggle': App.reviewDoneExpanded = !App.reviewDoneExpanded; render(); break;
    case 'edit:save': saveTaskEdit(id, btn.dataset.src); break;
    case 'frag:start': fragStart(id, btn.dataset.from); break;
    case 'frag:ignore': fragIgnore(id); break;
  }
}

/* ================= 动作实现 ================= */

/* 状态签到：单个表情按钮点击后弹出三个选项供选择 */
function openMoodPicker() {
  const store = Store.load();
  const cur = store.today.status || '😊';
  const items = Object.entries(App.moodLabels).map(([m, label]) => `
    <button class="mood-opt ${cur === m ? 'on' : ''}" data-action="mood:set" data-val="${m}">
      <span class="mo-emoji">${m}</span>
      <span class="mo-label">${label}</span>
      <span class="mo-check">${cur === m ? '✓' : ''}</span>
    </button>`).join('');
  openSheet(`
    <div class="sheet mood-sheet">
      <div class="sheet-title">今天状态怎么样？</div>
      <div class="sheet-sub">如实记录，墨会据此调整节奏</div>
      <div class="mood-opts">${items}</div>
    </div>`);
}

function setMood(m) {
  const store = Store.load();
  const prev = store.today.status;
  store.today.status = m;
  Store.save();
  const ov = $('.sheet-overlay');
  if (ov) ov.remove();
  /* 状态签到 → 任务量联动：😊 明日任务量 +1 件 */
  if (m === '😊') {
    store.flags.tomorrowBoost = Store.shiftDate(Store.todayStr(), 1);
    Store.save();
    aiToast('mood_happy');
  }
  if (m === '😐') {
    aiToast('mood_neutral');
  }
  if (m === '😔' && prev !== '😔') {
    // 只留 1 件最重要、其余顺延到待办
    const undone = store.today.tasks.filter(t => !t.done);
    if (undone.length > 1) {
      const kept = undone.find(t => t.priority) || undone[0];
      undone.filter(t => t.id !== kept.id).forEach(t => {
        store.backlog.unshift({ id: Store.uid(), text: t.text, estMin: t.estMin, priority: t.priority, originalDate: Store.todayStr(), why: t.why || '' });
        store.today.tasks = store.today.tasks.filter(x => x.id !== t.id);
      });
      Store.save();
    }
    aiToast('mood_low');
  }
  render();
}

function endToday() {
  const store = Store.load();
  const doneCount = store.today.tasks.filter(t => t.done).length;
  const planned = store.today.tasks.length;
  const prevDate = store.todayDate;
  store.dayLog[prevDate] = { done: doneCount, planned, mood: store.today.status || '😐' };
  store.today.tasks.filter(t => !t.done).forEach(t => {
    store.backlog.unshift({ id: Store.uid(), text: t.text, estMin: t.estMin, priority: t.priority, originalDate: prevDate, why: t.why || '' });
  });
  const next = Store.shiftDate(prevDate, 1);
  store.today = { status: null, tasks: assembleDay(next) };
  store.todayDate = next;
  Store.save();
  render();
  aiToast('day_end', { D: doneCount, T: planned });
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
    /* 目标 100% → 自动弹出归档确认 */
    if (t.goalId) {
      const g = store.goals.find(x => x.id === t.goalId);
      if (g && g.tasks.length && g.tasks.every(x => x.done) && !(store.flags.archivedIds || []).includes(g.id)) {
        setTimeout(() => openAchieveConfirm(g), 700);
      }
    }
    if (!opts.silent) {
      actionToast('✨已完成，真棒。', () => toggleTask(id, { silent: true }));
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

/* 把某天（dayTasks）的任务排进今日 */
function dayToToday(id, date) {
  const store = Store.load();
  const list = (store.dayTasks && store.dayTasks[date]) || [];
  const t = list.find(x => x.id === id);
  if (!t) return;
  const nt = { id: Store.uid(), text: t.text, estMin: t.estMin, priority: t.priority, done: false, goalId: null, why: t.why || '', slot: t.slot || 'night', matched: true, routeNote: t.routeNote || '' };
  store.today.tasks.push(nt);
  store.dayTasks[date] = list.filter(x => x.id !== id);
  if (!store.dayTasks[date].length) delete store.dayTasks[date];
  Store.save();
  render();
  actionToast(`已把"${t.text}"排进今日`, () => {
    const st = Store.load();
    st.today.tasks = st.today.tasks.filter(x => x.id !== nt.id);
    st.dayTasks = st.dayTasks || {};
    st.dayTasks[date] = st.dayTasks[date] || [];
    st.dayTasks[date].unshift(t);
    Store.save(); render();
  });
}

/* 删除某天的任务 */
function dayDelete(id, date) {
  const store = Store.load();
  const list = (store.dayTasks && store.dayTasks[date]) || [];
  const t = list.find(x => x.id === id);
  if (!t) return;
  confirmDelete(t.text, () => {
    const st = Store.load();
    const arr = (st.dayTasks && st.dayTasks[date]) || [];
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [removed] = arr.splice(idx, 1);
    if (!arr.length && st.dayTasks) delete st.dayTasks[date];
    Store.save();
    render();
    actionToast(`已删除"${removed.text}"`, () => {
      const st2 = Store.load();
      st2.dayTasks = st2.dayTasks || {};
      st2.dayTasks[date] = st2.dayTasks[date] || [];
      st2.dayTasks[date].splice(Math.min(idx, st2.dayTasks[date].length), 0, removed);
      Store.save(); render();
    });
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

/* 确认创建目标：展开每日任务，Day 1 自动进入今日 */
function confirmGoal() {
  const plan = App.pendingPlan;
  App.pendingPlan = null;
  if (!plan) return;
  const store = Store.load();
  const startDate = Store.todayStr();
  const deadline = Store.shiftDate(startDate, plan.cycleDays - 1);
  const tasks = [];
  plan.daily.forEach(d => {
    d.tasks.forEach(t => {
      tasks.push({
        id: Store.uid(), text: t.text, why: t.why, estMin: t.estMin,
        day: d.day, date: Store.shiftDate(startDate, d.day - 1), done: false
      });
    });
  });
  const g = {
    id: Store.uid(), title: plan.title, createdAt: Store.todayStr(),
    startDate, deadline, archived: false,
    templateId: plan.template ? plan.template.id : null,
    templateName: plan.template ? plan.template.name : null,
    lifeStage: plan.lifeStage, cycleDays: plan.cycleDays, difficulty: plan.difficulty,
    totalTasks: plan.totalTasks, finishDay: plan.finishDay, freeDays: plan.freeDays,
    phases: plan.phases.map(p => ({ name: p.name, duration: p.duration, milestone: p.milestone })),
    milestones: plan.phases.map(p => p.milestone),
    tasks
  };
  store.goals.push(g);
  /* 数据联动：Day 1（今日）任务立即进入今日列表 */
  const today = Store.todayStr();
  tasks.filter(t => t.date === today && !t.done).forEach(t => {
    if (!store.today.tasks.some(x => x.goalId === g.id && x.text === t.text)) {
      store.today.tasks.push({ id: Store.uid(), text: t.text, estMin: t.estMin, priority: false, done: false, goalId: g.id, why: t.why || '' });
    }
  });
  store.flags.goalJustDecomposed = plan.title;
  Store.save();
  closeModal();
  render();
  aiToast('goal_created', {}, { fallback: '已创建目标，Day 1 的任务已放进「今日」。' });
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

/* OCR 提交：原文进入待办列表，不做任何自动分类或标注 */
function commitOcr() {
  const draft = App.ocrDraft;
  App.ocrDraft = null;
  if (!draft) return;
  const store = Store.load();
  const today = Store.todayStr();
  let n = 0;
  draft.lines.forEach(l => {
    const text = (l.text || '').trim();
    if (!text) return;
    store.backlog.unshift({ id: Store.uid(), text, estMin: null, priority: false, originalDate: today, why: '' });
    n++;
  });
  Store.save();
  closeModal();
  aiToast('ocr_committed', { n }, { fallback: `已把 ${n} 件任务放入待办，未做任何分类或标注。` });
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
      <button class="btn-ghost" data-action="settings:clear-demo">清空演示数据</button>
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

/* 清空所有演示数据：参考成熟软件的「恢复全新状态」——
   示例任务/目标/待办/日志/课表一键清空，只保留用户配置（主题/色盘/AI Key）。
   一层确认框，清完留在设置页不跳转；支持撤销。 */
function confirmClearDemo() {
  const ov = openSheet(`
    <div class="sheet confirm-sheet">
      <div class="sheet-title">确定清空所有演示数据吗？</div>
      <div class="sheet-sub">会把示例任务、目标、待办、课表和日志全部清掉，让「墨」回到全新的空状态，方便你记录自己的真实生活。AI 配置、主题等设置会保留。</div>
      <div class="sheet-acts">
        <button class="btn-ghost sheet-cancel">取消</button>
        <button class="btn-primary sheet-ok">确定</button>
      </div>
    </div>`);
  ov.querySelector('.sheet-cancel').addEventListener('click', () => ov.remove());
  ov.querySelector('.sheet-ok').addEventListener('click', () => { ov.remove(); clearDemoData(); });
}

function clearDemoData() {
  const store = Store.load();
  const today = Store.todayStr();
  const backup = JSON.parse(JSON.stringify(store)); // 完整快照，供撤销恢复
  // 保留 settings（palette/theme/ai 等用户配置），其余演示数据全部清空
  store.today = { status: null, tasks: [] };
  store.todayDate = today;
  store.inbox = [];
  store.goals = [];
  store.archivedGoals = [];
  store.backlog = [];
  store.completedLog = [];
  store.dayLog = {};
  store.aiLog = [];
  store.corrections = {};
  store.stats = {};
  store.flags = {
    goalJustDecomposed: null, streakShownDate: null, adjustedShown: {},
    skeletonShown: false, fragRemind: {}, fragBubbleShownDate: null
  };
  store.settings.skeleton = { enabled: false, week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, overrides: {} };
  Store.save();
  openSettings(); // 留在设置页，刷新为空状态
  actionToast('已清空所有演示数据，现在可以记录自己的真实生活了', () => {
    const s2 = Store.load();
    Object.keys(backup).forEach(k => { s2[k] = backup[k]; });
    Store.save();
    openSettings();
  });
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
