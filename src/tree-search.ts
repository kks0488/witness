import type { Dataset } from './fixtures';
import { HYPOTHESIS_OBJECTIVES, type HypothesisExchange } from './hypothesis';
import { compileTree, canonicalKey,invertedKey,type CompiledTree } from './tree-expression';
import { allowedQuestion,appendAnswer,bitsPerAnswer,canAnswer,makeLedger,normalizeAnswer,usedBits,type Ledger,type Query,type Token } from './protocol';
import { safeQuestion } from './extraction';
import type { TreeHypothesis,TreeInvestigator } from './tree-investigator';
import { evaluateExpression } from './open-expression';
export const GROUP_PROCEDURE='Normalize public trees: sort eq/neq/and/or operands, gt(a,b)=lt(b,a), cancel double negation, not(eq)=neq. Equivalent predicates share one scan. Complementary predicates share singleton queries, inverting Y/N and retaining X; an existential group answer is NEVER blindly inverted. Round-robin predicates one step at a time, breadth-first within each predicate. Y descendants take priority over X descendants. Round one spends at most 60 percent of the bit cap. Reserve the rest for the only follow-up round. New second-round predicates share the remaining work fairly with pending first-round predicates; when there are no new predicates return the reserve to pending work. N prunes a range; Y/X splits it; singleton X stays unconfirmed. Ask each predicate/range once. Send only aggregate Y/X counts and public rejection reasons, no row positions. Stop before exceeding the answer-channel bit cap.';
export interface SharedPredicate {id:string;targetId:string;inverted:boolean;}
export interface ReusedAnswer {id:string;targetId:string;start:number;end:number;token:Token;sourceToken:Token;}

export interface Rejection {id:string;round:number;reason:string;bits:0;}
export interface ExpressionUsage {id:string;expression:string;answers:number;bits:number;y:number;x:number;unconfirmed:number[];pending:{start:number;end:number;priority?:'Y'|'X'}[];status:'running'|'complete'|'unfinished at cap';}
export interface TreeRun {
 task:{objective:string;rowCount:number};hypotheses:TreeHypothesis[];exchanges:HypothesisExchange[];ledger:Ledger;slots:number[];
 shared:SharedPredicate[];reusedAnswers:ReusedAnswer[];rejections:Rejection[];usage:ExpressionUsage[];rounds:{round:number;answerCount:number;bits:number;summary:{id:string;identifiedY:number;x:number}[]}[];
 status:'planning'|'running'|'complete'|'sealed'|'error';startedAt:string;endedAt?:string;cloudCalls:number;error?:string;
}
export interface TreeWitness {answer(data:Dataset,q:Query,signal?:AbortSignal):Promise<string>;}
/** Public validation cannot access rows, evidence, private values, or the witness. */
export function validateTreeHypothesis(h:TreeHypothesis,domain:string,rowCount:number):{compiled:CompiledTree}|{reason:string} {
 if(!h||typeof h.id!=='string'||!h.id.trim()||typeof h.title!=='string'||typeof h.question!=='string')return {reason:'invalid public hypothesis shape'};
 const compiled=compileTree(h.tree,domain);if(!compiled)return {reason:'invalid expression structure, type, depth or field count'};
 if(!allowedQuestion({kind:domain as Query['kind'],start:1,end:rowCount,text:h.question},domain,rowCount)||!safeQuestion(h.question))return {reason:'public question policy'};
 return {compiled};
}
/** With unknowns, q,k positive/unknown leaves: <=1+2 sum min(2^d,k).
 * X can force every node, so the unconditional bound is 2n-1; k alone is
 * insufficient when X is allowed. Both bounds are capped by the full tree. */
export function groupAnswerBound(n:number,k:number,unknownLeaves=0):number {
 if(!Number.isInteger(n)||n<1||k<0||unknownLeaves<0||k+unknownLeaves>n)throw Error('Invalid public bound');
 const h=Math.ceil(Math.log2(n));let count=1;for(let d=0;d<h;d++)count+=2*Math.min(2**d,k+unknownLeaves);
 return Math.min(2*n-1,count);
}
/** Truth signature over public synthetic field values; no source rows/keys.
 * Exact enumeration of finite order/equality partitions for this small grammar
 * would be larger. This conservative fingerprint deduplicates flag-only logic;
 * other trees use normalized AST equality, never empirical source equivalence. */
