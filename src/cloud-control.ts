/** One queue for all investigator instances in this page. HTTP guard in live5.py also
 * enforces the interval across processes, captures full 429 bodies and retries once. */
let tail:Promise<unknown>=Promise.resolve();let lastStart=0;
export async function pacedCloud<T>(operation:()=>Promise<T>):Promise<T>{
 const result=tail.catch(()=>undefined).then(async()=>{const delay=Math.max(0,13000-(Date.now()-lastStart));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastStart=Date.now();return operation();});
 tail=result;return result;
}
export const PUBLIC_REVIEW_HANDBOOK = [
 'Compare a claim with independent supporting evidence before acting.',
 'Check that amounts, authorizations and completion states agree.',
 'Look for missing, repeated or inconsistent supporting documents.',
 'Distinguish a business purpose from an explicitly private purpose.',
 'Check that counterparties in related records are consistent.',
 'A promise must be supported by authorization and an unfinished obligation.'
].join('\n');

/** Selected from cloud-only original-schema comparison; never from holdout. */
export const DEFAULT_HYPOTHESIS_MODEL='gemini-3.5-flash-lite';
export const DEFAULT_PUBLIC_HANDBOOK=true;
