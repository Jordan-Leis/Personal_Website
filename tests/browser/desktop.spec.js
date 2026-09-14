// Desktop checks. These run against a Jekyll build (see playwright.config.js);
// every external destination is stubbed, and the YouTube IFrame API is replaced
// by a fake player so playback logic is deterministic.
import {test, expect} from '@playwright/test';
import assert from 'node:assert/strict';

const EXTERNAL_PAGE = '<!doctype html><title>External page fixture</title><p>External page fixture</p>';

// A fake YT.Player: records calls, becomes ready on the next microtask.
function fakeYouTube() {
  window.players = [];
  window.YT = {Player: class {
    constructor(el, options) {
      this.el = el; this.options = options; this.state = 0; this.volume = 0; this.time = 0; this.next = 0; this.prev = 0; this.destroyed = false;
      window.players.push(this); queueMicrotask(() => options.events.onReady());
    }
    playVideo() { this.state = 1; } pauseVideo() { this.state = 2; } stopVideo() { this.state = 0; }
    setVolume(v) { this.volume = v; } getDuration() { return 120; } getCurrentTime() { return this.time; }
    getVideoData() { return {title: 'Test track'}; } getPlayerState() { return this.state; } seekTo(v) { this.time = v; }
    previousVideo() { this.prev++; } nextVideo() { this.next++; } getPlaylist() { return []; }
    destroy() { this.destroyed = true; this.el.remove(); }
  }};
}

async function desktop(browser, baseURL, {width = 1440, path = '/', reducedMotion = 'reduce', youtube = true, boot = false} = {}) {
  const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 900}, reducedMotion, hasTouch: width === 390});
  const issues = [];
  page.on('pageerror', e => issues.push(e.message));
  page.on('response', r => { if (r.url().startsWith(baseURL) && r.status() >= 400) issues.push(r.status() + ' ' + r.url()); });
  await page.route('https://**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({contentType: 'text/html', body: EXTERNAL_PAGE}) : route.abort());
  await page.addInitScript(() => { window.opened = []; window.open = (...args) => window.opened.push(args); });
  if (youtube) await page.addInitScript(fakeYouTube);
  await page.goto(path);
  if (!boot) await page.waitForFunction(() => typeof Terminal !== 'undefined' && Terminal.introduced);
  page.issues = issues;
  return page;
}

const dock = (p, id) => p.locator(`.dock-item[data-window="${id}"]`);
const visible = (p, id) => p.locator(`#${id}`).isVisible();
const control = (p, id, action) => p.locator(`#${id} .window-control[data-action="${action}"]`).click();
const closeIfOpen = async (p, id) => { if (await visible(p, id)) await control(p, id, 'close'); };
const launch = async (p, id) => { await p.locator('#show-apps').click(); await p.locator(id === 'browser-window' ? '.app-launcher[data-action="browser"]' : `.app-launcher[data-window="${id}"]`).click(); };
const openPath = async (p, path) => { await p.locator('#show-apps').click(); await p.locator(`.app-launcher[data-path="${path}"]`).click(); };
const cmd = async (p, text) => { await p.locator('#terminal-input').fill(text); await p.locator('#terminal-input').press('Enter'); return p.locator('.terminal-response').last().textContent(); };
const noIssues = p => assert.deepEqual(p.issues, [], 'no page errors or first-party resource failures');
// The newest post's URL, from the Liquid-rendered list inside the Files window.
const firstPost = p => p.evaluate(() => document.getElementById('posts-data').content.querySelector('.post-entry').getAttribute('href'));

