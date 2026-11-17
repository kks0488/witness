import {afterEach,describe,it,expect,vi} from 'vitest';
import {checkLocalReadiness,LOCAL_OPTIONS} from '../src/local-readiness';
describe('local preparation gate',()=>{
 afterEach(()=>vi.useRealTimers());
 it('does not create a model or infer its version from API presence',async()=>{
  const create=vi.fn(),availability=vi.fn().mockResolvedValue('available');
  expect(await checkLocalReadiness({availability,create})).toBe('available');
  expect(availability).toHaveBeenCalledWith(LOCAL_OPTIONS);expect(create).not.toHaveBeenCalled();
 });
 for(const value of ['available','downloadable','downloading','unavailable'])it(`reports ${value}`,async()=>{
  expect(await checkLocalReadiness({availability:async()=>value,create:vi.fn()})).toBe(value);
 });
 it('handles absent, unknown and rejected APIs without an unhandled failure',async()=>{
  expect(await checkLocalReadiness(undefined)).toBe('unavailable');
  expect(await checkLocalReadiness({availability:async()=>'surprise',create:vi.fn()})).toBe('unavailable');
  expect(await checkLocalReadiness({availability:async()=>{throw Error('private details');},create:vi.fn()})).toBe('unavailable');
 });
 it('ends a stalled availability check',async()=>{
  vi.useFakeTimers();const ready=checkLocalReadiness({availability:()=>new Promise(()=>{}),create:vi.fn()});
  await vi.advanceTimersByTimeAsync(4000);expect(await ready).toBe('unavailable');
 });
});
