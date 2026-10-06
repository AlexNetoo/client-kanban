import { Button } from "./halaska-kit";
import { DatePicker, TextArea, TextInput } from "./halaska-kit";
import { val } from "./ui";

export const Text1 = (p: { label: string; value: string; onChange: (v: string) => void; type?: string; maxLength?: number; required?: boolean; caption?: string }) => (
  <TextInput label={p.label + (p.required ? " *" : "")} caption={p.caption} type={p.type} value={p.value} onChange={(e: never) => p.onChange(val(e))} aria-label={p.label} />
);
export const Area = (p: { label: string; value: string; onChange: (v: string) => void; rows?: number; caption?: string }) => (
  <TextArea label={p.label} caption={p.caption} rows={p.rows ?? 3} value={p.value} onChange={(e: never) => p.onChange(val(e))} aria-label={p.label} />
);

const toDate = (iso: string) => (iso ? new Date(iso + "T00:00:00") : null);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Themed date picker (the kit's calendar) working with YYYY-MM-DD strings, replacing the browser's native date input. */
export const DateField = (p: { label: string; value: string; onChange: (v: string) => void; required?: boolean; clearable?: boolean; placeholder?: string }) => (
  <div className="datefield">
    <DatePicker label={p.label + (p.required ? " *" : "")} placeholder={p.placeholder ?? "Pick a date"} value={toDate(p.value)} onChange={(d: Date) => p.onChange(toIso(d))} />
    {p.clearable && p.value && <Button type="button" variant="ghost" size="sm" onClick={() => p.onChange("")} aria-label={`Clear ${p.label}`}>Clear</Button>}
  </div>
);
