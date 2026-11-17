import {describe,it,expect} from 'vitest';
import { compileTree,treeSchema } from '../src/tree-expression';
import {validateTreeHypothesis,runTreeInvestigation,groupAnswerBound,treeReceipt} from '../src/tree-search';
import {TreeInvestigator} from '../src/tree-investigator';
import {DATASETS,type Dataset} from '../src/fixtures';
import {usedBits,bitsPerAnswer,type Token} from '../src/protocol';
const is=(f:string)=>({op:'is',args:[f]});
const h=(id='a',tree:unknown=is('reused_image'),question='Is the supporting image reused?')=>({id,title:id,question,tree});
const data=(n:number):Dataset=>({...DATASETS.refund,rows:Array.from({length:n},(_,i)=>({slot:i+1})),evidence:[],meanings:{}});
const planner=(first=[h()],second=[h('b')])=>({async propose(_t:unknown,r:number){return r===1?first:second;}});
const oracle=(tokens:Token[],queries:string[])=>({async answer(_d:Dataset,q:{start:number;end:number;expression?:string}){const key=JSON.stringify([q.expression,q.start,q.end]);expect(queries).not.toContain(key);queries.push(key);const t=tokens.slice(q.start-1,q.end);return t.includes('Y')?'Y':t.includes('X')?'X':'N';}});
describe('structured trees and a public zero-bit boundary',()=>{
 it('attaches types from the dictionary, not model strings',()=>{
  expect(compileTree({op:'gt',args:['refund','paid']},'refund')?.expression).toBe('gt(num(refund),num(paid))');
  expect(compileTree({op:'neq',args:['memo_supplier','receipt_supplier']},'receipt')?.expression).toBe('neq(name(memo_supplier),name(receipt_supplier))');
  expect(compileTree({op:'eq',args:['matching_receipts',0]},'receipt')?.expression).toBe('eq(num(matching_receipts),0)');
  expect(JSON.stringify(treeSchema('refund'))).not.toContain('phone');
 });
 it.each([is('phone'),is('paid'),{op:'gt',args:['paid','reused_image']},{op:'eq',args:['paid',1]},{op:'eq',args:[0,'paid']},{op:'run',args:['paid']},{op:'is',args:['reused_image'],code:'x'},'is(reused_image)',{op:'not',args:[{op:'not',args:[{op:'not',args:[is('reused_image')]}]}]}])('rejects invalid public structure %j',tree=>expect(compileTree(tree,'refund')).toBeUndefined());
 it('uses no records or source values to determine a public rejection',async()=>{
  const bad=h('bad',is('phone'),'Does the phone identify this customer?');
  expect(validateTreeHypothesis(bad,'refund',7)).toEqual(validateTreeHypothesis(bad,'refund',7));
  for(const d of [data(7),{...data(7),evidence:new Proxy([],{get(){throw Error('private evidence read');}})}]){
   for(const row of d.rows)Object.defineProperty(row,'reason',{get(){throw Error('private value read');}});
   let calls=0;const run=await runTreeInvestigation(d,planner([bad],[bad]),{async answer(){calls++;return 'Y';}});
   expect(calls).toBe(0);expect(run.exchanges).toEqual([]);expect(run.ledger.answers).toEqual([]);expect(usedBits(run.ledger)).toBe(0);expect(run.rejections).toHaveLength(2);expect(run.rejections.every(r=>r.bits===0&&!('token'in r))).toBe(true);
  }
 });
 it('charges witness X, subdivides it, and leaves singleton X unconfirmed',async()=>{
  const queries:string[]=[];const run=await runTreeInvestigation(data(4),planner(),oracle(['X','N','Y','N'],queries));
  expect(run.slots).toEqual([3]);expect(run.usage[0].unconfirmed).toEqual([1]);expect(run.usage[0].x).toBe(2);expect(run.exchanges).toHaveLength(7);expect(usedBits(run.ledger)).toBe(7*bitsPerAnswer('ternary'));expect(run.rejections).toHaveLength(1);
 });
});
describe('public group procedure and two rounds',()=>{
 it('stays within n,k bounds for every subset up to ten rows',async()=>{
  for(let n=1;n<=10;n++)for(let mask=0;mask<2**n;mask++){
   const tokens=Array.from({length:n},(_,i)=>mask&(1<<i)?'Y':'N') as Token[];const queries:string[]=[];
   const run=await runTreeInvestigation(data(n),planner(),oracle(tokens,queries),{limit:1000});const found=tokens.flatMap((t,i)=>t==='Y'?[i+1]:[]);
   expect(run.slots).toEqual(found);expect(run.exchanges.length).toBeLessThanOrEqual(groupAnswerBound(n,found.length));expect(run.status).toBe('complete');
  }
 });
 it('includes unknown leaves in the bound; k alone cannot bound all-X work',async()=>{
  for(const n of [1,3,7,17]){const run=await runTreeInvestigation(data(n),planner(),oracle(Array(n).fill('X'),[]),{limit:1000});expect(run.exchanges).toHaveLength(2*n-1);expect(groupAnswerBound(n,0,n)).toBe(2*n-1);}
 });
 it('makes exactly one follow-up with Y/X counts and explores complementary trees',async()=>{
  let calls=0;const seen:unknown[]=[];const p={async propose(...args:unknown[]){calls++;seen.push(args);return calls===1?[h('a')]:[h('b',is('previous_refund'),'Is a previous refund recorded?')];}};
  const run=await runTreeInvestigation(data(4),p,{async answer(_d,q){return q.expression?.includes('previous_refund')&&q.start<=4&&q.end>=4?'Y':'N';}});
  expect(calls).toBe(2);expect(run.slots).toEqual([4]);const s=(seen[1] as unknown[])[2] as object[];expect(s).toEqual([{id:'r1-a',identifiedY:0,x:0}]);expect(Object.keys(s[0])).toEqual(['id','identifiedY','x']);
 });
 it('stops before cap and shows unfinished per-expression work',async()=>{
  const run=await runTreeInvestigation(data(8),planner(),oracle(Array(8).fill('Y'),[]),{limit:5});expect(run.exchanges).toHaveLength(3);expect(run.status).toBe('sealed');expect(run.usage[0].status).toBe('unfinished at cap');expect(run.cloudCalls).toBe(2);expect(usedBits(run.ledger)).toBeLessThanOrEqual(5);expect(treeReceipt(run,[],{calls:1,fields:1}).rejectedRequests).toBe(1);
 });
 it('deduplicates flag logic equivalents without consulting private data',async()=>{
  const alt={op:'not',args:[{op:'not',args:[is('reused_image')]}]};const run=await runTreeInvestigation(data(4),planner([h('a')],[h('b',alt)]),oracle(['Y','N','N','N'],[]));expect(run.usage).toHaveLength(1);expect(run.rejections[0].reason).toContain('equivalent');
 });
 it('cloud gets no rows, labels, record columns or range transcripts',async()=>{
  const p=new TreeInvestigator(async prompt=>{const obj=JSON.parse(prompt);expect(Object.keys(obj.task)).toEqual(['objective','rowCount']);expect(prompt).not.toContain('FORBIDDEN');expect(obj).not.toHaveProperty('transcript');return {raw:JSON.stringify({hypotheses:[h('a'),h('b'),h('c')]}),inferenceSource:'in_cloud'};});
  await p.propose({objective:'Review refunds',rowCount:8,domain:'refund'},1);
 });
});
