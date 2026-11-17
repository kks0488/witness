import type {TreeRun} from './tree-search';

/** A prefix of a real transcript, never newly inferred answers or future findings. */
export function replayFrame(source:TreeRun,count:number):TreeRun {
 const run:TreeRun=structuredClone(source),total=source.exchanges.length;
 count=Math.max(0,Math.min(total,Math.floor(count)));
 if(count===total)return run;
 run.exchanges=run.exchanges.slice(0,count);run.ledger.answers=run.ledger.answers.slice(0,count);
 const round=(source.rounds[0]?.answerCount??total)<=count?2:1;
 run.hypotheses=run.hypotheses.filter(h=>(h.round??1)<=round);
 const ids=new Set(run.hypotheses.map(h=>h.id));
 run.rejections=run.rejections.filter(r=>ids.has(r.id));run.shared=run.shared.filter(s=>ids.has(s.id));
 run.reusedAnswers=run.reusedAnswers.filter(r=>ids.has(r.id)&&run.exchanges.some(e=>e.test.hypothesisId===r.targetId&&e.test.start===r.start&&e.test.end===r.end));
 run.slots=[...new Set([...run.exchanges.filter(e=>e.token==='Y'&&e.test.start===e.test.end).map(e=>e.test.start),...run.reusedAnswers.filter(e=>e.token==='Y'&&e.start===e.end).map(e=>e.start)])].sort((a,b)=>a-b);
 run.usage=run.usage.filter(u=>ids.has(u.id)).map(u=>{
  const answers=run.exchanges.filter(e=>e.test.hypothesisId===u.id);
  return {...u,answers:answers.length,bits:answers.length*Math.log2(3),y:answers.filter(e=>e.token==='Y'&&e.test.start===e.test.end).length,x:answers.filter(e=>e.token==='X').length,unconfirmed:answers.filter(e=>e.token==='X'&&e.test.start===e.test.end).map(e=>e.test.start),pending:[],status:'running'};
 });
 run.rounds=run.rounds.filter(r=>r.answerCount<=count);run.cloudCalls=round;run.status='running';delete run.endedAt;
 return run;
}
