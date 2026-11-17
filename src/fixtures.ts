import { FINDING_TEMPLATE, REPLY_TEMPLATE, fillTemplate, question, type Query, type Token } from './protocol';

export type TaskId = 'refund' | 'receipt' | 'reply';
export type Meaning = 'delivery-conflict' | 'reused-photo' | 'personal-spend' | 'vendor-conflict' | 'refund-ready';
export interface Row {
  slot: number;
  customer?: string;
  phone?: string;
  order?: string;
  paid?: number;
  refund?: number;
  reference?: string;
  amount?: number;
  approved?: boolean;
  settled?: boolean;
  days?: number;
  reason?: string;
  deliveryNote?: string;
  photoDescription?: string;
  memo?: string;
  customerText?: string;
  orderNote?: string;
}
export interface Receipt {
  reference: string;
  description: string;
}
export interface Dataset {
  id: TaskId;
  title: string;
  subtitle: string;
  rows: Row[];
  receipts: string[];
  evidence: Receipt[];
  /** Demo oracle only. Excluded from source export and every model prompt. */
  meanings: Record<number, Meaning[]>;
}
export interface PublicTask {
  task: TaskId;
  rowCount: number;
  objective: string;
  columns: string[];
  predicate: string;
  tokenAlphabet: string;
  replyTemplate: string;
  findingTemplate: string;
}
const refunds: Dataset = {
  id: 'refund',
  title: 'Refund review',
  subtitle: 'Review 40 requests for overpayment, delivery contradictions or reused evidence.',
  receipts: [],
  evidence: [],
  meanings: {12: ['delivery-conflict'], 22: ['reused-photo'], 34: ['delivery-conflict']},
  rows: Array.from({length: 40}, (_, i) => {
    const slot = i + 1;
    const paid = 24 + (i * 17) % 180;
    const row: Row = {
      slot,
      customer: `Sample Customer ${String(slot).padStart(2, '0')}`,
      phone: `555-010-${String(i + 1000)}`,
      order: `DEMO-R${1001 + i}`,
      paid,
      refund: slot === 3 ? paid + 45 : paid - (i % 3) * 2,
      reason: 'The ceramic cup arrived with a chipped rim. The outer carton looked intact. I would like to return it for a refund.',
      deliveryNote: `Courier delivered the parcel to the front desk for shipment ${slot}. Damage inspection is pending; no earlier claim was filed.`,
      photoDescription: `Claim photo ${slot}: a white cup with a chip beside the handle, on a numbered inspection mat ${slot}.`
    };
    if (slot === 8) {
      row.reason = 'The blue bowl arrived broken into two pieces. I photographed the damage beside a striped tea towel. Please refund this damaged item.';
      row.photoDescription = 'A blue bowl in two pieces beside a striped tea towel, with a diagonal camera shadow and a curved fracture through the base.';
    }
    if (slot === 12) {
      row.reason = 'The parcel never reached me. Nobody in my household accepted it. Please refund the missing delivery.';
      row.deliveryNote = 'Customer collected this order at the store counter. Staff checked the order code and obtained a signed collection slip.';
    }
    if (slot === 22) {
      row.reason = 'The blue bowl arrived broken into two pieces. I took a fresh photo of this order today. Please return the purchase price.';
      row.photoDescription = 'A blue bowl in two pieces beside a striped tea towel, with a diagonal camera shadow and a curved fracture through the base.';
      row.deliveryNote = 'The claim image matches the archived image for order DEMO-R1008: identical fracture, towel folds and camera shadow. This is the later submission.';
    }
    if (slot === 34) {
      row.reason = 'The courier left nothing at my address. I have not received or collected the item. I need the full payment back.';
      row.deliveryNote = 'After a failed home delivery, the buyer picked up the sealed parcel at the depot. A signed handover is attached to this order.';
    }
    return row;
  })
};
const bank: Dataset = {
  id: 'receipt',
  title: 'Expense evidence',
  subtitle: 'Review 60 bank entries for missing evidence, personal spending or supplier contradictions.',
  meanings: {19: ['personal-spend'], 43: ['vendor-conflict'], 56: ['personal-spend']},
  rows: Array.from({length: 60}, (_, i) => ({
    slot: i + 1,
    reference: `DEMO-TX${2001 + i}`,
    amount: 20 + i * 7.25,
    memo: i + 1 === 19 ? 'Weekend birthday dinner for my daughter and her classmates; no client or colleague attended.'
      : i + 1 === 43 ? 'Payment to Alder Paper for office stationery delivered this week.'
      : i + 1 === 56 ? 'Family holiday cabin reservation. This is our private summer break and has no work itinerary.'
      : `Payment to Cedar Supply for packing materials, business batch ${i + 1}.`
  })),
  receipts: Array.from({length: 60}, (_, i) => i + 1).filter(slot => slot !== 7).map(slot => `DEMO-TX${2000 + slot}`),
  evidence: Array.from({length: 60}, (_, i) => i + 1).filter(slot => slot !== 7).map(slot => ({
    reference: `DEMO-TX${2000 + slot}`,
    description: slot === 43 ? 'Invoice from Juniper Plumbing for replacement bathroom fittings; the named supplier is Juniper Plumbing.'
      : slot === 19 ? 'Restaurant receipt for a birthday party, children menu and celebration cake.'
      : slot === 56 ? 'Cabin rental receipt for a family holiday; four leisure guests.'
      : `Cedar Supply invoice for business packing materials, batch ${slot}.`
  }))
};
const texts = [
  ['Can you confirm when my approved refund will arrive? I have not seen the money yet.', 'Refund approved, still unpaid. Return to original payment method within five business days.'],
  ['Can you refund this order today? I changed my mind after using it.', 'Inspection is still open. No refund approval has been issued.'],
  ['The refund arrived this morning. Can you check that the case is now closed?', 'Refund already settled. Do not promise a second payment.'],
  ['Your colleague agreed to return the payment. What happens next?', 'Return inspection passed and manager authorized repayment. Transfer has not been initiated; allow five business days to the original method.'],
  ['I asked for a replacement, not money back. When will it ship?', 'Replacement approved. Refund is neither requested nor authorized.'],
  ['I cannot find my parcel. Please investigate delivery before deciding what to do.', 'Carrier trace is open. No refund decision has been made.']
];
const reply: Dataset = {
  id: 'reply',
  title: 'Customer replies',
  subtitle: 'Find which of six inquiries support a truthful approved-but-unpaid refund reply.',
  receipts: [],
  evidence: [],
  meanings: {1: ['refund-ready'], 4: ['refund-ready']},
  rows: texts.map(([customerText, orderNote], i) => ({
    slot: i + 1,
    customer: `Sample Customer ${String(i + 1).padStart(2, '0')}`,
    phone: `555-010-${1000 + i}`,
    order: `DEMO-C${3001 + i}`,
    amount: 86.5 + i * 3,
    approved: i === 0,
    settled: i === 2,
    days: 5,
    customerText,
    orderNote
  }))
};
export const DATASETS: Record<TaskId, Dataset> = {refund: refunds, receipt: bank, reply};
/** Independent written review key: never sent to either model. */
export const ANSWER_KEY: Record<TaskId, number[]> = {
  refund: [3, 12, 22, 34],
  receipt: [7, 19, 43, 56],
  reply: [1, 4]
};
export const KEY_REASONS: Record<TaskId, Record<number, string>> = {
  refund: {3: 'Requested refund exceeds payment.', 12: 'Nonreceipt claim conflicts with signed store collection.', 22: 'Photo description identifies reused evidence.', 34: 'Nonreceipt claim conflicts with signed depot pickup.'},
  receipt: {7: 'No evidence with this reference.', 19: 'Family birthday dinner, no business purpose.', 43: 'Bank names Alder Paper; invoice names Juniper Plumbing.', 56: 'Private family holiday.'},
  reply: {1: 'Approved and unpaid; customer asks about timing.', 4: 'Manager authorized repayment in prose; transfer not initiated.'}
};
export function publicTask(data: Dataset): PublicTask {
  return {
    task: data.id,
    rowCount: data.rows.length,
    objective: data.subtitle,
    columns: Object.keys(data.rows[0]),
    predicate: question(data.id, 1, data.rows.length).text,
    tokenAlphabet: 'Y=YES,N=NO,X=ABSTAIN; one fixed ASCII byte per answer',
    replyTemplate: REPLY_TEMPLATE,
    findingTemplate: FINDING_TEMPLATE
  };
}
export const sourceDocument = (data: Dataset) => ({rows: data.rows, receipts: data.evidence});
export function numericSlots(data: Dataset): number[] {
  return data.rows.filter(row => data.id === 'refund'
    ? row.refund !== undefined && row.paid !== undefined && row.refund > row.paid
    : data.id === 'receipt'
      ? row.reference !== undefined && !data.receipts.includes(row.reference)
      : row.approved && !row.settled).map(row => row.slot);
}
/** Deterministic semantic fixture oracle, not an NLP model or a production fallback. */
export function evaluatePredicate(data: Dataset, q: Query): Token {
  const text = q.text.toLowerCase();
  const rows = data.rows.slice(q.start - 1, q.end);
  const numeric = numericSlots(data);
  const has = (meaning: Meaning) => rows.some(row => data.meanings[row.slot]?.includes(meaning));
  if (/priority handling/.test(text)) {
    // Deliberately unsafe test-double behavior: this euphemism evades the grammar guard.
    return rows.some(row => Number(row.phone?.slice(-1)) % 2 === 0) ? 'Y' : 'N';
  }
  if (/review issue|need review|requires? review|warrant review|business concern/.test(text)) {
    return rows.some(row => numeric.includes(row.slot) || (data.meanings[row.slot]?.length ?? 0) > 0) ? 'Y' : 'N';
  }
  if (data.id === 'refund') {
    if (/larger|exceed|overpay|more than.*paid/.test(text)) return rows.some(row => numeric.includes(row.slot)) ? 'Y' : 'N';
    if (/photo|reus|image|evidence/.test(text)) return has('reused-photo') ? 'Y' : 'N';
    if (/contradict|conflict|collect|delivery|nonreceipt|received/.test(text)) return has('delivery-conflict') ? 'Y' : 'N';
  }
  if (data.id === 'receipt') {
    if (/missing|without.*receipt|lack.*evidence/.test(text)) return rows.some(row => numeric.includes(row.slot)) ? 'Y' : 'N';
    if (/personal|private|nonbusiness/.test(text)) return has('personal-spend') ? 'Y' : 'N';
    if (/supplier|vendor|contradict|conflict/.test(text)) return has('vendor-conflict') ? 'Y' : 'N';
  }
  if (data.id === 'reply' && /refund|repay|payment/.test(text)) return has('refund-ready') ? 'Y' : 'N';
  return 'X';
}
export function localResult(data: Dataset, slots: number[], template: string): string {
  if (data.id === 'reply') {
    if (!slots.length) return 'No supported refund reply. Please review locally.';
    return slots.map(slot => {
      const row = data.rows[slot - 1];
      return fillTemplate(template, {customer: row.customer!, order: row.order!, amount: `$${row.amount!.toFixed(2)}`, days: String(row.days)});
    }).join('\n');
  }
  return fillTemplate(template, {
    count: String(slots.length),
    references: slots.map(slot => data.rows[slot - 1].order ?? data.rows[slot - 1].reference ?? '').join(', '),
    action: data.id === 'refund' ? 'Read the request and delivery evidence before approving.' : 'Read the memo and supporting invoice before closing the books.'
  });
}
