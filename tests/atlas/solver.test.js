import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseGraph, shortestChains, simulate, normalize, weight} from '../../assets/atlas/solver.js';

/** Mirror of linxicon_solver.export_graph.pack for a tiny graph: words must be sorted. */
function packGraph(words, edges){
  const pad=n=>(4-n%4)%4;
  const text=new TextEncoder().encode(words.join('\n'));
  const rows=words.map(()=>[]);
  for(const [a,b,s] of edges)rows[Math.min(a,b)].push([Math.max(a,b),s]);
  const degree=[],neighbor=[],score=[];
  for(const row of rows){row.sort((x,y)=>x[0]-y[0]);degree.push(row.length);let prev=0;for(const [b,s] of row){neighbor.push(b-prev);score.push(Math.round(s*65535));prev=b;}}
  const size=16+text.length+pad(text.length)+degree.length*2+pad(degree.length*2)+neighbor.length*2+pad(neighbor.length*2)+score.length*2;
  const buffer=new ArrayBuffer(size),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  bytes.set([76,88,71,49],0);view.setUint32(4,words.length,true);view.setUint32(8,neighbor.length,true);view.setUint32(12,text.length,true);
  let offset=16;bytes.set(text,offset);offset+=text.length+pad(text.length);
  new Uint16Array(buffer,offset,degree.length).set(degree);offset+=degree.length*2+pad(degree.length*2);
  new Uint16Array(buffer,offset,neighbor.length).set(neighbor);offset+=neighbor.length*2+pad(neighbor.length*2);
  new Uint16Array(buffer,offset,score.length).set(score);
  return buffer;
}
// apple-banana .5, apple-cherry .75, banana-cherry 1, cherry-fig .4, date-elder .9, apple-date .45, date-fig .5
const words=['apple','banana','cherry','date','elder','fig'];
const tiny=()=>parseGraph(packGraph(words,[[0,1,.5],[0,2,.75],[1,2,1],[2,5,.4],[3,4,.9],[0,3,.45],[3,5,.5]]));

