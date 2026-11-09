const { chromium } = require('playwright');
const base = 'http://localhost:3100';
const pages = [
  ['home', '/'],
  ['overview', '/family/shah'],
  ['approvals', '/family/shah/approvals'],
  ['claims', '/family/shah/claims'],
  ['documents', '/family/shah/documents'],
  ['calendar', '/family/shah/calendar'],
  ['report', '/family/shah/report'],
  ['billing', '/family/shah/billing'],
  ['onboarding', '/onboarding'],
  ['chat', '/chat/shah'],
  ['ops', '/ops'],
  ['hours', '/ops/families'],
  ['task', '/ops/task/t1'],
];
(async () => {
  const browser = await chromium.launch();
  const widths = [375, 768, 1440];
  const errors = [];
  for (const scheme of ['light', 'dark']) {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 800 : 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(`${scheme} ${w} pageerror ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${scheme} ${w} console ${m.text()}`); });
      for (const [name, path] of pages) {
        await page.goto(base + path, { waitUntil: 'networkidle' });
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) errors.push(`HORIZONTAL OVERFLOW ${scheme} ${w} ${name}`);
        await page.screenshot({ path: `shots/${name}-${w}-${scheme}.png`, fullPage: w === 375 && scheme === 'light' });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no errors, no overflow');
})();
