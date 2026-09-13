/** In-browser solver over the exported link graph (format LXG1, see the solver's export_graph.py).
    Pure functions, no DOM: parseGraph, shortestChains and simulate mirror linxicon_solver's
    graph.shortest_chains and board.Board so results match the command-line solver. */
export const THRESHOLD=0.3995,MAX_LINKS=5,MAX_WORDS=50,MIN_WORD_LEN=3,MAX_WORD_LEN=15;

export function normalize(word){
  const w=String(word??'').trim().toLowerCase();
  return w.length>=MIN_WORD_LEN&&w.length<=MAX_WORD_LEN&&/^[a-z]+$/.test(w)?w:null;
}

/** Decode the bundle into an undirected CSR graph. Rows are sorted by word index, which is
    alphabetical order in the export, so a row doubles as the alphabetical visiting order. */
export function parseGraph(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if(bytes.length<16||String.fromCharCode(...bytes.subarray(0,4))!=='LXG1')throw new Error('Not an LXG1 word graph.');
  const n=view.getUint32(4,true),m=view.getUint32(8,true),textLength=view.getUint32(12,true);
  const pad=x=>(4-x%4)%4;
  let offset=16;
  const words=textLength?new TextDecoder().decode(bytes.subarray(offset,offset+textLength)).split('\n'):[];
  if(words.length!==n)throw new Error('Word count does not match the graph header.');
  offset+=textLength+pad(textLength);
  const degree=new Uint16Array(buffer,offset,n);offset+=n*2+pad(n*2);
  const delta=new Uint16Array(buffer,offset,m);offset+=m*2+pad(m*2);
  const quantized=new Uint16Array(buffer,offset,m);
  // First pass: full degrees in both directions.
  const counts=new Uint32Array(n);
  for(let a=0,p=0;a<n;a++){let b=0;for(let i=0;i<degree[a];i++,p++){b+=delta[p];counts[a]++;counts[b]++;}}
  const offsets=new Uint32Array(n+1);
  for(let a=0;a<n;a++)offsets[a+1]=offsets[a]+counts[a];
  const neighbors=new Uint32Array(offsets[n]),scores=new Float32Array(offsets[n]),fill=new Uint32Array(n);
  for(let a=0,p=0;a<n;a++){
    let b=0;
    for(let i=0;i<degree[a];i++,p++){
      b+=delta[p];const s=quantized[p]/65535;
      neighbors[offsets[a]+fill[a]]=b;scores[offsets[a]+fill[a]]=s;fill[a]++;
      neighbors[offsets[b]+fill[b]]=a;scores[offsets[b]+fill[b]]=s;fill[b]++;
    }
  }
  // Each row is already ascending: its lower-index neighbours arrive while earlier rows are
  // decoded (in row order) and its higher-index neighbours arrive from its own sorted row.
  return {words,index:new Map(words.map((w,i)=>[w,i])),offsets,neighbors,scores};
}

function rowIndex(g,a,b){
  let lo=g.offsets[a],hi=g.offsets[a+1]-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(g.neighbors[mid]===b)return mid;if(g.neighbors[mid]<b)lo=mid+1;else hi=mid-1;}
  return -1;
}
/** Link score between two words, or null when they are not linked (or unknown). */
export function weight(g,wordA,wordB){
  const a=g.index.get(wordA),b=g.index.get(wordB);
  if(a==null||b==null)return null;
  const i=rowIndex(g,a,b);
  return i<0?null:g.scores[i];
}

const compareWords=(x,y)=>{for(let i=0;i<Math.min(x.length,y.length);i++){if(x[i]<y[i])return -1;if(x[i]>y[i])return 1;}return x.length-y.length;};

