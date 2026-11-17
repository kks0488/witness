import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const sdk=vi.hoisted(()=>({getGenerativeModel:vi.fn(),getAI:vi.fn()}));
vi.mock('firebase/ai',()=>({...sdk,GoogleAIBackend:class{},InferenceMode:{ONLY_ON_DEVICE:'only_on_device'},InferenceSource:{ON_DEVICE:'on_device'}}));
import {FirebaseLocalTransport} from '../src/firebase-local';
import {OpenWitness} from '../src/open-witness';
import {ExtractionWitness} from '../src/extraction';
import {ResearchWitness} from '../src/local-research';
describe('Firebase device transport',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('window',{LanguageModel:{}});});
 afterEach(()=>vi.unstubAllGlobals());
 function response(text='{}',source='on_device'){
  return {stream:(async function*(){yield {text:()=>text,inferenceSource:source};})(),response:Promise.resolve({inferenceSource:source})};
 }
 it('makes every default extraction path use Firebase',()=>{
  for(const w of [new OpenWitness(),new ExtractionWitness(),new ResearchWitness()])expect(w.transport).toBeInstanceOf(FirebaseLocalTransport);
 });
 it('blocks missing device API before the SDK can omit the device adapter',async()=>{
  vi.stubGlobal('window',{});
  await expect(new FirebaseLocalTransport().call('record',null,undefined,new AbortController().signal)).rejects.toThrow('Local LanguageModel unavailable');
  expect(sdk.getGenerativeModel).not.toHaveBeenCalled();
 });
 it('passes schema and system to device options and closes the abort lifetime',async()=>{
  const generateContentStream=vi.fn(async(_prompt:string,_options:unknown)=>response('{"paid":12}'));
  sdk.getGenerativeModel.mockReturnValue({generateContentStream});
  const schema={type:'object',properties:{paid:{type:'number'}}};
  expect(await new FirebaseLocalTransport().call('private record',schema,'system instruction',new AbortController().signal)).toBe('{"paid":12}');
  const params=sdk.getGenerativeModel.mock.calls[0][1];
  expect(params).toMatchObject({mode:'only_on_device',onDeviceParams:{createOptions:{initialPrompts:[{role:'system',content:[{type:'text',value:'system instruction'}]}]},promptOptions:{responseConstraint:schema}}});
  expect(params.inCloudParams).toBeUndefined();expect(params.onDeviceParams.createOptions.signal.aborted).toBe(true);
  expect(generateContentStream.mock.calls[0][0]).toBe('private record');
 });
 it('rejects cloud provenance without retry or fallback',async()=>{
  sdk.getGenerativeModel.mockReturnValue({generateContentStream:async()=>response('{}','in_cloud')});
  await expect(new FirebaseLocalTransport().call('record',null,undefined,new AbortController().signal)).rejects.toThrow('Local inference required');
  expect(sdk.getGenerativeModel).toHaveBeenCalledOnce();
 });
 it('honors abort even when the SDK does not finish session creation',async()=>{
  sdk.getGenerativeModel.mockReturnValue({generateContentStream:()=>new Promise(()=>{})});
  const c=new AbortController();const pending=new FirebaseLocalTransport().call('record',null,undefined,c.signal);c.abort();
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
 });
 it('bounds output and forwards local failure without fallback',async()=>{
  sdk.getGenerativeModel.mockReturnValue({generateContentStream:async()=>response('x'.repeat(1801))});
  await expect(new FirebaseLocalTransport().call('record',null,undefined,new AbortController().signal)).rejects.toThrow('Local output limit');
  sdk.getGenerativeModel.mockReturnValue({generateContentStream:async()=>{throw new Error('native unavailable');}});
  await expect(new FirebaseLocalTransport().call('record',null,undefined,new AbortController().signal)).rejects.toThrow('native unavailable');
 });
});
