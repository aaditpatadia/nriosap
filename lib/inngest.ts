import "server-only";
import { cron, eventType, Inngest, staticSchema } from "inngest";
import { runApprovedActions, runBillReminders, runHousekeeping, runNoReplyCheck, runRenewalReminders, runSlaAlerts } from "./jobs";
import { processMessage, runWhatsAppSweep } from "./wa-pipeline";

export const inngest = new Inngest({ id: "ally" });

const job = (id: string, schedule: string, fn: () => Promise<unknown>) =>
  inngest.createFunction({ id, triggers: [cron(schedule)] }, async ({ step }) => step.run(id, fn));

/** One stored WhatsApp message to read and route. Carries only the row id: no text, no number. */
export const whatsappReceived = eventType("whatsapp/message.received", { schema: staticSchema<{ id: string }>() });

const whatsappMessage = inngest.createFunction(
  { id: "whatsapp-message", triggers: [whatsappReceived], retries: 3 },
  async ({ event, step }) => step.run("process", () => processMessage(String(event.data.id))),
);

// Times are UTC. 02:30 UTC is 08:00 in India.
export const functions = [
  job("sla-alerts", "*/10 * * * *", runSlaAlerts),
  job("no-reply-check", "0 * * * *", runNoReplyCheck),
  job("renewal-reminders", "30 2 * * *", runRenewalReminders),
  job("bill-reminders", "35 2 * * *", runBillReminders),
  job("approved-actions", "* * * * *", runApprovedActions),
  job("housekeeping", "0 21 * * *", runHousekeeping),
  job("whatsapp-sweep", "*/2 * * * *", runWhatsAppSweep),
  whatsappMessage,
];
