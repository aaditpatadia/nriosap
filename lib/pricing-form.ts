import { requestDetailsSchema, type RequestDetails } from "./pricing-rules";

const str = (form: FormData, key: string) => (typeof form.get(key) === "string" ? (form.get(key) as string) : "");
const num = (form: FormData, key: string) => {
  const raw = str(form, key).replace(/[, ]/g, "");
  return raw === "" ? 0 : Number(raw);
};

/** True when the customer filled in anything about where or when. Used to avoid saving an empty block. */
export function hasDetailsInput(form: FormData): boolean {
  return [...form.keys()].some((k) => /^(p_|d_|w_|i_)/.test(k) && str(form, k).trim() !== "") || str(form, "urgency") !== "" || str(form, "service") === "delivery";
}

/** Turns the form fields into the stored shape, or says what is wrong in plain words. */
export function detailsFromForm(form: FormData): { ok: true; details: RequestDetails } | { ok: false; message: string } {
  const place = (p: string) => ({ address: str(form, `${p}_address`), area: str(form, `${p}_area`), pincode: str(form, `${p}_pincode`).replace(/\s/g, ""), contactName: str(form, `${p}_contactName`), contactPhone: str(form, `${p}_contactPhone`), access: str(form, `${p}_access`) });
  const parsed = requestDetailsSchema.safeParse({
    service: str(form, "service") || "visit",
    urgency: str(form, "urgency") || "standard",
    pickup: place("p"),
    drop: place("d"),
    window: { date: str(form, "w_date"), from: str(form, "w_from"), to: str(form, "w_to") },
    item: { what: str(form, "i_what"), size: str(form, "i_size") || "small", weightKg: num(form, "i_weight"), valueInr: num(form, "i_value"), fragile: form.get("i_fragile") === "on" },
    returnTrip: form.get("returnTrip") === "on",
    waitMinutes: num(form, "waitMinutes"),
    notes: str(form, "notes"),
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    const where = i?.path.join(" ") ?? "";
    if (/pincode/.test(where)) return { ok: false, message: "A PIN code has 6 digits." };
    if (/weightKg|valueInr|waitMinutes/.test(where)) return { ok: false, message: "Please check the weight, value and waiting time. They must be numbers." };
    return { ok: false, message: "Please check the place and timing details." };
  }
  return { ok: true, details: parsed.data };
}
