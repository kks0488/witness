import { WITNESS_SCHEMA,OPEN_GRAMMAR } from '../witness-schema';
import { disclosureReceipt, type Session } from '../session';
import { utf8 } from '../protocol';
import { escape } from './helpers';

export function receiptSheet(state: Session): string {
  const receipt = disclosureReceipt(state);
  return `
    <dialog id="receipt-dialog" aria-labelledby="receipt-title">
      <div class="receipt-sheet">
        <div class="receipt-heading"><div>
          <div class="eyebrow">WITNESS / DISCLOSURE RECEIPT</div>
          <h2 id="receipt-title">Everything the investigator received.</h2>
        </div><button id="close-receipt" aria-label="Close receipt">Close ×</button></div>
        <p class="receipt-context">${escape(receipt.scope)}</p>
        <div class="receipt-stats">
          <div><strong>${receipt.publicTask.bytes}</strong><span>initial public task bytes</span></div>
          <div><strong>${receipt.answerBytes}</strong><span>single-symbol answers</span></div>
          <div><strong>${receipt.totalBits.toFixed(3)} / ${receipt.capBits}</strong><span>answer-channel bits</span></div>
          <div><strong>0</strong><span>source text bytes</span></div>
        </div>
        <dl class="receipt-facts">
          <dt>Started / ended</dt><dd>${escape(receipt.startedAt)} / ${escape(receipt.endedAt)}</dd>
          <dt>Status / grammar blocks</dt><dd>${receipt.status} / ${receipt.grammarBlockedQuestions} (${receipt.blockedQuestions} total X answers)</dd>
          <dt>Fields extracted on device (local only)</dt><dd>${receipt.localExtractedFieldCount}</dd>
          <dt>Extracted values released</dt><dd>${receipt.extractedValuesReleased}</dd>
          <dt>Public instructions</dt><dd>${utf8(receipt.publicInstructions)} B; included verbatim below</dd>
          <dt>Application prompt uplink</dt><dd>${receipt.applicationUplinkBytes.toLocaleString()} B, including repeated context; ${receipt.investigatorPrompts.length} simulated/real calls</dd>
          <dt>Every released symbol</dt><dd class="receipt-tokens">${receipt.answers.map(answer => answer.symbol).join(' ')}</dd>
        </dl>
        <details><summary>Every question and its one-symbol answer</summary>
          <pre>${escape(receipt.answers.map((answer, index) => `${index + 1}. Rows ${answer.question.start}-${answer.question.end}: ${answer.question.text}\n${answer.symbol}`).join('\n'))}</pre>
        </details>
        <details><summary>Public witness schema and grammar</summary><pre>${escape(JSON.stringify(WITNESS_SCHEMA,null,2))}\n\n${escape(OPEN_GRAMMAR)}</pre></details>
        <details><summary>Initial public task · exact bytes</summary><pre>${escape(receipt.publicTask.text)}</pre></details>
        <details><summary>Public instructions and all repeated investigator payloads</summary>
          <pre>${escape(receipt.publicInstructions)}\n\n${escape(receipt.investigatorPrompts.join('\n\n'))}</pre>
        </details>
        <p class="receipt-limit">${escape(receipt.limitations)}</p>
        <div class="receipt-bottom"><b>Guards reduce. The cap guarantees.</b><button id="download-receipt" class="primary">Download JSON ↓</button></div>
      </div>
    </dialog>`;
}
