import { TextArea, TextInput } from "./halaska-kit";
import { val } from "./ui";

export const Text1 = (p: { label: string; value: string; onChange: (v: string) => void; type?: string; maxLength?: number; required?: boolean; caption?: string }) => (
  <TextInput label={p.label + (p.required ? " *" : "")} caption={p.caption} type={p.type} value={p.value} onChange={(e: never) => p.onChange(val(e))} aria-label={p.label} />
);
export const Area = (p: { label: string; value: string; onChange: (v: string) => void; rows?: number; caption?: string }) => (
  <TextArea label={p.label} caption={p.caption} rows={p.rows ?? 3} value={p.value} onChange={(e: never) => p.onChange(val(e))} aria-label={p.label} />
);