test.describe('window manager and browser', () => {
  test('dock, app grid, desktop icons, keyboard, and drag limits', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    for (const id of ['hero-window', 'about-window', 'contact-window', 'projects-window', 'browser-window']) {
      await closeIfOpen(p, id); await dock(p, id).click();
      assert.ok(await visible(p, id), id + ' dock opens');
      await dock(p, id).click(); assert.ok(!await visible(p, id), id + ' focused dock minimizes');
      assert.ok(await dock(p, id).evaluate(e => e.classList.contains('running')), id + ' minimized dock dot retained');
      await dock(p, id).click(); await control(p, id, 'maximize');
      assert.ok(await p.locator('#' + id).evaluate(e => e.classList.contains('maximized')), id + ' maximize');
      await control(p, id, 'maximize'); assert.ok(!await p.locator('#' + id).evaluate(e => e.classList.contains('maximized')), id + ' restore');
      await control(p, id, 'minimize'); await dock(p, id).click();
      await closeIfOpen(p, id); assert.ok(!await dock(p, id).evaluate(e => e.classList.contains('running')), id + ' closed dock dot removed');
      await launch(p, id); assert.ok(await visible(p, id), id + ' app grid opens'); await closeIfOpen(p, id);
    }
    for (const [target, id] of [['[data-window="projects-window"]', 'projects-window'], ['[data-window="about-window"]', 'about-window'], ['[data-window="contact-window"]', 'contact-window'], ['[data-action="terminal"]', 'hero-window']]) {
      await p.locator('.desktop-icon' + target).dblclick(); assert.ok(await visible(p, id), id + ' desktop opens'); await closeIfOpen(p, id);
    }
    await dock(p, 'hero-window').click(); await dock(p, 'about-window').click(); await dock(p, 'about-window').click();
    await p.keyboard.press('Alt+Tab'); assert.ok(await visible(p, 'about-window'), 'Alt+Tab restores minimized app');
    await p.locator('#activities').click(); await p.keyboard.press('Escape');
    assert.ok(!(await p.locator('#app-grid').evaluate(e => e.classList.contains('open'))) && await visible(p, 'about-window'), 'Escape dismisses grid without closing app');
    await p.locator('#show-apps').click(); await p.locator('#app-grid').click({position: {x: 10, y: 10}});
    assert.ok(!(await p.locator('#app-grid').evaluate(e => e.classList.contains('open'))), 'click outside dismisses grid');
    await p.keyboard.press('Escape'); assert.ok(!await visible(p, 'about-window'), 'Escape closes focused window');
    const header = await p.locator('#hero-window .window-header').boundingBox();
    await p.mouse.move(header.x + 160, header.y + 20); await p.mouse.down(); await p.mouse.move(-400, -400); await p.mouse.up();
    assert.ok(await p.locator('#hero-window').evaluate(e => { const r = e.getBoundingClientRect(), a = document.querySelector('#desktop').getBoundingClientRect(); return r.left >= a.left && r.top >= a.top; }), 'drag clamps to work area');
    const moved = await p.locator('#hero-window .window-header').boundingBox();
    await p.mouse.move(moved.x + 160, moved.y + 20); await p.mouse.down(); await p.mouse.move(1900, 1300); await p.mouse.up();
    assert.ok(await p.locator('#hero-window').evaluate(e => { const r = e.getBoundingClientRect(), a = document.querySelector('#desktop').getBoundingClientRect(); return r.top <= a.bottom - 46; }), 'header stays reachable');
    noIssues(p); await p.close();
  });

  test('Files actions route through the desktop browser with real URLs', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    await closeIfOpen(p, 'hero-window'); await dock(p, 'projects-window').click();
    const before = await p.locator('#projects-window').boundingBox();
    await p.getByRole('button', {name: 'software', exact: true}).dblclick(); await p.locator('#files-back').dblclick();
    const after = await p.locator('#projects-window').boundingBox();
    assert.ok(before.x === after.x && before.y === after.y && before.width === after.width, 'Files header buttons do not drag or maximize');
    await p.locator('#files-forward').click();
    await p.locator('[data-project="summarization"]').click(); await p.getByRole('button', {name: 'Open on GitHub', exact: true}).click();
    await p.locator('#browser-frame').waitFor();
    assert.ok((await p.locator('#browser-frame').getAttribute('src')).startsWith('https://github1s.com/ScienceGPTstream2/SummarizationTool'));
    assert.equal(await p.locator('#browser-address').inputValue(), 'github.com/ScienceGPTstream2/SummarizationTool');
    assert.ok(await p.evaluate(() => Browser.history.length === 1 && Browser.index === 0), 'no extra history entry');
    assert.equal(await p.locator('#browser-external').getAttribute('href'), 'https://github.com/ScienceGPTstream2/SummarizationTool');
    assert.ok(await p.locator('#browser-external').evaluate(e => e.target === '_blank' && e.rel === 'noopener'));
    await control(p, 'browser-window', 'close');
    assert.ok(await p.evaluate(() => Browser.history.length === 0 && !document.querySelector('#browser-frame').hasAttribute('src')), 'closing clears history and frame');
    await p.locator('#files-back').click(); await p.getByRole('button', {name: 'papers', exact: true}).dblclick();
    assert.ok(await p.locator('.fs-project .fs-icon img').evaluateAll(es => es.length === 2 && es.every(e => e.src.endsWith('/application-pdf.png'))), 'papers use PDF icons');
    await p.locator('[data-project="microgrid"]').dblclick();
    assert.equal(await p.locator('#browser-frame').getAttribute('src'), 'https://cucai.ca/papers/48');
    await control(p, 'browser-window', 'close');
    await p.locator('.dock-item[data-action="blog"]').click();
    const post = await firstPost(p);
    await p.frameLocator('#browser-frame').locator(`a[href="${post}"]`).click();
    await p.waitForFunction(post => document.querySelector('#browser-address').value.endsWith(post), post);
    await p.locator('#browser-back').click(); await p.waitForFunction(() => document.querySelector('#browser-frame').contentWindow.location.pathname === '/blog/');
    await p.locator('#browser-forward').click(); await p.waitForFunction(post => document.querySelector('#browser-frame').contentWindow.location.pathname === post, post);
    await p.locator('#browser-reload').click(); await p.waitForFunction(() => !document.querySelector('#browser-loading').classList.contains('on'));
    await control(p, 'browser-window', 'close');
    await p.locator('#show-apps').click(); await p.locator('.app-launcher[data-action="resume"]').click();
    assert.ok((await p.locator('#browser-frame').getAttribute('src')).endsWith('/preview'), 'Resume uses the Drive preview');
    await control(p, 'browser-window', 'close');
    await p.locator('#show-apps').click(); await p.locator('.app-launcher[data-action="linkedin"]').click();
    assert.ok(await p.evaluate(() => opened.length === 1 && opened[0][0].includes('linkedin.com') && !document.querySelector('#browser-frame').hasAttribute('src')), 'LinkedIn opens a new tab, never an iframe');
    await dock(p, 'contact-window').click(); await p.locator('.contact-row').filter({hasText: 'GitHub'}).click();
    assert.equal(await p.locator('#browser-frame').getAttribute('src'), 'https://github1s.com/Jordan-Leis/Jordan-Leis');
    await p.waitForFunction(() => !document.querySelector('#browser-loading').classList.contains('on'));
    await p.locator('#browser-frame').dispatchEvent('error');
    assert.ok(await p.locator('#browser-fallback').evaluate(e => e.classList.contains('on')), 'iframe error shows fallback');
    await p.locator('#browser-reload').click(); await p.waitForFunction(() => !document.querySelector('#browser-loading').classList.contains('on'));
    assert.ok(!await p.locator('#browser-fallback').evaluate(e => e.classList.contains('on')), 'retry clears fallback');
    await control(p, 'browser-window', 'close');
    // Hold an external navigation to exercise the real timeout.
    await p.route('https://github1s.com/**', () => {}); await p.clock.install();
    await p.locator('.contact-row').filter({hasText: 'GitHub'}).click(); await p.clock.fastForward(15001);
    assert.ok(await p.locator('#browser-fallback').evaluate(e => e.classList.contains('on')), 'stalled navigation shows fallback after 15 s');
    await control(p, 'browser-window', 'close'); await p.clock.fastForward(15001);
    assert.ok(!await p.locator('#browser-fallback').evaluate(e => e.classList.contains('on')), 'closing cancels the stale timeout');
    noIssues(p); await p.close();
  });

  test('deep links open only same-origin paths', async ({browser, baseURL}) => {
    const probe = await desktop(browser, baseURL); const post = await firstPost(probe); await probe.close();
    const deep = await desktop(browser, baseURL, {path: '/?open=' + post});
    await deep.waitForFunction(post => document.querySelector('#browser-address').value.endsWith(post), post);
    assert.ok(await visible(deep, 'browser-window')); await deep.close();
    for (const path of ['//example.com', 'https://example.com', '/\\example.com']) {
      const page = await desktop(browser, baseURL, {path: '/?open=' + encodeURIComponent(path)});
      assert.ok(!await visible(page, 'browser-window'), 'rejected ' + path); await page.close();
    }
  });

  for (const width of [1440, 390]) test(`windows fit the viewport at ${width}`, async ({browser, baseURL}) => {
    const page = await desktop(browser, baseURL, {width});
    for (const id of ['hero-window', 'projects-window', 'browser-window', 'about-window', 'contact-window', 'music-window', 'solitaire-window']) {
      if (id !== 'hero-window') await launch(page, id);
      assert.ok(await page.locator('#' + id).evaluate(e => { const c = e.querySelector('.files-body,.browser-body,.window-content'); return c.scrollWidth <= c.clientWidth + 1; }), id + ' content fits');
      assert.ok(await page.locator('#' + id).evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight - (innerWidth <= 768 ? 64 : 0) + 1; }), id + ' inside viewport');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'document fits');
    if (width === 390) {
      await dock(page, 'projects-window').tap(); await page.getByRole('button', {name: 'software', exact: true}).tap(); await page.getByRole('button', {name: 'Open', exact: true}).tap();
      await page.locator('[data-project="summarization"]').tap();
      assert.ok(!await page.locator('.files-sidebar').isVisible(), 'mobile sidebar hidden');
      assert.ok(await page.locator('#files-details').evaluate(e => getComputedStyle(e).position === 'absolute' && e.getBoundingClientRect().bottom <= innerHeight - 64), 'details are a bottom sheet');
      assert.ok(await page.locator('.crumb.current').evaluate(e => { const r = e.getBoundingClientRect(), q = e.parentElement.getBoundingClientRect(); return r.left >= q.left - 1 && r.right <= q.right + 1; }), 'current breadcrumb visible');
      await page.getByRole('button', {name: 'Open on GitHub', exact: true}).tap(); assert.ok(await visible(page, 'browser-window'), 'details action reachable');
      assert.ok(await page.locator('.browser-toolbar').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'toolbar fits');
      await page.locator('#show-apps').tap(); assert.ok(await page.locator('#app-grid').evaluate(e => e.classList.contains('open')), 'bottom dock reachable');
    }
    noIssues(page); await page.close();
  });
});

