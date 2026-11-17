export const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]!));
export const money = (value?: number): string => value === undefined ? '—' : `$${value.toFixed(2)}`;
