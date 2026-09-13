import {test,expect} from '@playwright/test';
async function open(page){await page.goto('/linxicon-solver/');await expect(page.getByRole('button',{name:'Watch the search'})).toBeEnabled();}
test('answer stays hidden, reveal selects a verified route and links inspect scores',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await open(page);await expect(page.locator('#solution')).toBeHidden();
 await expect(page.locator('#inspector-content h2')).toHaveText('bridge');
 await page.getByRole('button',{name:'Show solution'}).click();
 await expect(page.locator('#solution')).toBeVisible();await expect(page.locator('#solution')).toContainText('track');
 await expect(page.locator('.alternates .active')).toContainText('VERIFIED');
 await page.locator('#inspector-content summary').click();await page.locator('[data-edge]').first().click();
 await expect(page.locator('#inspector-content')).toContainText('Vector similarity');
 await expect(page.locator('#inspector-content')).toContainText('Server score');
 await page.getByRole('button',{name:'Restart and hide solution'}).click();await expect(page.locator('#solution')).toBeHidden();
 expect(errors).toEqual([]);
});
test('play, pause, scrubbing, alternate selection, and board sources',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Watch the search'}).click();
 await page.getByRole('button',{name:'Pause recorded solve'}).click();
 await expect(page.locator('#timeline')).not.toHaveValue('0');
 await page.locator('#timeline').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('#solution')).toBeVisible();
 await page.locator('[data-candidate="1"]').click();await expect(page.locator('.alternates .active')).toContainText('tracks');
 await page.getByRole('tab',{name:'Game board'}).click();await expect(page.locator('.board-world')).toBeVisible();
 await page.getByRole('button',{name:'Local model'}).click();await expect(page.locator('.board-world')).toContainText('local scores');
 await page.getByRole('button',{name:'Server scores'}).click();await expect(page.locator('.board-world')).toContainText('server scores');
});
test('word explorer and tabs work from keyboard',async({page})=>{
 await open(page);await page.getByRole('tab',{name:'Search',exact:false}).focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'Word neighborhoods'})).toBeFocused();
 await page.locator('#word-details summary').click();await page.getByLabel('Find a word in this map').fill('track');
 const word=page.locator('#word-list [data-word="track"]');await word.focus();await page.keyboard.press('Enter');
 await expect(page.locator('#inspector-content h2')).toHaveText('track');
});
test('mobile layout and reduced motion do not autoplay or overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await open(page);
 await page.waitForTimeout(700);await expect(page.locator('#timeline')).toHaveValue('0');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/atlas-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Show solution'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('desktop composition and route redirect',async({page})=>{
 await page.setViewportSize({width:1440,height:1100});await open(page);
 await page.screenshot({path:'/tmp/atlas-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Show solution'}).click();await page.screenshot({path:'/tmp/atlas-revealed.png',fullPage:true});
 await page.goto('/linixcon-solver/');await expect(page).toHaveURL(/\/linxicon-solver\//);
});
test('stale and unavailable data are explicit',async({page})=>{
 await page.route('**/data/latest.json',async route=>{const response=await route.fetch();const m=await response.json();await route.fulfill({json:{...m,schema_version:999}});});
 await page.goto('/linxicon-solver/');await expect(page.locator('#inspector-content')).toContainText('unsupported format');await expect(page.locator('#solution')).toBeHidden();
});

test('older snapshots show their actual date and a stale notice',async({page})=>{
 await page.clock.setFixedTime(new Date('2030-01-01T12:00:00Z'));await open(page);
 await expect(page.locator('#freshness')).toBeVisible();await expect(page.locator('#freshness')).toContainText('2026-09-13');
});

test('playback remains responsive under mobile CPU throttling',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.evaluate(()=>{window.frameTimes=[];let last=performance.now();function frame(now){window.frameTimes.push(now-last);last=now;if(window.frameTimes.length<300)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
 await page.getByRole('button',{name:'Watch the search'}).click();await page.waitForTimeout(4000);
 const times=await page.evaluate(()=>window.frameTimes.slice(5).sort((a,b)=>a-b));
 const p95=times[Math.floor(times.length*.95)];console.log('Mobile CPU 4x frame p95:',p95.toFixed(1),'ms');
 expect(p95).toBeLessThan(100);
});
