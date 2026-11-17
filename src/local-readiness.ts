export const LOCAL_OPTIONS={expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]};
export type LocalReadiness='checking'|'available'|'downloadable'|'downloading'|'unavailable';
export interface LocalModelAPI {
 availability(options:typeof LOCAL_OPTIONS):Promise<string>;
 create(options:typeof LOCAL_OPTIONS&{signal:AbortSignal}):Promise<{destroy():void}>;
}
/** Availability only; no session, prompt, cloud request or version inference.
 * Chrome's web API does not expose the selected model's version. */
export async function checkLocalReadiness(api:LocalModelAPI|undefined,timeout=4000):Promise<LocalReadiness> {
 if(!api||typeof api.availability!=='function')return 'unavailable';
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const value=await Promise.race([api.availability(LOCAL_OPTIONS),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve('unavailable'),timeout);})]);
  return value==='available'||value==='downloadable'||value==='downloading'?value:'unavailable';
 }catch{return 'unavailable';}finally{clearTimeout(timer);}
}
