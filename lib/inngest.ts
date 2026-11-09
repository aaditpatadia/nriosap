import "server-only";
import { cron, Inngest } from "inngest";
import { runApprovedActions, runBillReminders, runHousekeeping, runNoReplyCheck, runRenewalReminders, runSlaAlerts } from "./jobs";

export const inngest = new Inngest({ id: "gharsaath" });

const job = (id: string, schedule: string, fn: () => Promise<unknown>) =>
  inngest.createFunction({ id, triggers: [cron(schedule)] }, async ({ step }) => step.run(id, fn));

// Times are UTC. 02:30 UTC is 08:00 in India.
export const functions = [
  job("sla-alerts", "*/10 * * * *", runSlaAlerts),
  job("no-reply-check", "0 * * * *", runNoReplyCheck),
  job("renewal-reminders", "30 2 * * *", runRenewalReminders),
  job("bill-reminders", "35 2 * * *", runBillReminders),
  job("approved-actions", "* * * * *", runApprovedActions),
  job("housekeeping", "0 21 * * *", runHousekeeping),
];
