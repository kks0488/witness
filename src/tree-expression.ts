import { WITNESS_SCHEMA, publicSchema } from './witness-schema';
import { parseExpression, type ParsedExpression } from './open-expression';
export const TREE_OPS=['is','not','and','or','gt','lt','eq','neq'] as const;
export type TreeOp=typeof TREE_OPS[number];
export type ExpressionTree={op:TreeOp;args:(ExpressionTree|string|0)[]};
export const TREE_GRAMMAR=`A predicate is JSON {op,args}. op is is, not, and, or, gt, lt, eq or neq. is takes one flag field name; not takes one predicate; and/or take two predicates; comparisons take two field names of the same type. gt/lt require numeric fields. eq may also compare a numeric field to literal 0. All field names come from the public dictionary. Do not write num/name wrappers: code attaches the dictionary type. Maximum predicate depth three and four distinct fields. No other literals, identifiers, executable text or arbitrary values. Missing facts use Kleene Y/N/X logic. An X after the witness runs costs one answer; a public validation rejection releases no symbol and costs zero bits.`;
/** Deliberately bounded JSON schema. Enum leaves cannot carry identifiers or values. */
export function treeSchema(domain:string,depth=1):unknown {
 const field={type:'string',enum:Object.keys(publicSchema(domain))};
 const args:unknown[]=[field,{type:'integer',enum:[0]}];
 if(depth<3)args.push(treeSchema(domain,depth+1));
 return {type:'object',properties:{op:{type:'string',enum:TREE_OPS},args:{type:'array',items:{anyOf:args}}},required:['op','args'],additionalProperties:false};
}
export type CompiledTree={tree:ExpressionTree;expression:string;parsed:ParsedExpression};
/** No data dependency: only the tree and a public domain select the result. */
export function compileTree(value:unknown,domain:string):CompiledTree|undefined {
 const convert=(v:unknown,depth:number):string=>{
  if(depth>3||!v||typeof v!=='object'||Array.isArray(v))throw Error('structure');
  const n=v as Record<string,unknown>;
  if(Object.keys(n).sort().join(',')!=='args,op'||!TREE_OPS.includes(n.op as TreeOp)||!Array.isArray(n.args))throw Error('structure');
  const a=n.args,op=n.op;
  const field=(v:unknown,type?:string)=>{
   if(typeof v!=='string'||!Object.hasOwn(WITNESS_SCHEMA,v))throw Error('field');
   const f=v as keyof typeof WITNESS_SCHEMA,s=WITNESS_SCHEMA[f];
   if(s.domain!==domain||(type&&s.type!==type))throw Error('type');
   return {f,type:s.type};
  };
  if(op==='is'){if(a.length!==1)throw Error('arity');return `is(${field(a[0],'flag').f})`;}
  if(op==='not'){if(a.length!==1)throw Error('arity');return `not(${convert(a[0],depth+1)})`;}
  if(op==='and'||op==='or'){if(a.length!==2)throw Error('arity');return `${op}(${convert(a[0],depth+1)},${convert(a[1],depth+1)})`;}
  if(a.length!==2)throw Error('arity');const l=field(a[0]);
  if(l.type==='flag')throw Error('type');
  if(a[1]===0){if(op!=='eq'||l.type!=='num')throw Error('literal');return `eq(num(${l.f}),0)`;}
  const r=field(a[1],l.type);if((op==='gt'||op==='lt')&&l.type!=='num')throw Error('type');
  return `${op}(${l.type}(${l.f}),${r.type}(${r.f}))`;
 };
 try {const expression=convert(value,1),parsed=parseExpression(expression,domain);if(!parsed)return;return {tree:structuredClone(value) as ExpressionTree,expression,parsed};}catch{return;}
}

/** Structural normal form over the public AST only; never uses record values. */
export function canonicalTree(tree:ExpressionTree):ExpressionTree {
 let op=tree.op,args=tree.args.map(a=>typeof a==='object'?canonicalTree(a):a);
 if(op==='not'){
  const child=args[0] as ExpressionTree;
  if(child.op==='not')return child.args[0] as ExpressionTree;
  if(child.op==='eq'||child.op==='neq')return canonicalTree({op:child.op==='eq'?'neq':'eq',args:child.args});
 }
 if(op==='gt'){op='lt';args.reverse();}
 if(['eq','neq','and','or'].includes(op))args.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
 return {op,args};
}
export const canonicalKey=(tree:ExpressionTree):string=>JSON.stringify(canonicalTree(tree));
export const invertedKey=(tree:ExpressionTree):string=>canonicalKey({op:'not',args:[tree]});
/** Pure public candidate inventory. Its sole argument is the dictionary. */
export function publicCandidates(dictionary:ReturnType<typeof publicSchema>):ExpressionTree[]{
 const entries=Object.entries(dictionary).sort(([a],[b])=>a.localeCompare(b,'en'));
 const nums=entries.filter(([,v])=>v.type==='num').map(([f])=>f),names=entries.filter(([,v])=>v.type==='name').map(([f])=>f);
 const out:ExpressionTree[]=[];
 for(const a of nums)for(const b of nums)if(a!==b)out.push({op:'gt',args:[a,b]});
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)out.push({op:'neq',args:[names[i],names[j]]});
 for(const f of nums)out.push({op:'eq',args:[f,0]});
 for(const [f,v]of entries)if(v.type==='flag')out.push({op:'is',args:[f]});
 return out;
}
