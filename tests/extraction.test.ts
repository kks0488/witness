import { describe,it,expect } from 'vitest';
import { compilePublicQuestion,evaluateRule,PROGRAMS,makePlan,ExtractionWitness,extractAndJudge } from '../src/extraction';
import type { LocalTransport } from '../src/local-research';
import { DATASETS } from '../src/fixtures';

describe('fact rules and guarded public compilation',()=>{
 it('does comparisons and three valued conjunctions in code',()=>{
  expect(evaluateRule(PROGRAMS[0],{paid:58,refund:103})).toBe('Y');
  expect(evaluateRule(PROGRAMS[0],{paid:103,refund:58})).toBe('N');
  expect(evaluateRule(PROGRAMS[0],{paid:58,refund:'not_stated'})).toBe('X');
  expect(evaluateRule(PROGRAMS[1],{claim_nonreceipt:'no',signed_handover:'not_stated'})).toBe('N');
  expect(evaluateRule(PROGRAMS[1],{claim_nonreceipt:'yes',signed_handover:'not_stated'})).toBe('X');
  expect(evaluateRule(PROGRAMS[5],{matching_receipts:0})).toBe('Y');
  expect(evaluateRule(PROGRAMS[6],{refund_approved:'yes',refund_settled:'no'})).toBe('Y');
 });
 it('treats empty supplier values as missing and never executes foreign expressions',()=>{
  for(const missing of ['', '   ', ' not_stated '])expect(evaluateRule(PROGRAMS[4],{memo_supplier:'Alder',receipt_supplier:missing})).toBe('X');
  expect(evaluateRule('gt(num(refund),100)',{refund:101})).toBe('X');
  expect(evaluateRule('is(phone)',{})).toBe('X');
 });
 it('does not drop negation, added conditions or written numeric thresholds',()=>{
  const questions=['Does the requested refund not exceed the amount paid?','Is matching receipt evidence not missing for this entry?','Are the suppliers named in the memo and matching receipt different and is the receipt unsigned?','Does the requested refund exceed the amount paid by one hundred dollars?','Does the requested refund exceed the amount paid and is the customer wealthy?'];
  for(const q of questions)expect(compilePublicQuestion(q)).toBe('X');
  expect(compilePublicQuestion('Does the requested refund exceed the amount paid?')).toBe(PROGRAMS[0]);
 });
 it('does not permanently cache a failed planning transport',async()=>{
  let calls=0;const t:LocalTransport={async call(){calls++;if(calls===1)throw new Error('transient');return JSON.stringify({rule:PROGRAMS[0]});}};
  const w=new ExtractionWitness('b',t),q={kind:'refund' as const,start:3,end:3,text:'Does the requested refund exceed the amount paid?'};
  expect(await w.answer(DATASETS.refund,q)).toBe('X');
  await w.answer(DATASETS.refund,q);expect(calls).toBeGreaterThan(1);
 });
 it('does not cache extraction errors and retries them',async()=>{
  let calls=0;const t:LocalTransport={async call(){calls++;if(calls===1)throw new Error('transient');return '{"refund":103,"paid":58}';}};
  const w=new ExtractionWitness('c',t),q={kind:'refund' as const,start:3,end:3,text:'Does the requested refund exceed the amount paid?'};
  expect(await w.answer(DATASETS.refund,q)).toBe('X');expect(await w.answer(DATASETS.refund,q)).toBe('Y');expect(calls).toBe(2);
 });
 it('shows the extractor only requested source fields, never the decision or question',async()=>{
  let input='';const t:LocalTransport={async call(prompt){input=prompt;return '{"refund":103,"paid":58}';}};
  const plan=await makePlan('Does the requested refund exceed the amount paid?','c');
  const r=await extractAndJudge(DATASETS.refund,DATASETS.refund.rows[2],plan,t);
  const p=JSON.parse(input);expect(Object.keys(p.record).sort()).toEqual(['paid','refund']);expect(p).not.toHaveProperty('question');expect(p).not.toHaveProperty('expected');expect(p).not.toHaveProperty('rule');expect(r.token).toBe('Y');
 });
});
