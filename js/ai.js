/* ============================================================
   「墨」· AI 层
   目标拆解 · OCR 模拟 · ISFJ 话术生成 · 周报/月报 · 明日方案
   ------------------------------------------------------------
   双层架构：
   1) LLM 层（真实大模型，按用户 ISFJ+天秤座人格画像 + 本地
      行为数据生成个性化话术 / 复盘 / 方案 / 拆解）
   2) 规则层（离线兜底，未配置 API Key 或调用失败时自动回退）
   所有 AI 能力均为 async，失败时降级为规则引擎，不阻塞体验。
   ============================================================ */
'use strict';

const AI = (() => {

  /* ================= 人格画像（注入 LLM 的灵魂） ================= */
  const PERSONA = `你是「墨」，一位专为 ISFJ 型人格（内向敏感、极度负责、利他、需要被看见但抗拒施压、压力向内攻击）且是天秤座（追求平衡、害怕冲突、需要选择权、对美与和谐敏感）的用户设计的 AI 生活知己。

你的说话铁律（每条输出都必须满足）：
1. 一句话里同时包含：共情肯定 + 基于用户真实数据的事实复盘 + 一条可执行建议 + 选择权（用"要…吗？""看你想不想"）。
2. 绝不批判、绝不催促、绝不施压。禁用"你还有任务没完成""效率太低"等句式；把"未完成"转译为"顺延到待办"，把疲惫转译为"你不需要每天都很强"。
3. 称呼克制，禁用"亲爱的""宝宝"等肉麻称呼；语气像一位温和有力的朋友坐在对面。
4. 先看见付出再给建议：每句话都要让用户感到"被看见、被感谢、被尊重"。
5. 鼓励进步但从不逼进：大任务主动建议拆小、连续高能量主动提醒留缓冲、状态低时主动减量。
6. 表达平实、克制、有呼吸感，少用感叹号；中文输出，30~60 字为主。`;

  /* ================= LLM 可用性控制 ================= */
  let _failAt = 0;
  function canCallLLM() {
    return typeof LLM !== 'undefined' && LLM.isEnabled() && Date.now() > _failAt;
  }
  function markFail() { _failAt = Date.now() + 5 * 60 * 1000; } // 失败后 5 分钟内不再请求
  function markOk() { _failAt = 0; }
  function clean(s) {
    return String(s || '').trim()
      .replace(/^["'“”「」\n]+|["'“”「」\n]+$/g, '')
      .replace(/\s*\n+\s*/g, ' ');
  }

  /* ================= 用户行为上下文（喂给 LLM 的"大数据"） ================= */
  function streakLocal() {
    const store = Store.load();
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const rec = store.dayLog[Store.shiftDate(Store.todayStr(), -i)];
      if (rec && rec.done >= 1) n++; else break;
    }
    return n;
  }

  function userContext(limit = 30) {
    const store = Store.load();
    const today = Store.todayStr();
    let doneSum = 0, days = 0;
    const recent7 = [];
    for (let i = 0; i < limit; i++) {
      const ymd = Store.shiftDate(today, -i);
      const rec = store.dayLog[ymd];
      if (rec) {
        doneSum += rec.done; days++;
        if (i < 7) recent7.push({ dow: Store.fmtDOW(ymd), done: rec.done, planned: rec.planned, mood: rec.mood });
      }
    }
    const moodTrend = {};
    store.completedLog.slice(-40).forEach(e => {
      const m = e.mood || '😐';
      moodTrend[m] = (moodTrend[m] || 0) + 1;
    });
    const staleBacklog = store.backlog.filter(b => {
      const d = (new Date(today + 'T00:00:00') - new Date((b.originalDate || today) + 'T00:00:00')) / 864e5;
      return d >= 3;
    }).length;
    const activeGoals = store.goals.filter(g => !g.archived).map(g => ({
      title: g.title,
      progress: g.tasks.length ? Math.round(g.tasks.filter(t => t.done).length / g.tasks.length * 100) : 0,
      deadline: g.deadline
    }));
    return {
      streak: streakLocal(),
      avgDone: days ? Math.round(doneSum / days * 10) / 10 : 0,
      recent7,
      moodTrend,
      todayTasks: store.today.tasks.map(t => ({ text: t.text, done: t.done, estMin: t.estMin, priority: t.priority })),
      todayStatus: store.today.status || '未记录',
      backlogCount: store.backlog.length,
      staleBacklog,
      activeGoals,
      tomorrowDOW: Store.fmtDOW(Store.shiftDate(today, 1))
    };
  }

  /* ================= 目标拆解（LLM 优先，规则兜底） ================= */
  const DOMAINS = [
    {
      key: 'write', words: ['文章', '写作', '公众号', '笔记', '书稿', '专栏', '报告', '论文', '文案'],
      hours: '约6-8小时',
      milestones: ['筹备与选题', '内容打磨', '发布与收尾'],
      tasks: [
        ['搜索3篇参考文章并做笔记', '先摸清同行的表达方式，写的时候心里有底', 25],
        ['列出文章大纲', '大纲定下来，文章就完成了30%', 20],
        ['写引言和第一个论点', '趁状态好先啃最难的开头', 40],
        ['写核心论证部分', '这是文章的主体，拆成两天写更稳', 45],
        ['补充案例与数据', '具体例子能让观点立得住', 35],
        ['打磨语言与结构', '好文章是改出来的，不是写出来的', 40],
        ['自读一遍并修改', '用读者的眼睛读一遍，删掉废话', 30],
        ['排版配图', '好看的外表，值得被打开', 25],
        ['预览检查错别字', '发出去之前的最后一道体面', 15],
        ['发布并记录反馈', '让这篇文章形成闭环', 20]
      ]
    },
    {
      key: 'read', words: ['读', '看书', '阅读', '本', '章'],
      hours: '约5-7小时',
      milestones: ['建立阅读节奏', '深入重点章节', '输出读书笔记'],
      tasks: [
        ['每天读1章并划重点', '细水长流比突击更适合你', 30],
        ['记录每章触动自己的1句话', '把书变成自己的东西', 10],
        ['读完第一个重点章节', '先拿下全书方法的核心', 40],
        ['整理这一章的要点卡片', '输出一次，理解就深一层', 25],
        ['读完第二个重点章节', '保持你自己的节奏就好', 40],
        ['对比两章的关联', '观点之间的连接最有价值', 20],
        ['写一篇300字读书笔记', '给这段时间的阅读一个交代', 30]
      ]
    },
    {
      key: 'learn', words: ['学', '课程', '英语', '技能', '考', '练', '会'],
      hours: '约7-10小时',
      milestones: ['打好基础', '专项练习', '检验成果'],
      tasks: [
        ['列出学习大纲和重点', '先看地图再出发', 15],
        ['完成基础部分的学习', '地基打牢，后面才不慌', 40],
        ['做一次专项小练习', '练一遍比看三遍有用', 30],
        ['整理易错点清单', '错误是最好的老师', 20],
        ['完成进阶部分的练习', '挑战一下，但不必完美', 45],
        ['做一次阶段性自测', '看看自己走到了哪里', 35],
        ['总结心得并定下一步', '阶段性收个尾，给自己一个交代', 20]
      ]
    },
    {
      key: 'habit', words: ['运动', '健身', '跑步', '早睡', '打卡', '习惯', '拉伸', '冥想'],
      hours: '约3-5小时',
      milestones: ['建立新习惯', '稳定节奏', '融入生活'],
      tasks: [
        ['定一个最小的起点', '5分钟也算开始', 5],
        ['连续3天执行最小动作', '先让身体记住这件事', 15],
        ['记录每次执行后的感受', '看见变化才更容易坚持', 5],
        ['逐步增加到舒适的时长', '加量不急，稳定优先', 20],
        ['连续一周保持节奏', '一周之后，它就是你生活的一部分', 15],
        ['回顾并奖励自己', '该奖励的时候别犹豫', 10]
      ]
    },
    {
      key: 'default', words: [],
      hours: '约5-7小时',
      milestones: ['准备阶段', '执行阶段', '收尾阶段'],
      tasks: [
        ['理清目标和最终产出', '想清楚"完成"长什么样', 15],
        ['收集必要资料和信息', '先把材料备齐', 30],
        ['制定执行清单', '把大目标拆成能打勾的小步', 20],
        ['完成第一部分的执行', '先完成，再完美', 45],
        ['完成第二部分的执行', '保持这个节奏', 45],
        ['检查遗漏并补全', '收尾前的自查', 30],
        ['整理成果并记录', '让完成感落下来', 20]
      ]
    }
  ];

  /** 规则兜底：领域模板拆解 */
  function _ruleGoalDecompose(input, deadlineStr) {
    const d = DOMAINS.find(x => x.words.some(w => input.includes(w))) || DOMAINS[DOMAINS.length - 1];
    const today = Store.todayStr();
    const deadline = deadlineStr || Store.shiftDate(today, 10);
    const workdays = Store.weekdaysBetween(today, deadline) || 5;
    const dates = Store.listWeekdays(today, d.tasks.length);
    const dailyMin = Math.max(20, Math.min(90, Math.round(60 * 7 / workdays)));
    const tasks = d.tasks.map((t, i) => ({
      text: t[0], why: t[1], estMin: t[2],
      date: dates[i] || dates[dates.length - 1]
    }));
    return {
      estimate: d.hours, workdays, daily: `约${dailyMin}分钟/天`,
      milestones: d.milestones, tasks
    };
  }

  /**
   * 目标拆解（async）：LLM 按人格画像生成，失败回退规则模板
   * @returns {Promise<{estimate:string, workdays:number, daily:string, milestones:string[], tasks:{text,why,estMin,date}[]}>}
   */
  async function goalDecompose(input, deadlineStr) {
    if (!canCallLLM()) return _ruleGoalDecompose(input, deadlineStr);
    const today = Store.todayStr();
    const deadline = deadlineStr || Store.shiftDate(today, 10);
    const workdays = Store.weekdaysBetween(today, deadline) || 5;
    const dates = Store.listWeekdays(today, Math.min(Math.max(workdays, 3), 12));
    const prompt = `用户的目标：「${input}」，计划截止：${deadline}，可用工作日：${dates.join('、')}。
请把目标拆成 3 个里程碑，以及不超过 ${dates.length} 个每日任务（每天不超过1件，任务描述要具体可执行、符合 ISFJ 每天≤3件的舒适区）。
每个任务包含：text（具体动作+对象+预期产出）、why（为什么做，≤20字）、estMin（预计分钟数 10~90）。
严格输出 JSON：{"estimate":"总耗时估算（如 约6-8小时）","milestones":["里程碑1","里程碑2","里程碑3"],"tasks":[{"text":"…","why":"…","estMin":30}]}`;
    const r = await LLM.chat([
      { role: 'system', content: PERSONA + '你擅长把长期目标拆成温柔、具体、可打勾的每日任务。只输出 JSON，不要任何多余文字。' },
      { role: 'user', content: prompt }
    ], { json: true, maxTokens: 1200, temperature: 0.7 });
    if (r && Array.isArray(r.tasks) && r.tasks.length) {
      markOk();
      const tasks = r.tasks.slice(0, dates.length).map((t, i) => ({
        text: String(t.text || '').slice(0, 40),
        why: String(t.why || '').slice(0, 40),
        estMin: Math.max(5, Math.min(120, Number(t.estMin) || 30)),
        date: dates[i] || dates[dates.length - 1]
      }));
      const avgMin = Math.round(tasks.reduce((s, t) => s + t.estMin, 0) / Math.max(tasks.length, 1));
      return {
        estimate: String(r.estimate || '约5-7小时'),
        workdays, daily: `约${avgMin}分钟/天`,
        milestones: Array.isArray(r.milestones) && r.milestones.length ? r.milestones.slice(0, 3) : ['准备阶段', '执行阶段', '收尾阶段'],
        tasks
      };
    }
    markFail();
    return _ruleGoalDecompose(input, deadlineStr);
  }

  /* ================= OCR（只做文字提取，不做任何 AI 补全/修正/联想/分类） ================= */
  const OCR_POOL = [
    '搜索3篇参考文章并做笔记', '列出文章大纲', '写周报初稿', '给妈妈打电话',
    '读《认知觉醒》第3章', '回复邮件', '买本周计划本', '整理书桌', '散步30分钟'
  ];

  /**
   * 模拟拍照 OCR。真实实现：调用百度 OCR 手写版 API 后返回同结构。
   * 铁律：只返回识别到的原始文本，绝不补全、修正、联想或分类。
   * @returns {{lines:{original:string,text:string,estMin:null,edited:boolean}[]}}
   */
  function ocrSimulate() {
    const n = 2 + Math.floor(Math.random() * 3); // 2-4 条
    const picked = [...OCR_POOL].sort(() => Math.random() - 0.5).slice(0, n);
    const lines = picked.map(p => ({
      original: p,
      text: p,
      estMin: null,
      edited: false
    }));
    return { lines };
  }

  /* ================= 动线系统：时间骨架 → 时间槽 → 顺路推荐 ================= */
  const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DEFAULT_SLOTS = [
    { key: 'early', label: '🌅 清晨', time: '07:30', type: 'focus', hint: '安静的自我时间' },
    { key: 'am', label: '☀️ 上午', time: '09:30', type: 'focus', hint: '' },
    { key: 'noon', label: '🍚 午间', time: '12:10', type: 'route', hint: '出门吃饭，顺路办事' },
    { key: 'pm', label: '🌤 下午', time: '14:30', type: 'focus', hint: '' },
    { key: 'evening', label: '🌙 傍晚', time: '17:40', type: 'route', hint: '课后/下班路上' },
    { key: 'night', label: '🌃 晚间', time: '19:30', type: 'focus', hint: '一天里最安静的一段' },
    { key: 'sleep', label: '🛌 睡前', time: '21:40', type: 'focus', hint: '轻量收尾' }
  ];

  /**
   * 根据日期 + 时间骨架生成当天可用的时间槽。
   * 骨架段 = 固定被占用（lesson，不可安排）；段间空档 / 午休 / 课后 = 顺路槽（route）。
   * 单日覆盖（overrides[date]）优先于每周默认骨架。
   */
  function buildSlots(date) {
    const store = Store.load();
    const sk = store.settings.skeleton;
    if (!sk || !sk.enabled) return DEFAULT_SLOTS.map(s => ({ ...s }));
    const dow = DOW_KEYS[new Date(date + 'T00:00:00').getDay()];
    const segs = (((sk.overrides && sk.overrides[date]) !== undefined) ? sk.overrides[date] : (sk.week && sk.week[dow])) || [];
    if (!segs.length) return DEFAULT_SLOTS.map(s => ({ ...s }));
    const sorted = segs.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const tMin = s => { const p = String(s || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
    const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const isMeal = t => /午休|午饭|午餐|吃饭|外卖|取餐|用餐/.test(t || '');
    const isClass = t => /课|上课|自习|教室/.test(t || '');
    const isWork = t => /工作|上班|会议|加班/.test(t || '');
    const slots = [];
    if (tMin(sorted[0].start) > 8 * 60) {
      slots.push({ key: 'early', label: '🌅 清晨', time: '07:30', type: 'focus', hint: '第一个固定安排之前，安静的自我时间' });
    }
    let prevEnd = null;
    sorted.forEach((seg, i) => {
      const st = tMin(seg.start);
      const en = Math.max(st + 30, tMin(seg.end));
      if (prevEnd !== null && st - prevEnd >= 15) {
        slots.push({ key: 'gap' + i, label: '🕐 空档', time: fmt(prevEnd), type: 'route', hint: '两段安排之间的空隙，顺路办事' });
      }
      if (isMeal(seg.tag)) {
        const key = (st >= 11 * 60 && st <= 14 * 60) ? 'noon' : 'gapM' + i;
        slots.push({ key, label: '🍚 ' + (seg.tag || '休息'), time: seg.start, type: 'route', hint: '吃饭出门，顺路办事' });
      } else {
        const ic = isClass(seg.tag) ? '📚' : (isWork(seg.tag) ? '💼' : '⏳');
        slots.push({ key: 'seg' + i, label: ic + ' ' + (seg.tag || '已占用'), time: seg.start, type: 'lesson', seg, hint: '' });
      }
      prevEnd = Math.max(prevEnd || 0, en);
    });
    const lastEnd = prevEnd;
    if (lastEnd <= 18 * 60) slots.push({ key: 'after', label: '🌙 课后/下班后', time: fmt(lastEnd), type: 'route', hint: '一天安排结束后，顺路收个尾' });
    if (lastEnd < 19 * 60) slots.push({ key: 'night', label: '🌃 晚间', time: '19:30', type: 'focus', hint: '一天里最安静的一段' });
    slots.push({ key: 'sleep', label: '🛌 睡前', time: '21:40', type: 'focus', hint: '轻量收尾' });
    return slots;
  }

  /* ================= 碎片时间（全局融入，非独立功能） ================= */
  /** 适合碎片时间完成的任务关键词（AI 自动识别，用户无需手动标记） */
  const FRAG_KEYWORDS = [
    '换壁纸', '壁纸', '整理相册', '清理相册', '相册', '清理缓存', '清缓存', '缓存',
    '回消息', '回微信', '回信息', '回信', '回QQ', '回钉钉', '回邮件', '看消息',
    '擦桌子', '擦灰', '擦台', '擦鞋', '刷鞋', '叠衣服', '收衣服', '晒衣服',
    '浇花', '浇水', '养花', '喂猫', '喂狗', '铲猫砂', '遛狗', '给植物',
    '倒垃圾', '扔垃圾', '丢垃圾', '取快递', '拿快递', '寄快递', '取件', '拿外卖', '取外卖',
    '倒水', '接水', '烧水', '泡茶', '煮咖啡', '冲咖啡',
    '剪指甲', '敷面膜', '涂护手霜', '洗手', '洗脸',
    '收拾桌面', '整理桌面', '收拾书桌', '整理书桌', '整理床头柜', '整理抽屉', '整理杂物', '整理文件', '收纳',
    '归档', '清理手机', '删照片', '备份', '理账单', '清空回收站', '折叠', '擦玻璃', '拖地'
  ];

  /**
   * AI 自动识别碎片任务：关键词命中 + 短时长（≤20分钟或未填）。
   * 纯规则，保证离线可用；LLM 场景可用 copySmart('frag_*') 生成话术。
   */
  function isFragTask(text, estMin) {
    if (!text) return false;
    const t = String(text);
    const hit = FRAG_KEYWORDS.some(k => t.includes(k));
    if (!hit) return false;
    return !estMin || Number(estMin) <= 20;
  }

  /**
   * 当前是否处于"时间骨架的空档"（课间/午休/提前下课/课后）。
   * @returns {null | {minutes:number, hint:string}} 空闲分钟数与提示语
   */
  function currentFreeSlot(date) {
    const store = Store.load();
    const sk = store.settings.skeleton;
    if (!sk || !sk.enabled) return null;
    const day = date || Store.todayStr();
    const dow = DOW_KEYS[new Date(day + 'T00:00:00').getDay()];
    const segs = (((sk.overrides && sk.overrides[day]) !== undefined) ? sk.overrides[day] : (sk.week && sk.week[dow])) || [];
    if (!segs.length) return null;
    const sorted = segs.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const tMin = s => { const p = String(s || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let prevEnd = null;
    for (const seg of sorted) {
      const st = tMin(seg.start);
      const en = Math.max(st + 30, tMin(seg.end));
      if (prevEnd !== null && nowMin >= prevEnd && nowMin < st && st - prevEnd >= 15) {
        return { minutes: Math.min(st - nowMin, 45), hint: '两段安排之间的空隙' };
      }
      if (nowMin >= st && nowMin < en) return null; // 正被固定安排占用
      prevEnd = Math.max(prevEnd || 0, en);
    }
    if (prevEnd !== null && nowMin >= prevEnd && prevEnd <= 18 * 60 && nowMin < 19 * 60) {
      return { minutes: Math.min(19 * 60 - nowMin, 60), hint: '今天的固定安排已经结束' };
    }
    return null;
  }

  /** 今天可用碎片时段数（骨架启用时顺路槽/空档的数量），用于右下角气泡 */
  function countFragSlots(date) {
    const store = Store.load();
    const sk = store.settings.skeleton;
    if (!sk || !sk.enabled) return 0;
    return buildSlots(date || Store.todayStr()).filter(s => s.type === 'route').length;
  }

  /** 当前可推荐的碎片任务候选：今日未开始 + 待办池（各按新鲜度排序，去重） */
  function fragCandidates(store) {
    const today = Store.todayStr();
    const seen = new Set();
    const out = [];
    store.today.tasks.filter(t => !t.done && !t.doing).forEach(t => {
      if (isFragTask(t.text, t.estMin)) { out.push({ id: t.id, text: t.text, estMin: t.estMin, from: 'today' }); seen.add(t.id); }
    });
    store.backlog.slice().reverse().forEach(b => {
      if (isFragTask(b.text, b.estMin) && !seen.has(b.id)) out.push({ id: b.id, text: b.text, estMin: b.estMin, from: 'backlog' });
    });
    return out;
  }

  /** 规则版顺路匹配：根据任务关键词 + 预估时长，推荐最顺手的槽位 */
  function routeSuggestRule(text, estMin, slots) {    const route = slots.filter(s => s.type === 'route');
    const focus = slots.filter(s => s.type === 'focus');
    const noon = slots.find(s => s.key === 'noon');
    const evening = slots.find(s => s.key === 'evening') || slots.find(s => s.key === 'after');
    const night = slots.find(s => s.key === 'night');
    const firstGap = route[0];
    if (/快递|取件|寄|签收|驿站|包裹|取票|打印|复印|买|购|采购|拿/.test(text)) {
      return { slot: (noon || firstGap).key, reason: '出门路上顺手就办了，不用专门跑一趟', type: 'route' };
    }
    if (/电话|视频|联系|问候|聊|打电话/.test(text)) {
      return { slot: (evening || noon).key, reason: '饭后散步打个电话，最不占用额外时间', type: 'route' };
    }
    if (/运动|跑步|散步|拉伸|锻炼|健身/.test(text)) {
      return { slot: (evening || firstGap).key, reason: '课后顺路动一动，正好缓解久坐', type: 'route' };
    }
    if (/写|读|背|复习|学|作业|笔记|复盘|预习|考/.test(text)) {
      return { slot: (night || evening).key, reason: '放到安静的时间段，专注起来更高效', type: 'focus' };
    }
    if (estMin && estMin <= 15) {
      return { slot: (firstGap || noon).key, reason: '十几分钟，课间/饭后就够', type: 'route' };
    }
    return { slot: (evening || night).key, reason: '安排到傍晚，不急不赶', type: 'focus' };
  }

  /**
   * 顺路推荐（async）：对今日未确认任务，返回 [{taskId,text,slot,reason}]
   * LLM 结合课表空档做最优匹配；失败/离线回退规则版。
   */
  async function routeSuggest(tasks, date) {
    const slots = buildSlots(date);
    const base = tasks.filter(t => !t.done && !t.matched).map(t => {
      const r = routeSuggestRule(t.text, t.estMin, slots);
      return { taskId: t.id, text: t.text, estMin: t.estMin || null, slot: r.slot, reason: r.reason, type: r.type };
    });
    if (!base.length) return base;
    if (!canCallLLM()) return base;
    const store = Store.load();
    const sk = store.settings.skeleton;
    const dow = DOW_KEYS[new Date(date + 'T00:00:00').getDay()];
    const segs = sk && sk.enabled ? (((sk.overrides && sk.overrides[date]) !== undefined) ? sk.overrides[date] : (sk.week && sk.week[dow])) || [] : [];
    const gapInfo = slots.filter(s => s.type !== 'lesson')
      .map(s => `${s.key}(${s.label} ${s.time} ${s.hint})`).join('；');
    const prompt = `今天是 ${Store.fmtDOW(date)}（${date}），时间骨架（固定被占用）：${segs.length ? segs.map(l => `${l.start}-${l.end} ${l.tag}`).join('、') : '无固定安排'}。可安排任务的空档槽位：${gapInfo}。
待安排任务：${JSON.stringify(base.map(b => ({ id: b.taskId, text: b.text, estMin: b.estMin })))}。
请为每个任务选择最合适的空档槽位，原则：顺路优先（能在空档/午间/课后路上顺手完成的绝不让用户多走一步）、避开骨架中被占用的时间、兼顾专注型任务（学习类放安静时段）、减少多余动作。规则建议仅供参考，可优化。
严格输出 JSON 数组：[{"taskId":"…","slot":"…","reason":"≤20字"}]，slot 必须是上面列出的 key 之一，不要输出任何其他文字。`;
    const r = await LLM.chat([
      { role: 'system', content: PERSONA + '你擅长把任务自然地嵌进用户每天的行程，让事情顺路发生。只输出 JSON。' },
      { role: 'user', content: prompt }
    ], { json: true, maxTokens: 800, temperature: 0.3 });
    if (Array.isArray(r) && r.length) {
      markOk();
      const valid = new Set(slots.filter(s => s.type !== 'lesson').map(s => s.key));
      const merged = base.map(b => {
        const hit = r.find(x => x && x.taskId === b.taskId);
        if (hit && valid.has(hit.slot)) return { ...b, slot: hit.slot, reason: String(hit.reason || b.reason).slice(0, 24) };
        return b;
      });
      return merged;
    }
    markFail();
    return base;
  }

  /** 灵感箱整理建议（规则版，离线兜底）：先接住想法，再判断去向 */
  function inboxSuggest(text) {
    if (/快递|取件|寄|签收|驿站|包裹|取票|打印|复印|买|购|拿/.test(text)) {
      return { action: 'today', slot: 'noon', reason: '适合午间出门顺路办，不用专门跑一趟' };
    }
    if (/写|读|学|复习|作业|背|笔记/.test(text)) {
      return { action: 'today', slot: 'night', reason: '放到晚间安静时段，专注完成' };
    }
    if (/电话|视频|联系|问候/.test(text)) {
      return { action: 'today', slot: 'evening', reason: '饭后打个电话，顺路又不占时间' };
    }
    return { action: 'backlog', slot: null, reason: '先放待办，之后由你决定安排' };
  }

  /** 灵感箱整理建议（async，LLM 优先） */
  async function inboxSuggestSmart(text) {
    if (!canCallLLM()) return inboxSuggest(text);
    const slots = buildSlots(Store.todayStr()).filter(s => s.type !== 'lesson');
    const prompt = `用户刚刚冒出一个想法：「${text}」。请判断它的最佳去向：
a) today：今天就能顺路/顺手完成（必须给一个最合适的空档槽位 key）
b) backlog：放待办，之后安排
c) drop：不值得记录
今天可用槽位：${slots.map(s => `${s.key}(${s.label} ${s.hint})`).join('；')}
严格输出 JSON：{"action":"today|backlog|drop","slot":"槽位key或null","reason":"≤18字"}`;
    const r = await LLM.chat([
      { role: 'system', content: PERSONA + '你在帮用户做极简的"接住想法→自动分类"：只输出 JSON。' },
      { role: 'user', content: prompt }
    ], { json: true, maxTokens: 200, temperature: 0.4 });
    if (r && (r.action === 'today' || r.action === 'backlog' || r.action === 'drop')) {
      markOk();
      const valid = new Set(slots.map(s => s.key));
      const slot = valid.has(r.slot) ? r.slot : (r.action === 'today' ? 'noon' : null);
      return { action: r.action, slot, reason: String(r.reason || '').slice(0, 20) };
    }
    markFail();
    return inboxSuggest(text);
  }

  /* ================= 话术生成 ================= */

  /** 规则兜底：一句话包含 共情 + 事实 + 建议 + 选择权 */
  function copy(trigger, ctx = {}) {
    const T = ctx.total ?? 0, D = ctx.done ?? 0, P = ctx.priorityCount ?? 0;
    switch (trigger) {
      case 'morning':
        return `今天有${T}件事等你去完成。${P ? `其中${P}件标记为优先。` : '都按你的节奏来。'}`;
      case 'evening':
        return `今天已完成${D}件，还剩${T - D}件。睡前可以拍个复盘。`;
      case 'mood_low':
        return '今天状态偏低。我已把1件事移到了待办。你不需要每天都很强。';
      case 'all_done':
        return '今日已完成。';
      case 'streak3':
        return '这周全勤。不是做得多，是节奏稳。';
      case 'adjust_estimate':
        return `你最近${ctx.task}平均用时${ctx.avg}分钟，已按此调整后续预估。`;
      case 'only_one':
        return '你今天选了最难的那件先做。另外几件没完成，是因为时间被其他事占用了，还是预估不准？明天我可以帮你把大任务拆小。';
      case 'no_exercise':
        return '你这几天没安排运动。不是催促——只是想确认，是累了，还是时间被占用了？明天下午有一个空档，5分钟拉伸也是进步，要看我帮你排进去吗？';
      case 'over_done':
        return `今天状态很好，${T}件全部完成。但连续高能量容易透支，明天我只帮你排2件——剩下的时间留给你自己缓冲。`;
      case 'goal_decomposed':
        return '目标已拆解完成。你可以调整任务分配到具体日期，或直接确认。';
      case 'goal_done':
        return `🎯 已达成：${ctx.title}。要归档吗？`;
      case 'goal_archived':
        return '已归档。你完成了一件重要的事，剩下的明天再说。';
      case 'goal_created':
        return `已为你创建目标。我会陪着你一步步走。`;
      case 'backlog_7d':
        return `"${ctx.task}"已在待办里放了7天。要重新安排，还是删除？`;
      case 'backlog_3d':
        return `"${ctx.task}"在待办里放了3天，还需要它吗？`;
      case 'backlog_restored':
        return `已把"${ctx.task}"移回今日任务。`;
      case 'backlog_deleted':
        return `这件事已经不重要了。已为你放下。`;
      case 'ocr_done':
        return '如果识别有误，点击任务文字即可修改。';
      case 'ocr_committed':
        return `已把 ${ctx.n ?? ''}件任务排进今天。拍得不错。`;
      case 'day_end':
        return '今日已完成。明天见。';
      case 'task_moved_out':
        return `状态偏低时不用硬撑。已把"${ctx.task}"移到待办，明天再排回来就好。`;
      case 'review_saved':
        return '记录好了。完成本身就是意义。';
      case 'route_suggest':
        return `"${ctx.task}"放在${ctx.slot}：${ctx.reason}。要按这个顺路计划来吗？`;
      case 'route_accepted':
        return `好，已把"${ctx.task}"安排在${ctx.slot}。出门顺手就办了，不用多走一步。`;
      case 'all_routes':
        return `已把 ${ctx.n} 件事嵌进今天的时间线，都是顺路的。`;
      case 'inbox_captured':
        return '先记下了。等你有空，我帮你分分类。';
      case 'inbox_today':
        return `已把"${ctx.task}"排进${ctx.slot}${ctx.reason ? '：' + ctx.reason : ''}。`;
      case 'inbox_backlog':
        return `已把"${ctx.task}"放进待办，晚点再安排。`;
      case 'skeleton_saved':
        return `时间骨架已更新。我会避开你忙碌的时段，把顺路的事嵌进空档。`;
      case 'skeleton_off':
        return '已关闭时间骨架，改用默认时段安排。';
      case 'skeleton_templated':
        return `已按「${ctx.tpl || ''}」搭好周一至周五的时间骨架，你可以微调。`;
      case 'skeleton_copied':
        return '已复制到所选日期。';
      case 'skeleton_override':
        return '今天的时间骨架已单独调整，其他日期不受影响。';
      case 'skeleton_reset':
        return '今天已恢复本周默认的时间骨架。';
      case 'skeleton_onboard':
        return '先定下每周固定被占用的时间，我才能把别的事顺路安排好。';
      case 'frag_suggest':
        return `现在有${ctx.min}分钟空闲，可以：${ctx.list}。要开始一件吗？`;
      case 'frag_started':
        return `已把"${ctx.task}"放进今天。现在做正好。`;
      case 'frag_ignored':
        return '好，这件事今天先放一放。';
      case 'frag_bubble':
        return `今天有${ctx.n}段碎片时间，可以完成一些小事。`;
      case 'frag_bubble_close':
        return '想做小事时，随时叫我。';
      case 'task_done':
        return '已标记为完成。';
      case 'task_undone':
        return '已取消完成。';
      case 'task_restored':
        return `已把"${ctx.task}"排回今日。`;
      case 'task_to_backlog':
        return `已把"${ctx.task}"移回待办，晚点再安排。`;
      case 'task_edited':
        return '已保存修改。';
      case 'task_deleted':
        return `已删除"${ctx.task}"。`;
      case 'goal_kept':
        return '先留在这里，等你觉得合适再归档。';
      default:
        return '';
    }
  }

  /** 场景映射：把触发器翻译给 LLM */
  const SCENARIOS = {
    morning: '用户早晨打开App，今日任务列表已生成',
    evening: '用户晚上打开App，查看今日进度',
    mood_low: '用户刚刚点选了😔（有点累）的状态',
    all_done: '今日任务全部完成',
    streak3: '用户已连续多天全勤',
    adjust_estimate: '系统根据历史用时自动修正了某任务的预估时间',
    only_one: '今天原计划多件，只完成了1件（先挑了最难的）',
    no_exercise: '用户连续几天没有运动安排',
    over_done: '超额完成，计划内任务全部完成',
    goal_decomposed: '用户的长期目标刚刚被拆解完成',
    goal_done: '某个目标已达成100%',
    goal_archived: '用户确认归档一个已达成目标',
    goal_created: '用户确认创建一个新目标',
    backlog_7d: '待办里有一件事存放超过7天',
    backlog_3d: '待办里有一件事连续3天没被排进日程',
    backlog_restored: '一件待办被用户移回今日任务',
    backlog_deleted: '用户删除了一件待办',
    ocr_done: '拍照识别完成，等待用户确认识别结果',
    ocr_committed: '用户确认了OCR识别的任务，加入今日/待办',
    day_end: '用户点击结束今天，明天即将开始',
    task_moved_out: '因状态偏低，系统把1件事移到了待办',
    review_saved: '用户完成了一次即时复盘记录',
    ai_connected: 'AI 服务连接测试成功',
    ai_failed: 'AI 服务连接测试失败',
    route_suggest: 'AI 为某个今日任务推荐了顺路的执行时机',
    route_accepted: '用户确认接受了一条顺路建议',
    all_routes: '用户一键确认了所有顺路建议',
    inbox_captured: '用户往灵感箱记了一条想法，等待整理',
    inbox_today: '一条灵感被排进今日任务并匹配了时间槽',
    inbox_backlog: '一条灵感被移入待办',
    skeleton_saved: '用户保存了新的时间骨架（每周固定被占用的时间段）',
    skeleton_off: '用户关闭了时间骨架匹配',
    skeleton_templated: '用户套用了时间骨架模板（上班族/学生）',
    skeleton_copied: '用户把某天的时间骨架复制到了其他日期',
    skeleton_override: '用户在今日页单独调整了当天的时间骨架',
    skeleton_reset: '用户恢复了今天的默认骨架',
    skeleton_onboard: '首次使用，引导用户设置时间骨架',
    frag_suggest: '时间线出现空闲时段，系统推荐可以顺手完成的碎片任务',
    frag_started: '用户点击"开始做"，把一个碎片任务放进今天开始执行',
    frag_ignored: '用户点击"忽略"，放弃本次碎片任务建议',
    frag_bubble: '系统检测到今天有多段碎片时间，在右下角提示一次',
    frag_bubble_close: '用户关闭了右下角的碎片时间提示气泡',
    task_done: '用户通过复选框标记某任务完成',
    task_undone: '用户取消某任务的完成状态',
    task_restored: '用户把待办/碎片任务移回今日任务',
    task_to_backlog: '用户把今日任务移回待办',
    task_edited: '用户编辑保存了任务内容',
    task_deleted: '用户删除了一条任务（已二次确认）',
    goal_kept: '目标已达100%，但用户选择暂不归档'
  };

  /**
   * 个性化话术（async）：LLM 结合人格画像 + 用户行为数据生成
   * 失败时回退规则版 copy()，保证始终有话可说。
   */
  async function copySmart(trigger, ctx = {}) {
    if (!canCallLLM()) return copy(trigger, ctx);
    const scene = SCENARIOS[trigger] || `场景：${trigger}`;
    const payload = { scene, ctx, user: userContext() };
    const msg = await LLM.chat([
      { role: 'system', content: PERSONA },
      { role: 'user', content: `当前场景：${scene}。上下文数据：${JSON.stringify(payload)}\n请输出一句 30~60 字的话（只输出这句话本身，不要引号、不要换行、不要列表）。一句话里同时包含：共情 + 基于上面数据的事实 + 一条可执行建议 + 选择权。` }
    ], { maxTokens: 200, temperature: 0.95, timeout: 15000 });
    if (msg) { markOk(); return clean(msg); }
    markFail();
    return copy(trigger, ctx);
  }

  /* ================= 复盘生成 ================= */

  /** 周报统计（规则计算，供渲染 + 喂给 LLM） */
  function weeklyReport() {
    const store = Store.load();
    const today = Store.todayStr();
    const days = [];
    let total = 0;
    for (let i = 6; i >= 0; i--) {
      const ymd = Store.shiftDate(today, -i);
      const rec = store.dayLog[ymd] || { done: 0, planned: 0 };
      days.push({ ymd, done: rec.done, planned: rec.planned, dow: Store.fmtDOW(ymd) });
      total += rec.done;
    }
    const vals = days.map(d => d.done);
    const maxI = vals.indexOf(Math.max(...vals));
    const minI = vals.indexOf(Math.min(...vals));
    const up = vals[6] >= vals[minI] ? '回升' : '走低';
    const curve = `${days[maxI].dow}最高（${vals[maxI]}件）→ ${days[minI].dow}最低（${vals[minI]}件）→ 之后${up}`;
    const sorted = [...days].sort((a, b) => b.done - a.done);
    const advice = `建议下周把重要任务放在${sorted[0].dow}和${sorted[1].dow}。`;
    const fullAttendance = vals.every(v => v >= 1);
    return { total, curve, advice, fullAttendance, days };
  }

  /** 周报 AI 叙事（async）：LLM 基于本周真实数据写一段个性化复盘 */
  async function weeklyNarration(r) {
    if (!canCallLLM()) return null;
    const store = Store.load();
    const today = Store.todayStr();
    const weekEntries = [];
    for (let i = 6; i >= 0; i--) {
      const ymd = Store.shiftDate(today, -i);
      const items = store.completedLog.filter(e => e.date === ymd).map(e => e.text);
      weekEntries.push({ dow: Store.fmtDOW(ymd), items });
    }
    const prompt = `请基于本周真实数据，写一段 2~4 句的周复盘（80~140字）。要求：先共情看见用户的付出；再指出真实节奏规律（高/低点、全勤或波动、情绪倾向）；最后给一条可执行且带选择权的下周建议。不要用列表、不要用标题、不要喊称呼。
本周数据：
- 总完成：${r.total} 件
- 每天完成数：${r.days.map(d => `${d.dow}${d.done}`).join('、')}
- 是否全勤：${r.fullAttendance ? '是' : '否'}
- 最近7天实际完成的任务：${weekEntries.map(w => `${w.dow}(${w.items.join('、') || '无记录'})`).join('；')}
- 用户整体上下文：${JSON.stringify(userContext())}`;
    const msg = await LLM.chat([
      { role: 'system', content: PERSONA },
      { role: 'user', content: prompt }
    ], { maxTokens: 400, temperature: 0.9 });
    if (msg) { markOk(); return clean(msg); }
    markFail();
    return null;
  }

  /** 月报统计（规则计算） */
  function monthlyReport() {
    const store = Store.load();
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const entries = store.completedLog.filter(e => e.date.startsWith(monthKey));
    const total = entries.length;
    const count = {};
    entries.forEach(e => { count[e.text] = (count[e.text] || 0) + 1; });
    const repeated = Object.entries(count).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const byDay = {};
    entries.forEach(e => { const dd = Number(e.date.slice(8)); byDay[dd] = (byDay[dd] || 0) + 1; });
    const timeline = [];
    for (let i = 1; i <= daysInMonth; i++) timeline.push({ day: i, n: byDay[i] || 0 });
    return { total, repeated: repeated.map(([text, n]) => ({ text, n })), timeline, monthKey };
  }

  /** 月报 AI 叙事（async） */
  async function monthlyNarration(m) {
    if (!canCallLLM()) return null;
    const store = Store.load();
    const month = m.monthKey;
    const entries = store.completedLog.filter(e => e.date.startsWith(month))
      .map(e => `${e.date.slice(5)} ${e.mood || ''} ${e.text}`).slice(-30);
    const prompt = `请基于本月真实数据，写一段 2~4 句的月度复盘（80~140字）。要求：先共情看见整月的付出；再指出节奏与情绪规律、重复出现的主题；最后给一条面向下个月的可执行建议（带选择权）。不要列表、不要标题、不要喊称呼。
本月数据：
- 总完成：${m.total} 件
- 重复出现的灵感：${m.repeated.length ? m.repeated.map(r => `${r.text}×${r.n}`).join('、') : '无'}
- 完成明细（节选）：${entries.join('；') || '本月暂无完成记录'}
- 用户整体上下文：${JSON.stringify(userContext())}`;
    const msg = await LLM.chat([
      { role: 'system', content: PERSONA },
      { role: 'user', content: prompt }
    ], { maxTokens: 400, temperature: 0.9 });
    if (msg) { markOk(); return clean(msg); }
    markFail();
    return null;
  }

  /* ================= 智能任务量适配（规则，供渲染 + 明日方案） ================= */
  function suggestTomorrow() {
    const store = Store.load();
    const today = Store.todayStr();
    let sum = 0, n = 0;
    for (let i = 1; i <= 30; i++) {
      const rec = store.dayLog[Store.shiftDate(today, -i)];
      if (rec) { sum += rec.done; n++; }
    }
    const base = n ? Math.round(sum / n * 10) / 10 : 3;
    let factor = 1;
    if (store.today.status === '😔') factor = 0.6;
    if (store.today.status === '😊') factor = 1.15;
    const tomorrow = new Date(today + 'T00:00:00'); tomorrow.setDate(tomorrow.getDate() + 1);
    const isWeekend = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;
    if (isWeekend) factor *= 1.4;
    let count = Math.round(base * factor);
    count = Math.max(0, Math.min(5, count));
    if (isWeekend) count = Math.max(count, 2);
    return { base, count, weekend: isWeekend };
  }

  /**
   * 明日方案（async）：LLM 从待办+目标中挑选最合适的明日任务，
   * 给出排序理由与一句明日寄语；失败回退 null（上层保留规则建议）。
   * @returns {Promise<{plan:{text:string,why:string}[], note:string}|null>}
   */
  async function tomorrowPlan() {
    if (!canCallLLM()) return null;
    const store = Store.load();
    const today = Store.todayStr();
    const tomorrow = Store.shiftDate(today, 1);
    const candidates = [
      ...store.backlog.map(b => ({
        text: b.text,
        from: '待办',
        age: Math.max(1, Math.round((new Date(today + 'T00:00:00') - new Date((b.originalDate || today) + 'T00:00:00')) / 864e5))
      })),
      ...store.goals.filter(g => !g.archived).flatMap(g =>
        g.tasks.filter(t => !t.done && t.date <= tomorrow).map(t => ({ text: t.text, from: `目标「${g.title}」`, age: 0 }))
      )
    ].slice(0, 12);
    const prompt = `用户明天是 ${Store.fmtDOW(tomorrow)}（${tomorrow}）。候选任务：${JSON.stringify(candidates)}。用户行为数据：${JSON.stringify(userContext())}。
请从中挑选 2~4 件最适合明天做的任务（综合优先级、紧迫度、ISFJ 每日≤3件的舒适区、用户当前状态与历史节奏），排好顺序；每件附一句 ≤18字的"为什么选它"；最后给一句 ≤40字的明日寄语（温柔、有推动力、带选择权）。
严格输出 JSON：{"plan":[{"text":"任务原文","why":"为什么选它"}],"note":"明日寄语"}`;
    const r = await LLM.chat([
      { role: 'system', content: PERSONA + '你擅长为 ISFJ 用户安排温柔不施压的每日方案。只输出 JSON。' },
      { role: 'user', content: prompt }
    ], { json: true, maxTokens: 800, temperature: 0.8 });
    if (r && Array.isArray(r.plan)) {
      markOk();
      const picked = r.plan.filter(p => candidates.some(c => c.text === p.text)).slice(0, 4)
        .map(p => ({ text: String(p.text).slice(0, 40), why: String(p.why || '').slice(0, 30) }));
      if (picked.length) return { plan: picked, note: clean(String(r.note || '')) };
    }
    markFail();
    return null;
  }

  return {
    goalDecompose, ocrSimulate, copy, copySmart,
    weeklyReport, weeklyNarration, monthlyReport, monthlyNarration,
    suggestTomorrow, tomorrowPlan, userContext,
    buildSlots, routeSuggest, routeSuggestRule, inboxSuggest, inboxSuggestSmart,
    isFragTask, currentFreeSlot, countFragSlots, fragCandidates
  };
})();