/** Port of Graph.shortest_chains: BFS layers from src, then k-best DP over layer-advancing links. */
export function shortestChains(g,src,dst,k=5){
  const s=g.index.get(src),t=g.index.get(dst);
  if(s==null||t==null)return {chains:[],visited:0,layers:0};
  if(s===t)return {chains:[{words:[src],scores:[],total:0,added:-1}],visited:1,layers:0};
  const dist=new Int32Array(g.words.length).fill(-1);dist[s]=0;
  const order=[s];let head=0;
  while(head<order.length){
    const u=order[head++];
    if(u===t)break;
    for(let i=g.offsets[u];i<g.offsets[u+1];i++){const v=g.neighbors[i];if(dist[v]<0){dist[v]=dist[u]+1;order.push(v);}}
  }
  const visited=order.length;
  if(dist[t]<0)return {chains:[],visited,layers:dist[order[order.length-1]]};
  const best=new Map([[s,[{total:0,path:[s]}]]]);
  for(const u of order){
    if(u===s||dist[u]>dist[t])continue;
    const cands=[];
    for(let i=g.offsets[u];i<g.offsets[u+1];i++){
      const p=g.neighbors[i];
      if(dist[p]===dist[u]-1&&best.has(p))for(const entry of best.get(p))cands.push({total:entry.total+g.scores[i],path:[...entry.path,u]});
    }
    cands.sort((x,y)=>y.total-x.total||compareWords(x.path.map(i=>g.words[i]),y.path.map(i=>g.words[i])));
    best.set(u,cands.slice(0,k));
  }
  const chains=(best.get(t)||[]).map(({path})=>{
    const scores=path.slice(1).map((v,i)=>g.scores[rowIndex(g,path[i],v)]);
    return {words:path.map(i=>g.words[i]),scores,total:scores.reduce((a,b)=>a+b,0),added:path.length-2};
  });
  return {chains,visited,layers:dist[t]};
}

/** Port of board.Board: the game's own top-5 pruning and shortest-path rules, replayed locally. */
export function simulate(g,tl,br,chain){
  const sim=(a,b)=>weight(g,a,b)??0;
  const id=e=>[e.a,e.b].sort().join('-');
  const prune=candidates=>{
    const eligible=candidates.filter(e=>e.score>=THRESHOLD),nodes=[];
    for(const e of eligible)for(const n of [e.a,e.b])if(!nodes.includes(n))nodes.push(n);
    const keep=[],seen=new Set();
    for(const n of nodes){
      const incident=eligible.filter(e=>e.a===n||e.b===n).sort((x,y)=>y.score-x.score);
      for(const e of incident.slice(0,MAX_LINKS))if(!seen.has(id(e))){seen.add(id(e));keep.push(e);}
    }
    return keep;
  };
  const words=[tl,br],candidates=[];
  const first=sim(tl,br);if(first>=THRESHOLD)candidates.push({a:tl,b:br,score:first});
  let edges=prune(candidates);
  const shortestPath=()=>{
    const adj=new Map();
    for(const e of edges){if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
    if(!adj.has(tl)||!adj.has(br))return [];
    const dist=new Map([[tl,0]]),queue=[tl];
    for(let h=0;h<queue.length;h++){const u=queue[h];for(const v of adj.get(u))if(!dist.has(v)){dist.set(v,dist.get(u)+1);queue.push(v);}}
    if(!dist.has(br))return [];
    const paths=[];
    const walk=(u,acc)=>{if(u===br){paths.push([...acc]);return;}for(const v of adj.get(u))if(dist.get(v)===dist.get(u)+1){acc.push(v);walk(v,acc);acc.pop();}};
    walk(tl,[tl]);
    const score=p=>{const ids=new Set(p.slice(1).map((w,i)=>id({a:p[i],b:w})));return edges.filter(e=>ids.has(id(e))).reduce((sum,e)=>sum+e.score,0);};
    let best=[],bestScore=-1;
    for(const p of paths){const sc=score(p);if(sc>=bestScore){best=p;bestScore=sc;}}
    return best;
  };
  const frames=[];
  const record=added=>{
    const kept=new Set(edges.map(id));
    frames.push({words:[...words],added,path:shortestPath(),edges:edges.map(e=>({...e})),pruned:candidates.filter(e=>!kept.has(id(e))).map(e=>({...e}))});
  };
  record(null);
  if(shortestPath().length)return {won:true,path:shortestPath(),wordsAdded:0,frames};
  let added=0;
  for(const w of chain){
    if(words.length>=MAX_WORDS||words.includes(w))break;
    for(const existing of words){const s=sim(existing,w);if(s>=THRESHOLD)candidates.push({a:existing,b:w,score:s});}
    words.push(w);edges=prune(candidates);record(w);added++;
    if(shortestPath().length)break;
  }
  const path=shortestPath();
  return {won:path.length>0,path,wordsAdded:added,frames};
}
