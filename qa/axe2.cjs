const { chromium } = require('playwright');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  for (const u of ['/family/shah', '/ops/task/t1']) {
    await p.goto('http://localhost:3100' + u, { waitUntil: 'networkidle' }); await p.evaluate(axeSrc);
    const r = await p.evaluate(async () => await axe.run(document, { runOnly: ['wcag22aa'] }));
    for (const v of r.violations) for (const n of v.nodes) console.log(u, v.id, n.target.join(' '), '|', n.failureSummary.split('\n').slice(0,3).join(' '), '|', n.html.slice(0,90));
  }
  await b.close();
})();
