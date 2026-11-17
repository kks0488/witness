import {describe,it,expect} from 'vitest';
import {RECORDED_RUNS} from '../src/recorded-runs';
import {replayFrame} from '../src/recorded-replay';

describe('recorded hosted executions',()=>{
 for(const [task,{run}] of Object.entries(RECORDED_RUNS)){
  it(`${task}: replays only the recorded prefix, without future findings`,()=>{
   const original=structuredClone(run);
   for(let n=0;n<run.exchanges.length;n++){
    const frame=replayFrame(run,n);
    expect(frame.ledger.answers).toEqual(run.ledger.answers.slice(0,n));
    expect(frame.exchanges).toEqual(run.exchanges.slice(0,n));
    for(const slot of frame.slots)expect(frame.exchanges.some(e=>e.token==='Y'&&e.test.start===slot&&e.test.end===slot)||frame.reusedAnswers.some(e=>e.token==='Y'&&e.start===slot&&e.end===slot)).toBe(true);
    expect(frame.usage.reduce((sum,u)=>sum+u.answers,0)).toBe(n);
    expect(frame.status).toBe('running');
   }
   expect(replayFrame(run,run.exchanges.length)).toEqual(original);
   expect(run).toEqual(original);
  });
 }
 it('retains the measured hosted totals',()=>{
  expect(Object.values(RECORDED_RUNS).map(v=>[v.run.slots.length,v.localModelCalls,v.run.cloudCalls])).toEqual([[4,120,2],[4,180,2],[2,6,2]]);
 });
});
