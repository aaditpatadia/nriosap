"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/family/platform-actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <button className="btn btn-primary w-fit" disabled={pending}>Accept the invitation</button>
      {state?.ok === false && <p role="alert" className="text-danger">{state.message}</p>}
    </form>
  );
}
