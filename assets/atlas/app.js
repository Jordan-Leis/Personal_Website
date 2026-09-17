import {createTimeline,initialState,transition} from './replay.js';
import {parseGraph,shortestChains,simulate,normalize} from './solver.js';
const $=id=>document.getElementById(id);
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('en-US');
const score=n=>n==null?'Not checked':Number(n).toFixed(4);
const key=(a,b)=>[a,b].sort().join('|');
const COLOR={ink:'#14212B',route:'#1F4FD8',explore:'#9DB8C6',discovered:'#6C8A9A',near:'#3E6F86',faint:'#B7C6CF',edge:'#7F98A6',contour:'#9DB8C6'};
const STATUS={verified:'Verified',rejected:'Rejected',unavailable:'Unchecked'};
const COUNT=['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
let data,state,timeline,nodes,edges,svg,world,nodeElements,edgeElements,contours,zoom,timer,homeTransform;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow=()=>window.innerWidth<600;
let speed=1,lastNarration='',heroKey='',labelUnit=16,flipped=null,viewBounds=null;
let graph=null,graphLoading=null,custom=null,solveKey='',blocked=new Set();// words the game's dictionary has rejected// the in-browser solver's graph and the last solved pair
const ICON={play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>'};
const position=n=>[80+(n.x+1)*420,65+(n.y+1)*235];

async function start(){
  const response=await fetch('./data/latest.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('The latest solve could not be loaded.');
  const manifest=await response.json();
  if(manifest.schema_version!==1||!/^daily-\d+-[a-f0-9]+\.json$/.test(manifest.file))throw new Error('This solve uses an unsupported format.');
  const bundle=await fetch('./data/'+manifest.file);if(!bundle.ok)throw new Error('The solve data is unavailable.');
  const raw=await bundle.arrayBuffer();
  if(globalThis.crypto?.subtle){
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==manifest.sha256)throw new Error('The solve did not pass its integrity check.');
  }
  data=JSON.parse(new TextDecoder().decode(raw));
  if(data.schema_version!==1||!Array.isArray(data.nodes)||data.nodes.length>500)throw new Error('Invalid solve data.');
  nodes=new Map(data.nodes.map(n=>[n.word,n]));edges=new Map(data.edges.map(e=>[key(e.a,e.b),e]));
  state=initialState(data);timeline=createTimeline(data);
  $('intro-start').textContent=data.game.tl;$('intro-end').textContent=data.game.br;
  $('puzzle-id').textContent='Linxicon #'+data.game.id;
  $('puzzle-date').textContent=new Date(data.game.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
  $('puzzle-date').dateTime=data.game.date;
  $('map-count').textContent=number(data.nodes.length)+' words on this map';
  $('timeline').max=timeline.length-1;
  for(const id of ['watch','reveal','play','timeline'])$(id).disabled=false;
  const age=Date.now()-Date.parse(data.generated_at);
  if(age>26*3600*1000){$('freshness').hidden=false;$('freshness').textContent='This is the latest recorded solve, from '+data.game.date+'. A newer one is not available yet.';}
  if(data.verification_status==='unavailable'){$('freshness').hidden=false;$('freshness').textContent='Some game checks were unavailable when this solve was recorded. Local results are shown with their check status.';}
  if(window.gsap&&window.DrawSVGPlugin)gsap.registerPlugin(DrawSVGPlugin);
  setupMap();bind();renderWords();render();
}
function setupMap(){
  const d3=window.d3;
  svg=d3.select('#map');
  world=svg.append('g').attr('class','map-world');
  const density=d3.contourDensity().x(n=>position(n)[0]).y(n=>position(n)[1]).size([1000,620]).bandwidth(35).thresholds(8)(data.nodes);
  contours=world.append('g').attr('class','contours').selectAll('path').data(density).join('path').attr('d',d3.geoPath()).attr('fill','none').attr('stroke',COLOR.contour).attr('stroke-width',.7).attr('opacity',.35);
  edgeElements=world.append('g').attr('class','map-edges').selectAll('line').data(data.edges).join('line').attr('class','map-edge')
    .attr('x1',e=>position(nodes.get(e.a))[0]).attr('y1',e=>position(nodes.get(e.a))[1]).attr('x2',e=>position(nodes.get(e.b))[0]).attr('y2',e=>position(nodes.get(e.b))[1])
    .on('click',(event,e)=>{event.stopPropagation();dispatch({type:'edge',edge:key(e.a,e.b)});});
  nodeElements=world.append('g').attr('class','map-nodes').selectAll('g').data(data.nodes).join('g').attr('class','map-node').attr('transform',n=>'translate('+position(n)+')')
    .on('click',(event,n)=>{event.stopPropagation();dispatch({type:'word',word:n.word});});
  nodeElements.append('circle').attr('class','hit-area').attr('r',14).attr('fill','transparent');
  nodeElements.append('circle').attr('class','halo').attr('r',11).attr('fill','none').attr('stroke',COLOR.route).attr('stroke-width',1);
  nodeElements.append('circle').attr('class','point');
  nodeElements.append('text').attr('x',11).attr('y',5).text(n=>n.word);
  world.append('g').attr('class','board-world');
  zoom=d3.zoom().scaleExtent([.4,4]).filter(event=>event.type!=='wheel'||event.ctrlKey||event.metaKey).on('zoom',event=>world.attr('transform',event.transform));
  svg.call(zoom);
  frameMap();svg.call(zoom.transform,homeTransform);
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{frameMap();svg.call(zoom.transform,homeTransform);},150);});
  $('zoom-in').onclick=()=>svg.call(zoom.scaleBy,1.3);
  $('zoom-out').onclick=()=>svg.call(zoom.scaleBy,1/1.3);
  $('zoom-reset').onclick=()=>svg.call(zoom.transform,homeTransform);
}
/** Fit the sheet to what matters at this size and keep labels at a readable pixel size.
    A phone frames the two starters (the sheet is cropped and panned like a map);
    a desktop fits every drawn word; the board view fits the board layout. */
