import './style.css';
import { OPEN_PLAN_INSTRUCTIONS,OPEN_CHOOSE_INSTRUCTIONS } from './open-investigator';
import { parseExpression } from './open-expression';
import { safeQuestion } from './extraction';
import { WITNESS_SCHEMA,OPEN_GRAMMAR } from './witness-schema';
import { DATASETS, type Dataset, type TaskId } from './fixtures';
import { benchmark, type Comparison } from './benchmark';
import { demoPair, loadModels } from './models';
import type { ModelPair } from './models/types';
import { ask, createSession, disclosureReceipt, InvestigationError, step, type Attack, type Session } from './session';
import { screen } from './ui/screen';
import { HYPOTHESIS_PLAN_INSTRUCTIONS, HYPOTHESIS_CHOOSE_INSTRUCTIONS, runHypothesisInvestigation, type HypothesisRun } from './hypothesis';
import { allowedQuestion, publicSlotMs } from './protocol';

async function legacyMain(){
const root = document.querySelector<HTMLDivElement>('#app')!;
let task: TaskId = 'refund';
let cap = 64;
let session: Session = createSession(DATASETS[task], false, cap);
let models: ModelPair = demoPair();
let running = false;
let investigationMode: 'hypothesis' | 'scripted-witness' = 'hypothesis';
let hypothesisRun: HypothesisRun | undefined;
let recordedReplay=false;
let comparisons: Comparison[] = [];
let hypothesisExtractedFieldStart = 0;

function reset(): void {
  recordedReplay=false;
  hypothesisRun = undefined;
  hypothesisExtractedFieldStart=models.hypothesisWitness?.extractedFieldCount??0;
  session = createSession(DATASETS[task], false, cap);
  render();
}
async function refreshComparison(): Promise<void> {
  const selectedCap = cap;
  const rows = await benchmark(selectedCap);
  if (selectedCap === cap) comparisons = rows;
  render();
}
function downloadReceipt(): void {
  const blob = new Blob([JSON.stringify(disclosureReceipt(session), null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'witness-disclosure-receipt.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render(): void {
  const sourceScroll = document.querySelector('.record-table')?.scrollTop ?? 0;
  root.innerHTML = screen(task, session, investigationMode === 'hypothesis' && models.hypothesisWitness ? {...models,witness:models.hypothesisWitness} : models, running, comparisons,{mode:investigationMode,run:hypothesisRun,recorded:recordedReplay});
  document.querySelector('#task')!.addEventListener('change', event => {
    task = (event.target as HTMLSelectElement).value as TaskId;
    reset();
  });
  document.querySelector('#investigation-mode')!.addEventListener('change',event=>{investigationMode=(event.target as HTMLSelectElement).value as typeof investigationMode;reset();});
  document.querySelector('#cap')!.addEventListener('change', event => {
    cap = Number((event.target as HTMLSelectElement).value);
    reset();
    void refreshComparison();
  });
  document.querySelector('#run')!.addEventListener('click', () => void run(false));
  document.querySelector('#attack')!.addEventListener('click', () => void run(true));
  document.querySelector('#subtle')!.addEventListener('click', () => void run('subtle'));
  document.querySelector('#reset')!.addEventListener('click', reset);
  document.querySelector('#question-form')!.addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    void runQuestion(Number(form.get('start')), Number(form.get('end')), String(form.get('text')),String(form.get('expression')??''));
  });
  document.querySelector('#show-receipt')?.addEventListener('click', () => {
    document.querySelector<HTMLDialogElement>('#receipt-dialog')!.showModal();
  });
  document.querySelector('#close-receipt')?.addEventListener('click', () => {
    document.querySelector<HTMLDialogElement>('#receipt-dialog')!.close();
  });
  document.querySelector('#download-receipt')?.addEventListener('click', downloadReceipt);
  document.querySelector('.record-table')!.scrollTop = sourceScroll;
  const history = document.querySelector('.exchanges')!;
  history.scrollTop = history.scrollHeight;
}
function stopWithError(): void {
  session = {
    ...session,
    status: 'error',
    endedAt: new Date().toISOString(),
    result: 'Investigation stopped. No supported conclusion was produced. Review the local setup and reset to retry.'
  };
}
async function runQuestion(start: number, end: number, text: string, expression?:string): Promise<void> {
  if (running) return;
  running = true;
  render();
  try {
    const activeModels=investigationMode==='hypothesis'&&models.hypothesisWitness?{...models,witness:models.hypothesisWitness}:models;
    session = await ask(session, DATASETS[task], activeModels, {kind: task, start, end, text,...(expression?{expression}:{})});
  } catch (error) {
    if (error instanceof InvestigationError) session = error.state;
    stopWithError();
  } finally {
    running = false;
    render();
  }
}
function applyHypothesisRun(run:HypothesisRun,logStart:number):void {
  hypothesisRun=run;
  session={...session,localExtractedFieldCount:Math.max(0,(models.hypothesisWitness?.extractedFieldCount??0)-hypothesisExtractedFieldStart),blockedQuestions:run.exchanges.filter(e=>!allowedQuestion(e.question,task,DATASETS[task].rows.length)||!!e.question.expression&&(!parseExpression(e.question.expression,task)||!safeQuestion(e.question.text))).length,ledger:run.hypotheses.some(h=>h.expression)?{...run.ledger,bootstrap:models.hypothesisInvestigator?.log.slice(logStart).find(l=>l.phase==='hypotheses')?.prompt??run.ledger.bootstrap}:run.ledger,transcript:run.exchanges.map(e=>({query:e.question,token:e.token})),slots:run.slots,status:run.status==='planning'?'running':run.status,startedAt:run.startedAt,endedAt:run.endedAt,
    outbound:models.hypothesisInvestigator?.log.slice(logStart).map(l=>l.prompt)??[],
    publicInstructions:run.hypotheses.some(h=>h.expression)?OPEN_PLAN_INSTRUCTIONS+'\n'+OPEN_CHOOSE_INSTRUCTIONS+'\n'+OPEN_GRAMMAR+'\n'+JSON.stringify(WITNESS_SCHEMA):(run.hypotheses[0]?.id==='baseline'?'':HYPOTHESIS_PLAN_INSTRUCTIONS+'\n')+HYPOTHESIS_CHOOSE_INSTRUCTIONS,
    result:run.status==='complete'||run.status==='sealed'?`Hypothesis search ${run.status==='sealed'?'stopped at cap':'finished'}. ${run.slots.length} singleton findings confirmed; untested hypotheses remain open.`:run.error??''};
  render();
}
async function run(attack: Attack): Promise<void> {
  if (running) return;
  if (attack) session = createSession(DATASETS[task], attack, cap);
  running = true;
  render();
  try {
    if(!attack && investigationMode==='hypothesis' && models.hypothesisInvestigator && models.hypothesisWitness){
      if(session.transcript.length) return; // A fresh hypothesis ledger requires an explicit reset.
      const start=models.hypothesisInvestigator.log.length;
      hypothesisExtractedFieldStart=models.hypothesisWitness.extractedFieldCount??0;
      await runHypothesisInvestigation(DATASETS[task],models.hypothesisInvestigator,models.hypothesisWitness,{limit:cap,slotMs:q=>publicSlotMs(q,DATASETS[task].rows.length),onUpdate:r=>applyHypothesisRun(r,start)});
      return;
    }
    const activeModels=investigationMode==='hypothesis'&&models.hypothesisWitness?{...models,witness:models.hypothesisWitness}:models;
    while (['ready', 'running'].includes(session.status)) {
      session = await step(session, DATASETS[task], activeModels);
      render();
    }
  } catch (error) {
    if (error instanceof InvestigationError) session = error.state;
    stopWithError();
  } finally {
    running = false;
    render();
  }
}
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__witnessReplay4 = (data:Dataset,run:HypothesisRun,cloudLog:{prompt:string}[],modelName:string) => {
    DATASETS[data.id]=data;task=data.id;investigationMode=run.hypotheses[0]?.id==='baseline'?'scripted-witness':'hypothesis';reset();recordedReplay=true;
    for(const witness of [models.witness,models.hypothesisWitness])if(witness){Object.defineProperty(witness,'name',{value:modelName,configurable:true});const calls=(run as HypothesisRun & {localModelCalls?:number}).localModelCalls;if(calls!==undefined)Object.defineProperty(witness,'calls',{value:calls,writable:true,configurable:true});}
    applyHypothesisRun(run,0);
    session={...session,localExtractedFieldCount:(run as HypothesisRun & {localExtractedFieldCount?:number}).localExtractedFieldCount??session.localExtractedFieldCount,ledger:{...session.ledger,bootstrap:cloudLog[0]?.prompt??session.ledger.bootstrap},publicInstructions:cloudLog.map(entry=>entry.prompt).join('\n\n'),outbound:cloudLog.map(entry=>entry.prompt)};render();
  };
  (window as unknown as Record<string, unknown>).__witnessPresentRun = (run:HypothesisRun,taskId:TaskId,modelName?:string) => {
    task=taskId;investigationMode='hypothesis';reset();
    if(modelName&&models.hypothesisWitness)Object.defineProperty(models.hypothesisWitness,'name',{value:modelName,configurable:true});
    applyHypothesisRun(run,0);
  };
  (window as unknown as Record<string, unknown>).__witnessStats = () => {
    const w = (investigationMode==='hypothesis'&&models.hypothesisWitness?models.hypothesisWitness:models.witness) as unknown as {calls?: number; pending?: number; cacheHits?: number; log?: unknown[]};
    return {
      mode: models.mode,
      investigationMode,
      hypotheses:hypothesisRun?.hypotheses??[],
      live: models.live,
      status: session.status,
      transcript: session.transcript,
      ledger: session.ledger,
      result: session.result,
      receipt: ['complete', 'sealed', 'error'].includes(session.status) ? disclosureReceipt(session) : undefined,
      slots: [...session.slots],
      outboundCalls: session.outbound.length,
      nanoCalls: w.calls ?? 0,
      pendingNano: w.pending ?? 0,
      nanoCacheHits: w.cacheHits ?? 0,
      nanoLog: Array.isArray(w.log) ? [...w.log] : [],
      cloudLog: investigationMode==='hypothesis'?models.hypothesisInvestigator?.log??[]:(models.investigator as unknown as {log?: unknown[]}).log??[]
    };
  };
}
render();
void refreshComparison();
void loadModels().then(pair => {
  models = pair;
  if(!pair.hypothesisInvestigator)investigationMode='scripted-witness';
  render();
}).catch(() => {
  models = demoPair();
  investigationMode='scripted-witness';
  render();
});

}
if(new URLSearchParams(location.search).has('legacy'))void legacyMain();
else void import('./tree-ui').then(m=>m.initTreeApp());
