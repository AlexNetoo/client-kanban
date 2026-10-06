const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export function formatDate(iso: string) {
  return iso ? parse(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}
export function isOverdue(iso: string, done = false) {
  if (!iso || done) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return parse(iso) < t;
}
export const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}