test.describe('system menu, terminal, filesystem, and Easter eggs', () => {
  for (const width of [1440, 390]) test(`interactions at ${width}`, async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL, {width});
    const ok = (a, b = true) => assert.deepEqual(a, b);
    assert.equal(await p.title(), 'Jordan Leis');
    ok(await p.locator('#system-volume').inputValue(), '50');
    await p.locator('#system-toggle').click(); await p.locator('#system-mute').click(); ok(await p.locator('#system-volume').inputValue(), '0');
    await p.locator('#system-mute').click(); ok(await p.locator('#system-volume').inputValue(), '50');
    await p.keyboard.press('Escape'); ok(await p.locator('#system-menu').isVisible(), false); ok(await p.locator('#hero-window').isVisible());
    await p.locator('#system-toggle').click(); await p.mouse.click(width - 20, 400); ok(await p.locator('#system-menu').isVisible(), false);

    ok((await cmd(p, 'help')).includes('work work'), false); ok((await cmd(p, 'help')).includes('1 million'), false);
    ok(await cmd(p, 'echo "<img src=x onerror=alert(1)>"'), '<img src=x onerror=alert(1)>'); ok(await p.locator('#terminal-output img').count(), 0);
    ok(await cmd(p, 'pwd'), '/home/jordan'); await cmd(p, 'cd "Downloads"'); ok(await cmd(p, 'pwd'), '/home/jordan/Downloads');
    ok((await cmd(p, 'ls')).includes('.notes'), false); ok((await cmd(p, 'ls -a')).includes('.notes'), true);
    ok(await cmd(p, 'cat .notes.txt'), 'What do peons say all day?\nRecursiveness is dangerous.\nVivado hates this one trick.');
    ok((await cmd(p, 'cat secret.mp4')).includes('Binary file'), true); await cmd(p, 'cd ..');
    ok((await cmd(p, 'cat Downloads')).includes('Is a directory'), true); ok((await cmd(p, 'cd nope')).includes('No such file'), true);
    ok((await cmd(p, 'cd mission.txt')).includes('Not a directory'), true); ok(await cmd(p, 'sudo rm -rf /'), 'sudo: command not found');
    ok(await cmd(p, 'echo a | cat'), 'a | cat');
    await p.locator('#terminal-input').fill('draft'); await p.keyboard.press('ArrowUp'); ok(await p.locator('#terminal-input').inputValue(), 'echo a | cat');
    await p.keyboard.press('ArrowDown'); ok(await p.locator('#terminal-input').inputValue(), 'draft');
    await p.locator('#terminal-input').fill('clear'); await p.keyboard.press('Enter'); ok(await p.locator('#terminal-output').innerText(), ''); ok(await p.locator('#terminal-intro').isVisible(), false);
    for (const c of ['whoami', 'cat about.md', 'cat mission.txt']) { const out = await cmd(p, c); ok(out.length > 10, true); ok(/ {3,}/.test(out), false); }
    const contact = JSON.parse(await cmd(p, 'cat contact.json')); ok(contact.email, 'jordan.jay.leis@gmail.com'); ok(contact.looking_for[0], 'FPGA / RTL co-op, 2027.');
    ok((await cmd(p, 'cat looking_for.txt | head -1')), 'FPGA / RTL co-op, 2027.');
    await cmd(p, 'cd Projects/software'); assert.match(await cmd(p, 'cat "AI Document Summarization Tool"'), /Health Canada/); await cmd(p, 'cd ~');
    assert.match(await cmd(p, 'cat Documents/experience.txt'), /Health Canada/);

    await openPath(p, '/Documents'); ok(await p.locator('.fs-item').count(), 6);
    await p.getByRole('button', {name: 'mission.txt', exact: true}).dblclick();
    ok(await p.locator('#notes-content').innerText(), await p.evaluate(() => Session.node('/Documents/mission.txt').content)); await control(p, 'notes-window', 'close');
    await p.getByRole('button', {name: 'mission.txt', exact: true}).click(); await p.getByRole('button', {name: 'Add to Starred', exact: true}).click();
    await p.getByRole('button', {name: 'Move to Trash', exact: true}).click(); ok(await p.getByRole('button', {name: 'mission.txt', exact: true}).count(), 0);
    await p.locator('#files-trash').click(); await p.getByRole('button', {name: 'mission.txt', exact: true}).click(); await p.getByRole('button', {name: 'Restore', exact: true}).click();
    ok(await p.locator('.fs-item').count(), 0);
    ok(await p.evaluate(() => Session.list('/Recent').filter(n => n.name === 'mission.txt').length), 1);
    ok(await p.evaluate(() => Session.list('/Starred').filter(n => n.name === 'mission.txt').length), 1);
    await openPath(p, '/Desktop'); await p.locator('#files-grid').getByRole('button', {name: 'about.md', exact: true}).click(); await p.getByRole('button', {name: 'Move to Trash', exact: true}).click();
    ok(await p.locator('.desktop-icon[data-window="about-window"]').isVisible(), false);
    await launch(p, 'about-window'); ok(await p.locator('#about-window').isVisible()); await control(p, 'about-window', 'close');
    await p.locator('#files-trash').click(); await p.locator('#files-grid').getByRole('button', {name: 'about.md', exact: true}).click(); await p.getByRole('button', {name: 'Restore', exact: true}).click();
    ok(await p.evaluate(() => document.querySelector('.desktop-icon[data-window="about-window"]').hidden), false);

    for (const id of ['about-window', 'contact-window', 'projects-window', 'browser-window', 'hero-window', 'music-window', 'solitaire-window']) {
      await launch(p, id); await control(p, id, 'maximize'); ok(await p.locator('#' + id).evaluate(e => e.classList.contains('maximized')));
      await control(p, id, 'maximize'); await control(p, id, 'minimize'); ok(await p.locator('#' + id).isVisible(), false);
      ok(await p.locator('#' + id).evaluate(e => e.classList.contains('is-open'))); await p.keyboard.press('Alt+Tab'); await launch(p, id); await control(p, id, 'close');
      ok(await p.locator('#' + id).evaluate(e => e.classList.contains('is-open')), false);
    }
    await p.locator('#show-apps').click(); await p.keyboard.press('Escape'); ok(await p.locator('#app-grid').evaluate(e => e.classList.contains('open')), false);

    await launch(p, 'projects-window'); await p.locator('#files-path').getByRole('button', {name: 'Home', exact: true}).click();
    await p.locator('#files-grid').getByRole('button', {name: 'Projects', exact: true}).dblclick();
    ok(await p.locator('.fs-count').allTextContents(), ['6 items', '10 items', '2 items']);
    await p.getByRole('button', {name: 'software', exact: true}).dblclick(); ok(await p.locator('.fs-label').first().innerText(), 'AI Document Summarization Tool');
    await p.locator('.fs-item').first().click(); await p.getByRole('button', {name: 'Open on GitHub', exact: true}).click();
    ok((await p.locator('#browser-frame').getAttribute('src')).startsWith('https://github1s.com/ScienceGPTstream2/SummarizationTool')); ok(await p.locator('#browser-back').isDisabled());
    await control(p, 'browser-window', 'close'); await p.locator('.dt-close').click();
    await p.getByRole('button', {name: 'Linxicon Optimal Solver', exact: true}).click(); await p.getByRole('button', {name: 'Open on GitHub', exact: true}).click();
    ok((await p.locator('#browser-frame').getAttribute('src')).startsWith('https://github1s.com/Jordan-Leis/linxicon-optimal-solver')); await control(p, 'browser-window', 'close');
    await p.getByRole('button', {name: 'Open site', exact: true}).click();
    await p.waitForFunction(() => document.querySelector('#browser-address').value.endsWith('/linxicon-solver/'));
    await p.waitForFunction(() => document.querySelector('#browser-frame').contentDocument?.querySelector('#title'));
    await control(p, 'browser-window', 'close'); await p.locator('.dt-close').click();
    // An entry without links shows the note and opens nothing.
    await p.evaluate(() => { Session.node('/Projects/software/linxicon_solver').project = {...PROJECTS.find(x => x.id === 'linxicon'), site: null, repo: null}; });
    await p.getByRole('button', {name: 'Linxicon Optimal Solver', exact: true}).dblclick();
    ok((await p.locator('#files-details').innerText()).includes('Repository not public yet.')); ok(await p.locator('#browser-window').isVisible(), false);
    await p.evaluate(() => { Session.node('/Projects/software/linxicon_solver').project = PROJECTS.find(x => x.id === 'linxicon'); });

    await launch(p, 'browser-window');
    // The site's own displayed address (no scheme) stays on this origin.
    const host = new URL(baseURL).host;
    const post = await firstPost(p);
    await p.locator('#browser-address').fill(host + post); await p.locator('#browser-address').press('Enter');
    await p.waitForFunction(post => document.querySelector('#browser-frame').contentWindow.location.pathname === post, post);
    ok(await p.locator('#browser-address').inputValue(), host + post);
    await p.locator('#browser-back').click(); await p.waitForFunction(() => document.querySelector('#browser-address').value.endsWith('/blog/'));
    await p.locator('#browser-frame').contentFrame().locator(`a[href="${post}"]`).click();
    await p.waitForFunction(post => document.querySelector('#browser-address').value.includes(post), post);
    await p.locator('#browser-back').click(); await p.waitForFunction(() => document.querySelector('#browser-address').value.endsWith('/blog/'));
    await p.locator('#browser-forward').click(); await p.waitForFunction(post => document.querySelector('#browser-address').value.includes(post), post);
    ok(await p.locator('#browser-forward').isDisabled()); await p.waitForFunction(() => !document.querySelector('#browser-loading').classList.contains('on'));
    await p.locator('#browser-frame').dispatchEvent('error'); ok(await p.locator('#browser-fallback').evaluate(e => e.classList.contains('on')));
    await p.locator('#browser-reload').dispatchEvent('click'); await p.waitForFunction(() => !document.querySelector('#browser-loading').classList.contains('on'));
    ok(await p.locator('#browser-fallback').evaluate(e => e.classList.contains('on')), false); await control(p, 'browser-window', 'close');

    await launch(p, 'hero-window');
    const tree = (await cmd(p, 'tree')).split('\n').filter(l => /^  \S+\//.test(l)).map(l => l.trim().split('/')[0]);
    ok(tree, ['mvm_accelerator', 'tanh_pipeline', 'wordle_on_kria', 'morse_code_riscv', 'reflex_meter_riscv', 'summarization_tool', 'uw_awards_search', 'sred_copilot', 'linxicon_solver', 'microgrid_rl', 'rag_agents']);
    await cmd(p, '1 million bit register');
    await openPath(p, '/Downloads'); await p.locator('#files-grid').getByRole('button', {name: 'secret.mp4', exact: true}).dblclick();
    ok(await p.locator('#video-window').isVisible()); await p.waitForFunction(() => Media.records.video.ready);
    ok((await p.evaluate(() => document.getElementById('video-embed').src)).includes('/embed/dQw4w9WgXcQ?')); await control(p, 'video-window', 'close');
    await cmd(p, 'work work'); await p.evaluate(() => Session.discover('recursion'));
    ok(await p.locator('#egg-tracker').evaluate(e => e.classList.contains('complete'))); await p.locator('#egg-tracker').click(); ok(await p.locator('#video-window').isVisible());
    await control(p, 'video-window', 'close');
    await openPath(p, '/Downloads'); await p.locator('#files-hidden').click(); await p.keyboard.press('Control+h'); ok(await p.locator('.fs-item').count(), 1);
    noIssues(p); await p.close();
  });

  test('shared filesystem: names, descendants, Recent, Starred, and fixed locations', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    await p.locator('.dock-item[data-window="projects-window"]').click(); await p.getByRole('button', {name: 'software', exact: true}).dblclick();
    await p.locator('[data-project="linxicon"]').dblclick(); await control(p, 'browser-window', 'close');
    await p.locator('[data-project="linxicon"]').click(); await p.getByRole('button', {name: 'Add to Starred'}).click();
    await p.locator('#files-path').getByRole('button', {name: 'Projects', exact: true}).click(); await p.getByRole('button', {name: 'software', exact: true}).click();
    await p.getByRole('button', {name: 'Move to Trash'}).click();
    assert.equal(await p.evaluate(() => Session.resolve('/Projects/software/linxicon_solver')), null);
    assert.equal(await p.evaluate(() => Session.list('/Recent').some(n => n.project?.id === 'linxicon')), false);
    assert.equal(await p.evaluate(() => Session.list('/Starred').length), 0);
    await p.locator('#files-trash').click(); await p.getByRole('button', {name: 'software', exact: true}).click(); await p.getByRole('button', {name: 'Restore'}).click();
    assert.equal(await p.evaluate(() => Session.list('/Projects/software').length), 10);
    assert.equal(await p.evaluate(() => Session.list('/Starred').length), 1);
    assert.equal(await p.evaluate(() => Session.list('/Recent').filter(n => n.project?.id === 'linxicon').length), 1);
    assert.equal(await p.evaluate(() => Session.trash('/Downloads')), false); assert.equal(await p.evaluate(() => Session.trash('/Trash')), false);
    await p.evaluate(() => Files.go('/Recent')); assert.equal(await p.locator('[data-project="linxicon"]').count(), 1);
    await p.evaluate(() => Files.go('/Starred')); assert.equal(await p.locator('.fs-item').count(), 1);
    // A forged recursion message from the root or another origin is ignored.
    await p.evaluate(() => { window.postMessage({type: 'desktop:recursion'}, location.origin); window.dispatchEvent(new MessageEvent('message', {origin: 'https://example.com', source: window, data: {type: 'desktop:recursion'}})); });
    await p.waitForTimeout(100); assert.equal(await p.evaluate(() => Session.eggs.size), 0);
    noIssues(p); await p.close();
  });

  test('Trash is empty by default', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL, {width: 390});
    await control(p, 'hero-window', 'close'); await p.locator('.desktop-icon[data-action="trash"]').dblclick();
    assert.equal(await p.locator('#files-empty').isVisible(), true); assert.equal(await p.locator('#files-empty-sub').innerText(), ''); assert.equal(await p.locator('#files-status').innerText(), '0 items');
    noIssues(p); await p.close();
  });
});

