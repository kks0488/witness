vi.mock('../src/cloud-control',async importOriginal=>({...await importOriginal<typeof import('../src/cloud-control')>(),pacedCloud:<T>(operation:()=>Promise<T>)=>operation()}));
import { it, expect, vi } from 'vitest';
import { DATASETS, publicTask } from '../src/fixtures';
import { question } from '../src/protocol';
import { investigatorPayload } from '../src/session';
import { FirebaseWitness, FirebaseInvestigator, aggregateAnswers, exchangePrivateDebugToken, witnessRowPayload, type FirebaseSettings } from '../src/models/firebase';
import { InferenceSource, type GenerativeModel } from 'firebase/ai';
import { loadModels } from '../src/models';
const fake = (text: string, source: typeof InferenceSource[keyof typeof InferenceSource]) => {
  const generateContent = vi.fn(async(_request: unknown)=>({response:{text:()=>text,inferenceSource:source}}));
  return {model: {generateContent} as unknown as GenerativeModel, generateContent};
};
it('Firebase local adapter accepts constrained JSON string enums and uses the local source',async()=>{
  const f=fake('"Y"',InferenceSource.ON_DEVICE);
  expect(await new FirebaseWitness(f.model).answer(DATASETS.refund,question('refund',1))).toBe('Y');
  expect(f.generateContent.mock.calls.length).toBe(1);
});
it('Firebase local adapter rejects an in-cloud response',async()=>{
  const f=fake('Y',InferenceSource.IN_CLOUD);
  await expect(new FirebaseWitness(f.model).answer(DATASETS.refund,question('refund',1))).rejects.toThrow('Local inference required');
});
it('Firebase local adapter reduces free-form output to ABSTAIN',async()=>{
  const f=fake('Y: phone is 555-010-1000',InferenceSource.ON_DEVICE);
  expect(await new FirebaseWitness(f.model).answer(DATASETS.refund,question('refund',1))).toBe('X');
});
it('Firebase cloud adapter submits exactly the auditable public payload',async()=>{
  const f=fake(JSON.stringify({query:question('refund',1,40)}),InferenceSource.IN_CLOUD);
  const task=publicTask(DATASETS.refund);
  expect(await new FirebaseInvestigator(f.model).next(task,[])).toEqual({query:question('refund',1,40)});
  expect(f.generateContent).toHaveBeenCalledWith(investigatorPayload(task,[]));
  expect(JSON.stringify(f.generateContent.mock.calls)).not.toContain('555-');
});
it('Firebase cloud adapter rejects malformed model conclusions',async()=>{
  const f=fake('{"slots":"secret","template":12}',InferenceSource.IN_CLOUD);
  await expect(new FirebaseInvestigator(f.model).next(publicTask(DATASETS.reply),[])).rejects.toThrow('Invalid conclusion');
});
it('missing configuration chooses demo without initializing Firebase',async()=>{
  vi.stubEnv('VITE_MODEL_MODE','');
  try {
    const pair=await loadModels();expect(pair.live).toBe(false);expect(pair.mode).toBe('demo mode');
  } finally {vi.unstubAllEnvs();}
});
it('debug token exchange passes credentials only into the request and never logs them',async()=>{
  const settings: FirebaseSettings={apiKey:'fictional-test-key',projectId:'fictional-project',appId:'fictional-app',siteKey:'fictional-site',model:'gemini-3.5-flash-lite',mode:'cloud',debugToken:'fictional-debug-secret'};
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({token:'fictional-attestation',ttl:'3600s'})}));
  vi.stubGlobal('fetch',fetcher);
  try {
    const result=await exchangePrivateDebugToken(settings);
    expect(result.token).toBe('fictional-attestation');expect(result.expireTimeMillis).toBeGreaterThan(Date.now()+3500_000);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(':exchangeDebugToken?key='),expect.objectContaining({body:JSON.stringify({debugToken:settings.debugToken})}));
    expect(log).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();log.mockRestore();}
});
it('debug exchange failures expose a generic error without the response body',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({sensitive:'fictional-secret'})})));
  try {await expect(exchangePrivateDebugToken({} as FirebaseSettings)).rejects.toThrow('App Check debug exchange failed');}
  finally {vi.unstubAllGlobals();}
});
it('Firebase local adapter queries one row at a time, caches question-by-row results, and aggregates Y/N/X',async()=>{
  const seq=['"N"','"N"','"N"'];
  let idx=0;
  const generateContent=vi.fn(async()=>({response:{text:()=>seq[idx++]??'"X"',inferenceSource:InferenceSource.ON_DEVICE}}));
  const witness=new FirebaseWitness({generateContent} as unknown as GenerativeModel);
  expect(await witness.answer(DATASETS.reply,question('reply',1,3))).toBe('N');
  expect(generateContent).toHaveBeenCalledTimes(3);
  expect(await witness.answer(DATASETS.reply,question('reply',1,2))).toBe('N');
  expect(generateContent).toHaveBeenCalledTimes(3);
  expect(witness.cacheHits).toBe(2);
  expect(aggregateAnswers(['N','N'])).toBe('N');
  expect(aggregateAnswers(['N','X'])).toBe('X');
  expect(aggregateAnswers(['X','Y'])).toBe('Y');
  expect(aggregateAnswers([])).toBe('X');
});
it('per-row payload includes only matching receipt evidence rather than all 59 receipts',()=>{
  const missing=JSON.parse(witnessRowPayload(DATASETS.receipt,DATASETS.receipt.rows[6],question('receipt',7).text));
  expect(missing.row.slot).toBe(7);
  expect(missing.receipts).toEqual([]);
  const matched=JSON.parse(witnessRowPayload(DATASETS.receipt,DATASETS.receipt.rows[42],question('receipt',43).text));
  expect(matched.receipts).toHaveLength(1);
  expect(matched.receipts[0].reference).toBe('DEMO-TX2043');
});
it('local reasoning remains private and only the constrained answer enters the channel',async()=>{
  const f=fake(JSON.stringify({reason:'Private local evidence and 555-010-1000',answer:'N'}),InferenceSource.ON_DEVICE);
  const witness=new FirebaseWitness(f.model);
  expect(await witness.answer(DATASETS.refund,question('refund',1))).toBe('N');
  expect(witness.log[0].inferenceSource).toBe(InferenceSource.ON_DEVICE);
  const bad=fake(JSON.stringify({reason:'local',answer:'N plus private text'}),InferenceSource.ON_DEVICE);
  expect(await new FirebaseWitness(bad.model).answer(DATASETS.refund,question('refund',1))).toBe('X');
});
it('narrow review questions reach Nano unchanged instead of becoming omnibus checks',async()=>{
  const f=fake('"N"',InferenceSource.ON_DEVICE);
  const q={...question('refund',12),text:'Does this record have a review issue involving only overpayment?'};
  expect(await new FirebaseWitness(f.model).answer(DATASETS.refund,q)).toBe('N');
  expect(JSON.parse(f.generateContent.mock.calls[0][0] as string)).not.toHaveProperty('focusedCheck');
});
it('expired answer slots start no additional Nano checks or rows',async()=>{
  vi.useFakeTimers();
  try {
    let finish!:(value:unknown)=>void;
    const generateContent=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
    const witness=new FirebaseWitness({generateContent} as unknown as GenerativeModel);
    const {ask,createSession}=await import('../src/session');
    const pair={witness,investigator:new FirebaseInvestigator(fake('{}',InferenceSource.IN_CLOUD).model),live:true,mode:'test'};
    const pending=ask(createSession(DATASETS.reply),DATASETS.reply,pair,question('reply',1,6),10);
    await vi.advanceTimersByTimeAsync(10);
    expect((await pending).ledger.answers).toEqual(['X']);
    finish({response:{text:()=>'"Y"',inferenceSource:InferenceSource.ON_DEVICE}});
    await vi.advanceTimersByTimeAsync(1);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(witness.pending).toBe(0);
  } finally {vi.useRealTimers();}
});
