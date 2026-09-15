import {test,expect} from '@playwright/test';
const passage='This is a neutral passage used only by automated browser tests. '.repeat(8);
test.beforeEach(async({page})=>{
 let mode='normal',idx=0;const total=()=>mode==='normal'?12:5;
 await page.route('**/rest/v1/rpc/*',async route=>{
  const fn=route.request().url().split('/').pop(),args=route.request().postDataJSON();let json;
  if(fn==='start_session'){mode=args.p_mode;idx=0;json='test-session';}
  if(fn==='next_trial')json=idx===total()?{done:true}:{trial_id:'trial-'+idx,idx,total:total(),mode,prompt:{text:'Read an encyclopedia-style passage.'},passages:Array.from({length:mode==='normal'?1:4},(_,i)=>({sample_id:'sample-'+i,text:passage,attribution:{title:'Example',url:'https://en.wikipedia.org/wiki/Example'}}))};
  if(fn==='submit_trial'){idx++;json={ok:true,remaining:total()-idx};}
  if(fn==='finish_session')json={correct:6,total:mode==='normal'?12:20,accuracy:.5,global_avg:null,per_model_seen:{chatgpt:3},per_model_fooled:{chatgpt:1}};
  if(fn==='get_prompt_for_submission')json={id:'prompt',text:'Write about a place.',target_words:130};
  if(fn==='submit_writing')json='submission';
  await route.fulfill({json});
 });
});
for(const mode of ['normal','hard'])test(`${mode} consent, refresh and completion`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/ai-vs-human/');
 await page.getByRole('button',{name:new RegExp('Start '+mode)}).click();
 await expect(page.getByRole('button',{name:'Continue'})).toBeDisabled();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continue'}).click();await page.getByRole('button',{name:'Skip all'}).click();
 await expect(page.getByText(/ROUND 1 OF/)).toBeVisible();await page.reload();await expect(page.getByText(/ROUND 1 OF/)).toBeVisible();
 for(let i=0;i<(mode==='normal'?12:5);i++){
  if(mode==='normal')await page.getByRole('button',{name:'Probably human',exact:true}).click();
  else {if(i===1)for(const b of await page.getByRole('button',{name:/Mark passage/}).all())await b.click();await page.getByRole('button',{name:/Submit \(/}).click();}
  if(i<(mode==='normal'?11:4))await expect(page.getByText(`ROUND ${i+2} OF`,{exact:false})).toBeVisible();
 }
 await expect(page.getByRole('heading',{name:'How your instincts did.'})).toBeVisible();await expect(page.getByText('You’re among the first',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('contribution bounds and consent',async({page})=>{
 await page.goto('/ai-vs-human/submit.html');await expect(page.getByRole('button',{name:'Show my prompt'})).toBeDisabled();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Show my prompt'}).click();
 const text=page.getByRole('textbox',{name:'Your writing'}),submit=page.getByRole('button',{name:'Submit writing'});
 await text.fill('word '.repeat(59));await expect(submit).toBeDisabled();await text.fill('word '.repeat(301));await expect(submit).toBeDisabled();await text.fill('word '.repeat(60));await submit.click();await expect(page.getByRole('heading',{name:'Thank you for writing.'})).toBeVisible();
});
test('network interruption offers recovery',async({page})=>{
 await page.route('**/rpc/next_trial',route=>route.abort());await page.goto('/ai-vs-human/');await page.getByRole('button',{name:/Start normal/}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continue'}).click();await page.getByRole('button',{name:'Skip all'}).click();await expect(page.getByRole('button',{name:'Retry'})).toBeVisible();
});
