import { FirebaseLocalTransport } from './firebase-local';
import type { Dataset } from './fixtures';
import type { Query,Token } from './protocol';
import { allowedQuestion } from './protocol';
import { extractAndJudge, safeQuestion, type Plan } from './extraction';
import { parseExpression } from './open-expression';
import { localRecord, type LocalTransport } from './local-research';
export class OpenWitness {
 readonly name='Chrome · public schema + open expression';calls=0;pending=0;cacheHits=0;extractedFieldCount=0;rejected=0;grammarRejected=0;questionRejected=0;
 readonly log:{query:Query;token:Token;rejected:boolean;fields:number;localCalls:number;invalidExpression?:boolean}[]=[];
 private cache=new Map<string,Token>();
 constructor(readonly transport:LocalTransport=new FirebaseLocalTransport(),readonly grounded=true){}
 recordRejection(data:Dataset,q:Query):void {const invalidExpression=!q.expression||!parseExpression(q.expression,data.id);this.rejected++;if(invalidExpression)this.grammarRejected++;if(!allowedQuestion(q,data.id,data.rows.length)||!safeQuestion(q.text))this.questionRejected++;this.log.push({query:q,token:'X',rejected:true,invalidExpression,fields:0,localCalls:0});}
 async answer(data:Dataset,q:Query,signal?:AbortSignal):Promise<string>{
  const parsed=q.expression?parseExpression(q.expression,data.id):undefined;
  if(!parsed||!allowedQuestion(q,data.id,data.rows.length)||!safeQuestion(q.text)){this.recordRejection(data,q);return 'X';}
  const plan:Plan={rule:q.expression!,fields:parsed.fields,source:'open',calls:[],ms:0};
  const tokens:Token[]=[];const before=this.calls,fieldStart=this.extractedFieldCount;
  for(const row of data.rows.slice(q.start-1,q.end)){
   signal?.throwIfAborted();const key=JSON.stringify([q.expression,localRecord(data,row,'')]);const cached=this.cache.get(key);
   if(cached!==undefined){this.cacheHits++;tokens.push(cached);}else{
    this.pending++;try{const r=await extractAndJudge(data,row,plan,this.transport,signal,this.grounded);this.calls+=r.calls.length;this.extractedFieldCount+=Object.keys(r.values).length;signal?.throwIfAborted();if(!r.error)this.cache.set(key,r.token);tokens.push(r.token);}finally{this.pending--;}
   }
   if(tokens.at(-1)==='Y')break;
  }
  const token=tokens.includes('Y')?'Y':tokens.length&&tokens.every(x=>x==='N')?'N':'X';
  this.log.push({query:q,token,rejected:false,fields:this.extractedFieldCount-fieldStart,localCalls:this.calls-before});return token;
 }
}
