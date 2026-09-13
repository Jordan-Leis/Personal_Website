import {createTimeline,initialState,transition} from './replay.js';
const $=id=>document.getElementById(id);
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('en-US');
const score=n=>n==null?'Not checked':Number(n).toFixed(4);
const key=(a,b)=>[a,b].sort().join('|');
let data,state,timeline,nodes,edges,svg,world,nodeElements,edgeElements,contours,zoom,timer;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let speed=1,lastNarration='';
const position=n=>[80+(n.x+1)*420,65+(n.y+1)*235];

async function start(){
  const response=await fetch('./data/latest.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('The latest expedition could not be loaded.');
  const manifest=await response.json();
  if(manifest.schema_version!==1||!/^daily-\d+-[a-f0-9]+\.json$/.test(manifest.file))throw new Error('This expedition uses an unsupported format.');
  const bundle=await fetch('./data/'+manifest.file);if(!bundle.ok)throw new Error('The expedition data is unavailable.');
  const raw=await bundle.arrayBuffer();
  if(globalThis.crypto?.subtle){
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==manifest.sha256)throw new Error('The expedition did not pass its integrity check.');
  }
  data=JSON.parse(new TextDecoder().decode(raw));
  if(data.schema_version!==1||!Array.isArray(data.nodes)||data.nodes.length>500)throw new Error('Invalid expedition data.');
  nodes=new Map(data.nodes.map(n=>[n.word,n]));edges=new Map(data.edges.map(e=>[key(e.a,e.b),e]));
  state=initialState(data);timeline=createTimeline(data);
  $('intro-start').textContent=data.game.tl;$('intro-end').textContent=data.game.br;
  $('starter-a').textContent=data.game.tl;$('starter-b').textContent=data.game.br;
  $('puzzle-id').textContent='EXPEDITION '+String(data.game.id).padStart(3,'0');
  $('puzzle-date').textContent=new Date(data.game.date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).toUpperCase();
  $('puzzle-date').dateTime=data.game.date;
  $('compute-time').textContent='· SEARCH '+data.timings.search.toFixed(2)+'s';
  $('map-count').textContent=number(data.nodes.length)+' WORDS ON THIS MAP';
  $('timeline').max=timeline.length-1;
  for(const id of ['watch','reveal','play','timeline'])$(id).disabled=false;
  const age=Date.now()-Date.parse(data.generated_at);
  if(age>26*3600*1000){$('freshness').hidden=false;$('freshness').textContent='Latest available expedition · '+data.game.date+'. A newer recorded solve is not available yet.';}
  if(data.verification_status==='unavailable'){$('freshness').hidden=false;$('freshness').textContent='Some server checks were unavailable when this expedition was recorded. Local results are shown with their verification status.';}
  setupMap();bind();renderWords();render();
}
function setupMap(){
  const d3=window.d3;
  svg=d3.select('#map');
  world=svg.append('g').attr('class','map-world');
  const density=d3.contourDensity().x(n=>position(n)[0]).y(n=>position(n)[1]).size([1000,620]).bandwidth(35).thresholds(8)(data.nodes);
  contours=world.append('g').attr('class','contours').selectAll('path').data(density).join('path').attr('d',d3.geoPath()).attr('fill','none').attr('stroke','#8c9b83').attr('stroke-width',.6).attr('opacity',.19);
  world.append('path').attr('d','M28 84V56H56 M944 56H972V84 M28 536V564H56 M944 564H972V536').attr('fill','none').attr('stroke','#879580').attr('stroke-width',.7).attr('opacity',.45);
  edgeElements=world.append('g').attr('class','map-edges').selectAll('line').data(data.edges).join('line').attr('class','map-edge')
    .attr('x1',e=>position(nodes.get(e.a))[0]).attr('y1',e=>position(nodes.get(e.a))[1]).attr('x2',e=>position(nodes.get(e.b))[0]).attr('y2',e=>position(nodes.get(e.b))[1])
    .on('click',(event,e)=>{event.stopPropagation();dispatch({type:'edge',edge:key(e.a,e.b)});});
  nodeElements=world.append('g').attr('class','map-nodes').selectAll('g').data(data.nodes).join('g').attr('class','map-node').attr('transform',n=>'translate('+position(n)+')')
    .on('click',(event,n)=>{event.stopPropagation();dispatch({type:'word',word:n.word});});
  nodeElements.append('circle').attr('class','hit-area').attr('r',12).attr('fill','transparent');
  nodeElements.append('circle').attr('class','halo').attr('r',10).attr('fill','none').attr('stroke','#B6422E').attr('stroke-width',.7);
  nodeElements.append('circle').attr('class','point');
  nodeElements.append('text').attr('x',10).attr('y',4).text(n=>n.word);
  world.append('g').attr('class','board-world');
  zoom=d3.zoom().scaleExtent([.8,4]).filter(event=>event.type!=='wheel'||event.ctrlKey||event.metaKey).on('zoom',event=>world.attr('transform',event.transform));
  svg.call(zoom);
  $('zoom-in').onclick=()=>svg.call(zoom.scaleBy,1.3);
  $('zoom-out').onclick=()=>svg.call(zoom.scaleBy,1/1.3);
  $('zoom-reset').onclick=()=>svg.call(zoom.transform,d3.zoomIdentity);
}
function bind(){
  $('watch').onclick=()=>{if(state.index>=timeline.length-1)dispatch({type:'restart'});if(!state.playing)dispatch({type:'play'});dispatch({type:'step',delta:1});};
  $('reveal').onclick=()=>dispatch({type:'reveal'});
  $('play').onclick=()=>{if(state.index>=timeline.length-1)dispatch({type:'restart'});dispatch({type:'play'});};
  $('previous').onclick=()=>dispatch({type:'seek',index:state.index-1});
  $('next').onclick=()=>dispatch({type:'seek',index:state.index+1});
  $('restart').onclick=()=>dispatch({type:'restart'});
  $('timeline').oninput=event=>dispatch({type:'seek',index:Number(event.target.value)});
  $('speed').onchange=event=>{speed=Number(event.target.value);schedule();};
  document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>dispatch({type:'view',value:button.dataset.view}));
  document.querySelector('.tabs').onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const buttons=[...document.querySelectorAll('[data-view]')];const i=buttons.indexOf(document.activeElement);const next=buttons[(i+(event.key==='ArrowRight'?1:2))%3];next.focus();next.click();};
  $('word-filter').oninput=renderWords;
  $('word-list').onclick=event=>{const button=event.target.closest('[data-word]');if(button)dispatch({type:'word',word:button.dataset.word});};
  $('inspector-content').onclick=event=>{
    const word=event.target.closest('[data-word]'),edge=event.target.closest('[data-edge]'),source=event.target.closest('[data-source]');
    if(word)dispatch({type:'word',word:word.dataset.word});
    if(edge)dispatch({type:'edge',edge:edge.dataset.edge});
    if(source)dispatch({type:'source',value:source.dataset.source});
  };
  $('solution').onclick=event=>{
    const candidate=event.target.closest('[data-candidate]'),word=event.target.closest('[data-word]'),edge=event.target.closest('[data-edge]');
    if(candidate)dispatch({type:'candidate',index:Number(candidate.dataset.candidate)});
    if(edge)dispatch({type:'edge',edge:edge.dataset.edge});
    if(word)dispatch({type:'word',word:word.dataset.word});
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing)dispatch({type:'play'});});
}
function dispatch(action){
  const previous=state.stage;
  state=transition(state,action,data);
  if(['step','seek'].includes(action.type)&&state.stage==='board'&&previous!=='board')state.view='board';
  render();schedule();
}
function schedule(){
  clearTimeout(timer);
  if(state.playing)timer=setTimeout(()=>dispatch({type:'step',delta:1}),(reduced?800:450)/speed);
}
function render(){
  document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===state.view;button.setAttribute('aria-selected',active);button.tabIndex=active?0:-1;});
  document.querySelector('.map-panel').setAttribute('aria-labelledby','tab-'+state.view);
  $('map-intro').hidden=state.index>0||state.view!=='search';
  $('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'Pause recorded solve':'Play recorded solve');
  $('timeline').value=state.index;
  $('step-count').textContent=String(state.index).padStart(2,'0')+' / '+String(timeline.length-1).padStart(2,'0');
  $('previous').disabled=state.index===0;$('next').disabled=state.index===timeline.length-1;
  const stageNames={ready:'Ready to explore',search:'Searching the neighborhood',ranking:'Comparing shortest routes',verification:'Checking with the game',board:'Replaying the game board',complete:'Expedition complete'};
  $('stage-label').textContent=stageNames[state.stage];
  $('visited').textContent=number(state.visited);$('frontier').textContent=number(state.frontier);$('layer').textContent=state.depth;
  $('map-label').textContent={search:'THE SPACE BETWEEN WORDS',neighborhoods:'NEARBY IN THE ORIGINAL VECTOR SPACE',board:'ONE WORD AT A TIME'}[state.view];
  renderMap();renderInspector();renderSolution();
  const checking=data.candidates[state.checking];
  const captions={ready:'The solver has already made the journey. You can follow its footsteps.',
    search:`Looking ${state.depth} ${state.depth===1?'link':'links'} from the start. ${number(state.visited)} words discovered across the full graph.`,
    ranking:`The search found ${data.candidates.length} shortest ${data.candidates.length===1?'candidate':'candidates'}. Equal-length routes are ranked by their total link score.`,
    verification:checking?`${checking.words.join(' → ')}: ${checking.status==='verified'?'accepted by the server and connected in board replay':checking.error||'verification unavailable'}.`:'No candidate is available to verify.',
    board:'The two starters are already on the board. Add only the words in between; the game keeps each word’s strongest links.',
    complete:data.candidates.some(c=>c.status==='verified')?'A route through meaning. The highlighted candidate passed server validation and board replay.':'This expedition has no server-confirmed route. Explore the local candidates and their recorded check results.'};
  if(captions[state.stage]!==lastNarration){$('narration').textContent=captions[state.stage];lastNarration=captions[state.stage];}
}
function currentFrames(){
  const c=data.candidates[state.candidate];
  return c?(state.source==='server'?c.server_frames:c.local_frames):[];
}
function renderMap(){
  const d3=window.d3,board=state.view==='board';
  world.select('.map-edges').attr('display',board?'none':null);world.select('.map-nodes').attr('display',board?'none':null);contours.attr('display',board?'none':null);
  const boardWorld=world.select('.board-world');boardWorld.attr('display',board?null:'none');
  if(board){
    boardWorld.selectAll('*').remove();
    if(!state.revealed){boardWorld.append('text').attr('x',500).attr('y',300).attr('text-anchor','middle').attr('class','map-frame-note').text('Watch the search or reveal a route to inspect its board.');return;}
    const frames=currentFrames();
    if(!frames.length){boardWorld.append('text').attr('x',500).attr('y',300).attr('text-anchor','middle').attr('class','map-frame-note').text('No '+state.source+' board replay is available for this candidate.');return;}
    const frame=frames[state.stage==='board'?Math.min(state.boardIndex??0,frames.length-1):frames.length-1];
    const positions=new Map(frame.words.map((word,i)=>[word,i===0?[170,290]:i===1?[830,290]:[250+(i-2)*Math.min(500/Math.max(1,frame.words.length-3),170),410-(i%2)*190]]));
    for(const edge of [...frame.pruned.map(e=>({...e,pruned:true})),...frame.edges]){
      const a=positions.get(edge.a),b=positions.get(edge.b);
      const route=frame.path.some((w,i)=>i>0&&key(w,frame.path[i-1])===key(edge.a,edge.b));
      boardWorld.append('line').attr('class','board-edge').attr('x1',a[0]).attr('y1',a[1]).attr('x2',b[0]).attr('y2',b[1]).attr('stroke',edge.pruned?'#899384':route?'#B6422E':'#748779').attr('stroke-width',route?3:1.4).attr('stroke-dasharray',edge.pruned?'5 5':null).attr('opacity',edge.pruned?.35:.8).on('click',()=>dispatch({type:'edge',edge:key(edge.a,edge.b)}));
      boardWorld.append('text').attr('x',(a[0]+b[0])/2).attr('y',(a[1]+b[1])/2-8).attr('class','map-frame-note').attr('text-anchor','middle').text(edge.score.toFixed(2));
    }
    for(const [word,p] of positions){const group=boardWorld.append('g').attr('class','board-node').attr('transform','translate('+p+')').on('click',()=>dispatch({type:'word',word}));group.append('circle').attr('r',7).attr('fill',word===data.game.tl?'#193247':'#B6422E');group.append('circle').attr('r',16).attr('fill','none').attr('stroke','#B6422E').attr('opacity',.3);group.append('text').attr('x',0).attr('y',-28).attr('text-anchor','middle').text(word);}
    boardWorld.append('text').attr('x',500).attr('y',510).attr('text-anchor','middle').attr('class','map-frame-note').text((frame.path.length?'CONNECTED':'NOT CONNECTED YET')+' · '+Math.max(0,frame.words.length-2)+' words added · '+state.source+' scores');
    return;
  }
  const discovered=new Set(state.discovered),c=data.candidates[state.candidate];
  const route=new Set(state.revealed?(c?.words||[]):[]),routeEdges=new Set();
  if(state.revealed)c?.words.forEach((w,i)=>{if(i)routeEdges.add(key(w,c.words[i-1]));});
  const neighbors=new Set(nodes.get(state.selected)?.neighbors.map(n=>n.word)||[]);
  const showNeighborhood=state.view==='neighborhoods';
  edgeElements.attr('stroke',e=>routeEdges.has(key(e.a,e.b))?'#B6422E':'#667e6e')
    .attr('stroke-width',e=>routeEdges.has(key(e.a,e.b))?2.8:(e.a===state.selected||e.b===state.selected)?1.2:.65)
    .attr('stroke-dasharray',e=>e.local<data.config.threshold?'4 4':null)
    .attr('opacity',e=>{
      if(routeEdges.has(key(e.a,e.b)))return .9;
      if(e.local<data.config.threshold)return 0;
      if(showNeighborhood)return e.a===state.selected||e.b===state.selected?.3:.025;
      if(state.index===0)return .018;
      const tree=nodes.get(e.a)?.parent===e.b||nodes.get(e.b)?.parent===e.a;
      return tree&&discovered.has(e.a)&&discovered.has(e.b)?.35:.018;
    }).attr('pointer-events',e=>state.index===0&&!showNeighborhood?'none':'stroke');
  const occupied=[];
  const labels=new Set([data.game.tl,data.game.br,state.selected,...route]);
  const priorities=[...data.nodes].sort((a,b)=>Number(labels.has(b.word))-Number(labels.has(a.word))||Number(neighbors.has(b.word))-Number(neighbors.has(a.word))||a.word.localeCompare(b.word));
  for(const n of priorities){
    const p=position(n),width=n.word.length*7+12;
    if(labels.has(n.word)){occupied.push([p[0],p[1]-12,p[0]+width,p[1]+8]);continue;}
    if(state.index===0&&data.candidates.some(c=>c.words.includes(n.word)))continue;
    const eligible=showNeighborhood?neighbors.has(n.word):(state.index===0?n.discovery%43===0:discovered.has(n.word));
    if(!eligible||labels.size>42)continue;
    if(occupied.some(r=>p[0]<r[2]+10&&p[0]+width>r[0]-10&&p[1]-12<r[3]+8&&p[1]+8>r[1]-8))continue;
    labels.add(n.word);occupied.push([p[0],p[1]-12,p[0]+width,p[1]+8]);
  }
  nodeElements.attr('class',n=>'map-node'+([data.game.tl,data.game.br].includes(n.word)?' anchor':'')+(route.has(n.word)?' route':''));
  nodeElements.select('.point').attr('r',n=>[data.game.tl,data.game.br].includes(n.word)?5.5:route.has(n.word)?4.5:2.1)
    .attr('fill',n=>route.has(n.word)?'#B6422E':n.word===data.game.tl?'#193247':showNeighborhood&&neighbors.has(n.word)?'#536f57':'#879880')
    .attr('opacity',n=>labels.has(n.word)?1:showNeighborhood?.5:discovered.has(n.word)?.75:.27);
  nodeElements.select('.halo').attr('display',n=>n.word===state.selected||[data.game.tl,data.game.br].includes(n.word)?null:'none').attr('opacity',n=>n.word===state.selected?.9:.4);
  nodeElements.select('text').attr('display',n=>labels.has(n.word)?null:'none');
}
function renderInspector(){
  const c=data.candidates[state.candidate];
  const sourceSwitch=state.view==='board'?`<div class="source-switch" aria-label="Board scoring source"><button data-source="local" class="${state.source==='local'?'active':''}">Local model</button><button data-source="server" class="${state.source==='server'?'active':''}">Server scores</button></div>`:'';
  if(state.edge&&edges.has(state.edge)){
    const edge=edges.get(state.edge);
    const pair=c?.server_pairs.find(p=>key(p.a,p.b)===state.edge);
    const remote=pair?.score??null;
    $('inspector-content').innerHTML=`<button class="back-word" data-word="${escape(state.selected)}">← Back to ${escape(state.selected)}</button><h2>${escape(edge.a)}<br><span style="color:var(--red)">↳</span> ${escape(edge.b)}</h2><p>A link needs a score of at least 0.3995. The strongest local signal wins.</p><div class="score-row"><span>Vector similarity</span><b>${score(edge.cosine)}</b></div><div class="score-row"><span>WordNet boost</span><b>${score(edge.boost)}</b></div><div class="score-row"><span>Final local score</span><b>${score(edge.local)}</b></div><div class="score-row"><span>Server score</span><b>${score(remote)}</b></div><div class="threshold-meter"><i style="width:${Math.max(0,Math.min(100,(remote??edge.local)*100))}%"></i></div><p>${remote==null?'This pair has not been checked for the selected candidate.':remote>=data.config.threshold?'The server allows this link.':'The server score falls below the link threshold.'}</p><details><summary>Why these words connect</summary><p>${escape(edge.relationship?.label||'The local score comes from the vectors alone.')}</p>${edge.relationship?.definition?'<p>'+escape(edge.relationship.definition)+'</p>':''}<p>Cosine and WordNet boosts are separate signals. The server can disagree with the local model.</p></details>${sourceSwitch}`;
    return;
  }
  const n=nodes.get(state.selected),kind=n.word===data.game.tl?'THE STARTING POINT':n.word===data.game.br?'THE DESTINATION':'A WORD IN THIS NEIGHBORHOOD';
  const relevant=data.edges.filter(e=>e.local>=data.config.threshold&&(e.a===n.word||e.b===n.word)).sort((a,b)=>b.local-a.local).slice(0,6);
  $('inspector-content').innerHTML=`<h2>${escape(n.word)}</h2><p class="word-kind">${kind}</p><p>Words nearby in the original vector space. A higher score means a more similar direction.</p><p class="section-label">NEAREST VECTOR NEIGHBORS</p><ol class="neighbor-list">${n.neighbors.map(other=>`<li>${nodes.has(other.word)?`<button data-word="${escape(other.word)}">${escape(other.word)} <span aria-hidden="true">↗</span></button>`:`<span class="outside" title="Outside this expedition's map">${escape(other.word)}</span>`}<span class="score">${other.score.toFixed(3)}</span><span class="neighbor-bar" aria-hidden="true"><i style="width:${Math.max(0,other.score)*100}%"></i></span></li>`).join('')}</ol><details><summary>Inspect game links (${relevant.length})</summary><ul class="neighbor-list">${relevant.map(e=>`<li><button data-edge="${escape(key(e.a,e.b))}">${escape(e.a===n.word?e.b:e.a)} ↗</button><span class="score">${score(e.local)}</span></li>`).join('')}</ul><p>These include lexical boosts. They are different from the vector-neighbor ranking above.</p></details>${sourceSwitch}`;
}
function renderSolution(){
  $('solution').hidden=!state.revealed;if(!state.revealed){$('solution').innerHTML='';return;}
  const c=data.candidates[state.candidate];
  if(!c){$('solution').innerHTML='<div><span class="annotation">THE RESULT</span><h2>No route in the local graph.</h2><p>This vocabulary and scoring model could not connect the starters.</p></div>';return;}
  const success=data.candidates.some(c=>c.status==='verified');
  const words=c.status==='verified'&&c.server_frames.at(-1)?.path.length?c.server_frames.at(-1).path:c.words;
  const intermediates=words.filter(w=>![data.game.tl,data.game.br].includes(w));
  $('solution').innerHTML=`<div><span class="annotation">${success?'THE JOURNEY, REVEALED':'NO SERVER-CONFIRMED ROUTE'}</span><h2 id="solution-title">${c.status==='verified'?'A connection in '+intermediates.length+' '+(intermediates.length===1?'word.':'words.'):'A candidate, with a caveat.'}</h2><div class="solution-path">${words.map((w,i)=>(i?'<span class="arrow" aria-hidden="true">→</span>':'')+`<button data-word="${escape(w)}">${escape(w)}</button>`).join('')}</div><div class="solution-links" aria-label="Inspect solution links">${words.slice(1).map((w,i)=>`<button data-edge="${escape(key(words[i],w))}" aria-label="Inspect ${escape(words[i])} to ${escape(w)}">${escape(words[i])} → ${escape(w)} <span aria-hidden="true">↗</span></button>`).join('')}</div><p>${c.status==='verified'?`Add <strong>${intermediates.map(escape).join('</strong>, then <strong>')||'no words'}</strong> in <a href="https://linxicon.com/game/${data.game.id}?enterGame=">game #${data.game.id} ↗</a>. All words were accepted; captured server scores connect the board.`:escape(c.error||'Server verification was unavailable.')}<br>Local total ${c.total.toFixed(4)} · ${c.added} added ${c.added===1?'word':'words'} · ${c.status==='verified'?'Server-board replay verified':'Not certified as a game win'}</p></div><div><span class="annotation">SHORTEST LOCAL CANDIDATES</span><ol class="alternates">${data.candidates.map((candidate,i)=>`<li><button data-candidate="${i}" class="${state.candidate===i?'active':''}" aria-pressed="${state.candidate===i}"><span>${String(i+1).padStart(2,'0')} &nbsp; ${candidate.words.map(escape).join(' → ')}</span><span class="status ${candidate.status}">${candidate.status==='verified'?'VERIFIED ✓':candidate.status.toUpperCase()}</span></button></li>`).join('')}</ol><p>Same number of local links. Ordered by total local score, with each server result shown separately.</p></div>`;
}
function renderWords(){
  const query=$('word-filter').value.toLowerCase();
  const matching=data.nodes.filter(n=>n.word.includes(query));
  $('word-list').innerHTML=matching.length?matching.map(n=>`<button data-word="${escape(n.word)}">${escape(n.word)}</button>`).join(''):'<p>No matching word in this expedition.</p>';
}
start().catch(error=>{
  $('inspector-content').innerHTML='<h2>The map is unavailable.</h2><p>'+escape(error.message)+'</p><p>You can reload the page or visit the original game.</p>';
  $('narration').textContent='The recorded expedition could not be loaded. No solution has been assumed.';
  $('map-intro').innerHTML='<p>An expedition is on its way.</p><a class="button-text" href="https://linxicon.com/">Play Linxicon ↗</a>';
});
