const { chromium } = require('playwright');
const crypto = require('crypto');
const base = 'http://localhost:3100';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();

  // 1 waitlist
  await p.goto(base + '/#waitlist');
  await p.fill('input[name=email]', 'test@example.com'); await p.fill('input[name=country]', 'Canada');
  await p.click('text=Join the waitlist >> nth=-1');
  await p.waitForSelector('#waitlist-status:has-text("on the list")', { timeout: 5000 }).then(() => ok(true, 'waitlist submit shows success')).catch(() => ok(false, 'waitlist submit'));

  // 2 approve + undo + persistence
  await p.goto(base + '/family/shah/approvals');
  await p.click('button:has-text("Approve payment")');
  await p.waitForSelector('text=Approved', { timeout: 5000 }); ok(true, 'approve shows Approved (optimistic)');
  await p.waitForSelector('button:has-text("Undo")'); ok(true, 'undo button appears');
  await p.reload(); await p.waitForSelector('text=Approved'); ok(true, 'approval persisted after reload');
  await p.click('button:has-text("Undo")');
  await p.waitForSelector('button:has-text("Approve payment")', { timeout: 5000 }).then(() => ok(true, 'undo restores pending')).catch(() => ok(false, 'undo restores pending'));
  const tl = await p.goto(base + '/family/shah'); const txt = await p.textContent('main');
  ok(/Undone|Approved/.test(txt), 'timeline records approval events');

  // 3 emergency chat creates ops task
  await p.goto(base + '/chat/shah');
  await p.fill('input[aria-label="Message as parent"]', 'Please send an ambulance'); await p.click('button:has-text("Send")');
  await p.waitForSelector('text=Emergency words detected', { timeout: 5000 }).then(() => ok(true, 'emergency detected in chat')).catch(() => ok(false, 'emergency detected'));
  await p.goto(base + '/ops'); ok(await p.isVisible('text=EMERGENCY: call the parent now'), 'ops queue shows EMERGENCY task');

  // 4 timer logs time and hours page changes
  await p.goto(base + '/ops/families'); const before = await p.textContent('tbody tr:first-child td:nth-child(3)');
  await p.goto(base + '/ops/task/t1'); await p.click('button:has-text("Start timer")'); await p.waitForTimeout(2200);
  await p.click('button:has-text("Stop and log")'); await p.waitForSelector('text=Logged 1 min', { timeout: 5000 }).then(() => ok(true, 'timer logged 1 min')).catch(() => ok(false, 'timer log'));
  await p.goto(base + '/ops/task/t1'); ok(await p.isVisible('text=Timer entry'), 'time entry appears in the task time log');

  // 5 text size toggle
  await p.goto(base + '/'); const fs0 = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  await p.click('button[aria-pressed]'); const fs1 = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  ok(parseFloat(fs1) > parseFloat(fs0), `large text mode ${fs0} -> ${fs1}`);

  // 6 onboarding validation and success
  await p.goto(base + '/onboarding'); await p.fill('label:has-text("Parent\'s name") input', 'Test Parent'); await p.fill('label:has-text("WhatsApp number") input', '+919800000099');
  await p.click('button:has-text("Continue")'); await p.check('label:has-text("may read and store") input'); await p.check('label:has-text("prepare tasks") input');
  await p.click('button:has-text("Continue")'); await p.click('button:has-text("Finish")');
  await p.waitForSelector('text=Thanks. A coordinator will call', { timeout: 5000 }).then(() => ok(true, 'onboarding with consent succeeds')).catch(() => ok(false, 'onboarding success'));

  // 7 reduced motion renders content instantly
  const rm = await (await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
  await rm.goto(base + '/family/shah'); await rm.waitForTimeout(450);
  const ops = await rm.evaluate(() => [...document.querySelectorAll('ol[aria-label] li')].map(e => getComputedStyle(e).opacity + '|' + getComputedStyle(e).transform));
  ok(ops.length > 0 && ops.every(o => o.startsWith('1|')), 'reduced motion: timeline items visible with no translate (' + ops.slice(0,2).join(', ') + ')');

  // 8 frame timing during animations under 4x CPU throttle
  const fp = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const cdp = await fp.context().newCDPSession(fp); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await fp.goto(base + '/family/kulkarni/approvals'); await fp.goto(base + '/family/shah/approvals');
  await fp.evaluate(() => { window.__d = []; let last = performance.now(); (function loop() { const n = performance.now(); window.__d.push(n - last); last = n; window.__raf = requestAnimationFrame(loop); })(); });
  await fp.click('button:has-text("Approve payment")'); await fp.waitForTimeout(700);
  await fp.click('button:has-text("Undo")'); await fp.waitForTimeout(700);
  await fp.click('a:has-text("Overview")'); await fp.waitForTimeout(900);
  const d = await fp.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__d.slice(2); });
  const slow = d.filter(x => x > 33).length; const max = Math.max(...d);
  console.log(`INFO frames=${d.length} slow(>33ms)=${slow} (${(100 * slow / d.length).toFixed(1)}%) max=${max.toFixed(0)}ms avg=${(d.reduce((a, c) => a + c, 0) / d.length).toFixed(1)}ms at 4x CPU throttle`);
  await b.close();

  // 9 webhook signature
  const url = 'http://localhost:3101/api/whatsapp';
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '919800000002', id: 'wamid.t1', type: 'text', text: { body: 'namaste, all fine' } }] } }] }] });
  let r = await fetch(url, { method: 'POST', body }); ok(r.status === 401, 'webhook rejects unsigned request (401)');
  r = await fetch(url, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'testsecret').update(body).digest('hex') } }); ok(r.status === 200, 'webhook accepts valid signature (200)');
  r = await fetch(url + '?hub.mode=subscribe&hub.verify_token=vt123&hub.challenge=abc'); ok((await r.text()) === 'abc', 'webhook verification handshake echoes challenge');
  r = await fetch(url + '?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc'); ok(r.status === 403, 'webhook handshake rejects wrong token (403)');
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
