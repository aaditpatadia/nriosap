import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
const chrome = await chromeLauncher.launch({ chromePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', chromeFlags: ['--headless=new', '--no-sandbox'] });
const r = await lighthouse('http://localhost:3100/', { port: chrome.port, onlyCategories: ['best-practices'], formFactor: 'mobile', logLevel: 'error' });
for (const [k, a] of Object.entries(r.lhr.audits)) if (a.score !== null && a.score < 1 && r.lhr.categories['best-practices'].auditRefs.find(x => x.id === k)) console.log(k, a.score, a.title, JSON.stringify(a.details?.items?.slice(0,2) ?? '').slice(0,200));
await chrome.kill();
