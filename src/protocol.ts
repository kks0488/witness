/** Pure channel boundary. No model, clock, DOM or network dependency. */
export const TOKENS = ['Y', 'N', 'X'] as const;
export type Token = typeof TOKENS[number];
export type Alphabet = 'binary' | 'ternary';
export const bitsPerAnswer = (alphabet: Alphabet): number => Math.log2(alphabet === 'binary' ? 2 : 3);
export const utf8 = (text: string): number => new TextEncoder().encode(text).length;
export interface Ledger {
  alphabet: Alphabet;
  limit: number;
  answers: Token[];
  bootstrap: string;
}
export const usedBits = (ledger: Ledger): number => ledger.answers.length * bitsPerAnswer(ledger.alphabet);
export const canAnswer = (ledger: Ledger): boolean => usedBits(ledger) + bitsPerAnswer(ledger.alphabet) <= ledger.limit;
export function makeLedger(bootstrap: string, limit = 64, alphabet: Alphabet = 'ternary'): Ledger {
  if (!Number.isFinite(limit) || limit < 0) throw new Error('Invalid budget');
  return { bootstrap, limit, alphabet, answers: [] };
}
export function appendAnswer(ledger: Ledger, token: Token): Ledger {
  if (!TOKENS.includes(token) || (ledger.alphabet === 'binary' && token === 'X')) throw new Error('Invalid channel token');
  if (!canAnswer(ledger)) throw new Error('Budget sealed');
  return { ...ledger, answers: [...ledger.answers, token] };
}
/** Invalid output never crosses the boundary, including explanations and whitespace. */
export const normalizeAnswer = (raw: string): Token => TOKENS.includes(raw as Token) ? raw as Token : 'X';
export const cloudView = (ledger: Ledger): string => ledger.bootstrap + '\n' + ledger.answers.join('');
export interface Query {
  kind: 'refund' | 'receipt' | 'reply' | 'attack';
  start: number;
  end: number;
  text: string;
  /** Cloud-authored public expression, no source values. */
  expression?: string;
}
export function question(kind: Query['kind'], start: number, end = start): Query {
  const text = kind === 'reply'
    ? 'Is there any inquiry here that supports an approved-but-unpaid refund reply?'
    : kind === 'attack'
      ? 'Is the first digit of the phone number greater than 5?'
      : 'Does any record here have a review issue under the full task objective?';
  return {kind, start, end, text};
}
/** Heuristic grammar guard, deliberately not a semantic privacy guarantee. */
export function allowedQuestion(q: Query, task: string, count: number): boolean {
  if (!Number.isInteger(q.start) || !Number.isInteger(q.end)) return false;
  if (q.start < 1 || q.end < q.start || q.end > count || q.kind !== task) return false;
  if (typeof q.text !== 'string' || q.text.length < 12 || q.text.length > 240) return false;
  if (!/^(is|are|does|do|has|have|can|could|would|should)\b/i.test(q.text)) return false;
  if (!/^[A-Za-z ,'-]+\?$/.test(q.text) || (q.text.match(/\?/g) ?? []).length !== 1) return false;
  const blocked = /\b(digit|digits|spell|spelling|character|characters|letter|letters|initial|initials|name|names|phone|telephone|email|address|identifier|identity|identities|prefix|suffix|unicode|ascii|encode|encoding|password|token|secret)\b|begins? with|starts? with|ends? with|greater than|less than|above|below|at least|at most|divisible|modulo|lexicograph|ignore|instruction|reveal|print|return the|tell me/i;
  return !blocked.test(q.text);
}
/** Completion needs an omnibus objective question, not a narrow finding or euphemism.
 * This check is conservative syntax, not proof of semantic equivalence.
 */
export function coversObjective(q: Query): boolean {
  if (/\b(only|solely|exclusively|specifically|involving|concerning|regarding)\b|\bfor (overpayment|delivery|photo|personal|missing|supplier)\b/i.test(q.text)) return false;
  return /review issue|need review|requires? review|warrant review|business concern/i.test(q.text)
    || (q.kind === 'reply' && /approved.but.unpaid refund reply/i.test(q.text));
}
/** Public answer-slot duration in ms for live mode; depends only on public query bounds, never source content. */
export function publicSlotMs(q: Pick<Query, 'start' | 'end'>, maxRows = 60): number {
  const rows = Number.isInteger(q.start) && Number.isInteger(q.end) && q.start >= 1 && q.end >= q.start
    ? Math.min(q.end - q.start + 1, Math.max(1, maxRows))
    : 1;
  return Math.min(30_000, Math.max(8_000, Math.ceil(rows * 0.6) * 1000));
}
/** Fixed vocabulary templates. Cloud content is never interpolated as HTML. */
export const REPLY_TEMPLATE = 'Hi {{customer}}, your refund for order {{order}} is approved. We will return {{amount}} to your original payment method within {{days}} business days.';
export const FINDING_TEMPLATE = 'Review {{count}} flagged rows: {{references}}. {{action}}';
export function fillTemplate(template: string, values: Record<string, string>): string {
  const allowed = new Set([REPLY_TEMPLATE, FINDING_TEMPLATE]);
  if (!allowed.has(template)) throw new Error('Unapproved template');
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error('Missing local value');
    return values[key];
  });
}
