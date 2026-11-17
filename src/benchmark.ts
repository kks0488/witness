import { DATASETS, ANSWER_KEY, numericSlots, evaluatePredicate, publicTask, sourceDocument, type Dataset, type TaskId } from './fixtures';
import { demoPair } from './models';
import { question, utf8, usedBits } from './protocol';
import { createSession, step } from './session';

export interface Comparison {
  task: TaskId;
  method: string;
  accuracy: number;
  recall: number;
  score: string;
  metadataBytes: number;
  sourceBytes: number;
  answerBits: number | null;
  answerBytes: number;
  applicationUplinkBytes: number;
  calls: number;
  status: string;
  bitsPerFinding: number | null;
  realModel: 'pending real-model run' | 'not applicable';
}
/** Identity-only pseudonymization retains narrative and amounts, including privacy risk. */
export function redact(data: Dataset): Dataset {
  const aliases = new Map<string, string>();
  for (const row of data.rows) {
    for (const key of ['customer', 'phone', 'order', 'reference'] as const) {
      if (row[key]) aliases.set(row[key], `[${key}-${row.slot}]`);
    }
  }
  let document = JSON.stringify(sourceDocument(data));
  for (const [value, alias] of aliases) document = document.replaceAll(value, alias);
  const parsed = JSON.parse(document) as ReturnType<typeof sourceDocument>;
  return {...data, rows: parsed.rows, evidence: parsed.receipts, receipts: parsed.receipts.map(receipt => receipt.reference)};
}
export function score(id: TaskId, slots: number[]): Pick<Comparison, 'accuracy' | 'recall' | 'score'> {
  const truth = ANSWER_KEY[id];
  const unique = [...new Set(slots)];
  const tp = unique.filter(slot => truth.includes(slot)).length;
  const f1 = 2 * tp / (unique.length + truth.length);
  return {
    accuracy: f1,
    recall: tp / truth.length,
    score: `${tp}/${truth.length} findings; recall ${(tp / truth.length * 100).toFixed(0)}%`
  };
}
export async function benchmark(limit = 64): Promise<Comparison[]> {
  const rows: Comparison[] = [];
  for (const data of Object.values(DATASETS)) {
    const metadataBytes = utf8(JSON.stringify(publicTask(data)));
    // Full and redacted rows are fixture-oracle ceilings, never measured model accuracy.
    for (const masked of [false, true]) {
      const input = masked ? redact(data) : data;
      const bytes = utf8(JSON.stringify(sourceDocument(input)));
      rows.push({
        task: data.id,
        method: masked ? 'Redacted upload' : 'Full upload',
        ...score(data.id, input.rows.filter(row => evaluatePredicate(input, question(data.id, row.slot)) === 'Y').map(row => row.slot)),
        metadataBytes,
        sourceBytes: bytes,
        answerBits: null,
        answerBytes: 0,
        applicationUplinkBytes: metadataBytes + bytes,
        calls: 1,
        status: 'fixture oracle ceiling',
        bitsPerFinding: null,
        realModel: 'pending real-model run'
      });
    }
    rows.push({
      task: data.id,
      method: 'Numeric rules only',
      ...score(data.id, numericSlots(data)),
      metadataBytes: 0,
      sourceBytes: 0,
      answerBits: 0,
      answerBytes: 0,
      applicationUplinkBytes: 0,
      calls: 0,
      status: 'local, no model',
      bitsPerFinding: 0,
      realModel: 'not applicable'
    });
    let session = createSession(data, false, limit);
    while (['ready', 'running'].includes(session.status)) session = await step(session, data, demoPair(), 0);
    rows.push({
      task: data.id,
      method: 'Witness',
      ...score(data.id, session.slots),
      metadataBytes,
      sourceBytes: 0,
      answerBits: usedBits(session.ledger),
      answerBytes: session.ledger.answers.length,
      applicationUplinkBytes: session.outbound.reduce((sum, payload) => sum + utf8(payload), 0),
      calls: session.outbound.length,
      status: session.status === 'sealed' ? 'unfinished at cap' : 'demo complete',
      bitsPerFinding: session.slots.length ? usedBits(session.ledger) / session.slots.length : null,
      realModel: 'pending real-model run'
    });
  }
  return rows;
}