test('parseGraph restores words and undirected weights',()=>{
  const g=tiny();
  assert.deepEqual(g.words,words);
  assert.ok(Math.abs(weight(g,'banana','cherry')-1)<1e-4);
  assert.ok(Math.abs(weight(g,'cherry','banana')-1)<1e-4);
  assert.ok(Math.abs(weight(g,'fig','cherry')-.4)<1e-4);
  assert.equal(weight(g,'apple','elder'),null);
  assert.throws(()=>parseGraph(new ArrayBuffer(8)),/LXG1/);
});
test('shortestChains finds the fewest words, ranks by total, and breaks ties alphabetically',()=>{
  const g=tiny();
  const result=shortestChains(g,'apple','fig',5);
  // apple→cherry→fig (.75+.4=1.15) and apple→date→fig (.45+.5=.95): both two links.
  assert.deepEqual(result.chains.map(c=>c.words),[['apple','cherry','fig'],['apple','date','fig']]);
  assert.ok(Math.abs(result.chains[0].total-1.15)<1e-3);
  assert.equal(result.chains[0].added,1);
  assert.equal(result.visited,6);
  assert.deepEqual(shortestChains(g,'banana','elder',5).chains.map(c=>c.words),[['banana','apple','date','elder'],['banana','cherry','fig','date','elder']].slice(0,1));
  assert.deepEqual(shortestChains(g,'apple','banana',5).chains.map(c=>c.words),[['apple','banana']]);
  assert.deepEqual(shortestChains(g,'apple','apple',5).chains,[{words:['apple'],scores:[],total:0,added:-1}]);
});
test('shortestChains never enters blocked words, except the starters themselves',()=>{
  const g=tiny();
  assert.deepEqual(shortestChains(g,'apple','fig',5,new Set(['cherry'])).chains.map(c=>c.words),[['apple','date','fig']]);
  assert.deepEqual(shortestChains(g,'apple','fig',5,new Set(['cherry','date','apple','fig'])).chains,[]);
});
test('shortestChains reports no chain for unreachable or unknown words',()=>{
  const g=parseGraph(packGraph(['ant','bee','cat'],[[0,1,.5]]));
  assert.deepEqual(shortestChains(g,'ant','cat',5).chains,[]);
  assert.deepEqual(shortestChains(g,'ant','dog',5).chains,[]);
});
test('simulate replays the board with top-5 pruning and reports frames like the daily export',()=>{
  const g=tiny();
  const result=simulate(g,'apple','fig',['cherry']);
  assert.equal(result.won,true);assert.deepEqual(result.path,['apple','cherry','fig']);assert.equal(result.wordsAdded,1);
  assert.equal(result.frames.length,2);
  assert.deepEqual(Object.keys(result.frames[1]).sort(),['added','edges','path','pruned','words']);
  assert.deepEqual(result.frames[1].words,['apple','fig','cherry']);
  assert.equal(result.frames[1].added,'cherry');
  assert.equal(simulate(g,'apple','banana',[]).wordsAdded,0);
  assert.equal(simulate(g,'apple','elder',['banana']).won,false);
});
test('simulate prunes a weak link when a word already has five stronger ones',()=>{
  // 'aa' and 'hh' share a weak link; six middle words link to both more strongly, so once
  // five of them are on the board the aa-hh link is outside both endpoints' top five.
  const names=['aa','bb','cc','dd','ee','ff','gg','hh','zz'];
  const edges=[[0,7,.5]];
  for(let i=1;i<=6;i++){edges.push([0,i,.9-(i-1)*.05]);edges.push([7,i,.9-(i-1)*.05]);}
  const g=parseGraph(packGraph(names,edges));
  const result=simulate(g,'aa','zz',['hh','bb','cc','dd','ee','ff','gg']);
  assert.equal(result.won,false);assert.equal(result.wordsAdded,7);
  const before=result.frames[5],after=result.frames[6];// after five middle words
  const isHub=e=>(e.a==='aa'&&e.b==='hh')||(e.a==='hh'&&e.b==='aa');
  assert.ok(before.edges.some(isHub));
  assert.ok(after.pruned.some(isHub)&&!after.edges.some(isHub));
});
test('normalize applies the game word rules',()=>{
  assert.equal(normalize('  Bridge '),'bridge');
  assert.equal(normalize('ab'),null);
  assert.equal(normalize("don't"),null);
  assert.equal(normalize('abcdefghijklmnop'),null);
});
test('the committed bundle reproduces the Python solver',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../linxicon-solver/data/graph.json',import.meta.url)));
  const raw=gunzipSync(readFileSync(new URL('../../linxicon-solver/data/'+manifest.file,import.meta.url)));
  const g=parseGraph(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/pairs.json',import.meta.url)));
  assert.equal(g.words.length,fixture.vocabulary);
  for(const pair of fixture.pairs){
    const result=shortestChains(g,pair.src,pair.dst,5);
    assert.deepEqual(result.chains.map(c=>c.words),pair.chains.map(c=>c.words),pair.src+' → '+pair.dst);
    result.chains.forEach((c,i)=>c.scores.forEach((s,j)=>assert.ok(Math.abs(s-pair.chains[i].scores[j])<1e-4)));
    if(pair.board){
      const sim=simulate(g,pair.src,pair.dst,pair.chains[0].words.slice(1,-1));
      assert.equal(sim.won,pair.board.won);assert.deepEqual(sim.path,pair.board.path);
      assert.equal(sim.wordsAdded,pair.board.words_added);assert.equal(sim.frames.length,pair.board.frames);
    }
  }
  // The game rejects "fete"; with the rejected list the CLI's verified chain comes first.
  assert.deepEqual(shortestChains(g,'holiday','satisfy',5).chains[0].words,['holiday','fete','meet','satisfy']);
  assert.deepEqual(shortestChains(g,'holiday','satisfy',5,new Set(['fete','fetes'])).chains[0].words,['holiday','celebrating','meet','satisfy']);
});