test.describe('pointer lifecycle', () => {
  test('dragging ends on release, cancel, lost capture, blur, and release outside', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    const idle = async () => { assert.equal(await p.evaluate(() => PointerDrag.active), null); assert.equal(await p.locator('body').evaluate(e => e.classList.contains('pointer-dragging')), false); assert.equal(await p.locator('.drag-source').count(), 0); };
    const header = p.locator('#hero-window .window-header');
    const drag = async () => { const b = await header.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + 20); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2 + 40, b.y + 70, {steps: 5}); assert.equal(await p.locator('body').evaluate(e => e.classList.contains('pointer-dragging')), true); };
    for (const end of ['release', 'cancel', 'lost', 'blur', 'outside']) {
      await drag();
      if (end === 'release') await p.mouse.up();
      if (end === 'cancel') await p.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', {pointerId: PointerDrag.active.id, bubbles: true})));
      if (end === 'lost') { await p.evaluate(() => PointerDrag.active.element.releasePointerCapture(PointerDrag.active.id)); await p.mouse.move(610, 310); }
      if (end === 'blur') await p.evaluate(() => window.dispatchEvent(new Event('blur')));
      if (end === 'outside') { await p.mouse.move(1500, 1000); await p.mouse.up(); }
      await p.waitForTimeout(30); await idle(); await p.mouse.up();
      const box = await header.boundingBox(); await p.mouse.move(600, 300); assert.deepEqual(await header.boundingBox(), box, 'window does not follow the pointer after ' + end);
    }
    await control(p, 'hero-window', 'close'); await dock(p, 'browser-window').click();
    const bh = p.locator('#browser-window .window-header'), b = await bh.boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + 20); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2 + 60, b.y + 100);
    assert.equal(await p.locator('#browser-frame').evaluate(e => getComputedStyle(e).pointerEvents), 'none', 'iframe does not intercept while dragging');
    await p.mouse.up(); await idle(); assert.equal(await p.locator('#browser-frame').evaluate(e => getComputedStyle(e).pointerEvents), 'auto');
    await control(p, 'browser-window', 'close');
    const icon = p.locator('.desktop-icon[data-window="about-window"]'), trash = p.locator('.desktop-icon[data-action="trash"]');
    let a = await icon.boundingBox(), t = await trash.boundingBox();
    await p.mouse.move(a.x + 30, a.y + 30); await p.mouse.down(); await p.mouse.move(t.x + 30, t.y + 30, {steps: 10}); await p.mouse.up(); await idle();
    assert.equal(await icon.isVisible(), false); assert.equal(await p.evaluate(() => Session.trashed.has('/Desktop/about.md')), true);
    await dock(p, 'projects-window').click(); await p.locator('.fs-folder').first().click();
    const initial = await p.locator('#projects-window').boundingBox();
    await p.locator('#files-path').getByRole('button', {name: 'Home', exact: true}).dblclick();
    assert.equal(await p.locator('#projects-window').evaluate(e => e.classList.contains('maximized')), false); assert.deepEqual(await p.locator('#projects-window').boundingBox(), initial);
    await p.getByRole('button', {name: 'Documents', exact: true}).last().dblclick();
    const item = p.locator('#files-grid').getByRole('button', {name: 'experience.txt', exact: true});
    a = await item.boundingBox(); t = await p.locator('#files-trash').boundingBox();
    await p.mouse.move(a.x + 30, a.y + 30); await p.mouse.down(); await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, {steps: 10}); await p.mouse.up(); await idle();
    assert.equal(await p.evaluate(() => Session.trashed.has('/Documents/experience.txt')), true);
    noIssues(p); await p.close();
  });

  test('touch: Solitaire controls, hidden files, and details actions', async ({browser, baseURL}) => {
    const touch = await desktop(browser, baseURL, {width: 390});
    await touch.locator('#show-apps').tap(); await touch.locator('.app-launcher[data-window="solitaire-window"]').tap();
    await touch.locator('#game-stock').tap(); assert.equal(await touch.locator('.waste-pile .playing-card').count(), 1);
    await touch.locator('#game-undo').tap(); assert.equal(await touch.locator('.waste-pile .playing-card').count(), 0);
    await touch.locator('#show-apps').tap(); await touch.locator('.app-launcher[data-path="/Downloads"]').tap(); await touch.locator('#files-hidden').tap();
    await touch.getByRole('button', {name: '.notes.txt', exact: true}).tap(); await touch.getByRole('button', {name: 'Open', exact: true}).tap();
    assert.match(await touch.locator('#notes-content').innerText(), /Vivado/);
    assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    noIssues(touch); await touch.close();
  });
});