export function expressionFingerprint(c:CompiledTree,inverted=false):string {
 if(c.parsed.fields.every(f=>!c.expression.includes(`num(${f})`)&&!c.expression.includes(`name(${f})`))){
  const fields=[...c.parsed.fields].sort(),out:string[]=[];
  for(let i=0;i<3**fields.length;i++){let m=i;const v:Record<string,string>={};for(const f of fields){v[f]=['yes','no','not_stated'][m%3];m=Math.floor(m/3);}const token=evaluateExpression(c.expression,v);out.push(inverted?invertAnswer(token):token);}
  return JSON.stringify([fields,out]);
 }
 return inverted?invertedKey(c.tree):canonicalKey(c.tree);
}
export const invertAnswer=(token:Token):Token=>token==='Y'?'N':token==='N'?'Y':'X';
export async function runTreeInvestigation(data:Dataset,investigator:Pick<TreeInvestigator,'propose'>,witness:TreeWitness,options:{limit?:number;onUpdate?:(run:TreeRun)=>void}={}):Promise<TreeRun> {
 // Only public task metadata crosses to investigator. Never spread the dataset.
 const task={objective:HYPOTHESIS_OBJECTIVES[data.id],rowCount:data.rows.length};
 const run:TreeRun={task,hypotheses:[],exchanges:[],ledger:makeLedger(JSON.stringify(task),options.limit??64),slots:[],shared:[],reusedAnswers:[],rejections:[],usage:[],rounds:[],status:'planning',startedAt:new Date().toISOString(),cloudCalls:0};
 const update=()=>options.onUpdate?.(run);const fingerprints=new Map<string,string>(),keys=new Map<string,string>(),ids=new Set<string>();update();
 try {
  for(let round=1;round<=2;round++){
   run.cloudCalls++;const proposed=await investigator.propose({...task,domain:data.id},round,run.rounds[0]?.summary??[],run.hypotheses,run.rejections.map(({id,reason})=>({id,reason})));run.status='running';
   for(const h of proposed){
    const id=`r${round}-${String(h?.id??'invalid')}`,v=validateTreeHypothesis(h,data.id,task.rowCount);let reason='reason' in v?v.reason:ids.has(id)?'duplicate public hypothesis id':'';
    let shared:SharedPredicate|undefined;
    if(!reason&&'compiled'in v){
     const fp=expressionFingerprint(v.compiled),key=canonicalKey(v.compiled.tree),same=fingerprints.get(fp)??keys.get(key),opposite=fingerprints.get(expressionFingerprint(v.compiled,true))??keys.get(invertedKey(v.compiled.tree));
     if(same){keys.set(key,same);reason='equivalent predicate already scheduled';shared={id,targetId:same,inverted:false};}
     else if(opposite){reason='complement predicate shares singleton answers';shared={id,targetId:opposite,inverted:true};}
     else {fingerprints.set(fp,id);keys.set(key,id);}
    }
    const hypothesis={...h,id,round,...('compiled'in v?{expression:v.compiled.expression}:{})};run.hypotheses.push(hypothesis);
    if(reason){run.rejections.push({id,round,reason,bits:0});if(shared){run.shared.push(shared);
      // Existential group negation is not a negated existential. A pair uses
      // singleton queries only, so every reused negation is logically sound.
      if(shared.inverted){const u=run.usage.find(u=>u.id===shared!.targetId)!;const done=new Set(run.exchanges.filter(e=>e.test.hypothesisId===u.id&&e.test.start===e.test.end).map(e=>e.test.start));u.pending=Array.from({length:task.rowCount},(_,i)=>({start:i+1,end:i+1})).filter(r=>!done.has(r.start));}
    }continue;}
    ids.add(id);run.usage.push({id,expression:hypothesis.expression!,answers:0,bits:0,y:0,x:0,unconfirmed:[],pending:[{start:1,end:task.rowCount}],status:'running'});
   }
   const reuse=()=>{
    run.reusedAnswers=run.shared.flatMap(s=>run.exchanges.filter(e=>e.test.hypothesisId===s.targetId&&(!s.inverted||e.test.start===e.test.end)).map(e=>({id:s.id,targetId:s.targetId,start:e.test.start,end:e.test.end,sourceToken:e.token,token:s.inverted?invertAnswer(e.token):e.token})));
    run.slots=[...new Set([...run.exchanges.filter(e=>e.token==='Y'&&e.test.start===e.test.end).map(e=>e.test.start),...run.reusedAnswers.filter(e=>e.token==='Y'&&e.start===e.end).map(e=>e.start)])].sort((a,b)=>a-b);
   };
   reuse();update();
   const ceiling=round===1?run.ledger.limit*.6:run.ledger.limit;
   while(canAnswer(run.ledger)&&usedBits(run.ledger)+bitsPerAnswer('ternary')<=ceiling+1e-9&&run.usage.some(u=>u.pending.length)){
    for(const u of run.usage){
     if(!canAnswer(run.ledger)||usedBits(run.ledger)+bitsPerAnswer('ternary')>ceiling+1e-9)break;
     // Stable FIFO within Y and X queues preserves breadth-first traversal;
     // only descendants of X are deferred behind all ordinary/Y work.
     if(u.pending.length&&u.pending.every(r=>r.priority==='X')&&run.usage.some(v=>v.pending.some(r=>r.priority!=='X')))continue;
     const at=u.pending.findIndex(r=>r.priority!=='X'),range=u.pending.splice(at<0?0:at,1)[0];if(!range)continue;
     const h=run.hypotheses.find(h=>h.id===u.id)!;
     const q:Query={kind:data.id,start:range.start,end:range.end,text:h.question,expression:u.expression};
     const token:Token=normalizeAnswer(await witness.answer(data,q));
     run.ledger=appendAnswer(run.ledger,token);run.exchanges.push({test:{hypothesisId:u.id,start:range.start,end:range.end},question:q,token});
     u.answers++;u.bits=u.answers*bitsPerAnswer('ternary');if(token==='X')u.x++;
     if(range.start===range.end){if(token==='Y')u.y++;if(token==='X')u.unconfirmed.push(range.start);}
     else if(token!=='N'){const middle=Math.floor((range.start+range.end)/2);u.pending.push({start:range.start,end:middle,priority:token},{start:middle+1,end:range.end,priority:token});}
     u.status=u.pending.length?'running':'complete';reuse();update();
    }
   }
   run.rounds.push({round,answerCount:run.exchanges.length,bits:usedBits(run.ledger),summary:run.usage.map(u=>({id:u.id,identifiedY:u.y,x:u.x}))});update();
  }
  for(const u of run.usage)u.status=u.pending.length?'unfinished at cap':'complete';
  run.status=run.usage.some(u=>u.pending.length)?'sealed':'complete';
 }catch{run.status='error';run.error='Model or transport failed';}
 run.endedAt=new Date().toISOString();update();return run;
}
export function treeReceipt(run:TreeRun,cloudLog:{prompt:string}[],local:{calls:number;fields:number}) {
 return {version:9,sharedPredicates:run.shared,reusedAnswers:run.reusedAnswers,status:run.status,startedAt:run.startedAt,endedAt:run.endedAt,publicTask:run.task,procedure:GROUP_PROCEDURE,hypotheses:run.hypotheses,answers:run.exchanges,totalBits:usedBits(run.ledger),capBits:run.ledger.limit,remainingBits:run.ledger.limit-usedBits(run.ledger),answerBytes:run.ledger.answers.length,rejectedRequests:run.rejections.length,publicRejections:run.rejections,expressionUsage:run.usage,rounds:run.rounds,investigatorPrompts:cloudLog.map(x=>x.prompt),sourceTextBytes:0,extractedValuesReleased:0,localModelCalls:local.calls,localExtractedFieldCount:local.fields,limitations:'Fixed Y/N/X answer channel only, conditional on public setup. Aggregate feedback is a deterministic function of those charged symbols and the public procedure. Public rejections depend on no source data. Transport, timing, App Check, model setup and repeated sessions are outside the cap. Local unsigned receipt.'};
}
