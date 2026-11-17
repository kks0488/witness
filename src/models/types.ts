import type { Dataset, PublicTask } from '../fixtures';
import type { Query, Token } from '../protocol';
import type { HypothesisInvestigator } from '../hypothesis';

export interface Exchange {
  query: Query;
  token: Token;
}
export interface WitnessModel {
  readonly name: string;
  /** Local diagnostic count only. Extracted values never enter this interface. */
  readonly extractedFieldCount?: number;
  recordRejection?(data:Dataset,query:Query):void;
  answer(data: Dataset, query: Query, signal?: AbortSignal): Promise<string>;
}
export interface InvestigatorDecision {
  query?: Query;
  slots?: number[];
  template?: string;
}
/** Cloud can receive public metadata and fixed replies; it cannot accept a Dataset. */
export interface InvestigatorModel {
  readonly name: string;
  next(task: PublicTask, transcript: readonly Exchange[]): Promise<InvestigatorDecision>;
}
export interface ModelPair {
  witness: WitnessModel;
  investigator: InvestigatorModel;
  mode: string;
  live: boolean;
  hypothesisInvestigator?: HypothesisInvestigator;
  hypothesisWitness?: WitnessModel;
}