test.describe('Solitaire', () => {
  for (const width of [1440, 390]) test(`selection, legal stack drag, flip, undo, and New Game at ${width}`, async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL, {width});
    await p.locator('#show-apps').click(); await p.locator('.app-launcher[data-window="solitaire-window"]').click();
    const deal = () => p.evaluate(() => { const card = (id, rank, suit, up = true) => ({id, rank, suit, up}); Object.assign(Solitaire.game, {stock: [], waste: [card(3, 1, '♥')], foundations: [[], [], [], []], tableau: [[card(4, 5, '♦', false), card(0, 12, '♥'), card(1, 11, '♣')], [card(2, 13, '♠')], [], [], [], [], []], history: []}); Solitaire.selected = null; Solitaire.render(); });
    await deal();
    const tap = sel => width === 390 ? p.locator(sel).tap({position: {x: 10, y: 10}}) : p.locator(sel).click({position: {x: 10, y: 10}});
    await tap('[data-card-id="3"]'); await tap('.foundation-pile[data-pile="0"]'); assert.equal(await p.evaluate(() => Solitaire.game.foundations[0].length), 1);
    await tap('[data-card-id="0"]'); await tap('[data-card-id="2"]');
    assert.equal(await p.evaluate(() => Solitaire.game.tableau[1].length), 3); assert.equal(await p.evaluate(() => Solitaire.game.tableau[0][0].up), true);
    await tap('#game-undo'); assert.equal(await p.evaluate(() => Solitaire.game.tableau[0][0].up), false);
    await deal();
    const from = await p.locator('[data-card-id="0"]').boundingBox(), to = await p.locator('[data-card-id="2"]').boundingBox();
    if (width === 1440) {
      await p.mouse.move(from.x + 20, from.y + 10); await p.mouse.down(); await p.mouse.move(to.x + 20, to.y + 10, {steps: 8}); await p.mouse.up();
    } else {
      const client = await p.context().newCDPSession(p);
      await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: from.x + 15, y: from.y + 10}]});
      await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: to.x + 15, y: to.y + 10}]});
      await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      // Chromium drops the click of the first tap after a synthesized touch drag; absorb it on empty felt.
      const board = await p.locator('#game-board').boundingBox();
      await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: board.x + board.width - 10, y: board.y + board.height - 10}]});
      await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await p.waitForTimeout(100);
    }
    assert.equal(await p.evaluate(() => Solitaire.game.tableau[1].length), 3); assert.equal(await p.locator('.card-ghost').count(), 0);
    await p.waitForTimeout(350); await tap('#game-new');
    assert.equal(await p.evaluate(() => Solitaire.game.stock.length), 24); assert.equal(await p.locator('#game-undo').isDisabled(), true);
    noIssues(p); await p.close();
  });
});

