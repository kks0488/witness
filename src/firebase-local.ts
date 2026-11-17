import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource, type AI, type HybridParams } from 'firebase/ai';
import type { LocalTransport } from './local-research';

/** Source-bearing requests have no cloud fallback. Options belong to the device,
 * not inCloudParams. A fresh abort lifetime also releases the native session. */
export class FirebaseLocalTransport implements LocalTransport {
 constructor(private readonly ai:()=>AI=()=>getAI(undefined,{backend:new GoogleAIBackend()})){}
 async call(prompt:string,schema:unknown,system:string|undefined,signal:AbortSignal):Promise<string>{
  signal.throwIfAborted();
  // SDK 13.3.0 omits its device adapter when LanguageModel is absent; its
  // dispatcher would then take the cloud branch even for ONLY_ON_DEVICE.
  if(typeof window==='undefined'||!(window as unknown as {LanguageModel?:unknown}).LanguageModel)throw new Error('Local LanguageModel unavailable');
  const lifetime=new AbortController(),abort=()=>lifetime.abort();
  signal.addEventListener('abort',abort,{once:true});
  const stopped=new Promise<never>((_,reject)=>lifetime.signal.addEventListener('abort',()=>reject(new DOMException('Local deadline','AbortError')),{once:true}));
  try {
   const params:HybridParams={mode:InferenceMode.ONLY_ON_DEVICE,onDeviceParams:{
    createOptions:{signal:lifetime.signal,expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}],...(system?{initialPrompts:[{role:'system',content:[{type:'text',value:system}]}]}:{})},
    promptOptions:{...(schema?{responseConstraint:schema as object}:{})}
   }};
   const model=getGenerativeModel(this.ai(),params);
   const work=async()=>{
    const result=await model.generateContentStream(prompt,{signal:lifetime.signal});let raw='';
    for await(const chunk of result.stream){
     signal.throwIfAborted();
     if(chunk.inferenceSource!==InferenceSource.ON_DEVICE)throw new Error('Local inference required');
     raw+=chunk.text();if(raw.length>1800)throw new Error('Local output limit');
    }
    const response=await result.response;
    if(response.inferenceSource!==InferenceSource.ON_DEVICE)throw new Error('Local inference required');
    return raw;
   };
   return await Promise.race([work(),stopped]);
  } finally {signal.removeEventListener('abort',abort);lifetime.abort();}
 }
}
