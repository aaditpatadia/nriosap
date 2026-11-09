const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto('http://localhost:3100/ops/task/t1', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => [...document.querySelectorAll('button.btn, a.btn, nav a')].map(e => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.textContent.trim().slice(0,20)} ${Math.round(b.width)}x${Math.round(b.height)} minH=${cs.minHeight} disp=${cs.display}`; }));
  console.log(r.join('\n'));
  await b.close();
})();
