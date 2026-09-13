/** Pure replay state. Every search frame aggregates recorded discovery events. */
export function createTimeline(data) {
  const steps=[{stage:'ready',through:-1}];
  const events=data.search.events;
  const batch=Math.max(1,Math.ceil(events.length/32));
  for(let i=0;i<events.length;i+=batch) steps.push({stage:'search',through:Math.min(i+batch-1,events.length-1)});
  steps.push({stage:'ranking',through:events.length-1});
  data.candidates.forEach((candidate,i)=>steps.push({stage:'verification',through:events.length-1,checking:i}));
  const winner=data.candidates.findIndex(c=>c.status==='verified');
  const chosen=winner>=0?winner:(data.candidates.length?0:-1);
  const candidate=data.candidates[chosen];
  const frames=candidate?.server_frames.length?candidate.server_frames:(candidate?.local_frames||[]);
  frames.forEach((_,i)=>steps.push({stage:'board',through:events.length-1,boardIndex:i}));
  steps.push({stage:'complete',through:events.length-1});
  return steps;
}
export function stateAt(data,timeline,index) {
  index=Math.max(0,Math.min(timeline.length-1,index));
  const step=timeline[index], event=data.search.events[step.through];
  const best=data.candidates.findIndex(c=>c.status==='verified');
  return {index,playing:false,view:'search',source:'server',selected:data.game.tl,edge:null,
    candidate:best>=0?best:(data.candidates.length?0:-1),stage:step.stage,
    checking:step.checking??null,boardIndex:step.boardIndex??null,
    revealed:!['ready','search'].includes(step.stage),
    discovered:data.search.events.slice(0,step.through+1).map(e=>e.word),
    visited:step.stage==='ready'?0:(['ranking','verification','board','complete'].includes(step.stage)?data.search.visited:(event?.visited||0)),
    frontier:['ranking','verification','board','complete'].includes(step.stage)?data.search.frontier:(event?.frontier||0),depth:event?.depth||0};
}
export function initialState(data){return stateAt(data,createTimeline(data),0);}
export function transition(state,action,data) {
  const timeline=createTimeline(data);
  if(action.type==='restart')return initialState(data);
  if(action.type==='reveal')return stateAt(data,timeline,timeline.length-1);
  if(action.type==='play')return {...state,playing:!state.playing};
  if(action.type==='view')return {...state,view:action.value};
  if(action.type==='source')return {...state,source:action.value};
  if(action.type==='word')return {...state,selected:action.word,edge:null};
  if(action.type==='edge')return {...state,edge:action.edge};
  if(action.type==='candidate')return {...state,candidate:action.index,edge:null};
  if(action.type==='step'||action.type==='seek'){
    const index=action.type==='step'?state.index+action.delta:action.index;
    const next=stateAt(data,timeline,index);
    return {...next,view:state.view,source:state.source,selected:state.selected,edge:state.edge,candidate:state.candidate,
      playing:action.type==='seek'?false:(state.playing&&next.index<timeline.length-1)};
  }
  return state;
}
