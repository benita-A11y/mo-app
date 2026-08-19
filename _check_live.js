(async () => {
  const r = await fetch('https://benita-A11y.github.io/reliang-shouzhang/js/pages4.js');
  const b = await r.text();
  console.log('pages4 status', r.status);
  console.log('has nutri:bill:', b.includes('nutri:bill'));
  console.log('has 蛋白缺口:', b.includes('蛋白缺口'));
  console.log('has 碳水剩余:', b.includes('碳水剩余'));
  console.log('has renderRecoCard:', b.includes('renderRecoCard'));
  console.log('has buildNutriPool:', b.includes('buildNutriPool'));
  console.log('has highFreqCombo:', b.includes('highFreqCombo'));
  console.log('cache-control:', r.headers.get('cache-control'), '| age:', r.headers.get('age'));
  const s = await fetch('https://benita-A11y.github.io/reliang-shouzhang/sw.js');
  console.log('sw status', s.status, 'v7:', (await s.text()).includes('reliang-v7'));
  const a = await fetch('https://benita-A11y.github.io/reliang-shouzhang/js/ai.js');
  const ab = await a.text();
  console.log('ai status', a.status, 'normFix:', ab.includes('replace(/的/g'));
  console.log('ai 想吃肉优化:', ab.includes('isSweetDrink'));
})();
