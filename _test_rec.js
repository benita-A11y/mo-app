const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('d:/热量/js/ai.js', 'utf8'), ctx);

const recommendNextMeal = (m, a, p, pool, slot, taste) => vm.runInContext('recommendNextMeal', ctx)(m, a, p, pool, slot, taste);
const FALLBACK = vm.runInContext('FALLBACK_POOL', ctx);

// mock analysis
const analysis = { remaining: 600, target: 1800, over: false, proteinNeed: 25, carbsNeed: 40, stats: { kcal: 1200 } };

// mock pool: user foods (recipes), platform items (with flavor + _src), fallback
const pool = [
  { name: '黑椒牛肉饭', kcal: 520, price: 22, flavor: '咸香', macros: { protein: 30, carbs: 55, fat: 14 }, _src: 'user' },
  { name: '水煮鸡胸肉', kcal: 300, price: 15, flavor: '清淡', macros: { protein: 35, carbs: 0, fat: 5 }, _src: 'user' },
  { name: '蛋炒饭', kcal: 480, price: 12, flavor: '咸香', macros: { protein: 14, carbs: 55, fat: 16 }, _src: 'user' },
  { name: '麻辣香锅', kcal: 680, price: 28, flavor: '辣', macros: { protein: 25, carbs: 30, fat: 40 }, _src: 'platform', _i: 0 },
  { name: '生椰拿铁', kcal: 190, price: 18, flavor: '甜口', macros: { protein: 3, carbs: 24, fat: 9 }, _src: 'platform', _i: 1 },
  { name: '番茄鸡蛋面', kcal: 420, price: 16, flavor: '清淡', macros: { protein: 16, carbs: 55, fat: 12 }, _src: 'platform', _i: 2 },
];

function show(label, rec) {
  console.log('\n== ' + label + ' | strategy=' + rec.strategy + ' | items=' + rec.items.length);
  rec.items.forEach((i) => console.log('  - ' + i.name + ' [' + i.flavor + '] ' + i.kcal + 'kcal src=' + (i._src || 'fallback') + ' | ' + (i.reason || '').slice(0, 40)));
}

// 1) 无口味（随便）→ 通用推荐
show('随便（无选择）', recommendNextMeal('lunch', analysis, { flavor: [], ingredient: [] }, pool, 'lunch0', { flavor: [], ingredient: [] }));
// 2) 想吃肉
show('想吃肉', recommendNextMeal('lunch', analysis, { flavor: [], ingredient: [] }, pool, 'lunch0', { flavor: [], ingredient: ['想吃肉'] }));
// 3) 清淡的 + 想吃蛋/豆腐
show('清淡+蛋豆腐', recommendNextMeal('lunch', analysis, { flavor: [], ingredient: [] }, pool, 'lunch0', { flavor: ['清淡的'], ingredient: ['想吃蛋/豆腐'] }));
// 4) 辣的
show('辣的', recommendNextMeal('lunch', analysis, { flavor: [], ingredient: [] }, pool, 'lunch0', { flavor: ['辣的'], ingredient: [] }));
// 5) 冲突：清淡的 vs 麻辣香锅 → 香锅应被排除
show('清淡的（应排除麻辣香锅）', recommendNextMeal('lunch', analysis, { flavor: [], ingredient: [] }, pool, 'lunch0', { flavor: ['清淡的'], ingredient: [] }));
// 6) 严格过滤无结果 → 放宽（比如只吃蛋/豆腐但池中无匹配 → 空）
const pool2 = pool.filter((x) => !x.name.includes('蛋'));
show('蛋豆腐-无匹配(应空)', recommendNextMeal('lunch', analysis, { flavor: [], ingredient: [] }, pool2, 'lunch0', { flavor: [], ingredient: ['想吃蛋/豆腐'] }));
// 7) snack 过滤 >250
show('snack(应≤250)', recommendNextMeal('snack', analysis, { flavor: [], ingredient: [] }, pool, 'snack1', { flavor: ['甜口的'], ingredient: [] }));
// 8) 仅历史偏好（无本次选择）
show('历史偏好(清淡)', recommendNextMeal('dinner', analysis, { flavor: ['清淡的'], ingredient: [] }, pool, 'dinner0', { flavor: [], ingredient: [] }));
console.log('\nFALLBACK_POOL keys: ' + Object.keys(FALLBACK).join(','));
console.log('ALL TESTS DONE');
