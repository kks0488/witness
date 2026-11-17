import {describe,it,expect} from 'vitest';
import {parseExpression,evaluateExpression} from '../src/open-expression';
import {WITNESS_SCHEMA} from '../src/witness-schema';
import {PROGRAMS,extractAndJudge,type Plan} from '../src/extraction';
import {OpenWitness} from '../src/open-witness';
import {DATASETS} from '../src/fixtures';
import {OpenInvestigator} from '../src/open-investigator';
const fresh=[
 ['lt(num(paid),num(refund))',{paid:2,refund:4},'Y'],
 ['eq(num(paid),num(refund))',{paid:2,refund:2},'Y'],
 ['neq(num(paid),num(refund))',{paid:2,refund:4},'Y'],
 ['or(is(reused_image),is(previous_refund))',{reused_image:'no',previous_refund:'yes'},'Y'],
 ['and(is(claim_nonreceipt),not(is(previous_refund)))',{claim_nonreceipt:'yes',previous_refund:'no'},'Y'],
 ['or(eq(num(matching_receipts),0),is(private_purpose))',{matching_receipts:2,private_purpose:'yes'},'Y'],
 ['eq(name(memo_supplier),name(receipt_supplier))',{memo_supplier:'Cedar',receipt_supplier:'cedar'},'Y'],
 ['not(or(is(reused_image),is(previous_refund)))',{reused_image:'no',previous_refund:'not_stated'},'X']
] as const;
const forbidden=['gt(num(paid),1)','eq(num(paid),-1)','eq(name(memo_supplier),"Cedar")','is(phone)','num(customer)','is(order)','eq(num(paid),0.0)','not(not(not(is(reused_image))))','and(and(is(claim_nonreceipt),is(signed_handover)),and(is(reused_image),and(is(previous_refund),gt(num(refund),num(paid)))))','gt(name(memo_supplier),name(receipt_supplier))','eq(0,num(paid))','neq(num(paid),0)','eq(num(paid),name(memo_supplier))','is(__proto__)'];
describe('open typed expressions',()=>{
 it.each(fresh)('executes new composition %s',(rule,v,token)=>{expect(PROGRAMS).not.toContain(rule);expect(parseExpression(rule)).toBeDefined();expect(evaluateExpression(rule,v)).toBe(token);});
 it.each(forbidden)('rejects %s before device inference',async rule=>{expect(parseExpression(rule)).toBeUndefined();let calls=0;const w=new OpenWitness({async call(){calls++;return '{}';}});expect(await w.answer(DATASETS.refund,{kind:'refund',start:1,end:1,text:'Does the claim require review?',expression:rule})).toBe('X');expect(calls).toBe(0);});
 it('rejects five different fields at otherwise valid depth',()=>expect(parseExpression('or(and(is(claim_nonreceipt),is(signed_handover)),and(is(reused_image),gt(num(refund),num(paid))))')).toBeUndefined());
 it('rejects all identifier and arbitrary value field additions',()=>{expect(Object.keys(WITNESS_SCHEMA).sort()).toEqual(['paid','refund','matching_receipts','claim_nonreceipt','signed_handover','reused_image','private_purpose','memo_supplier','receipt_supplier','refund_approved','refund_settled','previous_refund'].sort());for(const f of ['phone','customer','order','reference','character','arbitrary','amount','slot','days'])for(const op of ['is','num','name'])expect(parseExpression(`${op}(${f})`)).toBeUndefined();expect(parseExpression('is(refund_approved)','refund')).toBeUndefined();});
 it('enumerates all Kleene truth table cases',()=>{const vals=['yes','no','not_stated'];const and=[['Y','N','X'],['N','N','N'],['X','N','X']],or=[['Y','Y','Y'],['Y','N','X'],['Y','X','X']];for(let i=0;i<3;i++){expect(evaluateExpression('not(is(reused_image))',{reused_image:vals[i]})).toBe(['N','Y','X'][i]);for(let j=0;j<3;j++){const v={reused_image:vals[i],previous_refund:vals[j]};expect(evaluateExpression('and(is(reused_image),is(previous_refund))',v)).toBe(and[i][j]);expect(evaluateExpression('or(is(reused_image),is(previous_refund))',v)).toBe(or[i][j]);}}});
 it('rejects fabricated grounding quotes and keeps valid quotes only on device',async()=>{const plan:Plan={rule:'is(reused_image)',fields:['reused_image'],source:'open',ms:0,calls:[]};const row=DATASETS.refund.rows[0];let prompt='';const transport={async call(p:string){prompt=p;return JSON.stringify({reused_image:{value:'yes',quote:'fabricated archived match'}});}};const r=await extractAndJudge(DATASETS.refund,row,plan,transport,undefined,true);expect(r.token).toBe('X');expect(r.values.reused_image).toBe('not_stated');expect(JSON.parse(prompt).record).toEqual({deliveryNote:row.deliveryNote});expect(prompt).not.toContain(plan.rule);});
 it('does not trust caller fields mismatching the parsed expression',async()=>{let calls=0;const r=await extractAndJudge(DATASETS.refund,DATASETS.refund.rows[0],{rule:'is(reused_image)',fields:['paid'],source:'open',ms:0,calls:[]},{async call(){calls++;return '{}';}});expect(r.token).toBe('X');expect(calls).toBe(0);});
 it('cloud sees objective, dictionary and grammar but never raw columns or values',async()=>{let input='';const i=new OpenInvestigator(async p=>{input=p;return {raw:JSON.stringify({hypotheses:[{id:'h1',title:'Overpay',question:'Does the refund exceed payment?',expression:'gt(num(refund),num(paid))'},{id:'h2',title:'Image',question:'Is the image reused?',expression:'is(reused_image)'}]}),inferenceSource:'in_cloud'};});await i.hypotheses({objective:'Find refund requests requiring review.',rowCount:40,columns:['phone','order'],evidenceColumns:[]});const p=JSON.parse(input);expect(p.task).toEqual({objective:'Find refund requests requiring review.',rowCount:40});expect(p.schema).not.toHaveProperty('phone');expect(input).not.toContain(DATASETS.refund.rows[0].reason!);});
});

describe('seventh-step accounting',()=>{
 it('counts failed local attempts',async()=>{const plan:Plan={rule:'is(reused_image)',fields:['reused_image'],source:'open',ms:0,calls:[]};const r=await extractAndJudge(DATASETS.refund,DATASETS.refund.rows[0],plan,{async call(){throw Error('timeout');}});expect(r.calls).toHaveLength(1);expect(r.calls[0].error).toBe('Error');expect(r.token).toBe('X');});
 it('records grammar refusals made before witness invocation',async()=>{const {runHypothesisInvestigation}=await import('../src/hypothesis');let phase=0,calls=0;const w=new OpenWitness({async call(){calls++;return '{}';}});const i={name:'test cloud',log:[],async hypotheses(){return [{id:'h',title:'bad',question:'Does the phone identify this customer?',expression:'is(phone)'}];},async choose(){return phase++?{tests:[],done:true}:{tests:[{hypothesisId:'h',start:1,end:1}],done:false};}};const run=await runHypothesisInvestigation(DATASETS.refund,i,w);expect(run.exchanges).toHaveLength(1);expect(run.exchanges[0].token).toBe('X');expect(w.rejected).toBe(1);expect(w.grammarRejected).toBe(1);expect(w.log).toHaveLength(1);expect(calls).toBe(0);});
});
