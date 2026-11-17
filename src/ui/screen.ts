import { WITNESS_SCHEMA,OPEN_GRAMMAR } from '../witness-schema';
import { DATASETS, type TaskId } from '../fixtures';
import type { ModelPair } from '../models/types';
import type { Comparison } from '../benchmark';
import { question, usedBits, utf8 } from '../protocol';
import type { Session } from '../session';
import { escape } from './helpers';
import { workspace } from './workspace';
import { comparison } from './comparison';
import { receiptSheet } from './receipt';
import type { HypothesisRun } from '../hypothesis';
export interface InvestigationView {mode:'hypothesis'|'scripted-witness'; run?:HypothesisRun; recorded?:boolean;}

export function screen(task: TaskId, state: Session, models: ModelPair, running: boolean, comparisons: Comparison[], investigation: InvestigationView = {mode:'scripted-witness'}): string {
  const bits = usedBits(state.ledger);
  const localCalls=(models.hypothesisWitness as unknown as {calls?:number})?.calls ?? 0;
  const releasedSymbols=state.ledger.answers.length;
  const sealed = state.status === 'sealed';
  const ended = ['complete', 'sealed', 'error'].includes(state.status);
  const disabled = running ? 'disabled' : '';
  const maxSymbols = Math.floor(state.ledger.limit / Math.log2(3));
  return `
  <header>
    <a class="brand" href="#"><span class="brand-mark">W</span>Witness<span class="version">SECOND EDITION</span></a>
    <div class="header-right"><span class="mode">● ${escape(models.mode)}${investigation.recorded ? ' · Recorded actual run' : ''}</span><span class="private-label">Fictional data only</span></div>
  </header>
  <main>
    <section class="intro"><div>
      <div class="eyebrow">SMALL BUSINESS. SMALLER DISCLOSURE.</div>
      <h1>Ask without seeing.</h1>
      <p>Read the records here. Investigate in the cloud. Release one symbol at a time.</p>
    </div><div class="how"><span>01 <b>Read on-device</b></span><span>02 <b>Ask freely</b></span><span>03 <b>Account for every answer</b></span></div></section>
    <section class="budget ${sealed ? 'is-sealed' : ''}" aria-label="Disclosure budget">
      <div class="budget-title"><span class="eyebrow">ANSWER CHANNEL · SESSION CAP</span>
        <strong id="meter">${bits.toFixed(3)} <small>/ ${state.ledger.limit} bits</small></strong>
        <span>${state.status === 'error' ? 'STOPPED AFTER ERROR' : sealed ? 'UNFINISHED AT CAP' : state.status === 'complete' ? 'REVIEW COMPLETE' : running ? 'WITNESS IS ANSWERING' : 'READY WHEN YOU ARE'}</span>
      </div>
      <div class="budget-track"><div style="width:${bits / state.ledger.limit * 100}%"></div></div>
      <div class="budget-notes">
        <span>${state.ledger.answers.length} answers × log₂(3) = ${bits.toFixed(3)} bits · ${state.blockedQuestions} grammar blocks</span>
        <span>${state.slots.length} findings · <b>${state.slots.length ? (bits / state.slots.length).toFixed(2) : '—'} bits / finding</b></span>
        <span>Public setup: <b>${utf8(state.ledger.bootstrap)} B</b> · source text: <b>0 B</b></span>
      </div>
      <div class="guard-note"><b>Guards reduce. The cap guarantees.</b> Grammar checks, then witness refusal; even if both fail, each answer costs log₂(3) bits.</div>
    </section>
    <section class="toolbar">
      <div class="task-picker"><label for="task">WORKSPACE</label><select id="task" ${disabled}>
        ${Object.values(DATASETS).map(data => `<option value="${data.id}" ${data.id === task ? 'selected' : ''}>${data.title} · ${data.rows.length} records</option>`).join('')}
      </select></div>
      <div class="cap-picker"><label for="investigation-mode">INVESTIGATOR</label><select id="investigation-mode" ${disabled}>
        <option value="hypothesis" ${!models.hypothesisInvestigator ? 'disabled' : ''} ${investigation.mode === 'hypothesis' ? 'selected' : ''}>Blind hypotheses</option>
        <option value="scripted-witness" ${investigation.mode === 'scripted-witness' ? 'selected' : ''}>Baseline · scripted witness</option>
      </select></div>
      <div class="cap-picker"><label for="cap">CAP</label><select id="cap" ${disabled}>
        ${[32, 64, 128].map(cap => `<option value="${cap}" ${cap === state.ledger.limit ? 'selected' : ''}>${cap} bits</option>`).join('')}
      </select></div>
      <div class="actions">
        <button id="reset" ${disabled}>Reset</button>
        <button id="attack" class="attack" ${disabled}>Obvious probe</button>
        <button id="subtle" class="attack" ${disabled}>Subtle probe</button>
        <button id="run" class="primary" ${running || ended || (investigation.mode === 'hypothesis' && state.transcript.length > 0) ? 'disabled' : ''}>${running ? 'Investigating…' : 'Start investigation →'}</button>
      </div>
    </section>
    ${investigation.mode === 'hypothesis' ? `<section class="hypothesis-panel" aria-label="Cloud investigator hypotheses"><div class="eyebrow">CLOUD HYPOTHESES · NO RECORDS SEEN</div>
      <p>${escape(investigation.run?.task.objective ?? 'The investigator receives only the objective and column names, then decides what to suspect.')}</p>
      ${investigation.run?.hypotheses.length ? `<ol>${investigation.run.hypotheses.map(h => `<li><b>${escape(h.title)}</b><span>${escape(h.question)}</span>${h.expression?`<code>${escape(h.expression)}</code>`:''}</li>`).join('')}</ol>` : '<p>Start the investigation to see its hypotheses.</p>'}
      <small>Each answer tests one hypothesis. Untested hypotheses remain open.</small>${(models.hypothesisInvestigator as unknown as {handbook?:boolean})?.handbook ? '<p class="handbook-label">public review handbook, no customer data</p>' : ''}
      <p class="local-deliberation">On this device: <b>${localCalls} model call${localCalls===1?'':'s'}</b> · ${releasedSymbols} symbol${releasedSymbols===1?'':'s'} released. One symbol per question. Evidence stays here.</p></section>` : ''}
    <details class="schema-panel" id="schema-panel"><summary role="button">View witness schema · all twelve public fields</summary><table><thead><tr><th>Field</th><th>Type</th><th>Domain</th><th>Meaning</th></tr></thead><tbody>${Object.entries(WITNESS_SCHEMA).map(([name,v])=>`<tr><td><code>${name}</code></td><td>${v.type}</td><td>${v.domain}</td><td>${escape(v.meaning)}</td></tr>`).join('')}</tbody></table><pre>${escape(OPEN_GRAMMAR)}</pre></details>
    ${workspace(DATASETS[task], state, models)}
    <details class="custom-question"><summary>Ask with a public expression</summary>
      <form id="question-form"><label>Rows <input name="start" type="number" min="1" max="${DATASETS[task].rows.length}" value="1" required></label>
        <label>to <input name="end" type="number" min="1" max="${DATASETS[task].rows.length}" value="${DATASETS[task].rows.length}" required></label>
        <input name="text" aria-label="English yes/no question" value="${escape(question(task, 1).text)}" required maxlength="240">
        <input name="expression" aria-label="Public expression" placeholder="gt(num(refund),num(paid))" maxlength="600">
        <button type="submit" ${running || ended ? 'disabled' : ''}>Ask witness</button>
      </form>
    </details>
    <section class="result ${sealed ? 'sealed-result' : ''}" aria-live="polite">
      <span class="result-icon">${sealed ? '■' : state.status === 'complete' ? '✓' : '↳'}</span>
      <div><span class="eyebrow">${ended ? 'SESSION CLOSED' : 'THE ANSWER COMES HOME'}</span>
        <p id="result-text">${escape(state.result || 'The investigator finds rows. Names, references, amounts and final replies are filled here, locally.')}</p>
      </div>${ended ? '<button id="show-receipt">Disclosure receipt ↗</button>' : ''}
    </section>
    ${state.attack ? `
      <p class="attack-summary">${state.attack === 'subtle'
        ? models.mode.includes('Nano')
          ? `Actual on-device witness: ${state.ledger.answers.filter(token => token !== 'X').length} Y/N outcomes, ${state.ledger.answers.filter(token => token === 'X').length} X refusals. The scripted probe asks about priority handling; the witness is Gemini Nano.`
          : `Adversarial demo oracle deliberately misreads “priority handling” as a phone parity test. ${state.ledger.answers.filter(token => token !== 'X').length} Y/N outcomes escaped; ${state.ledger.answers.length} symbols released. This is simulated guard failure, not measured Nano behavior.`
        : 'Obvious digit/phone extraction: grammar blocks every probe before the model; each X still spends the cap.'}
        ${state.ledger.limit}-bit cap permits at most ${maxSymbols} ternary symbols (${(maxSymbols * Math.log2(3)).toFixed(3)} bits), or ${maxSymbols} binary outcomes in this attack. At 64 bits: 40 symbols, at most 3^40 transcripts; not an entire source document.</p>` : ''}
    ${comparison(comparisons.filter(row => row.task === task))}
    <footer>Witness / a question is a boundary.<span>Per-session answer-channel bound. Fixed public answer slots. Transport, timing and repeated sessions are outside this guarantee.</span></footer>
    ${ended ? receiptSheet(state) : ''}
  </main>`;
}
