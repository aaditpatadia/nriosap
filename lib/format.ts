export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
export function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
export function fromNow(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const h = Math.round(abs / 3600000);
  const d = Math.round(abs / 86400000);
  const unit = m < 60 ? `${m} min` : h < 24 ? `${h} h` : `${d} day${d === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}
export function inr(n: number): string {
  return "Rs " + n.toLocaleString("en-IN");
}
export function usd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
