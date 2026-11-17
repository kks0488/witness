vi.mock('../src/cloud-control',async importOriginal=>({...await importOriginal<typeof import('../src/cloud-control')>(),pacedCloud:<T>(operation:()=>Promise<T>)=>operation()}));
import {expect,it,vi} from 'vitest';
import {InferenceSource,type GenerativeModel} from 'firebase/ai';
import {DATASETS} from '../src/fixtures';
import {bitsPerAnswer,question,usedBits} from '../src/protocol';
import {blindTask,genericWitnessPayload,hypothesisPlanPayload,runHypothesisInvestigation,type HypothesisInvestigator} from '../src/hypothesis';
import {GenericFirebaseWitness} from '../src/models/firebase';

it('blind planning receives only business objective and schema, without scripted anomalies or source values',()=>{
  const payload=hypothesisPlanPayload(blindTask(DATASETS.refund));
  const task=JSON.parse(payload).task;
  expect(task).toEqual({objective:'Find refund requests that a careful reviewer would hold for manual review.',rowCount:40,columns:Object.keys(DATASETS.refund.rows[0]),evidenceColumns:['reference','description']});
  for(const value of ['Sample Customer','555-010','chipped rim','overpayment','delivery contradictions','reused evidence','meanings'])expect(payload).not.toContain(value);
});
it('generic witness preserves cloud question and includes only field-agnostic facts plus matching evidence',async()=>{
  const q={...question('receipt',43),text:'Does the supporting evidence contradict the transaction description?'};
  const generateContent=vi.fn(async(_request:unknown)=>({response:{text:()=> '"Y"',inferenceSource:InferenceSource.ON_DEVICE}}));
  const witness=new GenericFirebaseWitness({generateContent} as unknown as GenerativeModel);
  expect(await witness.answer(DATASETS.receipt,q)).toBe('Y');
  const payload=JSON.parse(generateContent.mock.calls[0]?.[0] as unknown as string);
  expect(payload.question).toBe(q.text);expect(payload).not.toHaveProperty('rules');expect(payload).not.toHaveProperty('focusedCheck');
  expect(payload.receipts).toHaveLength(1);expect(payload.facts.matchingEvidenceCount).toBe(1);
  expect(payload.instruction).toContain('one private field value');
});
it('generic arithmetic facts compare numeric field pairs without task-specific issue labels',()=>{
  const payload=JSON.parse(genericWitnessPayload(DATASETS.refund,DATASETS.refund.rows[2],'Does this record have inconsistent monetary figures?'));
  expect(payload.facts.numericComparisons).toContainEqual({leftField:'paid',rightField:'refund',relation:'less'});
  expect(JSON.stringify(payload.facts)).not.toContain('refundExceedsPayment');
});
it('adaptive runner honors cloud hypothesis allocation, keeps X distinct, and seals before any excess call',async()=>{
  const hypotheses=[{id:'h1',title:'First suspicion',question:'Does this record contain a business inconsistency?'},{id:'h2',title:'Second suspicion',question:'Does this record require a manual hold?'}];
  const choose=vi.fn(async()=>({tests:[{hypothesisId:'h2',start:1,end:6},{hypothesisId:'h1',start:4,end:4},{hypothesisId:'h2',start:2,end:2}],done:false}));
  const investigator:HypothesisInvestigator={name:'fake',log:[],hypotheses:vi.fn(async()=>hypotheses),choose};
  const answer=vi.fn().mockResolvedValueOnce('X').mockResolvedValueOnce('Y');
  const run=await runHypothesisInvestigation(DATASETS.reply,investigator,{name:'fake',answer},{limit:bitsPerAnswer('ternary')*2});
  expect(run.status).toBe('sealed');expect(run.ledger.answers).toEqual(['X','Y']);expect(run.slots).toEqual([4]);expect(answer).toHaveBeenCalledTimes(2);expect(choose).toHaveBeenCalledTimes(1);expect(usedBits(run.ledger)).toBeLessThanOrEqual(run.ledger.limit);
  expect(answer.mock.calls[0][1].text).toBe(hypotheses[1].question);
});
it('baseline scheduling retains its one scripted question and does not ask cloud for hypotheses',async()=>{
  const hypotheses=vi.fn(async()=>[]);
  const investigator:HypothesisInvestigator={name:'fake',log:[],hypotheses,choose:vi.fn(async()=>({tests:[],done:true}))};
  const initial=[{id:'baseline',title:'scripted-witness',question:question('refund',1,40).text}];
  const result=await runHypothesisInvestigation(DATASETS.refund,investigator,{name:'fake',answer:vi.fn()},{initialHypotheses:initial});
  expect(hypotheses).not.toHaveBeenCalled();expect(result.hypotheses).toEqual(initial);expect(result.cloudCalls).toBe(1);
});

// Starting a fresh adaptive ledger must not erase earlier manual disclosure.
it('requires an explicit reset before starting hypotheses after a manual answer',async()=>{
  const {screen}=await import('../src/ui/screen');
  const {createSession}=await import('../src/session');
  const {demoPair}=await import('../src/models');
  const state=createSession(DATASETS.reply,false,64);
  state.transcript.push({query:question('reply',1),token:'Y'});
  state.ledger.answers.push('Y');
  const html=screen('reply',state,demoPair(),false,[],{mode:'hypothesis'});
  expect(html).toMatch(/id="run"[^>]*disabled/);
  expect(state.ledger.answers).toEqual(['Y']);
});
