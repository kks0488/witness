import { describe,it,expect,vi } from 'vitest';
import { ChromeLocalTransport, classifyLocal, ResearchWitness, localRecord, type LocalTransport } from '../src/local-research';
import { DATASETS } from '../src/fixtures';
import { pacedCloud } from '../src/cloud-control';
const q='Does the evidence support this claim?';
describe('generic local evidence pipeline',()=>{
 it('keeps evidence local and releases a single token',async()=>{
  const seen:string[]=[];const transport:LocalTransport={async call(prompt){seen.push(prompt);return seen.length===1?'{"evidence":"fictional source quote"}':'"Y"';}};
  const w=new ResearchWitness('memo',transport);expect(await w.answer(DATASETS.refund,{kind:'refund',start:1,end:1,text:q})).toBe('Y');expect(w.calls).toBe(2);expect(seen[1]).toContain('fictional source quote');
  expect(await w.answer(DATASETS.refund,{kind:'refund',start:1,end:1,text:q})).toBe('Y');expect(w.cacheHits).toBe(1);expect(w.calls).toBe(2);
 });
 it('uses model-authored conditions and preserves unknown',async()=>{
  let n=0;const t:LocalTransport={async call(){return ['{"conditions":["Is the crate red?","Is the shelf locked?"],"unsupported":false}','"Y"','"X"'][n++];}};
  const r=await classifyLocal(DATASETS.refund,DATASETS.refund.rows[0],q,'conditions',t);expect(r.token).toBe('X');expect(r.calls).toHaveLength(3);
 });
 it('retries failed local inference only once and never calls cloud',async()=>{
  const call=vi.fn(async()=>{throw new Error('local failure');});const r=await classifyLocal(DATASETS.refund,DATASETS.refund.rows[0],q,'memo',{call});expect(r.token).toBe('X');expect(call).toHaveBeenCalledTimes(2);expect(r.attempts).toBe(2);
 });
 it('does not include labels, answer keys or direct identifiers in projected source',()=>{
  const raw=JSON.stringify(localRecord(DATASETS.refund,DATASETS.refund.rows[11],q));expect(raw).not.toMatch(/meanings|ANSWER_KEY|delivery-conflict|"phone"|"customer"|"slot"/);expect(raw).toContain('signed collection slip');
 });
 it('enforces the deadline during session creation and destroys a late session',async()=>{
  vi.useFakeTimers();let resolveSession!:(value:unknown)=>void;const destroy=vi.fn();
  vi.stubGlobal('LanguageModel',{create:()=>new Promise(resolve=>{resolveSession=resolve;})});
  const controller=new AbortController();const pending=new ChromeLocalTransport().call('test',null,undefined,controller.signal).catch(e=>e.name);
  controller.abort();expect(await pending).toBe('AbortError');resolveSession({destroy});await Promise.resolve();expect(destroy).toHaveBeenCalledOnce();vi.unstubAllGlobals();vi.useRealTimers();
 });
 it('serializes concurrent cloud operations at least six seconds apart',async()=>{
  vi.useFakeTimers();const starts:number[]=[];const op=()=>{starts.push(Date.now());return Promise.resolve(1);};const tasks=[pacedCloud(op),pacedCloud(op),pacedCloud(op)];await vi.runAllTimersAsync();await Promise.all(tasks);expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(13000);expect(starts[2]-starts[1]).toBeGreaterThanOrEqual(13000);vi.useRealTimers();
 });
});
