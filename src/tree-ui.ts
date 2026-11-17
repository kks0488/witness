import {DATASETS,type TaskId} from './fixtures';
import {loadHypothesisModels} from './models';
import {treeInvestigator} from './models/firebase';
import {OpenWitness} from './open-witness';
import {GROUP_PROCEDURE,runTreeInvestigation,treeReceipt,type TreeRun} from './tree-search';
import {bitsPerAnswer,usedBits} from './protocol';
import {escape} from './ui/helpers';
import './tree.css';
type Log={phase?:string;prompt:string;raw?:string;inferenceSource?:string};
const TASKS:Record<TaskId,string>={reply:'Customer inquiries',refund:'Refund review',receipt:'Expense review'} as Record<TaskId,string>;

/** One question's group tests drawn over the row axis: each level halves the range above it. */
function ladder(run:TreeRun,id:string):string {
 const n=run.task.rowCount,ex=run.exchanges.filter(e=>e.test.hypothesisId===id);
 if(!ex.length)return '<div class="tw-ladder tw-ladder-empty">Not asked yet</div>';
 const sizes=[...new Set(ex.map(e=>e.test.end-e.test.start+1))].sort((a,b)=>b-a);
 const bars=ex.map(e=>{const size=e.test.end-e.test.start+1,level=sizes.indexOf(size);
  return `<i class="tw-bar tw-${e.token}${size===1?' tw-one':''}" style="left:${(e.test.start-1)/n*100}%;width:${size/n*100}%;top:${level*9}px" title="Rows ${e.test.start}–${e.test.end}: ${e.token}"></i>`;}).join('');
 return `<div class="tw-ladder" style="height:${sizes.length*9+2}px">${bars}</div>`;
}

