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
  if (App.tab === 'today') { refreshHero(); refreshTomorrowNote(); }
  else if (App.tab === 'review') refreshReviewAI();
}

/* ================= 今日页 ================= */
function renderToday() {
  const store = Store.load();
  const undone = store.today.tasks.filter(t => !t.done);
  const doneTasks = store.today.tasks.filter(t => t.done);
  const totalMin = undone.reduce((s, t) => s + t.estMin, 0);
  const budget = 180;
  const freeMin = Math.max(0, budget - totalMin);
  const prioCount = undone.filter(t => t.priority).length;

  // 长按已完成任务 → 即时复盘
  const taskRow = (t) => {
    const meta = `${t.estMin}分钟${t.priority ? ' · 🔴 优先任务' : ''}`;
    return `
      <li class="task ${t.done ? 'done' : ''}" data-action="${t.done ? 'task:instant' : 'task:toggle'}" data-id="${t.id}">
        <span class="check">${t.done ? '🌱' : ''}</span>
        <div class="task-body">
          <span class="task-text">${esc(t.text)}</span>
          <span class="task-meta">${meta}${t.why ? ` · ${esc(t.why)}` : ''}</span>
        </div>
        <span class="flag">${t.done ? '已完成' : ''}</span>
      </li>`;
  };

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

  return `
    <div class="today-grid">
      <div class="today-stack">
        ${hero}
        <section class="card">
          <div class="card-title">
            <span class="t">任务</span>
            <span class="meta">${undone.length}件 · 预计${totalMin}分钟</span>
          </div>
          ${backlogHint}
          <ul class="task-list">
            ${undone.map(taskRow).join('')}
            ${doneTasks.map(taskRow).join('')}
          </ul>
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
        ${groups[d].map(b => `
          <li class="task" data-action="backlog:restore" data-id="${b.id}" title="点击排进今日">
            <span class="check"></span>
            <div class="task-body">
              <span class="task-text">${esc(b.text)}${b.priority ? ' <span class="prio-tag">优先</span>' : ''}</span>
              <span class="task-meta">${b.estMin}分钟</span>
            </div>
            <span class="flag" data-action="backlog:delete" data-id="${b.id}" title="长按删除">长按删除</span>
          </li>`).join('')}
      </ul>
    </div>`).join('') || '<div class="card" style="text-align:center;color:var(--ink-2)">待办是空的，今天的计划都可以在纸上完成。</div>';

  return `
    <div class="page-stack">
      <div style="font-size:13px;color:var(--ink-2)">共 ${store.backlog.length} 件待办</div>
      ${remind}
      ${groupHtml}
      <div class="hint-line">点击任务 → 标记“今天做” · 长按任务 → 删除</div>
    </div>`;
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
    const dots = [0, 1, 2, 3, 4].map(i => {
      const filled = done / Math.max(total, 1) * 5 >= i + 0.5;
      return `<span class="dot ${filled ? 'on' : ''}"></span>`;
    }).join('');
    const remain = total - done;
    return `
      <article class="goal-card" data-action="goal:detail" data-id="${g.id}">
        <div class="goal-progress"><div class="bar" style="width:${pct}%"></div></div>
        <div class="goal-title">${esc(g.title)}</div>
        <div class="goal-sub">${pct}% · 剩余${Math.max(0, leftDays)}天 · 还有${remain}件任务待完成</div>
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
      return bubble(msg, 'left');
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
      ${align === 'left' ? `<div class="ai-avatar">墨</div>` : ''}
      <div class="ai-bubble" ${id ? `id="${id}"` : ''}>
        ${esc(text)}
        <div class="who"><span class="dot">墨</span>我</div>
      </div>
    </div>`;
}

function toast(text, opts = {}) {
  const root = $('#toast-root');
  const aiId = Store.uid();
  const t = el(`
    <div class="toast ${opts.ai ? 'ai' : ''}" style="pointer-events:auto">
      <div class="ai-bubble" style="max-width:${opts.wide ? '340px' : '280px'};background:${opts.ai ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.7)'};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)">
        ${esc(text)}
        <div class="who"><span class="dot">墨</span>我</div>
      </div>
    </div>`);
  root.appendChild(t);
  t.dataset.aiId = aiId;
  const log = Store.load();
  log.aiLog.push({ id: aiId, t: new Date().toTimeString().slice(0, 5), text });
  Store.save();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, opts.duration ?? 5000);
  return t;
}

