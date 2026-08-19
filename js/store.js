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

    return {
      version: 2,
      settings: {
        palette: 'lavender', theme: 'system',
        ai: { enabled: false, provider: 'deepseek', apiKey: '', baseUrl: '', model: '' },
        schedule: {
          enabled: false,
          week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
          // 每项: { id, start:'08:00', end:'09:40', name:'高数', place:'A301' }
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
      flags: { goalJustDecomposed: null, streakShownDate: null, adjustedShown: {} }
    };
  }

  /* ---------- 读写 ---------- */
  let data = null;
  function load() {
    if (data) { migrate(); return data; }
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { data = JSON.parse(raw); migrate(); return data; }
    } catch (e) { /* 损坏则重建 */ }
    data = seed();
    save();
    return data;
  }
  /** 兼容旧数据：补齐缺失字段 */
  function migrate() {
    const s = data.settings || (data.settings = {});
    if (!s.palette) s.palette = 'lavender';
    if (!s.theme) s.theme = 'system';
    if (!s.ai) s.ai = { enabled: false, provider: 'deepseek', apiKey: '', baseUrl: '', model: '' };
    if (!s.schedule) s.schedule = {
      enabled: false,
      week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
    };
    if (!Array.isArray(data.inbox)) data.inbox = [];
    if (!data.corrections) data.corrections = {};
    if (!data.stats) data.stats = {};
    if (!data.flags) data.flags = { goalJustDecomposed: null, streakShownDate: null, adjustedShown: {} };
    // 旧任务补齐时间线字段
    if (data.today && Array.isArray(data.today.tasks)) {
      data.today.tasks.forEach(t => {
        if (t.slot === undefined) t.slot = '';
        if (t.matched === undefined) t.matched = false;
        if (t.routeNote === undefined) t.routeNote = '';
      });
    }
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {} }
  function reset() { localStorage.removeItem(LS_KEY); data = seed(); save(); return data; }

  return { load, save, reset, seed, uid, todayStr, toYMD, shiftDate, fmtMD, fmtDOW, weekdaysBetween, listWeekdays };
})();