export async function initTreeApp(){
 const root=document.querySelector<HTMLDivElement>('#app')!;let run:TreeRun|undefined,log:Log[]=[],recorded=false,busy=false,task:TaskId='refund',cap=128,calls=0,fields=0;
 const render=()=>{
  const limit=run?.ledger.limit??cap,bits=run?usedBits(run.ledger):0,remaining=limit-bits,answers=run?.ledger.answers??[];
  const n=run?.task.rowCount??DATASETS[task].rows.length,found=new Set(run?.slots??[]),open=new Set(run?.usage.flatMap(u=>u.unconfirmed)??[]);
  const maxAnswers=Math.floor(limit/bitsPerAnswer('ternary'));
  const tape=Array.from({length:maxAnswers},(_,i)=>answers[i]?`<i class="tw-${answers[i]}">${answers[i]}</i>`:'<i></i>').join('');
  const rows=Array.from({length:n},(_,i)=>`<i class="${found.has(i+1)?'tw-hit':open.has(i+1)?'tw-open':''}">${found.has(i+1)?i+1:''}</i>`).join('');
  const rejected=new Map((run?.rejections??[]).map(r=>[r.id,r.reason]));
  const mode=recorded?'Recorded run · replayed locally':busy?'Interview in progress':'Ready';
  root.innerHTML=`<main class="tree-app tw">
   <header><a class="wordmark" href="/">WITNESS<span>TWENTY QUESTIONS FOR PRIVATE DATA</span></a><span class="tree-mode">${mode.toUpperCase()}</span></header>
   <section class="tw-hero">
    <div class="tw-side tw-cloud">
     <p class="tw-eyebrow">The cloud investigator · never sees a record</p>
     <h1>It heard <em>${(bits/8).toFixed(1)} bytes.</em></h1>
     <p class="tw-lede">Every answer the device gave is one of three letters. This strip is the whole conversation — ${answers.length} of at most ${maxAnswers} answers, ${bits.toFixed(1)} of ${limit} bits.</p>
     <div class="tw-tape" aria-label="Released symbols">${tape}</div>
     <p class="tw-key"><i class="tw-Y">Y</i> yes, somewhere in this range <i class="tw-N">N</i> no <i class="tw-X">X</i> can't tell<span>Guards reduce. The cap guarantees.</span></p>
    </div>
    <div class="tw-wall"><span>ONLY Y · N · X CROSSES</span></div>
    <div class="tw-side tw-device">
     <p class="tw-eyebrow">Your device · reads everything, says almost nothing</p>
     <h2><em>${found.size}</em> ${found.size===1?'record':'records'} flagged for a human.</h2>
     <p class="tw-lede">${n} records stay here. The on-device model only fills in typed fields; plain code turns them into Y, N or X.</p>
     <div class="tw-rows" style="--n:${n>60?30:20}">${rows}</div>
     <p class="tw-key"><i class="tw-hit"></i> flagged <i class="tw-open"></i> unconfirmed<span>Source text released: 0 bytes</span></p>
    </div>
   </section>
   <section class="tree-toolbar"><label>Investigation <select id="tree-task" ${busy?'disabled':''}>${(Object.keys(TASKS) as TaskId[]).map(t=>`<option value="${t}" ${task===t?'selected':''}>${TASKS[t]}</option>`).join('')}</select></label><label>Bit cap <select id="tree-cap" ${busy?'disabled':''}><option ${cap===64?'selected':''}>64</option><option ${cap===128?'selected':''}>128</option></select></label><button class="primary" id="tree-start" ${busy?'disabled':''}>${busy?'Interviewing…':'Start investigation →'}</button><button id="tree-receipt" ${run&&!busy?'':'disabled'}>Disclosure receipt ↗</button><span>${run?.status??'Ready'} · ${calls} on-device calls · ${run?.cloudCalls??0} cloud calls</span></section>
   <section class="tw-body">
    <div class="tw-questions">
     <div class="tw-head"><h3>The interview</h3><p>${run?escape(run.task.objective):'A clear objective becomes a handful of testable questions. No record values enter this panel.'}</p><div class="tw-axis"><span>row 1</span><span>row ${n}</span></div></div>
     ${run?.hypotheses.map(h=>{const u=run!.usage.find(x=>x.id===h.id),why=rejected.get(h.id),twin=run!.shared?.find(s=>s.id===h.id);
      return `<article class="tw-q${why||twin?' tw-q-off':''}"><div class="tw-q-text"><span>${escape(h.id)}${h.round?` · round ${h.round}`:''}</span><h4>${escape(h.title)}</h4><p>${escape(h.question)}</p>${h.expression?`<code>${escape(h.expression)}</code>`:''}</div>
       <div class="tw-q-run">${twin?`<p class="tw-note">Same meaning as ${escape(twin.targetId)}${twin.inverted?' (inverted)':''} — shares its scan, 0 new answers.</p>`:why?`<p class="tw-note tw-refused">Refused before the witness saw a record · ${escape(why)} · 0 bits</p>`:ladder(run!,h.id)}
       ${u?`<p class="tw-q-meta"><b>${u.y}</b> found · ${u.answers} answers · ${u.bits.toFixed(1)} bits${u.x?` · ${u.x} X`:''}<em class="tw-st-${u.status==='complete'?'ok':u.status==='running'?'run':'cap'}">${u.status}</em></p>`:''}</div></article>`;}).join('')??'<div class="tree-empty">Press “Start investigation”. The investigator writes its questions from the objective and a public field dictionary only.</div>'}
    </div>
    <aside class="tw-aside">
     <div class="tw-panel"><h3>How a range is searched</h3><div class="tree-steps"><span>WHOLE GROUP</span> → <span>Y / X: HALVE</span> → <span>SINGLE ROW</span></div><p>N closes a branch. X keeps it open; a single-row X stays unconfirmed. Questions take turns, Y branches before X. Round one may spend 60% of the cap.</p><details><summary>Full public procedure</summary><p>${GROUP_PROCEDURE}</p></details></div>
     <div class="tw-panel" id="tree-rejections"><h3>Refused requests <span>${run?.rejections.length??0}</span></h3><p>${bits.toFixed(2)} / ${limit} bits used · ${remaining.toFixed(2)} bits left. A refusal depends only on public rules, so it releases no symbol.</p>${run?.rejections.map(r=>`<p class="tw-rej"><b>${escape(r.id)}</b> ${escape(r.reason)}</p>`).join('')??''}</div>
     <div class="tw-panel tw-math"><h3>The arithmetic</h3><p>One answer = log₂3 = ${(bitsPerAnswer('ternary')).toFixed(3)} bits.<br>${maxAnswers} answers fit under ${limit} bits = ${(limit/8).toFixed(0)} bytes.<br>Extracted field values released: 0.</p></div>
    </aside>
   </section>
   <footer class="tree-foot">Source text released: 0 bytes <span>Extracted field values released: 0</span><a href="/?legacy=1">Earlier comparison workspace ↗</a></footer>
   <dialog id="tree-receipt-dialog"><div class="tree-receipt-sheet"><button id="tree-close" style="float:right">Close ×</button><p class="eyebrow">WITNESS / DISCLOSURE RECEIPT · ${recorded?'RECORDED EXECUTION':'LOCAL RECORD'}</p><h2>Every answer. Every exception.</h2>${run?`<div class="tree-receipt-stats"><div><strong>${run.ledger.answers.length}</strong><span>witness answers</span></div><div><strong>${bits.toFixed(2)} / ${run.ledger.limit}</strong><span>answer-channel bits</span></div><div><strong>${run.shared?.length??0}</strong><span>merged predicates · 0 new answers</span></div><div><strong>0</strong><span>source text bytes</span></div></div><p>${escape(run.task.objective)}</p><p>Status: <b>${run.status}</b> · ${remaining.toFixed(2)} bits remaining · ${run.cloudCalls} investigator calls</p><table><thead><tr><th>Predicate</th><th>Answers</th><th>Bits</th><th>Identified Y / X</th><th>Coverage</th></tr></thead><tbody>${run.usage.map(u=>`<tr><td>${escape(u.id)}</td><td>${u.answers}</td><td>${u.bits.toFixed(2)}</td><td>${u.y} / ${u.x}</td><td>${u.status}</td></tr>`).join('')}</tbody></table><p>Round one ≤ 60% of cap · remaining capacity reserved for the follow-up. Breadth first, rotating across predicates. Equivalent tests share one scan.</p><h3>Shared predicates</h3><p>${run.shared?.map(s=>`${escape(s.id)} → ${escape(s.targetId)} (${s.inverted?'inverted singleton answers':'same meaning'})`).join('<br>')||'None.'}</p><h3>Released symbols</h3><p class="tree-symbols">${run.ledger.answers.join(' ')}</p><h3>Public validation refusals</h3><p>${run.rejections.map(r=>`${escape(r.id)}: ${escape(r.reason)} (0 bits)`).join('<br>')||'None.'}</p><p class="muted">${escape(treeReceipt(run,log,{calls,fields}).limitations)}</p>`:''}<button class="primary" id="tree-download">Download receipt ↓</button></div></dialog></main>`;
  document.querySelector('#tree-task')?.addEventListener('change',e=>{task=(e.target as HTMLSelectElement).value as TaskId;run=undefined;recorded=false;render();});
  document.querySelector('#tree-cap')?.addEventListener('change',e=>{cap=Number((e.target as HTMLSelectElement).value);run=undefined;recorded=false;render();});
  document.querySelector('#tree-receipt')?.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#tree-receipt-dialog')!.showModal());
  document.querySelector('#tree-close')?.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#tree-receipt-dialog')!.close());
  document.querySelector('#tree-download')?.addEventListener('click',()=>{if(!run)return;const url=URL.createObjectURL(new Blob([JSON.stringify(treeReceipt(run,log,{calls,fields}),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='witness-receipt.json';a.click();URL.revokeObjectURL(url);});
  document.querySelector('#tree-start')?.addEventListener('click',async()=>{if(busy)return;busy=true;recorded=false;run=undefined;render();try{await loadHypothesisModels();const i=await treeInvestigator(),w=new OpenWitness(undefined,false);run=await runTreeInvestigation(DATASETS[task],i,w,{limit:cap,onUpdate:r=>{run=r;log=i.log;calls=w.calls;fields=w.extractedFieldCount;render();}});}finally{busy=false;render();}});
 };
 (window as unknown as Record<string,unknown>).__witnessReplay8=(v:{run:TreeRun;cloudLog:Log[];nanoCalls:number;extractedFieldCount:number;task:TaskId})=>{run=v.run;task=v.task;cap=run.ledger.limit;log=v.cloudLog;calls=v.nanoCalls;fields=v.extractedFieldCount;recorded=true;busy=false;render();};
 (window as unknown as Record<string,unknown>).__witnessReceipt8=()=>run?treeReceipt(run,log,{calls,fields}):null;
 render();
}
