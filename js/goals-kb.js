/* ============================================================
 * 目标拆解 · 本地知识库（完全离线，不依赖任何外部 API）
 * ------------------------------------------------------------
 * 核心原则：一份模板、动态适配、全领域覆盖、人格适配、数据联动
 *  - 12 大领域 × 5 大人生阶段，62 个目标模板
 *  - 每个模板：三大阶段 + 里程碑 + 每日任务 + 「为什么做」
 *  - 周期适配：自由日（每 7 天 1 天）、每天最多 3 件
 *  - ISFJ 适配：每天 ≤3 件、任务具体可执行、始终显示 why
 *  - 天秤座适配：每天给选项、避免强制词汇、自由日缓冲
 * ============================================================ */
const GoalKB = (() => {

  /* ================= 5 大人生阶段 ================= */
  const LIFE_STAGES = {
    student: { id: 'student', name: '学生时代', range: '12-22岁', maxDailyTasks: 2, freeDayInterval: 7, desc: '时间相对灵活，学习类目标优先' },
    starter: { id: 'starter', name: '初入社会', range: '22-30岁', maxDailyTasks: 3, freeDayInterval: 7, desc: '求职与独立生活为主，节奏紧凑' },
    family:  { id: 'family',  name: '成家立业', range: '30-45岁', maxDailyTasks: 3, freeDayInterval: 7, desc: '家庭、财务、事业需要平衡' },
    midlife: { id: 'midlife', name: '中年沉淀', range: '45-60岁', maxDailyTasks: 2, freeDayInterval: 7, desc: '传承、健康、自我实现为主' },
    silver:  { id: 'silver',  name: '银发时光', range: '60岁+',   maxDailyTasks: 2, freeDayInterval: 7, desc: '兴趣、奉献与回顾为主' }
  };

  /* ================= 周期 ================= */
  const CYCLES = [
    { id: 'week',  label: '一周',   days: 7 },
    { id: 'two',   label: '两周',   days: 14 },
    { id: 'three', label: '三周',   days: 21 },
    { id: 'month', label: '一个月', days: 30 }
  ];

  /* ================= 难度 ================= */
  const DIFFICULTIES = {
    easy:   { id: 'easy',   name: '轻松',     factor: 0.75, note: '节奏放缓，每天更轻' },
    medium: { id: 'medium', name: '中等',     factor: 1.0,  note: '稳步推进' },
    hard:   { id: 'hard',   name: '有挑战',   factor: 1.3,  note: '任务更重，进步更快' }
  };

  /* ============================================================
   * 12 大领域骨架：每领域一套三阶段任务（含「为什么做」）
   * 任务文本中的 {T} = 模板名（如「学编程」），{G} = 用户输入
   * ============================================================ */
  const DOMAINS = {
    /* ---------- 1. 健康与身体 ---------- */
    health: {
      label: '健康与身体',
      phases: [
        { name: '建立习惯', milestone: '了解现状并启动最小行动', from: 0, to: 2 },
        { name: '执行推进', milestone: '核心动作坚持一周以上', from: 3, to: 7 },
        { name: '巩固调整', milestone: '让{T}融入日常节奏', from: 8, to: 10 }
      ],
      tasks: [
        ['记录今天与{T}相关的所有数据（不用改变）', '先看见现状，才能决定改什么', 15],
        ['查阅 1 篇权威资料，了解正确做法', '避免被错误信息带偏', 30],
        ['设定一个可量化的本周小目标', '没有数字的目标很难坚持', 15],
        ['从最小的动作开始（如散步15分钟/早睡30分钟）', '小动作容易开始，先动起来', 30],
        ['连续 3 天完成最小动作', '连续做才会变成习惯', 20],
        ['替换一个不健康的旧习惯', '不要求一步到位，慢慢替换更持久', 20],
        ['记录本周进展，和第 1 天的数据对比', '看到变化是最好的动力', 15],
        ['根据数据微调计划', '计划要适配真实生活', 20],
        ['安排一次小犒赏', '让坚持有甜头', 15],
        ['复盘：哪些顺畅、哪些卡住', '复盘让下次更顺', 15],
        ['把{T}安排进日常节奏', '变成生活方式而不是任务', 20]
      ]
    },

    /* ---------- 2. 学业与考试 ---------- */
    study: {
      label: '学业与考试',
      phases: [
        { name: '摸清规则', milestone: '信息与材料准备齐全', from: 0, to: 2 },
        { name: '系统学习', milestone: '完成一轮系统的学习与练习', from: 3, to: 7 },
        { name: '冲刺巩固', milestone: '模拟实战并查漏补缺', from: 8, to: 11 }
      ],
      tasks: [
        ['查询{T}的关键信息（时间/内容/要求）', '不清楚规则容易走弯路', 30],
        ['准备所需资料和工具', '材料齐了才能安心开始', 30],
        ['制定总体学习计划（每天学多久/每周几天）', '有计划才不容易中途放弃', 20],
        ['每天固定时间学习基础内容', '让身体习惯「每天学习」这件事', 60],
        ['做一轮练习题检验学习效果', '做题是检验学习的最好方式', 45],
        ['整理笔记与错题', '整理笔记等于二次复习', 30],
        ['复习本周学过的内容', '遗忘最快的是学完后的前 3 天', 30],
        ['做一套完整模拟/真题', '模拟是最接近实战的练习', 60],
        ['针对薄弱点专项突破', '把时间花在提分最快的地方', 45],
        ['调整作息，保持状态', '考试拼到最后是状态', 15],
        ['做考前最后检查（证件/路线/材料）', '细节决定成败', 15],
        ['考后复盘总结', '一次考试就是一次学习', 20]
      ]
    },

    /* ---------- 3. 职业与发展 ---------- */
    career: {
      label: '职业与发展',
      phases: [
        { name: '定位准备', milestone: '完成现状梳理与关键材料', from: 0, to: 2 },
        { name: '执行推进', milestone: '连续一周推进实质行动', from: 3, to: 7 },
        { name: '冲刺收尾', milestone: '完成关键动作并沉淀经验', from: 8, to: 10 }
      ],
      tasks: [
        ['梳理现状与目标之间的差距', '先知道自己在哪、要去哪', 30],
        ['更新简历/作品集/个人介绍', '让别人快速看懂你', 45],
        ['调研目标岗位/方向的要求', '按需求准备才有效', 30],
        ['每天完成一项实质性准备（投递/学习/作品）', '量变引起质变', 45],
        ['联系 3 位相关领域的人交流', '信息差往往决定机会', 30],
        ['完成一个代表作品/项目', '作品比简历更有说服力', 60],
        ['复盘本周进展，及时调整方向', '方向比努力更重要', 20],
        ['打磨关键材料', '细节体现专业度', 30],
        ['模拟一次真实场景（面试/提案/演讲）', '提前演练更从容', 45],
        ['推进关键机会（投递/约谈/报价）', '机会是推进出来的', 30],
        ['复盘总结，沉淀经验', '让每一步都成为积累', 20]
      ]
    },

    /* ---------- 4. 财务与理财 ---------- */
    finance: {
      label: '财务与理财',
      phases: [
        { name: '看清现状', milestone: '完成收支盘点与目标设定', from: 0, to: 2 },
        { name: '执行行动', milestone: '储蓄/预算规则已自动运行一周', from: 3, to: 7 },
        { name: '巩固优化', milestone: '形成可持续的理财节奏', from: 8, to: 10 }
      ],
      tasks: [
        ['拉账单，记录近 30 天收支', '先看清钱去哪了', 30],
        ['算出每月固定支出与可支配金额', '有数字才能做规划', 20],
        ['设定一个具体金额目标', '目标要具体到数字', 15],
        ['建立自动储蓄/预算规则', '自动化比靠意志力有效', 30],
        ['砍掉一项非必要支出', '小钱积少成多', 15],
        ['学习一项理财基础知识', '认知决定收益', 30],
        ['每周核对一次账本', '保持对钱的敏感度', 15],
        ['调整预算，适配真实生活', '预算要能长期执行', 20],
        ['设置一个里程碑奖励', '给坚持一些甜头', 15],
        ['复盘本阶段执行情况', '找到可持续的方式', 20],
        ['制定下阶段的理财重点', '财务是长期工程', 20]
      ]
    },

    /* ---------- 5. 学习与技能 ---------- */
    skill: {
      label: '学习与技能',
      phases: [
        { name: '入门打底', milestone: '完成入门材料并首次实操', from: 0, to: 2 },
        { name: '刻意练习', milestone: '连续一周稳定练习并有输出', from: 3, to: 7 },
        { name: '巩固输出', milestone: '完成一个完整成果', from: 8, to: 10 }
      ],
      tasks: [
        ['明确学{T}的目标与验收标准', '先知道自己为什么学', 15],
        ['收集 2-3 份入门学习材料', '跟对材料事半功倍', 30],
        ['完成第一次实操/体验', '先动手，建立手感', 45],
        ['每天固定时间练习核心动作', '进步来自每天一点点', 45],
        ['每周完成一个小作品/输出', '输出倒逼输入', 45],
        ['找一位老师/搭子反馈', '有人反馈进步更快', 30],
        ['记录练习中遇到的问题', '问题清单就是进步清单', 15],
        ['完成一个完整作品/成果', '用成果检验水平', 60],
        ['复盘整个学习过程', '提炼可复用的方法', 20],
        ['规划下一步进阶方向', '学习是螺旋上升的', 20],
        ['把{T}用进日常生活', '用了才算学会', 30]
      ]
    },

    /* ---------- 6. 家庭与亲情 ---------- */
    family: {
      label: '家庭与亲情',
      phases: [
        { name: '用心经营', milestone: '想清楚期待并迈出第一步', from: 0, to: 2 },
        { name: '行动连接', milestone: '完成一轮主动连接与倾听', from: 3, to: 7 },
        { name: '沉淀习惯', milestone: '把有意义的行动变成日常', from: 8, to: 10 }
      ],
      tasks: [
        ['写下与家人相关的 3 个心愿/期待', '先想清楚自己想要什么', 15],
        ['主动联系/陪伴一次', '关系需要主动', 30],
        ['观察并记录家人最近的需求', '用心看见对方', 15],
        ['安排一次共同活动', '一起做事关系更近', 45],
        ['认真倾听一次，不评判', '倾听是最好的礼物', 30],
        ['表达一次感谢或爱意', '感情要说出来', 15],
        ['记录这周的温暖时刻', '让美好被看见', 15],
        ['复盘这轮相处', '找到彼此舒适的方式', 20],
        ['把一件有意义的行动固定为习惯', '让连接成为日常', 15],
        ['制定下一阶段的家庭计划', '经营是长期的事', 20],
        ['完成一次总结，给自己点赞', '你做得很好', 10]
      ]
    },

    /* ---------- 7. 社交与人际 ---------- */
    social: {
      label: '社交与人际',
      phases: [
        { name: '做好准备', milestone: '完成自我梳理与话题准备', from: 0, to: 2 },
        { name: '主动连接', milestone: '迈出多次主动社交', from: 3, to: 7 },
        { name: '深化关系', milestone: '把浅层连接变深', from: 8, to: 10 }
      ],
      tasks: [
        ['列出想结识的 3 类人', '先明确方向', 15],
        ['打磨 30 秒自我介绍', '让别人快速认识你', 20],
        ['准备 3 个可以聊的话题', '有话题就不尴尬', 15],
        ['主动参加一次线下/线上活动', '机会藏在行动里', 60],
        ['认识 2 位新朋友并保持联系', '认识之后要维护', 30],
        ['练习一次深度倾听', '会听的人更受欢迎', 30],
        ['复盘每次社交', '每次都是学习', 15],
        ['约一位朋友一对一深聊', '一对一最能拉近距离', 45],
        ['为朋友做一件小事', '关系靠细节', 15],
        ['整理自己的社交圈', '把精力给对的人', 20],
        ['制定下一步社交计划', '持续扩大舒适圈', 15]
      ]
    },

    /* ---------- 8. 爱情与情感 ---------- */
    love: {
      label: '爱情与情感',
      phases: [
        { name: '安顿自己', milestone: '理清期待与底线', from: 0, to: 2 },
        { name: '经营关系', milestone: '完成一轮真诚交流与表达', from: 3, to: 7 },
        { name: '成长沉淀', milestone: '看见模式并重建平衡', from: 8, to: 10 }
      ],
      tasks: [
        ['写下对关系的真实期待', '先搞清楚自己要什么', 20],
        ['安顿好独处的时光', '独处舒服了，关系才健康', 30],
        ['列出「绝对不要」清单', '底线要提前想清楚', 15],
        ['主动开启一次真诚交流', '关系需要经营', 30],
        ['表达一次真实需求', '需求说出来才可能被满足', 20],
        ['练习回应对方的情绪', '接住情绪比讲道理重要', 20],
        ['记录本周的相处感受', '感受需要被看见', 15],
        ['复盘关系中的模式', '看见循环才能跳出循环', 20],
        ['为自己设置关系边界', '边界是健康的保护', 15],
        ['做一件让自己开心的事', '先爱自己再爱别人', 30],
        ['写下对下一阶段关系的愿景', '带着清晰继续走', 15]
      ]
    },

    /* ---------- 9. 兴趣与爱好 ---------- */
    hobby: {
      label: '兴趣与爱好',
      phases: [
        { name: '探索确认', milestone: '确认方向并设定小目标', from: 0, to: 2 },
        { name: '坚持投入', milestone: '稳定投入两周并有产出', from: 3, to: 7 },
        { name: '开花结果', milestone: '兴趣融入生活并分享', from: 8, to: 10 }
      ],
      tasks: [
        ['体验/试玩 3 次再决定', '用体验检验兴趣', 30],
        ['确定投入的方向和资源', '避免三分钟热度', 20],
        ['设定一个小目标', '小目标容易达成，容易继续', 15],
        ['每周固定 2 次投入时间', '固定时间才能坚持', 45],
        ['完成一个小作品/成果', '产出带来成就感', 45],
        ['加入同好社群', '同好是最好的燃料', 30],
        ['记录兴趣带来的快乐时刻', '快乐是坚持的理由', 10],
        ['复盘兴趣带来的价值', '看见它的意义', 15],
        ['制定进阶计划', '让兴趣长大', 20],
        ['把兴趣变成生活的一部分', '融入日常才持久', 20],
        ['把你的{T}分享给 1 个人', '分享让快乐翻倍', 15]
      ]
    },

    /* ---------- 10. 旅行与体验 ---------- */
    travel: {
      label: '旅行与体验',
      phases: [
        { name: '规划筹备', milestone: '行程与预订全部就绪', from: 0, to: 2 },
        { name: '出发体验', milestone: '完成核心体验并记录', from: 3, to: 7 },
        { name: '回味沉淀', milestone: '把体验沉淀成回忆', from: 8, to: 10 }
      ],
      tasks: [
        ['明确目的地与时间预算', '先定框架', 30],
        ['收集攻略，做初步行程', '好行程是玩好的一半', 45],
        ['预订机票/住宿/门票', '早订更省心', 30],
        ['整理行李清单', '清单治「忘带焦虑」', 20],
        ['出发！完成核心体验', '最重要的就是出发', 60],
        ['记录旅途中的见闻', '记录让体验加倍', 20],
        ['尝试一件没做过的事', '旅行就是要突破日常', 30],
        ['整理照片/笔记，做成回忆', '把美好留存下来', 45],
        ['复盘旅程收获', '旅行改变看世界的方式', 20],
        ['写下最想分享的一段故事', '分享让体验增值', 20],
        ['规划下一次出发', '生活要有盼头', 15]
      ]
    },

    /* ---------- 11. 心灵与精神 ---------- */
    mind: {
      label: '心灵与精神',
      phases: [
        { name: '觉察现状', milestone: '开始与自己安静相处', from: 0, to: 2 },
        { name: '深入探索', milestone: '完成一轮自我探索', from: 3, to: 7 },
        { name: '沉淀整合', milestone: '把觉察变成日常', from: 8, to: 10 }
      ],
      tasks: [
        ['每天留 5 分钟安静独处', '静下来才能听见自己', 15],
        ['记录一个真实感受', '情绪被看见就松了一半', 15],
        ['觉察一个惯常模式', '看见模式是改变的开始', 20],
        ['完成一次自我探索练习（书写/对话）', '深入自己', 30],
        ['读/听一段启发内容', '外部启发点亮内部思考', 30],
        ['练习接纳不完美的部分', '接纳才有力量', 20],
        ['记录本周的觉察收获', '觉察需要沉淀', 15],
        ['写下对自己的新认识', '认识自己是终身功课', 20],
        ['把一项练习变成日常习惯', '让内在成长落地', 15],
        ['感谢一下自己', '你一直在向前走', 10],
        ['制定下一阶段的成长方向', '成长没有终点', 15]
      ]
    },

    /* ---------- 12. 生活与日常 ---------- */
    life: {
      label: '生活与日常',
      phases: [
        { name: '梳理现状', milestone: '看清现状并锁定一件事', from: 0, to: 2 },
        { name: '行动改善', milestone: '微习惯与整理同步推进', from: 3, to: 7 },
        { name: '巩固沉淀', milestone: '形成适合自己的生活节奏', from: 8, to: 10 }
      ],
      tasks: [
        ['盘点当前生活状态（记录一周）', '先看清现状', 20],
        ['找出最想改变的一件事', '一次专注一件事', 15],
        ['设定可量化的生活目标', '具体才可执行', 15],
        ['建立第一个微习惯', '小到不可能失败', 20],
        ['断舍离/整理一个区域', '空间清爽，心情清爽', 45],
        ['建立晨间/晚间固定流程', '流程省决策精力', 30],
        ['记录本周生活变化', '看见改变带来动力', 10],
        ['优化流程，适配节奏', '流程要能长期跑', 20],
        ['给自己一天「慢生活」', '生活需要留白', 30],
        ['复盘生活改善', '沉淀属于自己的方法', 20],
        ['制定下一阶段计划', '生活是慢慢变好的', 15]
      ]
    }
  };

  /* ============================================================
   * 62 个目标模板
   * fields: id / name / keywords / domain / defaultWeeks / tasks?(可选覆盖)
   * ============================================================ */
  const TEMPLATES = [
    /* ---- 1. 健康与身体（7） ---- */
    { id: 'weight-loss',  name: '减重',          keywords: ['减重','减肥','瘦身','瘦','体重','掉秤'],                     domain: 'health',  defaultWeeks: 4 },
    { id: 'muscle-gain',  name: '增肌',          keywords: ['增肌','健身','练肌肉','力量训练','举铁','塑形'],             domain: 'health',  defaultWeeks: 4 },
    { id: 'posture',      name: '改善体态',      keywords: ['体态','驼背','含胸','圆肩','骨盆前倾','体态改善'],           domain: 'health',  defaultWeeks: 3 },
    { id: 'marathon',     name: '跑马拉松',      keywords: ['马拉松','半马','跑步','跑5公里','跑10公里','慢跑','配速'],    domain: 'health',  defaultWeeks: 4 },
    { id: 'workout-habit',name: '养成运动习惯',  keywords: ['运动习惯','坚持运动','每周运动','锻炼习惯','健身习惯'],       domain: 'health',  defaultWeeks: 3 },
    { id: 'sugar-control',name: '控糖',          keywords: ['控糖','戒糖','血糖','甜食','抗糖','少糖'],                   domain: 'health',  defaultWeeks: 3 },
    { id: 'sleep',        name: '改善睡眠',      keywords: ['睡眠','早睡','失眠','作息','晚睡','熬夜','入睡'],             domain: 'health',  defaultWeeks: 3 },

    /* ---- 2. 学业与考试（6） ---- */
    { id: 'kaoyan',       name: '考研备考',      keywords: ['考研','研究生','备考','研考','初试','复试'],                 domain: 'study',   defaultWeeks: 4 },
    { id: 'gongkao',      name: '考公',          keywords: ['考公','公务员','国考','省考','事业单位','行测','申论'],      domain: 'study',   defaultWeeks: 4 },
    { id: 'study-abroad', name: '留学申请',      keywords: ['留学','出国读书','申请学校','offer','院校申请','文书'],       domain: 'study',   defaultWeeks: 4 },
    { id: 'english-exam', name: '通过英语考试',  keywords: ['英语','四六级','六级','四级','雅思','托福','专八','英语考试'], domain: 'study',   defaultWeeks: 3 },
    { id: 'thesis',       name: '完成毕业论文',  keywords: ['论文','毕业论文','开题','毕业设计','答辩','文献'],             domain: 'study',   defaultWeeks: 4 },
    { id: 'scholarship',  name: '拿奖学金',      keywords: ['奖学金','绩点','成绩','保研','评优','GPA'],                   domain: 'study',   defaultWeeks: 4 },

    /* ---- 3. 职业与发展（6） ---- */
    { id: 'job-hunt',     name: '求职面试',      keywords: ['求职','面试','找工作','投简历','offer','应聘'],               domain: 'career',  defaultWeeks: 3 },
    { id: 'raise',        name: '升职加薪',      keywords: ['升职','加薪','晋升','涨薪','职级','述职'],                   domain: 'career',  defaultWeeks: 4 },
    { id: 'career-switch',name: '转行',          keywords: ['转行','换行业','换赛道','跨界','跨行'],                       domain: 'career',  defaultWeeks: 4 },
    { id: 'startup',      name: '创业',          keywords: ['创业','开店','开公司','副业创业','项目启动','商业模式'],     domain: 'career',  defaultWeeks: 4 },
    { id: 'cert',         name: '考取职业证书',  keywords: ['证书','资格证','CPA','PMP','考证','职业资格','执照'],        domain: 'career',  defaultWeeks: 4 },
    { id: 'manager',      name: '晋升管理岗',    keywords: ['管理岗','带团队','主管','经理','管理能力','领导力'],         domain: 'career',  defaultWeeks: 4 },

    /* ---- 4. 财务与理财（6） ---- */
    { id: 'saving',       name: '强制储蓄',      keywords: ['储蓄','存钱','攒钱','存款','攒钱计划','存钱计划'],           domain: 'finance', defaultWeeks: 4 },
    { id: 'invest',       name: '开始投资',      keywords: ['投资','基金','股票','理财','定投','指数'],                   domain: 'finance', defaultWeeks: 4 },
    { id: 'house',        name: '买房',          keywords: ['买房','购房','首付','看房','房贷'],                           domain: 'finance', defaultWeeks: 4 },
    { id: 'debt-free',    name: '还清债务',      keywords: ['还债','债务','欠款','负债','分期','清债'],                   domain: 'finance', defaultWeeks: 4 },
    { id: 'emergency-fund',name: '建立应急金',   keywords: ['应急金','备用金','紧急基金','生活费储备','现金流'],           domain: 'finance', defaultWeeks: 3 },
    { id: 'financial-free',name: '财务自由',     keywords: ['财务自由','被动收入','退休计划','财富自由','睡后收入'],      domain: 'finance', defaultWeeks: 4 },

    /* ---- 5. 学习与技能（8） ---- */
    { id: 'new-language', name: '学新语言',      keywords: ['学语言','学英语','学日语','学韩语','学法语','学西班牙语','学德语','学粤语','背单词'], domain: 'skill', defaultWeeks: 4 },
    { id: 'coding',       name: '学编程',        keywords: ['编程','代码','程序','前端','后端','Python','JavaScript','写代码','开发'],             domain: 'skill', defaultWeeks: 4 },
    { id: 'instrument',   name: '学乐器',        keywords: ['乐器','吉他','钢琴','尤克里里','小提琴','架子鼓','学琴'],    domain: 'skill', defaultWeeks: 4 },
    { id: 'photography',  name: '学摄影',        keywords: ['摄影','拍照','相机','手机摄影','构图'],                       domain: 'skill', defaultWeeks: 3 },
    { id: 'painting',     name: '学画画',        keywords: ['画画','绘画','素描','水彩','板绘','插画','手绘'],            domain: 'skill', defaultWeeks: 3 },
    { id: 'cooking',      name: '学烹饪',        keywords: ['烹饪','做饭','做菜','烘焙','厨艺','学做菜'],                 domain: 'skill', defaultWeeks: 3 },
    { id: 'writing',      name: '学写作',        keywords: ['写作','写文章','写小说','文案','新媒体写作','写作能力','公众号','自媒体'], domain: 'skill', defaultWeeks: 2,
      tasks: [
        ['确定文章选题，用一句话概括核心观点', '没有明确选题，写的时候容易散', 30],
        ['搜索3篇参考文章，通读后记录框架和亮点', '先摸清同行的表达方式，写的时候心里有底', 45],
        ['收集素材/数据/案例，存入素材库', '素材够多，写的时候才不会卡壳', 30],
        ['列出文章大纲', '大纲定下来，文章就完成了30%', 30],
        ['完成最难的部分', '把最难的部分先写掉，后面会顺很多', 45],
        ['完成第二个部分', '一鼓作气，保持节奏', 45],
        ['完成第三个部分', '接近完成，别停', 45],
        ['整合全文，完成初稿', '不求完美，先写出完整版本', 60],
        ['修改润色，优化表达和逻辑', '好文章是改出来的', 45],
        ['排版（配图、标题、摘要）', '排版好了，读者才愿意看', 45],
        ['发布并转发到朋友圈/社群', '发出去，让内容被看见', 20],
        ['复盘本次写作（哪里顺/哪里卡）', '复盘是为了下次写得更顺', 20]
      ] },
    { id: 'video-edit',   name: '学剪辑做视频',  keywords: ['剪辑','剪视频','做视频','视频制作','Pr','剪辑软件','短视频'], domain: 'skill', defaultWeeks: 3 },

    /* ---- 6. 家庭与亲情（5） ---- */
    { id: 'parents',      name: '改善与父母关系', keywords: ['父母','爸妈','家人关系','家庭关系','孝顺','和父母'],         domain: 'family', defaultWeeks: 3 },
    { id: 'family-time',  name: '陪伴家人',      keywords: ['陪伴','陪家人','家庭时光','陪爸妈','陪孩子','多陪'],         domain: 'family', defaultWeeks: 3 },
    { id: 'family-trad',  name: '建立家庭传统',  keywords: ['家庭传统','家规','家庭仪式','家庭日','家族传统'],             domain: 'family', defaultWeeks: 3 },
    { id: 'move',         name: '搬家安顿',      keywords: ['搬家','安顿','新家','入住','搬进去'],                         domain: 'family', defaultWeeks: 3 },
    { id: 'renovation',   name: '装修',          keywords: ['装修','装潢','家装','软装','硬装','改造家'],                 domain: 'family', defaultWeeks: 4 },

    /* ---- 7. 社交与人际（4） ---- */
    { id: 'network',      name: '拓展社交圈',    keywords: ['社交','人脉','认识新朋友','拓展圈子','社交圈','混圈子'],     domain: 'social', defaultWeeks: 3 },
    { id: 'communication',name: '改善沟通能力',  keywords: ['沟通','说话','表达','倾听','沟通技巧','不会说话'],           domain: 'social', defaultWeeks: 3 },
    { id: 'deep-friends', name: '建立深度友谊',  keywords: ['友谊','好朋友','挚友','交心','深交'],                         domain: 'social', defaultWeeks: 3 },
    { id: 'social-anx',   name: '克服社交焦虑',  keywords: ['社交焦虑','社恐','怕社交','当众说话','不敢发言'],            domain: 'social', defaultWeeks: 3 },

    /* ---- 8. 爱情与情感（4） ---- */
    { id: 'find-partner', name: '找到伴侣',      keywords: ['找对象','脱单','相亲','伴侣','恋爱','找男朋友','找女朋友'],  domain: 'love', defaultWeeks: 4 },
    { id: 'relationship', name: '经营亲密关系',  keywords: ['亲密关系','情侣','恋爱关系','夫妻','感情经营','相处'],       domain: 'love', defaultWeeks: 3 },
    { id: 'breakup-heal', name: '走出失恋',      keywords: ['失恋','分手','放下','前任','情伤','走出来'],                 domain: 'love', defaultWeeks: 3 },
    { id: 'attachment',   name: '建立健康依恋',  keywords: ['依恋','安全感','爱自己','依赖','自我价值'],                 domain: 'love', defaultWeeks: 3 },

    /* ---- 9. 兴趣与爱好（3） ---- */
    { id: 'develop-hobby',name: '发展一个爱好',  keywords: ['爱好','兴趣','培养兴趣','发展爱好','新爱好'],               domain: 'hobby', defaultWeeks: 3 },
    { id: 'stick-hobby',  name: '坚持一项兴趣',  keywords: ['坚持兴趣','坚持爱好','长期爱好','一直喜欢'],                domain: 'hobby', defaultWeeks: 4 },
    { id: 'hobby-side',   name: '把爱好变成副业',keywords: ['副业','爱好变现','兴趣变现','做副业','第二收入'],           domain: 'hobby', defaultWeeks: 4 },

    /* ---- 10. 旅行与体验（4） ---- */
    { id: 'domestic-trip',name: '国内旅行',      keywords: ['国内旅行','周边游','国内游','自驾游','旅游计划','出去玩'],   domain: 'travel', defaultWeeks: 3 },
    { id: 'abroad-trip',  name: '出国旅行',      keywords: ['出国','境外','国外','出国游','签证','出境游'],               domain: 'travel', defaultWeeks: 4 },
    { id: 'bucket-list',  name: '体验清单',      keywords: ['跳伞','极光','蹦极','潜水','愿望清单','体验清单','打卡'],     domain: 'travel', defaultWeeks: 3 },
    { id: 'slow-travel',  name: '深度旅居',      keywords: ['旅居','深度游','数字游民','长住','慢旅行'],                  domain: 'travel', defaultWeeks: 4 },

    /* ---- 11. 心灵与精神（5） ---- */
    { id: 'self-know',    name: '自我认知',      keywords: ['自我认知','认识自己','自我探索','人生课题','了解自己'],      domain: 'mind', defaultWeeks: 3 },
    { id: 'meditation',   name: '冥想练习',      keywords: ['冥想','正念','打坐','呼吸练习','禅修'],                      domain: 'mind', defaultWeeks: 3 },
    { id: 'journaling',   name: '写日记',        keywords: ['日记','记录','手账','写作疗愈','每天记录'],                  domain: 'mind', defaultWeeks: 3 },
    { id: 'life-meaning', name: '找到人生意义',  keywords: ['人生意义','使命','价值观','活着的意义','人生方向'],          domain: 'mind', defaultWeeks: 4 },
    { id: 'self-accept',  name: '接纳自己',      keywords: ['接纳自己','自爱','自卑','自我接纳','自我价值','不自信'],     domain: 'mind', defaultWeeks: 3 },

    /* ---- 12. 生活与日常（4） ---- */
    { id: 'ideal-home',   name: '打造理想的家',  keywords: ['理想的家','家居','布置','改造','温馨的家','家装风格'],       domain: 'life', defaultWeeks: 4 },
    { id: 'minimalism',   name: '极简整理',      keywords: ['极简','整理','断舍离','收纳','清理','扔东西'],              domain: 'life', defaultWeeks: 2 },
    { id: 'routine',      name: '建立作息习惯',  keywords: ['晨间','晚间','routine','作息','习惯','早睡早起','打卡'],    domain: 'life', defaultWeeks: 2 },
    { id: 'self-care',    name: '学会自我照顾',  keywords: ['自我照顾','照顾自己','独处','放松','爱自己','休息'],        domain: 'life', defaultWeeks: 3 },
    /* ---- 增补：更多细分可能性 ---- */
    { id: 'teacher-cert', name: '考教师资格证', keywords: ['教资','教师资格','教师证','教资笔试','教资面试'], domain: 'study', defaultWeeks: 4 },
    { id: 'learn-car',    name: '学车考驾照',   keywords: ['学车','驾照','考驾照','练车','科目二','科目三'], domain: 'life', defaultWeeks: 3 },
    { id: 'diet-plan',    name: '规划减脂餐',   keywords: ['减脂餐','健康饮食','减脂','吃瘦','饮食计划','轻食'], domain: 'health', defaultWeeks: 3 },
    { id: 'mindful-eat',  name: '正念饮食',     keywords: ['正念饮食','不暴食','情绪性进食','好好吃饭','饮食觉察'], domain: 'mind', defaultWeeks: 3 },
    { id: 'nomad',        name: '成为数字游民', keywords: ['数字游民','远程工作','location independent','旅居办公','线上收入'], domain: 'career', defaultWeeks: 4 },
    { id: 'civil-servant-prep', name: '考编',   keywords: ['考编','事业编','教师编','国企','编制'], domain: 'study', defaultWeeks: 4 },
    { id: 'podcast',      name: '做播客',       keywords: ['播客','podcast','音频','电台','声音节目'], domain: 'skill', defaultWeeks: 3 },
    { id: 'home-workout', name: '居家健身',     keywords: ['居家健身','在家锻炼','无器械','跟练','居家运动'], domain: 'health', defaultWeeks: 3 },
    { id: 'parenting',    name: '科学育儿',     keywords: ['育儿','带娃','亲子','宝宝','孩子教育','科学育儿'], domain: 'family', defaultWeeks: 4 },
    { id: 'pet-care',     name: '养好宠物',     keywords: ['养猫','养狗','宠物','毛孩子','宠物健康'], domain: 'life', defaultWeeks: 3 },
    { id: 'gardening',    name: '阳台园艺',     keywords: ['园艺','种花','养绿植','阳台菜园','种菜','绿植'], domain: 'life', defaultWeeks: 3 },
    { id: 'minimal-wardrobe', name: '极简穿搭', keywords: ['极简穿搭','胶囊衣橱','断舍离衣服','衣橱整理','少买衣服'], domain: 'life', defaultWeeks: 2 },
    { id: 'bullet-journal', name: '玩转手帐',   keywords: ['手帐','bullet journal','拼贴','日程本','记录美化'], domain: 'skill', defaultWeeks: 2 },
    { id: 'read-more',    name: '养成阅读习惯', keywords: ['读书','阅读','看书','每年读','共读','读纸质书'], domain: 'skill', defaultWeeks: 3 },
    { id: 'side-writing', name: '自媒体写作',   keywords: ['自媒体','公众号','小红书','内容创作','博主','涨粉'], domain: 'skill', defaultWeeks: 3 },
    { id: 'gratitude',    name: '练习感恩',     keywords: ['感恩','感谢日记','幸福感','积极心理','三件好事'], domain: 'mind', defaultWeeks: 3 },
    { id: 'public-speak', name: '提升表达力',   keywords: ['公众演讲','演讲','表达力','汇报','presentation','口才'], domain: 'social', defaultWeeks: 3 },
    { id: 'save-emergency', name: '攒第一桶金', keywords: ['第一桶金','攒第一万','启动资金','存第一笔','小目标储蓄'], domain: 'finance', defaultWeeks: 4 },
    { id: 'debt-plan',    name: '理性消费',     keywords: ['理性消费','不乱买','消费观','剁手','冲动消费'], domain: 'finance', defaultWeeks: 3 },
    { id: 'language-hsk', name: '汉语水平考试', keywords: ['hsk','汉语','普通话','二甲','普通话考试'], domain: 'study', defaultWeeks: 3 },
    { id: 'draw-manga',   name: '画漫画',       keywords: ['漫画','画漫画','分镜','人设','二次元','条漫'], domain: 'skill', defaultWeeks: 4 },
    { id: 'bake',         name: '精进烘焙',     keywords: ['烘焙','面包','蛋糕','做面包','烤箱','甜点'], domain: 'skill', defaultWeeks: 3 },
    { id: 'travel-japan', name: '日本自由行',   keywords: ['日本','东京','大阪','日本旅行','赴日','霓虹'], domain: 'travel', defaultWeeks: 3 },
    { id: 'volunteer',    name: '做志愿者',     keywords: ['志愿','公益','义工','做义工','志愿活动','助人'], domain: 'social', defaultWeeks: 3 },
    { id: 'inner-peace',  name: '内心安定',     keywords: ['内心平静','焦虑缓解','安定','不内耗','情绪稳定'], domain: 'mind', defaultWeeks: 3 }
  ];

  /* ================= 关键词匹配 =================
   * 命中关键词越多/越长分数越高，返回最佳模板
   */
  function match(input) {
    const s = String(input || '').replace(/[，。！？、,.!?；;：:\s]/g, '');
    let best = null, bestScore = 0;
    TEMPLATES.forEach(t => {
      let score = 0;
      t.keywords.forEach(kw => {
        if (!s) return;
        if (s.includes(kw)) {
          score += Math.min(kw.length * 2, 8);
          if (s === kw || s.startsWith(kw) || s.endsWith(kw)) score += 4;
        }
      });
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return best; // 无命中返回 null，由调用方兜底为通用拆解
  }

  /* 通用兜底模板：用领域骨架中最接近的领域 */
  const FALLBACK_KEYWORDS = [
    ['健康','身体','减','瘦','运动','睡','吃'], 'health',
    ['学习','学','考试','考研','课','书'], 'skill',
    ['工作','职业','面试','职','业'], 'career',
    ['钱','理财','财务','存','投资'], 'finance'
  ];
  function fallbackDomain(input) {
    for (let i = 0; i < FALLBACK_KEYWORDS.length; i += 2) {
      if (FALLBACK_KEYWORDS[i].some(k => input.includes(k))) return FALLBACK_KEYWORDS[i + 1];
    }
    return 'life';
  }

  /* ============================================================
   * 周期适配算法
   *  - 总任务量 N 固定，总天数 D = 用户周期
   *  - 自由日：每 freeDayInterval 天 1 天（day % 7 === 0）
   *  - 每天任务数 = ceil(N / 可用天数)，且不超过人格上限
   * ============================================================ */
  function decompose(input, opts = {}) {
    const cycle = opts.cycleDays ? CYCLES.find(c => c.days === opts.cycleDays) : null;
    const D = opts.cycleDays || 14;
    const lifeStage = LIFE_STAGES[opts.lifeStage] || LIFE_STAGES.starter;
    const diff = DIFFICULTIES[opts.difficulty] || DIFFICULTIES.medium;
    const tpl = opts.template || match(input);

    const domain = tpl ? DOMAINS[tpl.domain] : DOMAINS[fallbackDomain(input)];
    const T = tpl ? tpl.name : (input.length <= 6 ? input : '这件事');
    const taskDefs = (tpl && tpl.tasks) || domain.tasks;

    /* 任务实例（替换占位符 + 难度缩放时长） */
    const tasks = taskDefs.map(([text, why, estMin], idx) => ({
      idx,
      text: String(text).replace(/\{T\}/g, T).replace(/\{G\}/g, input),
      why: String(why || ''),
      estMin: Math.round((estMin || 25) * diff.factor)
    }));

    const N = tasks.length;

    /* 自由日：每 freeDayInterval 天休息一天 */
    const freeInterval = lifeStage.freeDayInterval || 7;
    const freeDays = new Set();
    for (let d = freeInterval; d <= D; d += freeInterval) freeDays.add(d);
    const workDays = Math.max(D - freeDays.size, 1);

    /* 每天配额：ceil(N / workDays)，不超过人格上限 */
    const maxDaily = lifeStage.maxDailyTasks || 3;
    const quota = Math.max(1, Math.min(Math.ceil(N / workDays), maxDaily));

    /* 顺序分配任务到非自由日 */
    const dayOfTask = {};      // taskIdx -> day
    const tasksOfDay = {};     // day -> [taskIdx]
    let ti = 0;
    for (let d = 1; d <= D && ti < N; d++) {
      if (freeDays.has(d)) continue;
      for (let k = 0; k < quota && ti < N; k++) {
        dayOfTask[ti] = d;
        (tasksOfDay[d] = tasksOfDay[d] || []).push(ti);
        ti++;
      }
    }
    /* 若还有剩余任务（理论不会发生，防御性铺满剩余天） */
    if (ti < N) {
      for (let d = 1; d <= D && ti < N; d++) {
        if (freeDays.has(d)) continue;
        (tasksOfDay[d] = tasksOfDay[d] || []).push(ti);
        dayOfTask[ti] = d;
        ti++;
      }
    }

    /* 三大阶段：按领域 phases 的 from/to 切分任务（最后一阶段吸收剩余任务） */
    const phaseEnd = (pi) => (pi === (domain.phases || []).length - 1 ? N - 1 : (domain.phases || [])[pi].to);
    const phases = (domain.phases || []).map((p, pi) => {
      const idxs = [];
      for (let i = p.from; i <= phaseEnd(pi) && i < N; i++) idxs.push(i);
      const pt = idxs.map(i => tasks[i]);
      const days = idxs.map(i => dayOfTask[i]).filter(d => d !== undefined);
      const minD = days.length ? Math.min.apply(null, days) : 1;
      const maxD = days.length ? Math.max.apply(null, days) : 1;
      return {
        idx: pi,
        name: p.name.replace(/\{T\}/g, T),
        milestone: String(p.milestone || '').replace(/\{T\}/g, T),
        duration: `Day ${minD}-${maxD}`,
        tasks: pt.map((t, i) => ({ ...t, day: days[i] || minD }))
      };
    });

    /* 每件任务所属阶段索引 */
    const phaseOfTask = new Array(N).fill(0);
    (domain.phases || []).forEach((p, pi) => { for (let i = p.from; i <= phaseEnd(pi) && i < N; i++) phaseOfTask[i] = pi; });

    /* 每日任务总览（供确认后写入 store） */
    const daily = [];
    for (let d = 1; d <= D; d++) {
      const list = (tasksOfDay[d] || []).map(i => ({
        text: tasks[i].text, why: tasks[i].why, estMin: tasks[i].estMin, day: d, phase: phaseOfTask[i]
      }));
      if (list.length) daily.push({ day: d, freeDay: false, tasks: list });
      else daily.push({ day: d, freeDay: freeDays.has(d), tasks: [] });
    }

    const lastTaskDay = Math.max.apply(null, Object.keys(dayOfTask).map(k => dayOfTask[k]));
    const avgMin = Math.round(tasks.reduce((s, t) => s + t.estMin, 0) / Math.max(N, 1));

    return {
      title: input.trim(),
      template: tpl ? { id: tpl.id, name: tpl.name, domain: tpl.domain } : null,
      domain: domain.label,
      lifeStage: lifeStage.id,
      cycleDays: D,
      cycleLabel: cycle ? cycle.label : `${D}天`,
      difficulty: diff.id,
      difficultyName: diff.name,
      maxDailyTasks: maxDaily,
      quota,
      totalTasks: N,
      freeDays: [...freeDays],
      freeDayInterval: freeInterval,
      dayOfTask, tasksOfDay,
      phases,
      daily,
      avgMin,
      finishDay: lastTaskDay || D,
      /* 天秤座适配：每日提示 */
      libra: {
        dailyPrompt: '今天从以下选 1-2 件完成：',
        freeDayMessage: '今天没有安排，可以补进度或者休息。',
        allowFlexibility: true
      }
    };
  }

  /* 模板按 id 查找 */
  function byId(id) { return TEMPLATES.find(t => t.id === id) || null; }

  return { LIFE_STAGES, CYCLES, DIFFICULTIES, DOMAINS, TEMPLATES, match, decompose, byId };
})();

if (typeof window !== 'undefined') window.GoalKB = GoalKB;
