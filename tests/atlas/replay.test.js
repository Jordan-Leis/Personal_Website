import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeline, stateAt, initialState, transition} from '../../assets/atlas/replay.js';
const data={game:{tl:'start',br:'end'},search:{events:[{word:'start',depth:0,visited:1,frontier:1},{word:'bridge',depth:1,visited:2,frontier:1}],visited:3,frontier:0,examined:4},candidates:[{words:['start','bridge','end'],status:'rejected',local_frames:[],server_frames:[]},{words:['start','other','end'],status:'verified',local_frames:[{words:['start','end'],edges:[],path:[]}],server_frames:[{words:['start','end'],edges:[],path:[]},{words:['start','end','other'],edges:[],path:['start','other','end']}]}]};
test('answers stay hidden before playback or reveal',()=>{
 assert.equal(initialState(data).revealed,false);
 assert.equal(stateAt(data,createTimeline(data),0).revealed,false);
});
test('replay contains true search, rank, verification and board stages',()=>{
 const timeline=createTimeline(data);
 assert.deepEqual([...new Set(timeline.map(s=>s.stage))],['ready','search','ranking','verification','board','complete']);
 assert.equal(timeline.filter(s=>s.stage==='verification').length,2);
});
test('reveal chooses the first verified alternative',()=>{
 const result=transition(initialState(data),{type:'reveal'},data);
 assert.equal(result.candidate,1);assert.equal(result.revealed,true);assert.equal(result.playing,false);
});
test('scrubbing reconstructs forward playback exactly',()=>{
 const timeline=createTimeline(data);let state=initialState(data);
 for(let i=1;i<timeline.length;i++)state=transition(state,{type:'step',delta:1},data);
 const scrub=transition(initialState(data),{type:'seek',index:timeline.length-1},data);
 assert.deepEqual(state,scrub);
});
test('restart hides answers and pauses',()=>{
 const result=transition(transition(initialState(data),{type:'reveal'},data),{type:'restart'},data);
 assert.equal(result.revealed,false);assert.equal(result.index,0);assert.equal(result.playing,false);
});
test('no candidate or no verified candidate remains explicit',()=>{
 const empty={...data,candidates:[]};assert.equal(transition(initialState(empty),{type:'reveal'},empty).candidate,-1);
 const rejected={...data,candidates:[data.candidates[0]]};assert.equal(transition(initialState(rejected),{type:'reveal'},rejected).candidate,0);
});
