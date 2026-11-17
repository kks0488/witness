import { evaluatePredicate, type Dataset, type PublicTask } from '../fixtures';
import { question, coversObjective, REPLY_TEMPLATE, FINDING_TEMPLATE } from '../protocol';
import type { Exchange, InvestigatorDecision, InvestigatorModel, WitnessModel } from './types';

export class DeterministicWitness implements WitnessModel {
  readonly name = 'Fixture semantic oracle (demo)';
  async answer(data: Dataset, query: Parameters<WitnessModel['answer']>[1]): Promise<string> {
    return evaluatePredicate(data, query);
  }
}
/** Scripted group testing, reconstructed from public history, never from answer keys. */
export function nextSearch(task: PublicTask, transcript: readonly Exchange[]): InvestigatorDecision {
  const slots: number[] = [];
  function visit(start: number, end: number): InvestigatorDecision | undefined {
    const answer = [...transcript].reverse().find(e => e.query.start === start && e.query.end === end && coversObjective(e.query));
    if (!answer || answer.token === 'X') return {query: question(task.task, start, end)};
    if (answer.token === 'N') return;
    if (start === end) {
      slots.push(start);
      return;
    }
    const mid = Math.floor((start + end) / 2);
    return visit(start, mid) ?? visit(mid + 1, end);
  }
  const next = visit(1, task.rowCount);
  return next ?? {slots, template: task.task === 'reply' ? REPLY_TEMPLATE : FINDING_TEMPLATE};
}
export class DeterministicInvestigator implements InvestigatorModel {
  readonly name = 'Script investigator (demo)';
  async next(task: PublicTask, transcript: readonly Exchange[]): Promise<InvestigatorDecision> {
    return nextSearch(task, transcript);
  }
}
