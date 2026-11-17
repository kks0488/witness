/** Public dictionary. Values and identifiers never belong in this document. */
export const WITNESS_SCHEMA = {
 paid:{type:'num',domain:'refund',meaning:'Amount originally paid.'},
 refund:{type:'num',domain:'refund',meaning:'Requested refund amount.'},
 matching_receipts:{type:'num',domain:'receipt',meaning:'Count of matching supporting receipts.'},
 claim_nonreceipt:{type:'flag',domain:'refund',meaning:'Customer claims nonreceipt of the parcel.'},
 signed_handover:{type:'flag',domain:'refund',meaning:'Delivery evidence records signed handover or collection.'},
 reused_image:{type:'flag',domain:'refund',meaning:'Delivery evidence explicitly identifies an image reused from an earlier different order.'},
 private_purpose:{type:'flag',domain:'receipt',meaning:'Expense is explicitly private without a business purpose.'},
 memo_supplier:{type:'name',domain:'receipt',meaning:'Business supplier named in the expense memo; only local comparison allowed.'},
 receipt_supplier:{type:'name',domain:'receipt',meaning:'Business supplier named in matching receipt; only local comparison allowed.'},
 refund_approved:{type:'flag',domain:'reply',meaning:'Prose order note authorizes monetary repayment.'},
 refund_settled:{type:'flag',domain:'reply',meaning:'Prose order note says repayment has already been paid or settled.'},
 previous_refund:{type:'flag',domain:'refund',meaning:'Delivery note explicitly states an earlier refund was requested and processed for this order.'}
} as const;
export const OPEN_GRAMMAR = `expr := gt(num(field),num(field)) | lt(num(field),num(field)) | eq(num(field),num(field)) | neq(num(field),num(field)) | eq(name(field),name(field)) | neq(name(field),name(field)) | eq(num(field),0) | is(flagField) | not(expr) | and(expr,expr) | or(expr,expr)
Only the listed public fields with matching types are allowed. The only literal is 0, only as the second argument of eq(num(field),0). Maximum predicate depth 3 (a comparison or is is depth 1), maximum 4 distinct fields. num/name wrappers are typed leaves, not predicates. Missing facts are not_stated. Kleene three-valued logic: not X=X; N and X=N; Y and X=X; Y or X=Y; N or X=X. No identifiers, arbitrary values, string literals, arithmetic, indexing or executable code.`;
export function publicSchema(domain?:string){return Object.fromEntries(Object.entries(WITNESS_SCHEMA).filter(([,v])=>!domain||v.domain===domain));}