/* 个性化话术 toast：先显示规则版兜底，LLM 返回后无缝替换为 AI 生成版 */
async function aiToast(trigger, ctx = {}, opts = {}) {
  const rule = AI.copy(trigger, ctx) || opts.fallback || '…';
  const t = toast(rule, opts);
  const smart = await AI.copySmart(trigger, ctx);
  if (!smart || smart === rule || !t.isConnected) return;
  const b = t.querySelector('.ai-bubble');
  if (b) b.innerHTML = `${esc(smart)}<div class="who"><span class="dot">墨</span>我</div>`;
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
      <span class="tm"><input type="number" min="5" max="240" step="5" value="${l.estMin}" data-idx="${i}" class="t-min">分</span>
      <button class="edit-btn" data-action="ocr:edit" data-idx="${i}">✏️</button>
    </div>`).join('');

  openModal(modalShell(
    '识别结果', '如果识别有误，点击任务文字即可修改。',
    lines,
    `<div class="modal-actions">
      <button class="btn-ghost" data-action="ocr:discard">取消</button>
      <button class="btn-primary" data-action="ocr:today">加入今日</button>
      <button class="btn-primary" style="background:var(--card);border:.5px solid var(--line);color:var(--ink)" data-action="ocr:backlog">加入待办</button>
    </div>`
  ));

  $$('.t-min').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.idx);
      App.ocrDraft.lines[idx].estMin = clamp(Number(inp.value) || 20, 5, 240);
    });
  });
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
    if (val && val !== l.original) {
      Store.load().corrections[l.original] = val;
      Store.save();
      l.text = val;
    } else if (val) l.text = val;
    renderOcrConfirm();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('contextmenu', e => {
    const task = e.target.closest('.task');
    if (task && (task.dataset.action === 'backlog:delete' || task.dataset.action === 'backlog:restore')) {
      e.preventDefault(); doBacklogDelete(task.dataset.id);
    }
  });

  const input = $('#camera-input');
  input.addEventListener('change', () => handlePhoto(input.files[0]));

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
function onTouchStart(e) {
  touchTarget = e.target.closest('.task');
  if (!touchTarget) return;
  const act = touchTarget.dataset.action;
  if (act !== 'task:instant' && act !== 'backlog:restore' && act !== 'backlog:delete') return;
  App.longPressTimer = setTimeout(() => {
    const id = touchTarget.dataset.id;
    if (act === 'task:instant') openInstantReview(id);
    else doBacklogDelete(id);
    navigator.vibrate && navigator.vibrate(15);
  }, 550);
}
function onTouchMove() { clearTimeout(App.longPressTimer); }
function onTouchEnd() { clearTimeout(App.longPressTimer); }

function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  const id = btn.dataset.id;

  switch (act) {
    case 'tab:switch': App.tab = btn.dataset.tab; render(); break;
    case 'settings:open': openSettings(); break;
    case 'modal:close': closeModal(); break;
    case 'mood:set': setMood(btn.dataset.val); break;
    case 'task:toggle': toggleTask(id); break;
    case 'task:instant': openInstantReview(id); break;
    case 'end:day': endDay(); break;
    case 'camera:open': openCamera(); break;
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
    case 'ocr:today': commitOcr('today'); break;
    case 'ocr:backlog': commitOcr('backlog'); break;
    case 'ocr:discard': closeModal(); App.ocrDraft = null; break;
    case 'history:open': openHistory(); break;
    case 'settings:palette': setPalette(btn.dataset.val); break;
    case 'settings:theme': setTheme(btn.dataset.val); break;
    case 'settings:reset': resetAll(); break;
    case 'settings:ai-test': testAi(); break;
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

function toggleTask(id) {
  const store = Store.load();
  const t = store.today.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) {
    store.completedLog.push({ id: Store.uid(), text: t.text, date: Store.todayStr(), doneAt: new Date().toISOString(), estMin: t.estMin, actualMin: t.estMin, mood: '😐', note: '' });
    // 联动目标进度
    if (t.goalId) {
      const g = store.goals.find(x => x.id === t.goalId);
      if (g) { const gt = g.tasks.find(x => x.text === t.text && !x.done); if (gt) gt.done = true; }
    }
    // 时间预估修正
    adjustEstimate(t);
    // 提示
    const doneCount = store.today.tasks.filter(x => x.done).length;
    const total = store.today.tasks.length;
    const remaining = total - doneCount;
    Store.save();
    if (remaining === 0) {
      setTimeout(() => aiToast('all_done'), 400);
      if (total >= 5) setTimeout(() => aiToast('over_done', { total }, { wide: true }), 1800);
    } else if (doneCount === 1 && total >= 4) {
      setTimeout(() => aiToast('only_one', {}, { wide: true }), 800);
    }
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
  store.today.tasks.push({ id: Store.uid(), text: b.text, estMin: b.estMin, priority: b.priority, done: false, goalId: null, why: b.why || '' });
  store.backlog = store.backlog.filter(x => x.id !== id);
  store.flags.staleShown = false;
  Store.save();
  aiToast('backlog_restored', { task: b.text });
  render();
}

function doBacklogDelete(id) {
  const store = Store.load();
  const b = store.backlog.find(x => x.id === id);
  if (!b) return;
  store.backlog = store.backlog.filter(x => x.id !== id);
  Store.save();
  aiToast('backlog_deleted');
  render();
}

function doBacklogDiscard(id) {
  const store = Store.load();
  const b = store.backlog.find(x => x.id === id);
  if (!b) return;
  store.backlog = store.backlog.filter(x => x.id !== id);
  store.flags.staleShown = false;
  Store.save();
  aiToast('backlog_deleted');
  render();
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
  }
  Store.save();
  openGoalDetail(g.id);
  const pct = g.tasks.filter(t => t.done).length / g.tasks.length;
  if (pct === 1) {
    setTimeout(() => aiToast('goal_done', { title: g.title }), 500);
  }
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
      store.today.tasks.push({ id: Store.uid(), text: l.text, estMin: l.estMin, priority: false, done: false, goalId: null, why: '' });
    } else {
      store.backlog.unshift({ id: Store.uid(), text: l.text, estMin: l.estMin, priority: false, originalDate: today, why: '' });
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
