import {it,expect} from 'vitest';
import {canonicalKey,compileTree,publicCandidates} from '../src/tree-expression';
import {publicSchema} from '../src/witness-schema';
import {runTreeInvestigation,invertAnswer} from '../src/tree-search';
import {TreeInvestigator} from '../src/tree-investigator';
import {DATASETS} from '../src/fixtures';
import {bitsPerAnswer,type Token} from '../src/protocol';
const is=(f:string)=>({op:'is' as const,args:[f]});
const atom=is('reused_image'),other=is('previous_refund');
const h=(id:string,tree:unknown=atom)=>({id,title:id,question:'Is this business issue supported?',tree});
const data={...DATASETS.refund,rows:Array.from({length:8},(_,i)=>({slot:i+1}))};
it('normalizes swapped comparisons, logical operands, double negation and negated equality',()=>{
 for(const [a,b]of [
 [{op:'gt',args:['refund','paid']},{op:'lt',args:['paid','refund']}],
 [{op:'eq',args:['refund','paid']},{op:'eq',args:['paid','refund']}],
 [{op:'neq',args:['refund','paid']},{op:'not',args:[{op:'eq',args:['paid','refund']}]}],
 [{op:'not',args:[{op:'not',args:[atom]}]},atom],
 ...['and','or'].map(op=>[{op,args:[atom,other]},{op,args:[other,atom]}])
 ] as [Parameters<typeof canonicalKey>[0],Parameters<typeof canonicalKey>[0]][])expect(canonicalKey(a)).toBe(canonicalKey(b));
});
it('asks swapped name comparisons only once',async()=>{
 const trees=[{op:'neq',args:['memo_supplier','receipt_supplier']},{op:'neq',args:['receipt_supplier','memo_supplier']}];let calls=0;
 const r=await runTreeInvestigation({...data,id:'receipt'}, {async propose(){return trees.map((t,i)=>h(String(i),t));}}, {async answer(){calls++;return 'N';}});
 expect(calls).toBe(1);expect(r.usage).toHaveLength(1);expect(r.shared.length).toBe(3);
});
it('shares complementary singleton answers, preserves X and never flips ANY group truth',async()=>{
 const calls:string[]=[],truth:Token[]=['Y','N','X','N','Y','N','N','N'];
 const r=await runTreeInvestigation(data,{async propose(){return [h('yes'),h('no',{op:'not',args:[atom]})];}},{async answer(_d,q){expect(q.start).toBe(q.end);calls.push(q.expression!+q.start);return truth[q.start-1];}},{limit:64});
 expect(new Set(calls).size).toBe(8);expect(calls.length).toBe(8);
 const aliases=r.reusedAnswers.filter(a=>a.id==='r1-no');expect(aliases.map(a=>a.token)).toEqual(truth.map(invertAnswer));expect(aliases[2].token).toBe('X');
});
it('reserves 40 percent and rotates every predicate before revisiting it, breadth first',async()=>{
 let atFollowup=0,asked=0;
 const p={async propose(_t:unknown,round:number){if(round===2){atFollowup=asked;return [h('new',is('claim_nonreceipt'))];}return [h('a'),h('b',other)];}};
 const r=await runTreeInvestigation(data,p,{async answer(){asked++;return 'Y';}},{limit:64});
 expect(atFollowup).toBe(Math.floor(64*.6/bitsPerAnswer('ternary')));expect(r.exchanges.length).toBe(40);
 expect(r.exchanges.slice(0,6).map(e=>[e.test.hypothesisId,e.test.start,e.test.end])).toEqual([['r1-a',1,8],['r1-b',1,8],['r1-a',1,4],['r1-b',1,4],['r1-a',5,8],['r1-b',5,8]]);
 expect(r.usage.find(u=>u.id==='r2-new')!.answers).toBeGreaterThan(0);
});
it('returns reserved capacity when no new second-round predicate exists',async()=>{
 const r=await runTreeInvestigation({...data,rows:Array.from({length:40},(_,i)=>({slot:i+1}))},{async propose(){return [h('a')];}},{async answer(){return 'Y';}},{limit:64});
 expect(r.exchanges.length).toBe(40);expect(r.usage.length).toBe(1);
});
it('defers X descendants until all Y work is exhausted',async()=>{
 const r=await runTreeInvestigation(data,{async propose(){return [h('a')];}},{async answer(_d,q){return q.start===1&&q.end===4?'X':'Y';}},{limit:64});
 const index=(start:number,end:number)=>r.exchanges.findIndex(e=>e.test.start===start&&e.test.end===end);
 expect(index(1,2)).toBeGreaterThan(index(7,8));expect(index(1,2)).toBeGreaterThan(index(8,8));
});
it('generates only dictionary candidates, independent of objective, row count and property order',async()=>{
 const dictionary=publicSchema('refund'),expected=publicCandidates(dictionary);expect(publicCandidates(Object.fromEntries(Object.entries(dictionary).reverse()))).toEqual(expected);
 for(const c of expected)expect(compileTree(c,'refund')).toBeDefined();
 expect(expected).toContainEqual({op:'gt',args:['refund','paid']});expect(publicCandidates(publicSchema('receipt'))).toContainEqual({op:'neq',args:['memo_supplier','receipt_supplier']});
 const lists:unknown[]=[];const investigator=new TreeInvestigator(async prompt=>{lists.push(JSON.parse(prompt).publicCandidates);return {raw:JSON.stringify({hypotheses:[h('a'),h('b'),h('c')]}),inferenceSource:'in_cloud'};});
 await investigator.propose({objective:'Review one business objective',domain:'refund',rowCount:8},1);
 await investigator.propose({objective:'Entirely different task',domain:'refund',rowCount:900},1);
 expect(lists[0]).toEqual(lists[1]);expect(lists[0]).toEqual(expected);
});

it('shares the complement of a truth-table equivalent alias',async()=>{
 const r=await runTreeInvestigation(data,{async propose(){return [h('expanded',{op:'or',args:[atom,atom]}),h('simple',atom),h('opposite',{op:'not',args:[atom]})];}},{async answer(){return 'X';}});
 expect(r.usage).toHaveLength(1);expect(r.shared.some(s=>s.id==='r1-opposite'&&s.inverted)).toBe(true);expect(r.reusedAnswers.every(a=>a.token==='X')).toBe(true);
});
