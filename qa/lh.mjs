import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
const chrome = await chromeLauncher.launch({ chromePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', chromeFlags: ['--headless=new', '--no-sandbox'] });
const urls = ['/', '/family/shah', '/family/shah/approvals', '/ops/families'];
for (const u of urls) {
  const r = await lighthouse('http://localhost:3100' + u, { port: chrome.port, onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], formFactor: 'mobile', logLevel: 'error' });
  const c = r.lhr.categories, a = r.lhr.audits;
  console.log(u, 'perf', Math.round(c.performance.score * 100), 'a11y', Math.round(c.accessibility.score * 100), 'bp', Math.round(c['best-practices'].score * 100), 'seo', Math.round(c.seo.score * 100),
    '| LCP', a['largest-contentful-paint'].displayValue, 'CLS', a['cumulative-layout-shift'].displayValue, 'TBT', a['total-blocking-time'].displayValue, 'FCP', a['first-contentful-paint'].displayValue, 'JS', Math.round((a['total-byte-weight'].numericValue)/1024) + 'KB total');
}
await chrome.kill();
