import { WITNESS_SCHEMA } from './witness-schema';
import type { Token } from './protocol';
type F=keyof typeof WITNESS_SCHEMA;
type Leaf={type:'num'|'name';field:F}|{type:'zero'};
export type Expr={op:'is';field:F}|{op:'not';a:Expr}|{op:'and'|'or';a:Expr;b:Expr}|{op:'gt'|'lt'|'eq'|'neq';a:Leaf;b:Leaf};
export interface ParsedExpression {ast:Expr;fields:F[];depth:number;}
export function parseExpression(text:string,domain?:string):ParsedExpression|undefined {
 if(typeof text!=='string'||text.length>600)return;
 const tokens=text.match(/[a-z_]+|0|[(),]/g)??[];
 if(tokens.join('')!==text.replace(/\s/g,''))return;
 let i=0;const fields=new Set<F>();
 const take=(s:string)=>{if(tokens[i++]!==s)throw Error('syntax');};
 const field=(type:string):F=>{const f=tokens[i++] as F;if(!Object.hasOwn(WITNESS_SCHEMA,f)||WITNESS_SCHEMA[f].type!==type||(domain&&WITNESS_SCHEMA[f].domain!==domain))throw Error('field');fields.add(f);return f;};
 const leaf=():Leaf=>{const t=tokens[i++];if(t==='0')return {type:'zero'};if(t!=='num'&&t!=='name')throw Error('leaf');take('(');const f=field(t);take(')');return {type:t,field:f};};
 const expr=(depth:number):Expr=>{if(depth>3)throw Error('depth');const op=tokens[i++];take('(');let node:Expr;
  if(op==='is')node={op,field:field('flag')};
  else if(op==='not')node={op,a:expr(depth+1)};
  else if(op==='and'||op==='or'){const a=expr(depth+1);take(',');node={op,a,b:expr(depth+1)};}
  else if(op==='gt'||op==='lt'||op==='eq'||op==='neq'){const a=leaf();take(',');const b=leaf();if(a.type==='zero'||(b.type==='zero'&&!(op==='eq'&&a.type==='num'))||(b.type!=='zero'&&a.type!==b.type)||((op==='gt'||op==='lt')&&a.type!=='num'))throw Error('types');node={op,a,b};}
  else throw Error('op');take(')');return node;
 };
 try {const ast=expr(1);if(i!==tokens.length||fields.size>4)return;const depth=(e:Expr):number=>e.op==='not'?1+depth(e.a):e.op==='and'||e.op==='or'?1+Math.max(depth(e.a),depth(e.b)):1;return {ast,fields:[...fields],depth:depth(ast)};}catch{return;}
}
export function evaluateExpression(rule:string,values:Partial<Record<F,string|number>>,domain?:string):Token {
 const p=parseExpression(rule,domain);if(!p)return 'X';
 const value=(l:Leaf):string|number|undefined=>{if(l.type==='zero')return 0;const v=values[l.field];if(l.type==='num')return typeof v==='number'&&Number.isFinite(v)?v:undefined;if(typeof v!=='string'||!v.trim()||v.trim().toLowerCase()==='not_stated'||v.length>80)return;return v.trim().toLowerCase();};
 const run=(e:Expr):Token=>{if(e.op==='is')return values[e.field]==='yes'?'Y':values[e.field]==='no'?'N':'X';if(e.op==='not'){const a=run(e.a);return a==='Y'?'N':a==='N'?'Y':'X';}if(e.op==='and'||e.op==='or'){const a=run(e.a),b=run(e.b);return e.op==='and'?(a==='N'||b==='N'?'N':a==='Y'&&b==='Y'?'Y':'X'):(a==='Y'||b==='Y'?'Y':a==='N'&&b==='N'?'N':'X');}const comparison=e as Extract<Expr,{op:'gt'|'lt'|'eq'|'neq'}>;const a=value(comparison.a),b=value(comparison.b);if(a===undefined||b===undefined)return 'X';return (e.op==='gt'?a>b:e.op==='lt'?a<b:e.op==='eq'?a===b:a!==b)?'Y':'N';};
 return run(p.ast);
}
