/* ============================================================
   「墨」· 数据层
   localStorage 持久化 · 种子数据 · 日期工具
   ============================================================ */
'use strict';

const Store = (() => {
  const LS_KEY = 'mo_ink_app_v1';

  /* ---------- 工具 ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toYMD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => toYMD(new Date());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const shiftDate = (ymd, days) => {
    const d = new Date(ymd + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toYMD(d);
  };
  const fmtMD = ymd => { const [, m, dd] = ymd.split('-').map(Number); return `${m}月${dd}日`; };
  const fmtDOW = ymd => { const d = new Date(ymd + 'T00:00:00'); return '周' + '日一二三四五六'[d.getDay()]; };
  const weekdaysBetween = (fromYMD, toYMDx) => {
    let n = 0; const cur = new Date(fromYMD + 'T00:00:00'); const end = new Date(toYMDx + 'T00:00:00');
    while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) n++; cur.setDate(cur.getDate() + 1); }
    return n;
  };
  const listWeekdays = (fromYMD, count) => {
    const out = []; const cur = new Date(fromYMD + 'T00:00:00');
    while (out.length < count) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) out.push(toYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  };

  /* ---------- 标签快速分类（仅用于种子数据，避免循环依赖） ---------- */
  function seedTag(text) {
    if (!text) return '';
    if (/ddl|deadline|截止|紧急|优先|今天必须|马上|立刻|尽快/.test(text)) return 'urgent';
    if (/买菜|做饭|打扫|整理|洗衣服|购物|快递|缴费|拿|买|取|收拾|洗碗|拖地|洗晒|晾衣|洗衣|叠衣|收纳|浇水|扔垃圾|倒垃圾|取快递|拿快递|寄快递/.test(text)) return 'daily';
    if (/阅读|看书|学习|笔记|写|记|背|练|练习|做题|复习|预习|看文章|写日记|总结|摘抄|思考|大纲|文章|公众号|论文|报告/.test(text)) return 'study';
    if (/考试|考|考研|考公|考证|模考|刷题|错题|真题|模拟|冲刺|备考|笔试|面试|报名|复习计划|知识点/.test(text)) return 'exam';
    if (/电影|散步|休息|娱乐|玩|听歌|看剧|旅行|周末|发呆|放松|独处|画画|写字|做手工|园艺|运动|拉伸|冥想|跑步|健身/.test(text)) return 'leisure';
    if (/朋友|聚会|聊天|约|逛街|探店|见面|吃饭|电话|视频|家人|同事|约饭|下午茶|团建|妈妈|爸爸|邮件|消息/.test(text)) return 'social';
    return '';
  }

  /* ---------- 种子数据 ---------- */
  function seed() {
    const today = todayStr();
    const dayLog = {};
    const completedLog = [];
    const pool = [
      ['写周报初稿', 45], ['回复邮件', 20], ['读《认知觉醒》第3章', 30], ['整理书桌', 15],
      ['给妈妈打电话', 15], ['准备周三会议PPT', 40], ['拉伸5分钟', 5], ['散步30分钟', 30],
      ['整理相册', 15], ['写一篇笔记', 30], ['冥想10分钟', 10], ['给绿植浇水', 5],
      ['画本周小结', 20], ['更新手账', 15]
    ];
    // 最近7天完成曲线：高→低→回升（今天已有1件完成，用于演示全勤）
    const pat = [1, 4, 3, 2, 1, 2, 3]; // 0天前..6天前
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ymd = toYMD(d);
      const n = pat[i];
      dayLog[ymd] = { done: n, planned: n + 1, mood: '😐' };
      for (let j = 0; j < n; j++) {
        const pick = pool[(i * 2 + j + 1) % pool.length];
        completedLog.push({
          id: uid(), text: pick[0], date: ymd, doneAt: ymd + 'T' + pad(9 + j) + ':30',
          estMin: pick[1], actualMin: pick[1], mood: j % 2 ? '😊' : '😐', note: ''
        });
      }
    }
    // 月报素材：重复出现的灵感
    const d9 = shiftDate(today, -9), d12 = shiftDate(today, -12);
    completedLog.push({ id: uid(), text: '读《认知觉醒》第3章', date: d9, doneAt: '', estMin: 30, actualMin: 25, mood: '😊', note: '' });
    completedLog.push({ id: uid(), text: '读《认知觉醒》第3章', date: d12, doneAt: '', estMin: 30, actualMin: 30, mood: '😐', note: '' });

    const result = {
      version: 6,
      settings: {
        palette: 'lavender', theme: 'system',
        ai: { enabled: false, provider: 'deepseek', apiKey: '', baseUrl: '', model: '' },
        skeleton: {
          enabled: false,
          week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
          overrides: {}
          // 每项: { id, start:'09:00', end:'12:00', tag:'工作' }
          // overrides: { '2026-08-19': [...] } 单日临时覆盖（今日页单独调整）
        }
      },
      todayDate: today,
      today: {
        status: null,
        tasks: [
          { id: uid(), text: '写周报初稿', estMin: 45, priority: true, done: false, goalId: null, why: '周报是这周最重要的一件', slot: 'night', matched: false, routeNote: '' },
          { id: uid(), text: '整理相册', estMin: 15, priority: false, done: false, goalId: null, why: '', slot: 'noon', matched: false, routeNote: '' },
          { id: uid(), text: '回复邮件', estMin: 20, priority: false, done: false, goalId: null, why: '', slot: 'pm', matched: false, routeNote: '' },
          { id: uid(), text: '读《认知觉醒》第3章', estMin: 30, priority: false, done: true, goalId: null, why: '', slot: 'evening', matched: true, routeNote: '' }
        ]
      },
      inbox: [
        { id: uid(), text: '拿快递：菜鸟驿站', at: new Date().toISOString() },
        { id: uid(), text: '给爸爸挑生日礼物', at: new Date().toISOString() }
      ],
      goals: [
        {
          id: uid(), title: '写公众号文章', createdAt: shiftDate(today, -4), deadline: shiftDate(today, 6),
          archived: false, milestones: ['筹备与选题', '内容打磨', '发布与收尾'],
          tasks: [
            { id: uid(), text: '搜索3篇参考文章并做笔记', why: '先摸清同行表达，心里有底', date: shiftDate(today, -4), estMin: 25, done: true },
            { id: uid(), text: '列出文章大纲', why: '大纲定，文章就完成了30%', date: shiftDate(today, -3), estMin: 20, done: true },
            { id: uid(), text: '写引言与第一个论点', why: '趁状态好先完成最难的开头', date: shiftDate(today, -2), estMin: 40, done: false },
            { id: uid(), text: '写核心论证部分', why: '这是文章的主体，分两天写更稳', date: shiftDate(today, -1), estMin: 45, done: false },
            { id: uid(), text: '补充案例与数据', why: '具体例子让观点站得住', date: today, estMin: 35, done: false },
            { id: uid(), text: '打磨语言与结构', why: '好文章是改出来的', date: shiftDate(today, 1), estMin: 40, done: false },
            { id: uid(), text: '自读一遍并修改', why: '用读者的眼睛读一遍', date: shiftDate(today, 2), estMin: 30, done: false },
            { id: uid(), text: '排版配图', why: '好看的外表值得被打开', date: shiftDate(today, 3), estMin: 25, done: false },
            { id: uid(), text: '预览检查错别字', why: '发出去之前最后的体面', date: shiftDate(today, 4), estMin: 15, done: false },
            { id: uid(), text: '发布并记录反馈', why: '闭环，让下一篇文章更好', date: shiftDate(today, 5), estMin: 20, done: false }
          ]
        },
        {
          id: uid(), title: '读完《认知觉醒》', createdAt: shiftDate(today, -7), deadline: shiftDate(today, 13),
          archived: false, milestones: ['建立阅读节奏', '深入重点章节', '输出读书笔记'],
          tasks: [
            { id: uid(), text: '每天读1章并划重点', why: '细水长流比突击更适合你', date: shiftDate(today, -6), estMin: 30, done: true },
            { id: uid(), text: '记录每章触动自己的1句话', why: '把书变成自己的', date: shiftDate(today, -4), estMin: 10, done: true },
            { id: uid(), text: '读第3章并做笔记', why: '本章是全书方法的核心', date: today, estMin: 30, done: false },
            { id: uid(), text: '读第4章并做笔记', why: '坚持你自己的节奏', date: shiftDate(today, 2), estMin: 30, done: false },
            { id: uid(), text: '读第5章并做笔记', why: '再有3章就完成了', date: shiftDate(today, 4), estMin: 30, done: false }
          ]
        }
      ],
      archivedGoals: [
        { id: uid(), title: '早睡打卡21天', doneDate: shiftDate(today, -11) },
        { id: uid(), title: '整理手机相册', doneDate: shiftDate(today, -6) },
        { id: uid(), title: '学会做番茄炒蛋', doneDate: shiftDate(today, -3) }
      ],
      backlog: [
        { id: uid(), text: '准备周三会议PPT', estMin: 40, priority: true, originalDate: today, why: '' },
        { id: uid(), text: '给妈妈打电话', estMin: 15, priority: false, originalDate: today, why: '' },
        { id: uid(), text: '整理书桌', estMin: 15, priority: false, originalDate: shiftDate(today, -1), why: '' },
        { id: uid(), text: '写一篇笔记', estMin: 30, priority: false, originalDate: shiftDate(today, -3), why: '' },
        { id: uid(), text: '整理相册', estMin: 15, priority: false, originalDate: shiftDate(today, -8), why: '' }
      ],
      completedLog,
      dayLog,
      aiLog: [
        { t: new Date(Date.now() - 36e5).toTimeString().slice(0, 5), text: '欢迎回来。今天有4件事等你去完成，其中1件标记为优先。' }
      ],
      corrections: {},
      stats: {},       // { 任务文字: {n, totalMin, avg} } 用于时间预估修正
      flags: {
        goalJustDecomposed: null, streakShownDate: null, adjustedShown: {}, skeletonShown: false,
        fragRemind: {},           // { '日期:任务id': 提醒次数 } 碎片建议每日最多2次
        fragBubbleShownDate: null // 右下角「碎片时间气泡」每日只提示一次
      },
      tags: { prefs: {}, history: [], corrections: {} },
      dayTasks: {},
      dayHighlights: {},   // { '2026-08-23': [{id, text, from}] } 今日重点（拖拽设入的核心目标）
      weekNotes: {},   // { '周一日期': { focus:'', summary:'', items:[] } } 本周重点项
      monthNotes: {},  // { '2026-08': { focus:'', summary:'', items:[] } } 本月重点项
      timelineView: 'week' // 时间轴默认视图：today / week / month
    };
    // 给种子数据自动打标签
    result.today.tasks.forEach(t => { t.tag = seedTag(t.text); });
    result.backlog.forEach(t => { t.tag = seedTag(t.text); });
    result.goals.forEach(g => g.tasks.forEach(t => { t.tag = seedTag(t.text); }));
    return result;
  }

  /* ---------- 读写 ---------- */
  let data = null;
  let migrated = false;
  function load() {
    if (data) return data;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { data = JSON.parse(raw); }
    } catch (e) { /* 损坏则重建 */ }
    if (!data) { data = seed(); save(); }
    if (!migrated) { migrate(); migrated = true; }
    return data;
  }
  /** 兼容旧数据：补齐缺失字段 */
  function migrate() {
    const s = data.settings || (data.settings = {});
    if (!s.palette) s.palette = 'lavender';
    if (!s.theme) s.theme = 'system';
    if (!s.ai) s.ai = { enabled: false, provider: 'deepseek', apiKey: '', baseUrl: '', model: '' };
    // 旧「课表」→「时间骨架」
    if (!s.skeleton) {
      if (s.schedule && s.schedule.week) {
        const week = {};
        Object.keys(s.schedule.week).forEach(d => {
          week[d] = (s.schedule.week[d] || []).map(c => ({
            id: uid(), start: c.start || '', end: c.end || '',
            tag: c.name || (c.place ? c.place : '已占用')
          }));
        });
        s.skeleton = { enabled: !!s.schedule.enabled, week, overrides: {} };
        delete s.schedule;
      } else {
        s.skeleton = { enabled: false, week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, overrides: {} };
      }
    }
    if (!s.skeleton.overrides) s.skeleton.overrides = {};
    if (!Array.isArray(data.inbox)) data.inbox = [];
    if (!data.corrections) data.corrections = {};
    if (!data.stats) data.stats = {};
    if (!data.flags) data.flags = { goalJustDecomposed: null, streakShownDate: null, adjustedShown: {}, skeletonShown: false };
    if (data.flags.skeletonShown === undefined) data.flags.skeletonShown = false;
    if (data.flags.fragRemind === undefined) data.flags.fragRemind = {};
    if (data.flags.fragBubbleShownDate === undefined) data.flags.fragBubbleShownDate = null;
    // 旧任务补齐时间线字段
    if (data.today && Array.isArray(data.today.tasks)) {
      data.today.tasks.forEach(t => {
        if (t.slot === undefined) t.slot = '';
        if (t.matched === undefined) t.matched = false;
        if (t.routeNote === undefined) t.routeNote = '';
      });
    }
    // v5/v6: 标签系统 + 按日任务池 + 周重点
    if ((data.version || 0) < 6) {
      data.version = 6;
      data.tags = data.tags || { prefs: {}, history: [], corrections: {} };
      data.dayTasks = data.dayTasks || {};
      data.dayHighlights = data.dayHighlights || {};
      data.weekNotes = data.weekNotes || {};
      data.monthNotes = data.monthNotes || {};
      // 旧版 weekNotes/monthNotes 可能没有 items 字段，补齐
      Object.values(data.weekNotes).forEach(n => { if (n && !n.items) n.items = []; });
      Object.values(data.monthNotes).forEach(n => { if (n && !n.items) n.items = []; });
      if (data.today && Array.isArray(data.today.tasks)) {
        data.today.tasks.forEach(t => { if (t.tag === undefined) t.tag = ''; });
      }
      if (Array.isArray(data.backlog)) {
        data.backlog.forEach(b => { if (b.tag === undefined) b.tag = ''; });
      }
      if (Array.isArray(data.completedLog)) {
        data.completedLog.forEach(e => { if (e.tag === undefined) e.tag = ''; });
      }
      if (Array.isArray(data.goals)) {
        data.goals.forEach(g => {
          if (Array.isArray(g.tasks)) g.tasks.forEach(t => { if (t.tag === undefined) t.tag = ''; });
        });
      }
    }
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {} }
  function reset() { localStorage.removeItem(LS_KEY); data = seed(); save(); return data; }

  /* ---------- 日历工具 ---------- */
  function startOfWeek(ymd) {
    const d = new Date(ymd + 'T00:00:00');
    const day = d.getDay(); // 0=周日
    const diff = day === 0 ? -6 : 1 - day; // 调整到周一
    d.setDate(d.getDate() + diff);
    return toYMD(d);
  }
  function weekDates(ymd) {
    const start = startOfWeek(ymd);
    return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  }
  function monthDays(year, month) {
    return new Date(year, month, 0).getDate();
  }
  function parseYMD(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return { y, m, d };
  }
  function weekKey(ymd) { return startOfWeek(ymd); }
  function weekNumber(ymd) {
    const d = parseYMD(ymd);
    const date = new Date(d.y, d.m - 1, d.d);
    const oneJan = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - oneJan) / 86400000);
    return Math.ceil((days + oneJan.getDay() + 1) / 7);
  }
  function monthKey(ymd) {
    const [y, m] = ymd.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  return { load, save, reset, seed, uid, todayStr, toYMD, shiftDate, fmtMD, fmtDOW, weekdaysBetween, listWeekdays, startOfWeek, weekDates, monthDays, parseYMD, weekKey, weekNumber, monthKey };
})();
