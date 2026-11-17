import { describe, expect, it } from 'vitest';
import { DATASETS } from '../src/fixtures';
import { ExtractionWitness } from '../src/extraction';
import { demoPair, withWitnessMode } from '../src/models';
import { ask, createSession, disclosureReceipt, investigatorPayload } from '../src/session';
import { receiptSheet } from '../src/ui/receipt';

describe('opt-in extraction witness application path', () => {
  it('preserves the scripted and prior local witnesses unless explicitly selected', () => {
    const pair=demoPair();
    const oldLocal={name:'prior local witness',async answer(){return 'N';}};
    pair.hypothesisWitness=oldLocal;
    expect(withWitnessMode(pair,undefined)).toBe(pair);
    expect(withWitnessMode(pair,'other').hypothesisWitness).toBe(oldLocal);
    const selected=withWitnessMode(pair,'extract-code');
    expect(selected.witness).toBe(pair.witness);
    expect(selected.investigator).toBe(pair.investigator);
    expect(selected.hypothesisWitness).toBeInstanceOf(ExtractionWitness);
    expect(pair.hypothesisWitness).toBe(oldLocal);
  });
  it('puts only the extracted-field count and symbol in the receipt, never local values or text', async () => {
    const transport={async call(){return JSON.stringify({refund:424242,paid:111});}};
    const witness=new ExtractionWitness('c',transport);
    const pair={...demoPair(),witness};
    const q={kind:'refund' as const,start:1,end:1,text:'Does the requested refund exceed the amount paid?'};
    const state=await ask(createSession(DATASETS.refund),DATASETS.refund,pair,q,20);
    expect(state.transcript[0].token).toBe('Y');
    expect(state.localExtractedFieldCount).toBe(2);
    const receipt=disclosureReceipt({...state,status:'complete'});
    expect(receipt.localExtractedFieldCount).toBe(2);
    expect(receipt.sourceTextBytes).toBe(0);
    const serialized=JSON.stringify(receipt);
    expect(serialized).not.toContain('424242');
    expect(serialized).not.toContain('111');
    expect(serialized).not.toContain(DATASETS.refund.rows[0].reason!);
    expect(investigatorPayload(state.task,state.transcript)).not.toContain('localExtractedFieldCount');
    expect(receiptSheet({...state,status:'complete'})).toContain('Fields extracted on device (local only)</dt><dd>2</dd>');
    const cached=await ask(state,DATASETS.refund,pair,q,20);
    expect(cached.localExtractedFieldCount).toBe(2);
    expect(createSession(DATASETS.refund).localExtractedFieldCount).toBe(0);
  });
});
