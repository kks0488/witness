import { DeterministicInvestigator, DeterministicWitness } from './demo';
import type { ModelPair } from './types';
import { OpenWitness } from '../open-witness';
import { ExtractionWitness, type ExtractMethod } from '../extraction';

export const demoPair = (): ModelPair => ({
  witness: new DeterministicWitness(),
  investigator: new DeterministicInvestigator(),
  mode: 'demo mode',
  live: false
});
/** Explicit opt-in keeps the scripted witness and former local comparison path intact. */
export function withWitnessMode(pair: ModelPair, mode: unknown, method: ExtractMethod = 'c'): ModelPair {
  if (mode === 'open-expression') return {...pair,hypothesisWitness:new OpenWitness()};
  if (mode !== 'extract-code') return pair;
  return {...pair, hypothesisWitness: new ExtractionWitness(method)};
}
let actualPair: Promise<ModelPair> | undefined;
export async function loadModels(): Promise<ModelPair> {
  const env = import.meta.env;
  const configured = ['firebase', 'cloud'].includes(env.VITE_MODEL_MODE)
    && env.VITE_FIREBASE_API_KEY
    && env.VITE_FIREBASE_PROJECT_ID
    && env.VITE_FIREBASE_APP_ID
    && env.VITE_APP_CHECK_SITE_KEY
    && env.VITE_SPARK_FREE_TIER_CONFIRMED === 'true';
  if (!configured) return demoPair();
  if (actualPair) return actualPair;
  actualPair = import('./firebase').then(({firebasePair}) => firebasePair({
    apiKey: env.VITE_FIREBASE_API_KEY,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    siteKey: env.VITE_APP_CHECK_SITE_KEY,
    debugToken: env.VITE_APP_CHECK_DEBUG_TOKEN,
    model: 'gemini-3.5-flash-lite',
    mode: env.VITE_MODEL_MODE as 'firebase' | 'cloud'
  })).then(async pair => {const {expressionInvestigator}=await import('./firebase');return {...withWitnessMode(pair,'open-expression'),hypothesisInvestigator:await expressionInvestigator()};});
  return actualPair;
}

/** Local experiment entry point. Credentials remain inside the existing Vite/Firebase setup. */
export async function loadHypothesisModels() {
  const pair=await loadModels();
  if(!pair.live||!pair.hypothesisInvestigator||!pair.hypothesisWitness)throw new Error('Actual Firebase experiment models required');
  return {baselineWitness:pair.witness,witness:pair.hypothesisWitness,investigator:pair.hypothesisInvestigator,pair};
}