function frameMap(){
  const d3=window.d3,el=svg.node(),W=el.clientWidth||1000,H=el.clientHeight||620,slice=narrow();
  svg.attr('preserveAspectRatio',slice?'xMidYMid slice':'xMidYMid meet');
  const s=slice?Math.max(W/1000,H/620):Math.min(W/1000,H/620);
  const fit=(points,padX,padY,max)=>{
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const x0=Math.min(...xs)-padX,x1=Math.max(...xs)+padX,y0=Math.min(...ys)-padY,y1=Math.max(...ys)+padY;
    const k=Math.min(max,(W/s)/(x1-x0),(H/s)/(y1-y0));
    return d3.zoomIdentity.translate(500-k*(x0+x1)/2,310-k*(y0+y1)/2).scale(k);
  };
  const starters=[position(nodes.get(data.game.tl)),position(nodes.get(data.game.br))];
  const searchFit=slice?fit(starters,70,90,1.4):fit(data.nodes.map(position),70,50,1.5);
  const boardFit=fit([[170,290],[830,290],[500,220],[500,410]],120,110,1.5);
  homeTransform=state?.view==='board'?boardFit:searchFit;
  const unit=15/(s*homeTransform.k);// 15 CSS pixels at the home zoom, whatever the sheet scale is
  // On a phone the right-hand starter is labelled on its left, so both fit without clipping.
  flipped=slice?(starters[0][0]>starters[1][0]?data.game.tl:data.game.br):null;
  nodeElements.select('text').attr('text-anchor',n=>n.word===flipped?'end':null).attr('x',n=>n.word===flipped?-11:11);
  const t=homeTransform,hw=W/(2*s),hh=H/(2*s);
  viewBounds=[(500-hw-t.x)/t.k,(500+hw-t.x)/t.k,(310-hh-t.y)/t.k,(310+hh-t.y)/t.k];
  el.style.setProperty('--label',unit+'px');
  el.style.setProperty('--label-anchor',unit*(slice?1.3:1.5)+'px');
  el.style.setProperty('--label-route',unit*1.25+'px');
  el.style.setProperty('--label-board',unit*1.5+'px');
  el.style.setProperty('--label-note',unit*1.05+'px');
  labelUnit=unit;
}
function bind(){
  $('watch').onclick=()=>{if(state.index>=timeline.length-1)dispatch({type:'restart'});if(!state.playing)dispatch({type:'play'});dispatch({type:'step',delta:1});$('atlas').scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});};
  $('reveal').onclick=()=>{if(custom)custom.onBoard=false;dispatch({type:'reveal'});};
  $('play').onclick=()=>{if(state.index>=timeline.length-1)dispatch({type:'restart'});dispatch({type:'play'});};
  $('previous').onclick=()=>dispatch({type:'seek',index:state.index-1});
  $('next').onclick=()=>dispatch({type:'seek',index:state.index+1});
  $('restart').onclick=()=>dispatch({type:'restart'});
  $('timeline').oninput=event=>dispatch({type:'seek',index:Number(event.target.value)});
  $('speed').onclick=event=>{const button=event.target.closest('[data-speed]');if(!button)return;speed=Number(button.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',b===button));schedule();};
  document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>dispatch({type:'view',value:button.dataset.view}));
  document.querySelector('.tabs').onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const buttons=[...document.querySelectorAll('[data-view]')];const i=buttons.indexOf(document.activeElement);const next=buttons[(i+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length];next.focus();next.click();};
  $('word-filter').oninput=renderWords;
  $('word-list').onclick=event=>{const button=event.target.closest('[data-word]');if(button)dispatch({type:'word',word:button.dataset.word});};
  $('inspector-content').onclick=event=>{
    const word=event.target.closest('[data-word]'),edge=event.target.closest('[data-edge]'),source=event.target.closest('[data-source]');
    if(word)dispatch({type:'word',word:word.dataset.word});
    if(edge)dispatch({type:'edge',edge:edge.dataset.edge});
    if(source)dispatch({type:'source',value:source.dataset.source});
    if(event.target.closest('[data-daily-board]')&&custom){custom.onBoard=false;render();}
  };
  $('solution').onclick=event=>{
    const candidate=event.target.closest('[data-candidate]'),word=event.target.closest('[data-word]'),edge=event.target.closest('[data-edge]');
    if(candidate){if(custom)custom.onBoard=false;dispatch({type:'candidate',index:Number(candidate.dataset.candidate)});}
    if(edge)dispatch({type:'edge',edge:edge.dataset.edge});
    if(word)dispatch({type:'word',word:word.dataset.word});
  };
  $('hero-route').onclick=event=>{const word=event.target.closest('[data-word]');if(word)dispatch({type:'word',word:word.dataset.word});};
  $('solve-form').onsubmit=event=>{event.preventDefault();solvePair($('solve-from').value,$('solve-to').value);};
  $('solve-results').onclick=event=>{
    const pick=event.target.closest('[data-custom-candidate]'),board=event.target.closest('[data-show-board]');
    if(pick&&custom){custom.selected=Number(pick.dataset.customCandidate);custom.sim=simulate(graph,custom.tl,custom.br,custom.chains[custom.selected].words.slice(1,-1));renderSolve();}
    if(board&&custom){custom.onBoard=true;dispatch({type:'view',value:'board'});}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing)dispatch({type:'play'});});
}
function dispatch(action){
  const previous=state;
  state=transition(state,action,data);
  if(['step','seek'].includes(action.type)&&state.stage==='board'&&previous.stage!=='board')state.view='board';
  render();schedule();
  // Re-frame after rendering so the sheet has its real size (it is hidden in the Any pair view).
  if(state.view!==previous.view&&state.view!=='solve'){frameMap();svg.call(zoom.transform,homeTransform);renderMap();}
  if(!previous.revealed&&state.revealed)animateReveal();
}
function schedule(){
  clearTimeout(timer);
  if(state.playing)timer=setTimeout(()=>dispatch({type:'step',delta:1}),(reduced?800:450)/speed);
}
function render(){
  document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===state.view;button.setAttribute('aria-selected',active);button.tabIndex=active?0:-1;});
  document.querySelector('.map-panel').setAttribute('aria-labelledby','tab-'+state.view);
  $('map-intro').hidden=state.index>0||state.view!=='search';
  $('play').innerHTML=state.playing?ICON.pause:ICON.play;$('play').setAttribute('aria-label',state.playing?'Pause recorded solve':'Play recorded solve');
  $('timeline').value=state.index;
  $('step-count').textContent=state.index+' / '+(timeline.length-1);
  $('previous').disabled=state.index===0;$('next').disabled=state.index===timeline.length-1;
  const stageNames={ready:'Ready',search:'Searching outward',ranking:'Comparing shortest chains',verification:'Checking with the game',board:'Replaying the game board',complete:'Done'};
  $('stage-label').textContent=stageNames[state.stage];
  $('visited').textContent=number(state.visited);$('frontier').textContent=number(state.frontier);$('layer').textContent=state.depth;
  $('map-label').textContent={search:'The space between the words',neighborhoods:'Nearest in the original vector space',board:'One word at a time',solve:'Any two words'}[state.view];
  const solving=state.view==='solve';
  $('solve-panel').hidden=!solving;$('map').toggleAttribute('hidden',solving);
  document.querySelector('.map-topline').hidden=solving;document.querySelector('.map-bottom').hidden=solving;
  document.querySelector('.playback').hidden=solving;document.querySelector('.map-stats').hidden=solving;
  if(solving)$('map-intro').hidden=true;
  $('reveal').hidden=state.revealed;
  $('hint').textContent=(state.revealed?'':'The chain stays hidden until you ask. ')+'Search took '+data.timings.search.toFixed(2)+' s on the full graph.';
  renderHero();renderMap();renderInspector();renderSolution();renderSolve();
  const checking=data.candidates[state.checking];
  const captions={ready:'The solver has already made the trip. You can follow along.',
    search:`Looking ${state.depth} ${state.depth===1?'link':'links'} from the start. ${number(state.visited)} words discovered so far.`,
    ranking:`The search found ${data.candidates.length} shortest ${data.candidates.length===1?'chain':'chains'}. Chains of equal length are ranked by their total link score.`,
    verification:checking?`${checking.words.join(' → ')}: ${checking.status==='verified'?'accepted by the game and connected in board replay':checking.error||'check unavailable'}.`:'No chain is available to check.',
    board:'The two starters are already on the board. Add only the words in between; the game keeps each word’s strongest links.',
    complete:data.candidates.some(c=>c.status==='verified')?'The highlighted chain passed the game’s dictionary check and its board replay.':'No chain was confirmed by the game today. Explore the local candidates and their recorded checks.'};
  if(captions[state.stage]!==lastNarration){$('narration').textContent=captions[state.stage];lastNarration=captions[state.stage];}
}
function currentWords(){
  const c=data.candidates[state.candidate];
  if(!c)return null;
  return c.status==='verified'&&c.server_frames.at(-1)?.path.length?c.server_frames.at(-1).path:c.words;
}
function currentFrames(){
  const c=data.candidates[state.candidate];
  return c?(state.source==='server'?c.server_frames:c.local_frames):[];
}
/** The hero route: the two starters plus, once revealed, each added word as a station. */
function renderHero(){
  const c=data.candidates[state.candidate],words=state.revealed&&c?currentWords():null;
  const nextKey=words?words.join('|'):'hidden';
  if(nextKey===heroKey)return;heroKey=nextKey;
  if(!words){
    $('hero-route').innerHTML=routeHTML([data.game.tl,data.game.br],null,{ids:true});
    return;
  }
  const scores=c.status==='verified'&&c.server_scores?.length===words.length-1?c.server_scores:c.scores;
  $('hero-route').innerHTML=routeHTML(words,scores,{ids:true,interactive:true});
}
/** Route markup shared by the hero and the Any pair results. scores=null draws a pending leg. */
function routeHTML(words,scores,{ids=false,interactive=false}={}){
  const terminus=(w,label,id)=>`<span class="stop terminus"><b${ids?` id="${id}"`:''}>${escape(w)}</b><small>${label}</small></span>`;
  if(!scores)return terminus(words[0],'start','starter-a')+'<span class="leg pending" aria-hidden="true"><i></i><em>?</em></span>'+terminus(words[words.length-1],'finish','starter-b');
  return words.map((w,i)=>{
    const leg=i?`<span class="leg" aria-hidden="true"><i></i><em>${scores[i-1]!=null?Number(scores[i-1]).toFixed(2):''}</em></span>`:'';
    if(i===0)return terminus(w,'start','starter-a');
    if(i===words.length-1)return leg+terminus(w,'finish','starter-b');
    return leg+(interactive?`<button class="stop station" data-word="${escape(w)}"><b>${escape(w)}</b><small>add this</small></button>`:`<span class="stop station"><b>${escape(w)}</b><small>add this</small></span>`);
  }).join('');
}
/** Which board to draw: the daily candidate, or the pair the visitor solved themselves. */
function boardContext(){
  if(custom?.onBoard&&custom.sim)return {frames:custom.sim.frames,tl:custom.tl,br:custom.br,source:'local',custom:true};
  return {frames:currentFrames(),tl:data.game.tl,br:data.game.br,source:state.source,custom:false};
}
/** Load the link graph once, on demand, with the same integrity check as the daily bundle. */
async function loadGraph(){
  if(graph)return graph;
  if(!graphLoading)graphLoading=(async()=>{
    const status=$('solve-status');
    if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot unpack the word graph. Use the command-line solver instead.');
    const manifestResponse=await fetch('./data/graph.json',{cache:'no-cache'});
    if(!manifestResponse.ok)throw new Error('The word graph is unavailable right now.');
    const manifest=await manifestResponse.json();
    if(manifest.schema_version!==1||!/^graph-[a-f0-9]+\.bin$/.test(manifest.file))throw new Error('The word graph uses an unsupported format.');
    const response=await fetch('./data/'+manifest.file);
    if(!response.ok||!response.body)throw new Error('The word graph could not be downloaded.');
    const total=Number(response.headers.get('content-length'))||0,reader=response.body.getReader(),chunks=[];
    let received=0;
    for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;status.textContent='Downloading the word graph once: '+(received/1048576).toFixed(1)+(total?' of '+(total/1048576).toFixed(1):'')+' MB.';}
    const compressed=new Uint8Array(received);let at=0;for(const chunk of chunks){compressed.set(chunk,at);at+=chunk.length;}
    if(globalThis.crypto?.subtle){
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',compressed)),b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==manifest.sha256)throw new Error('The word graph did not pass its integrity check.');
    }
    status.textContent='Unpacking '+number(manifest.words)+' words and '+number(manifest.edges)+' links.';
    const raw=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    // Words the game rejected in past verifications are skipped; the list is optional.
    try{const rejected=await (await fetch('./data/rejected.json',{cache:'no-cache'})).json();if(rejected.schema_version===1&&Array.isArray(rejected.words))blocked=new Set(rejected.words.filter(w=>typeof w==='string'));}catch{blocked=new Set();}
    graph=parseGraph(raw);
    return graph;
  })().catch(error=>{graphLoading=null;throw error;});
  return graphLoading;
}
async function solvePair(fromValue,toValue){
  const status=$('solve-status'),button=$('solve-button');
  const tl=normalize(fromValue),br=normalize(toValue);
  status.className='solve-status error';
  if(!tl||!br){status.textContent='Each word needs 3 to 15 letters, a to z only.';return;}
  if(tl===br){status.textContent='Pick two different words.';return;}
  button.disabled=true;
  try{
    status.className='solve-status';
    const g=await loadGraph();
    const missing=[tl,br].filter(w=>!g.index.has(w));
    if(missing.length){status.className='solve-status error';status.textContent=missing.map(w=>'“'+w+'”').join(' and ')+(missing.length===1?' isn’t':' aren’t')+' in the solver’s vocabulary of '+number(g.words.length)+' common words.';custom=null;renderSolve();return;}
    const started=performance.now(),result=shortestChains(g,tl,br,5,blocked),elapsed=performance.now()-started;
    if(!result.chains.length){status.textContent='No chain connects '+tl+' and '+br+' in this vocabulary after exploring '+number(result.visited)+' words. The game’s wider dictionary may still allow one.';custom=null;renderSolve();return;}
    custom={tl,br,chains:result.chains,selected:0,visited:result.visited,layers:result.layers,elapsed,onBoard:false};
    custom.sim=simulate(g,tl,br,result.chains[0].words.slice(1,-1));
    status.textContent='Searched '+number(result.visited)+' words in '+(elapsed<1?'under a millisecond':Math.round(elapsed)+' ms')+'.';
    renderSolve();
  }catch(error){status.className='solve-status error';status.textContent=error.message;}
  finally{button.disabled=false;}
}
function renderSolve(){
  const box=$('solve-results');
  const nextKey=custom?custom.tl+'|'+custom.br+'|'+custom.selected:'';
  if(nextKey===solveKey)return;solveKey=nextKey;
  if(!custom){box.innerHTML='';if(state.view==='solve')renderInspector();return;}
  const chain=custom.chains[custom.selected],sim=custom.sim,n=chain.added;
  const verdict=sim.won?`<p class="verdict verified">Wins under the game’s rules locally after adding ${n===0?'no words':n===1?'one word':n+' words'}</p>`:'<p class="verdict unverified">Not connected under the game’s top-five link rule</p>';
  const alternates=custom.chains.length>1?`<h3>Shortest chains found</h3><ol class="alternates">${custom.chains.map((c,i)=>`<li><button data-custom-candidate="${i}" class="${custom.selected===i?'active':''}" aria-pressed="${custom.selected===i}"><span class="chain">${c.words.map(escape).join(' → ')}</span><span class="status">${c.total.toFixed(2)} total</span></button></li>`).join('')}</ol>`:'';
  const letters=chain.words.join('').length+chain.words.length*2,scale=Math.min(1,40/letters).toFixed(2);// long chains shrink to stay on one line
  box.innerHTML=`<div class="solve-result"><div class="route compact" style="--route-scale:${scale}" aria-label="Chain from ${escape(custom.tl)} to ${escape(custom.br)}">${routeHTML(chain.words,chain.scores)}</div>${verdict}<p class="note">Local model only, not checked against the game. The game’s dictionary sometimes rejects a word${blocked.size?' (it has rejected '+number(blocked.size)+' of ours so far, and those are skipped)':''}; if it rejects one of these, play the next chain. <a href="https://linxicon.com/practice">Try it in practice mode</a>.</p><div class="solve-actions"><button class="button-secondary" data-show-board>Show on the game board</button></div>${alternates}</div>`;
  if(state.view==='solve')renderInspector();
}
/** One orchestrated moment: the route grows stop by stop, on the hero and on the map. */
function animateReveal(){
  if(reduced||!window.gsap)return;
  const legs=[...document.querySelectorAll('#hero-route .leg')];
  if(!legs.length)return;
  const words=currentWords()||[];
  const routeLines=words.slice(1).map((w,i)=>edgeElements.filter(e=>key(e.a,e.b)===key(words[i],w)).node()).filter(Boolean);
  const step=.42,tl=gsap.timeline({defaults:{ease:'power2.out'}});
  tl.from(legs.map(l=>l.querySelector('i')),narrow()?{scaleY:0,duration:step,stagger:step}:{scaleX:0,duration:step,stagger:step},0)
    .from(legs.map(l=>l.querySelector('em')),{opacity:0,duration:.3,stagger:step},step*.6)
    .from(document.querySelectorAll('#hero-route .station'),{opacity:0,y:6,duration:.35,stagger:step},step*.7)
    .from($('solution'),{opacity:0,duration:.4},step*legs.length*.8);
  if(routeLines.length&&window.DrawSVGPlugin)tl.from(routeLines,{drawSVG:'50% 50%',duration:step,stagger:step},0);
}
function renderMap(){
  const board=state.view==='board';
  world.select('.map-edges').attr('display',board?'none':null);world.select('.map-nodes').attr('display',board?'none':null);contours.attr('display',board?'none':null);
  const boardWorld=world.select('.board-world');boardWorld.attr('display',board?null:'none');
  if(board){
    boardWorld.selectAll('*').remove();
    const ctx=boardContext();
    if(!ctx.custom&&!state.revealed){boardWorld.append('text').attr('x',500).attr('y',300).attr('text-anchor','middle').attr('class','map-frame-note').text('Watch the search or reveal the chain to see its board.');return;}
    const frames=ctx.frames;
    if(!frames.length){boardWorld.append('text').attr('x',500).attr('y',300).attr('text-anchor','middle').attr('class','map-frame-note').text('No '+(ctx.source==='server'?'game':'local')+' board replay is available for this chain.');return;}
    const frame=frames[!ctx.custom&&state.stage==='board'?Math.min(state.boardIndex??0,frames.length-1):frames.length-1];
    const positions=new Map(frame.words.map((word,i)=>[word,i===0?[170,290]:i===1?[830,290]:[250+(i-2)*Math.min(500/Math.max(1,frame.words.length-3),170),410-(i%2)*190]]));
    for(const edge of [...frame.pruned.map(e=>({...e,pruned:true})),...frame.edges]){
      const a=positions.get(edge.a),b=positions.get(edge.b);
      const route=frame.path.some((w,i)=>i>0&&key(w,frame.path[i-1])===key(edge.a,edge.b));
      boardWorld.append('line').attr('class','board-edge').attr('x1',a[0]).attr('y1',a[1]).attr('x2',b[0]).attr('y2',b[1]).attr('stroke',edge.pruned?COLOR.explore:route?COLOR.route:COLOR.discovered).attr('stroke-width',route?4:1.6).attr('stroke-linecap','round').attr('stroke-dasharray',edge.pruned?'5 6':null).attr('opacity',edge.pruned?.5:.9).on('click',()=>dispatch({type:'edge',edge:key(edge.a,edge.b)}));
      boardWorld.append('text').attr('x',(a[0]+b[0])/2).attr('y',(a[1]+b[1])/2-10).attr('class','map-frame-note').attr('text-anchor','middle').text(edge.score.toFixed(2));
    }
    for(const [word,p] of positions){const group=boardWorld.append('g').attr('class','board-node').attr('transform','translate('+p+')').on('click',()=>dispatch({type:'word',word}));group.append('circle').attr('r',8).attr('fill',[ctx.tl,ctx.br].includes(word)?COLOR.ink:COLOR.route);group.append('circle').attr('r',17).attr('fill','none').attr('stroke',COLOR.route).attr('opacity',.35);group.append('text').attr('x',0).attr('y',-30).attr('text-anchor','middle').text(word);}
    boardWorld.append('text').attr('x',500).attr('y',520).attr('text-anchor','middle').attr('class','map-frame-note').text((frame.path.length?'Connected':'Not connected yet')+' with '+Math.max(0,frame.words.length-2)+' '+(frame.words.length===3?'word':'words')+' added, using '+(ctx.source==='server'?'game':'local')+' scores');
    return;
  }
  const discovered=new Set(state.discovered),c=data.candidates[state.candidate];
  const route=new Set(state.revealed?(c?.words||[]):[]),routeEdges=new Set();
  if(state.revealed)c?.words.forEach((w,i)=>{if(i)routeEdges.add(key(w,c.words[i-1]));});
  const neighbors=new Set(nodes.get(state.selected)?.neighbors.map(n=>n.word)||[]);
  const showNeighborhood=state.view==='neighborhoods';
  edgeElements.attr('stroke',e=>routeEdges.has(key(e.a,e.b))?COLOR.route:COLOR.edge)
    .attr('stroke-width',e=>routeEdges.has(key(e.a,e.b))?4:(e.a===state.selected||e.b===state.selected)?1.4:.7)
    .attr('stroke-linecap','round')
    .attr('stroke-dasharray',e=>e.local<data.config.threshold?'4 4':null)
    .attr('opacity',e=>{
      if(routeEdges.has(key(e.a,e.b)))return .95;
      if(e.local<data.config.threshold)return 0;
      if(showNeighborhood)return e.a===state.selected||e.b===state.selected?.4:.03;
      if(state.index===0)return .025;
      const tree=nodes.get(e.a)?.parent===e.b||nodes.get(e.b)?.parent===e.a;
      return tree&&discovered.has(e.a)&&discovered.has(e.b)?.4:.025;
    }).attr('pointer-events',e=>state.index===0&&!showNeighborhood?'none':'stroke');
  const occupied=[];
  const labels=new Set([data.game.tl,data.game.br,state.selected,...route]);
  // Fewer, larger labels on a phone so the map stays readable.
  const budget=narrow()?10:42,pad=labelUnit*.55,above=labelUnit*.75,below=labelUnit*.45;
  const priorities=[...data.nodes].sort((a,b)=>Number(labels.has(b.word))-Number(labels.has(a.word))||Number(neighbors.has(b.word))-Number(neighbors.has(a.word))||a.word.localeCompare(b.word));
  const anchors=[data.game.tl,data.game.br];
  for(const n of priorities){
    const p=position(n),width=n.word.length*pad*(anchors.includes(n.word)?1.5:route.has(n.word)?1.25:1)+12;
    const rect=n.word===flipped?[p[0]-width,p[1]-above,p[0],p[1]+below]:[p[0],p[1]-above,p[0]+width,p[1]+below];
    if(labels.has(n.word)){occupied.push(rect);continue;}
    if(viewBounds&&(rect[0]<viewBounds[0]||rect[2]>viewBounds[1]||rect[1]<viewBounds[2]||rect[3]>viewBounds[3]))continue;
    if(state.index===0&&data.candidates.some(c=>c.words.includes(n.word)))continue;
    const eligible=showNeighborhood?neighbors.has(n.word):(state.index===0?n.discovery%43===0:discovered.has(n.word));
    if(!eligible||labels.size>budget)continue;
    if(occupied.some(r=>rect[0]<r[2]+10&&rect[2]>r[0]-10&&rect[1]<r[3]+8&&rect[3]>r[1]-8))continue;
    labels.add(n.word);occupied.push(rect);
  }
  nodeElements.attr('class',n=>'map-node'+([data.game.tl,data.game.br].includes(n.word)?' anchor':'')+(route.has(n.word)?' route':''));
  nodeElements.select('.point').attr('r',n=>[data.game.tl,data.game.br].includes(n.word)?6:route.has(n.word)?5:2.4)
    .attr('fill',n=>route.has(n.word)?COLOR.route:[data.game.tl,data.game.br].includes(n.word)?COLOR.ink:showNeighborhood&&neighbors.has(n.word)?COLOR.near:discovered.has(n.word)?COLOR.discovered:COLOR.faint)
    .attr('opacity',n=>labels.has(n.word)?1:showNeighborhood?.55:discovered.has(n.word)?.85:.45);
  nodeElements.select('.halo').attr('display',n=>n.word===state.selected||[data.game.tl,data.game.br].includes(n.word)?null:'none').attr('opacity',n=>n.word===state.selected?.9:.35);
  nodeElements.select('text').attr('display',n=>labels.has(n.word)?null:'none');
}
function renderInspector(){
  const c=data.candidates[state.candidate];
  const ctx=boardContext();
  const boardNote=state.view==='board'&&ctx.custom?`<div class="board-note"><span>Showing your pair, ${escape(custom.tl)} → ${escape(custom.br)}.</span><button data-daily-board>Back to today’s puzzle</button></div>`:'';
  if(state.view==='solve'||boardNote){
    if(!custom){$('inspector-content').innerHTML='<h2>Solve any pair</h2><p>Type two words and the solver searches its graph of common words for the shortest chain, the same way it solves the daily puzzle.</p><p>Results use the local scoring model. The game itself has the final say on spelling and scores.</p>';return;}
    const chain=custom.chains[custom.selected];
    $('inspector-content').innerHTML=`<h2>${escape(custom.tl)}<span class="to">to</span>${escape(custom.br)}</h2><p class="word-kind">${chain.added===0?'Linked directly':chain.added===1?'One word between':chain.added+' words between'}</p><p class="section-label">Link scores</p>${chain.words.slice(1).map((w,i)=>`<div class="score-row"><span>${escape(chain.words[i])} → ${escape(w)}</span><b>${chain.scores[i].toFixed(4)}</b></div>`).join('')}<div class="score-row"><span>Total</span><b>${chain.total.toFixed(4)}</b></div><p>A link needs a score of at least 0.3995. Searched ${number(custom.visited)} words, ${custom.layers} ${custom.layers===1?'link':'links'} deep.</p>${boardNote}`;
    return;
  }
  const sourceSwitch=state.view==='board'&&!ctx.custom?`<div class="source-switch" aria-label="Board scoring source"><button data-source="local" class="${state.source==='local'?'active':''}">Local model</button><button data-source="server" class="${state.source==='server'?'active':''}">Game scores</button></div>`:boardNote;
  if(state.edge&&edges.has(state.edge)){
    const edge=edges.get(state.edge);
    const pair=c?.server_pairs.find(p=>key(p.a,p.b)===state.edge);
    const remote=pair?.score??null;
    $('inspector-content').innerHTML=`<button class="back-word" data-word="${escape(state.selected)}">‹ Back to ${escape(state.selected)}</button><h2>${escape(edge.a)}<span class="to">to</span>${escape(edge.b)}</h2><p>A link needs a score of at least 0.3995. The strongest local signal wins.</p><div class="score-row"><span>Vector similarity</span><b>${score(edge.cosine)}</b></div><div class="score-row"><span>WordNet boost</span><b>${score(edge.boost)}</b></div><div class="score-row"><span>Final local score</span><b>${score(edge.local)}</b></div><div class="score-row"><span>Game score</span><b>${score(remote)}</b></div><div class="threshold-meter" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,(remote??edge.local)*100))}%"></i></div><p>${remote==null?'The game has not scored this pair for the selected chain.':remote>=data.config.threshold?'The game allows this link.':'The game’s score falls below the link threshold.'}</p><details><summary>Why these words connect</summary><p>${escape(edge.relationship?.label||'The local score comes from the vectors alone.')}</p>${edge.relationship?.definition?'<p>'+escape(edge.relationship.definition)+'</p>':''}<p>Cosine similarity and WordNet boosts are separate signals. The game can disagree with the local model.</p></details>${sourceSwitch}`;
    return;
  }
  const n=nodes.get(state.selected);
  if(!n){$('inspector-content').innerHTML=`<h2>${escape(state.selected)}</h2><p>This word is not on today’s map.</p>${sourceSwitch}`;return;}
  const kind=n.word===data.game.tl?'Start word':n.word===data.game.br?'Finish word':'A word near the puzzle';
  const relevant=data.edges.filter(e=>e.local>=data.config.threshold&&(e.a===n.word||e.b===n.word)).sort((a,b)=>b.local-a.local).slice(0,6);
  $('inspector-content').innerHTML=`<h2>${escape(n.word)}</h2><p class="word-kind">${kind}</p><p>Words nearby in the original vector space. A higher score means a more similar direction.</p><p class="section-label">Nearest by vector</p><ol class="neighbor-list">${n.neighbors.map(other=>`<li>${nodes.has(other.word)?`<button data-word="${escape(other.word)}">${escape(other.word)}</button>`:`<span class="outside" title="Not on this map">${escape(other.word)}</span>`}<span class="score">${other.score.toFixed(3)}</span><span class="neighbor-bar" aria-hidden="true"><i style="width:${Math.max(0,other.score)*100}%"></i></span></li>`).join('')}</ol><details><summary>Game links (${relevant.length})</summary><ul class="neighbor-list">${relevant.map(e=>`<li><button data-edge="${escape(key(e.a,e.b))}">${escape(e.a===n.word?e.b:e.a)}</button><span class="score">${score(e.local)}</span></li>`).join('')}</ul><p>These include WordNet boosts, so they differ from the vector ranking above.</p></details>${sourceSwitch}`;
}
function renderSolution(){
  $('solution').hidden=!state.revealed;if(!state.revealed){$('solution').innerHTML='';return;}
  const c=data.candidates[state.candidate];
  if(!c){$('solution').innerHTML='<div><h2 id="solution-title">No chain in the local graph</h2><p>This vocabulary and scoring model could not connect the two words.</p></div>';return;}
  const words=currentWords();
  const intermediates=words.filter(w=>![data.game.tl,data.game.br].includes(w));
  const n=intermediates.length,verified=c.status==='verified';
  const title=verified?(n===0?'They connect directly.':`${COUNT[n]||n} ${n===1?'word connects':'words connect'} them.`):'A candidate, with a caveat';
  const verdict=verified?'<p class="verdict verified">Checked against the game’s own scores</p>':`<p class="verdict ${c.status}">${c.status==='rejected'?'Rejected by the game':'Not confirmed by the game'}</p>`;
  const instructions=verified?`Open game #${data.game.id} and add ${n?intermediates.map(w=>'<strong>'+escape(w)+'</strong>').join(', then '):'nothing'}. Every word passed the dictionary check and the game’s scores connect the board.`:escape(c.error||'The game’s checks were unavailable when this solve was recorded.');
  const links=words.slice(1).map((w,i)=>`<button data-edge="${escape(key(words[i],w))}" aria-label="Inspect ${escape(words[i])} to ${escape(w)}">${escape(words[i])} → ${escape(w)}</button>`).join('');
  const alternates=data.candidates.map((candidate,i)=>`<li><button data-candidate="${i}" class="${state.candidate===i?'active':''}" aria-pressed="${state.candidate===i}"><span class="chain">${candidate.words.map(escape).join(' → ')}</span><span class="status ${candidate.status}">${STATUS[candidate.status]||candidate.status}</span></button></li>`).join('');
  $('solution').innerHTML=`<div><h2 id="solution-title">${title}</h2>${verdict}<p>${instructions}</p><a class="open-game" href="https://linxicon.com/play/daily">Open game #${data.game.id}</a><div class="solution-links" aria-label="Inspect each link">${links}</div></div><div><h3>${data.candidates.length===1?'The only shortest chain':'Shortest chains found'}</h3><ol class="alternates">${alternates}</ol><p>Same number of links, ordered by total local score. Each chain shows its own result from the game.</p></div>`;
}
function renderWords(){
  const query=$('word-filter').value.toLowerCase();
  const matching=data.nodes.filter(n=>n.word.includes(query));
  $('word-list').innerHTML=matching.length?matching.map(n=>`<button data-word="${escape(n.word)}">${escape(n.word)}</button>`).join(''):'<p>No matching word on this map.</p>';
}
start().catch(error=>{
  $('inspector-content').innerHTML='<h2>The map is unavailable</h2><p>'+escape(error.message)+'</p><p>Reload the page, or play the game directly.</p>';
  $('narration').textContent='The recorded solve could not be loaded. No chain has been assumed.';
  $('map-intro').innerHTML='<p>Today’s solve is on its way. <a href="https://linxicon.com/">Play Linxicon</a> in the meantime.</p>';
  $('map-intro').style.pointerEvents='auto';
});
