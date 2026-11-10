"use client";

import { useActionState, useState, useTransition } from "react";
import { addPropertyAction, removePropertyAction } from "@/app/family/platform-actions";
import { propertyContactAction, updatePropertyAction } from "@/app/family/workspace-actions";

export function AddPropertyForm({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(addPropertyAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-4">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Add a property or asset</h2>
      <input type="hidden" name="familyId" value={familyId} />
      <label className="field">Name<input className="input" name="name" maxLength={120} placeholder="Pune flat" required /></label>
      <label className="field">Type
        <select className="input" name="kind" defaultValue="flat"><option value="flat">Flat</option><option value="house">House</option><option value="plot">Plot</option><option value="shop">Shop</option><option value="vehicle">Vehicle</option><option value="other">Other</option></select>
      </label>
      <label className="field">Address (optional)<input className="input" name="address" maxLength={300} /></label>
      <label className="field">City (optional)<input className="input" name="city" maxLength={80} /></label>
      <label className="field">Ownership (optional)<input className="input" name="ownership" maxLength={200} placeholder="Joint with my brother" /></label>
      <label className="field">Tenant name (optional)<input className="input" name="tenantName" maxLength={120} /></label>
      <label className="field">Monthly rent in Rs (optional)<input className="input" name="rent" inputMode="numeric" /></label>
      <label className="field">Notes (optional)<textarea className="input" name="notes" rows={2} maxLength={1000} /></label>
      <button className="btn btn-primary w-fit" disabled={pending}>Add</button>
      <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
    </form>
  );
}

export function EditPropertyForm({ property }: { property: { id: string; ownership: string | null; rentInr: number | null; tenantName: string | null; tenantPhone: string | null; leaseEnd: string | null; notes: string | null } }) {
  const [state, action, pending] = useActionState(updatePropertyAction, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="propertyId" value={property.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Ownership<input className="input" name="ownership" maxLength={200} defaultValue={property.ownership ?? ""} /></label>
        <label className="field">Monthly rent in Rs<input className="input" name="rent" inputMode="numeric" defaultValue={property.rentInr ?? ""} /></label>
        <label className="field">Tenant name<input className="input" name="tenantName" maxLength={120} defaultValue={property.tenantName ?? ""} /></label>
        <label className="field">Tenant phone<input className="input" name="tenantPhone" maxLength={24} defaultValue={property.tenantPhone ?? ""} /></label>
        <label className="field">Rent agreement ends<input className="input" type="date" name="leaseEnd" defaultValue={property.leaseEnd ?? ""} /></label>
      </div>
      <label className="field">Notes<textarea className="input" name="notes" rows={2} maxLength={1000} defaultValue={property.notes ?? ""} /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Save details</button>
      <p role="status" aria-live="polite" className={`text-[length:var(--text-small)] ${state?.ok ? "text-ok" : "text-danger"}`}>{state?.message}</p>
    </form>
  );
}

export function PropertyContactToggle({ propertyId, memberId, name, linked }: { propertyId: string; memberId: string; name: string; linked: boolean }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-ghost" disabled={pending} aria-label={`${linked ? "Unlink" : "Link"} ${name}`} onClick={() => start(async () => { await propertyContactAction(propertyId, memberId, !linked); })}>{linked ? "Unlink" : "Link"}</button>;
}

export function RemovePropertyButton({ id, name }: { id: string; name: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  if (!sure) return <button type="button" className="btn btn-ghost" aria-label={`Remove ${name}`} onClick={() => setSure(true)}>Remove</button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await removePropertyAction(id); })}>Yes, remove</button>
      <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>Keep</button>
    </span>
  );
}
