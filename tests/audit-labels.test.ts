import { describe, expect, it } from "vitest";
import { collapseLog, describeAudit } from "@/lib/audit-labels";

describe("the access log in plain words", () => {
  it("names the things people actually do", () => {
    expect(describeAudit("view_family").label).toBe("Opened the family page");
    expect(describeAudit("quote_sent")).toEqual({ label: "The desk sent a quotation", group: "desk" });
    expect(describeAudit("document_uploaded").group).toBe("documents");
  });
  it("turns a status change into a sentence", () => {
    expect(describeAudit("request_status:awaiting_information").label).toBe("Your request moved to Awaiting Information");
    expect(describeAudit("request_status:completed").label).toBe("Your request moved to Completed");
    expect(describeAudit("request_status:something_new").label).toBe("Your request moved to something new");
  });
  it("never shows a code name, an underscore or a colon, even for an action it has not heard of", () => {
    for (const a of ["view_family", "price_calculated", "request_status:in_progress", "parent_consent_withdrawn:whatsapp", "brand_new_thing:x_y", "rate_card_changed"]) {
      const { label } = describeAudit(a);
      expect(label, a).not.toMatch(/[_:]/);
      expect(label[0], a).toBe(label[0].toUpperCase());
    }
  });
  it("merges repeats by the same person on the same day, and keeps different days and people apart", () => {
    const at = (d: string, t: string) => `2026-11-${d}T${t}:00.000Z`;
    const rows = collapseLog([
      { id: "1", at: at("14", "10:00"), action: "view_family", actorId: "a" },
      { id: "2", at: at("14", "09:50"), action: "view_family", actorId: "a" },
      { id: "3", at: at("14", "09:40"), action: "view_family", actorId: "a" },
      { id: "4", at: at("14", "09:30"), action: "view_family", actorId: "b" },
      { id: "5", at: at("13", "09:30"), action: "view_family", actorId: "b" },
    ], (id) => (id === "a" ? "You" : "Meera"));
    expect(rows.map((r) => [r.who, r.count])).toEqual([["You", 3], ["Meera", 1], ["Meera", 1]]);
  });
  it("says nothing in a dash", () => {
    for (const a of ["view_family", "quote_sent", "request_status:completed", "other_thing"]) expect(describeAudit(a).label).not.toContain("—");
  });
});