test.describe('media', () => {
  test('YouTube controller: play/pause, seek, tracks, volume, per-track skips, failure, close, reset', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    const origin = encodeURIComponent(new URL(baseURL).origin);
    await p.locator('#show-apps').click(); await p.locator('.app-launcher[data-window="music-window"]').click();
    assert.equal(await p.evaluate(() => players.length), 0, 'nothing plays before a user action');
    await p.getByRole('button', {name: 'Play playlist', exact: true}).click(); await p.waitForFunction(() => Media.records.music.ready);
    assert.equal(await p.evaluate(() => players[0].volume), 50);
    assert.equal(await p.locator('#music-embed').getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    assert.ok((await p.locator('#music-embed').getAttribute('src')).includes('origin=' + origin));
    await p.locator('[data-player="music"][data-media-action="play"]').click(); assert.equal(await p.evaluate(() => players[0].state), 2);
    await p.locator('[data-player="music"][data-media-action="play"]').click(); assert.equal(await p.evaluate(() => players[0].state), 1);
    await p.getByRole('button', {name: 'Next track'}).click(); await p.getByRole('button', {name: 'Previous track'}).click();
    assert.deepEqual(await p.evaluate(() => [players[0].next, players[0].prev]), [1, 1]);
    await p.locator('[data-media-seek="music"]').fill('50'); await p.locator('[data-media-seek="music"]').dispatchEvent('input'); assert.equal(await p.evaluate(() => players[0].time), 60);
    await p.locator('#system-toggle').click(); await p.locator('#system-volume').fill('19'); await p.locator('#system-volume').dispatchEvent('input');
    assert.equal(await p.evaluate(() => players[0].volume), 19); assert.equal(await p.evaluate(() => Media.audio.volume), 0.19); await p.keyboard.press('Escape');
    await p.locator('#music-window [data-action="minimize"]').click(); assert.equal(await p.evaluate(() => players[0].state), 1, 'minimized music keeps playing');
    await p.locator('#show-apps').click(); await p.locator('.app-launcher[data-window="music-window"]').click(); await p.locator('#music-window [data-action="close"]').click();
    assert.equal(await p.evaluate(() => players[0].destroyed), true); assert.equal(await p.locator('#music-embed').count(), 0);
    await p.locator('#show-apps').click(); await p.locator('.app-launcher[data-window="music-window"]').click();
    await p.getByRole('button', {name: 'Play playlist', exact: true}).click(); await p.waitForFunction(() => Media.records.music.ready);
    // Per-track errors skip forward, bounded by the playlist length; playing resets the count.
    await p.evaluate(() => { const pl = players.at(-1); pl.getPlaylist = () => ['a', 'b', 'c']; pl.options.events.onError({data: 150}); });
    assert.equal(await p.evaluate(() => players.at(-1).next), 1); assert.equal(await p.evaluate(() => Media.records.music.ready), true);
    assert.match(await p.locator('#music-message').innerText(), /Skipping a track/);
    await p.evaluate(() => players.at(-1).options.events.onStateChange({data: 1})); assert.equal(await p.evaluate(() => Media.records.music.skips), 0);
    await p.evaluate(() => { for (let i = 0; i < 3; i++) players.at(-1).options.events.onError({data: 101}); });
    assert.equal(await p.evaluate(() => players.at(-1).next), 4); assert.equal(await p.evaluate(() => Media.records.music.ready), true);
    await p.evaluate(() => players.at(-1).options.events.onError({data: 100}));
    assert.match(await p.locator('#music-message').innerText(), /unavailable.*External playback/);
    assert.equal(await p.getByRole('button', {name: 'Next track'}).isDisabled(), true); assert.equal(await p.locator('[data-media-seek="music"]').isDisabled(), true);
    await p.evaluate(() => Boot.crash());
    assert.equal(await p.evaluate(() => players.every(x => x.destroyed)), true); assert.equal(await p.evaluate(() => Media.records.music.ready), false);
    noIssues(p); await p.close();
  });

  test('a pending API load is cancelled by the fake reboot', async ({browser, baseURL}) => {
    const q = await desktop(browser, baseURL, {youtube: false});
    await q.route('https://www.youtube.com/iframe_api', () => {});
    await q.locator('#show-apps').click(); await q.locator('.app-launcher[data-window="music-window"]').click();
    await q.getByRole('button', {name: 'Play playlist', exact: true}).click(); assert.equal(await q.evaluate(() => Boolean(Media.apiCancel)), true);
    await q.evaluate(() => Boot.crash()); assert.equal(await q.evaluate(() => Media.apiCancel), null);
    assert.equal(await q.locator('script[src="https://www.youtube.com/iframe_api"]').count(), 0); assert.equal(await q.locator('#music-embed').count(), 0);
    await q.close();
  });

  test('Photos viewer steps through the gallery', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    await openPath(p, '/Photos'); assert.equal(await p.locator('.fs-photo').count(), 8);
    await p.locator('.fs-photo').first().dblclick(); assert.ok(await visible(p, 'photo-window'));
    assert.equal(await p.locator('#photo-name').innerText(), 'aero got funky ears.jpg'); assert.equal(await p.locator('#photo-prev').isDisabled(), true);
    await p.keyboard.press('ArrowRight'); assert.equal(await p.locator('#photo-name').innerText(), 'aero speaks.jpg');
    await p.locator('#photo-next').click(); assert.equal(await p.locator('#photo-name').innerText(), 'aero way too close.jpg');
    assert.ok((await p.locator('#photo-image').getAttribute('src')).endsWith('/assets/media/photos/aero-way-too-close.webp'));
    await p.waitForFunction(() => document.getElementById('photo-image').naturalWidth > 0);
    assert.ok(await p.locator('#photo-window .window-content').evaluate(c => c.scrollWidth <= c.clientWidth + 1), 'viewer content fits');
    assert.equal(await p.evaluate(() => Session.list('/Recent').filter(n => n.type === 'photo').length), 3, 'each viewed photo is listed once in Recent');
    noIssues(p); await p.close();
  });
});

