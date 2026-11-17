import type { Comparison } from '../benchmark';
import { escape } from './helpers';

export function comparison(rows: Comparison[]): string {
  return `
  <section class="comparison">
    <div class="comparison-head"><h2>Same task. Four ways.</h2>
      <span>Fixture results · F1 / recall · no real-model measurement</span>
    </div>
    <table><thead><tr>
      <th>Method</th><th>Fixture accuracy</th><th>Source / redacted text</th>
      <th>Answer bound / finding</th><th>Total app uplink*</th><th>Real model</th>
    </tr></thead><tbody>${rows.map(row => `
      <tr class="${row.method === 'Witness' ? 'winner' : ''}">
        <td>${escape(row.method)}</td>
        <td><b>${(row.accuracy * 100).toFixed(0)}% F1</b><small>${escape(row.score)}</small></td>
        <td>${row.sourceBytes.toLocaleString()} B</td>
        <td>${row.answerBits === null ? 'Document upload' : `${row.answerBits.toFixed(3)} bits / ${row.bitsPerFinding?.toFixed(2) ?? '—'}`}</td>
        <td>${row.applicationUplinkBytes.toLocaleString()} B</td>
        <td>${escape(row.realModel)}</td>
      </tr>`).join('')}</tbody></table>
    <p class="comparison-note">*Includes repeated public prompts; Witness is not a bandwidth-saving claim.
      Full/redacted accuracy is a fixture-oracle ceiling. Identity-only redaction keeps narratives and amounts, so its disclosure remains large.
      Numeric rules use no model and send nothing. Witness: ${escape(rows.find(row => row.method === 'Witness')?.status ?? 'calculating')}.</p>
  </section>`;
}
