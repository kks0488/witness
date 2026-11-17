import type { Dataset } from '../fixtures';
import type { ModelPair } from '../models/types';
import { bitsPerAnswer } from '../protocol';
import { cloudTranscript, privateChannel, type Session } from '../session';
import { escape, money } from './helpers';

export function workspace(data: Dataset, session: Session, models: ModelPair): string {
  const labels = {Y: 'YES', N: 'NO', X: 'ABSTAIN'};
  return `
  <section class="workspace">
    <article class="panel local-panel">
      <div class="panel-heading">
        <div><span class="step-number">01</span><h2>My screen</h2></div>
        <span class="tag local-tag">ON-DEVICE</span>
      </div>
      <p class="panel-subtitle">${escape(data.subtitle)}</p>
      <div class="record-table">
        <table><thead><tr><th>Row / record</th><th>Private narrative & evidence</th></tr></thead>
        <tbody>${data.rows.map(row => `
          <tr class="${session.slots.includes(row.slot) ? 'flagged' : ''}">
            <td><b>${String(row.slot).padStart(2, '0')}</b>
              <small>${escape(row.order ?? row.reference)}</small>
              <small>${escape(row.customer ?? '')}</small>
              <small>${escape(row.phone ?? '')}</small>
              <small>${data.id === 'refund' ? `${money(row.refund)} / ${money(row.paid)} paid` : money(row.amount)}</small>
            </td>
            <td class="narrative">${data.id === 'refund' ? `
              <p><b>Customer:</b> ${escape(row.reason)}</p>
              <p><b>Delivery:</b> ${escape(row.deliveryNote)}</p>
              <p><b>Photo:</b> ${escape(row.photoDescription)}</p>`
            : data.id === 'receipt' ? `
              <p><b>Memo:</b> ${escape(row.memo)}</p>
              <p><b>Evidence:</b> ${escape(data.evidence.find(receipt => receipt.reference === row.reference)?.description ?? 'No receipt on file.')}</p>`
            : `
              <p><b>Customer:</b> ${escape(row.customerText)}</p>
              <p><b>Order note:</b> ${escape(row.orderNote)}</p>`}
            </td>
          </tr>`).join('')}</tbody></table>
      </div>
      <div class="panel-footer">${escape(models.witness.name)} · narrative stays here</div>
    </article>
    <article class="panel dialogue-panel">
      <div class="panel-heading">
        <div><span class="step-number">02</span><h2>The interview</h2></div>
        <span class="tag">ONE BYTE / ANSWER</span>
      </div>
      <p class="panel-subtitle">${session.attack === 'subtle'
        ? models.mode.includes('Nano') ? 'Actual Nano refusal test: priority handling is outside the task.' : 'Simulated guard failure: a euphemism leaks Y/N. The cap still holds.'
        : session.attack
          ? 'Obvious identity probes stop before the witness. X still costs bits.'
          : 'Public expressions. Group tests split YES ranges and skip NO ranges.'}</p>
      <div class="exchanges" role="log" aria-label="Question and answer history">
        ${session.transcript.length ? session.transcript.map((exchange, index) => `
          <div class="exchange"><span class="round">${String(index + 1).padStart(2, '0')}</span>
            <div><p><b>Rows ${exchange.query.start}–${exchange.query.end}:</b> ${escape(exchange.query.text)}</p>${exchange.query.expression?`<code class="expression">${escape(exchange.query.expression)}</code>`:''}
              <span class="answer ${exchange.token === 'X' ? 'refused' : ''}">A: ${labels[exchange.token]}
                <small>wire: ${exchange.token} · +${bitsPerAnswer('ternary').toFixed(3)} bits</small>
              </span>
            </div>
          </div>`).join('') : `
          <div class="empty"><div class="empty-symbol">?</div>
            <h3>Read the story.<br>Release one symbol.</h3>
            <p>Could a claim contradict a signed pickup?<br>The cloud can ask. It cannot read.</p>
          </div>`}
      </div>
      <div class="panel-footer">Grammar guard + witness refusal · neither is a privacy proof</div>
    </article>
    <article class="panel cloud-panel">
      <div class="panel-heading">
        <div><span class="step-number">03</span><h2>What the cloud knows</h2></div>
        <span class="tag cloud-tag">CLOUD</span>
      </div>
      <p class="panel-subtitle">Public task and Y/N/X only. Demo simulates this disclosure locally.</p>
      <pre id="cloud-log">${escape(cloudTranscript(session))}</pre>
      <details class="wire-details"><summary>Exact public prompt payloads (${session.outbound.length})</summary>
        <pre>${escape(session.outbound.join('\n\n')) || 'No investigator call yet.'}</pre>
      </details>
      <div class="panel-footer">Private channel: ${privateChannel(session).length} bytes · source text: 0</div>
    </article>
  </section>`;
}
