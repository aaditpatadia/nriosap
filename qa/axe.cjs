const { chromium } = require('playwright');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = 'http://localhost:3100';
const pages = ['/', '/family/shah', '/family/shah/approvals', '/family/shah/claims', '/family/shah/documents', '/family/shah/calendar', '/family/shah/report', '/family/shah/billing', '/onboarding', '/chat/shah', '/ops', '/ops/families', '/ops/task/t1'];
(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.evaluate(axeSrc);
      const res = await page.evaluate(async () => await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
      for (const v of res.violations) {
        total++;
        console.log(`${scheme} ${p} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(' ')}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log('TOTAL violations:', total);
})();