test.describe('boot, introduction, and reboot lifecycle', () => {
  test('nested desktops share state, the third opening crashes and reboots, refresh resets', async ({browser, baseURL}) => {
    const p = await desktop(browser, baseURL);
    const command = text => cmd(p, text);
    await command('work work'); await command('work work'); await command('1 million bit register'); await command('1 million bit register');
    assert.equal(await p.locator('#egg-tracker').innerText(), 'Easter eggs: 2/3');
    await p.locator('#system-toggle').click(); await p.locator('#system-volume').fill('29'); await p.locator('#system-volume').dispatchEvent('input'); await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(() => Media.audio.volume), 0.29);
    await command('cd Downloads'); await command('cat .notes.txt');
    await p.evaluate(() => { Session.star('/Downloads/.notes.txt'); Session.trash('/Documents/mission.txt'); Solitaire.game.draw(); });
    const navigate = async frame => { await frame.locator('.dock-item[data-window="browser-window"]').click(); await frame.waitForFunction(() => !document.querySelector('#browser-loading').classList.contains('on')); await frame.locator('#browser-address').fill('jordanleis.com'); await frame.locator('#browser-address').press('Enter'); };
    const child = parent => p.frames().find(f => f.parentFrame() === parent && f.url().startsWith(baseURL + '/?desktop-depth='));
    await navigate(p);
    await p.waitForFunction(() => document.querySelector('#browser-frame').contentWindow.DesktopHost?.depth === 1);
    const a = child(p.mainFrame()); await a.waitForFunction(() => typeof Terminal !== 'undefined' && Terminal.introduced);
    assert.equal(await a.evaluate(() => Session === DesktopHost.root.DesktopHost.session), true, 'nested desktop shares the root session');
    assert.equal(await a.locator('#boot-screen').isVisible(), false); assert.equal(await a.evaluate(() => Media.audio), null);
    await navigate(a); await a.waitForFunction(() => document.querySelector('#browser-frame').contentWindow.DesktopHost?.depth === 2);
    const b = child(a); await b.waitForFunction(() => typeof Terminal !== 'undefined' && Terminal.introduced);
    let maxDepth = 2; p.on('framenavigated', f => { let d = 0; while (f.parentFrame()) { d++; f = f.parentFrame(); } maxDepth = Math.max(maxDepth, d); });
    await navigate(b);
    await p.waitForFunction(() => Session.eggs.size === 3 && !Boot.crashing && Terminal.introduced && Browser.index === -1, {}, {timeout: 20000});
    assert.ok(maxDepth <= 3, 'no desktop deeper than two nested frames');
    assert.equal(await p.evaluate(() => [...Session.views.values()].filter(x => x > 0).length), 0, 'nested views unregistered');
    assert.deepEqual(await p.evaluate(() => ({volume: Session.volume, eggs: Session.eggs.size, trash: Session.trashed.size, stars: Session.starred.size, recent: Session.recent.length, cwd: Terminal.cwd, history: Terminal.history.length, stock: Solitaire.game.stock.length, audioPaused: Media.audio.paused, hidden: Files.showHidden})),
      {volume: 0.29, eggs: 3, trash: 0, stars: 0, recent: 0, cwd: '/', history: 0, stock: 24, audioPaused: true, hidden: false});
    for (let i = 0; i < 2; i++) { await p.evaluate(() => Boot.crash()); assert.equal(await p.evaluate(() => Session.eggs.size), 3); assert.equal(await p.evaluate(() => Session.volume), 0.29); }
    await p.reload(); await p.waitForFunction(() => typeof Terminal !== 'undefined' && Terminal.introduced);
    assert.equal(await p.locator('#egg-tracker').isVisible(), false); assert.equal(await p.evaluate(() => Session.volume), 0.5);
    noIssues(p); await p.close();
  });

  test('boot and introduction use the randomized durations and finish on "I like to build."', async ({browser, baseURL}) => {
    test.setTimeout(90000);
    const p = await browser.newPage({viewport: {width: 1440, height: 900}});
    await p.addInitScript(() => { Math.random = () => 0; });
    await p.goto('/');
    assert.equal(await p.locator('#boot-screen').isVisible(), true);
    assert.equal((await p.locator('#terminal-intro').innerText()).trim(), '', 'introduction is blank under the boot screen');
    await p.waitForFunction(() => document.querySelector('#boot-screen').classList.contains('off'), {}, {timeout: 12000});
    assert.equal((await p.locator('#terminal-intro').innerText()).trim(), '', 'introduction is blank while the boot screen fades');
    await p.waitForFunction(() => document.querySelector('#boot-screen').hidden, {}, {timeout: 12000});
    assert.equal(await p.evaluate(() => Boot.duration), 6000);
    assert.equal(await p.evaluate(() => Terminal.running), true);
    const text = await p.locator('#terminal-intro').innerText(); await p.waitForTimeout(1000);
    assert.ok((await p.locator('#terminal-intro').innerText()).length > text.length, 'introduction is typed progressively');
    await p.waitForFunction(() => !Terminal.running, {}, {timeout: 30000});
    assert.equal(await p.locator('#hello-text').innerText(), "Hi, I'm Jordan. I like to build.");
    assert.ok(await p.evaluate(() => { const s = document.querySelector('#hero-window .window-content').getBoundingClientRect(), h = document.getElementById('hello-text').getBoundingClientRect(); return h.top >= s.top && h.bottom <= s.bottom; }), 'the hello line is in view when the cycle ends');
    assert.ok(await p.evaluate(() => document.getElementById('hero-window').getBoundingClientRect().bottom <= document.getElementById('desktop').getBoundingClientRect().bottom), 'terminal window stays inside the work area');
    assert.equal(await p.evaluate(() => Terminal.duration), 12000);
    await p.locator('.dock-item[data-window="hero-window"]').click(); await p.locator('.dock-item[data-window="hero-window"]').click();
    assert.equal(await p.evaluate(() => Terminal.running), false, 'refocusing never replays the introduction');
    await p.close();
  });

  for (const mode of ['key', 'pointer', 'button', 'reduce']) test(`boot skip by ${mode} on mobile`, async ({browser}) => {
    const p = await browser.newPage({reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference', viewport: {width: 390, height: 844}});
    await p.goto('/');
    if (mode === 'key') await p.keyboard.press('Space');
    if (mode === 'pointer') await p.locator('#boot-log').click();
    if (mode === 'button') await p.locator('#boot-skip').click();
    await p.waitForFunction(() => document.querySelector('#boot-screen').hidden);
    if (mode !== 'reduce') await p.locator('#intro-skip').click();
    assert.equal(await p.evaluate(() => Terminal.running), false);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.close();
  });
});

test('copy rules hold in the built page', async ({request, baseURL}) => {
  const html = await (await request.get('/')).text();
  const projects = await (await request.get('/assets/js/projects.js')).text();
  const text = html + projects;
  for (const banned of [/passion/i, /Building Tomorrow/i, /empower/i, /create positive change/i, /journey/i, /driven by the belief/i, /meaningful problems/i, /bridging the gap/i, /25% less diesel/, /Co-Authored-By/i]) {
    expect(text, 'banned phrase ' + banned).not.toMatch(banned);
  }
  expect(text).toContain('23%');
  expect(projects).toContain('https://cucai.ca/2025_proceedings.pdf#page=118');
  expect(html).not.toMatch(/{{|{%/);
});
