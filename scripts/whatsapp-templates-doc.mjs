// Writes docs/whatsapp-templates.md from lib/wa-templates.ts, so the text sent to Meta matches the code.
// Usage: node scripts/whatsapp-templates-doc.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { WA_LANG_CODE, WA_TEMPLATES } from "../lib/wa-templates.ts";

const out = [
  "# WhatsApp message templates for Meta",
  "",
  "Generated from `lib/wa-templates.ts` by `node scripts/whatsapp-templates-doc.mjs`. Do not edit by hand: change the code and run the script.",
  "",
  "Submit each one in WhatsApp Manager, Message templates. Category: Utility. One template per language, with the same name.",
  "Variables are `{{1}}`, `{{2}}` and so on, in the order listed. Meta asks for a sample value for each.",
  "",
  "Texts in Hindi, Gujarati and Marathi are drafts and need a native speaker's review before submission.",
  "",
];
for (const t of WA_TEMPLATES) {
  out.push(`## ${t.name}`, "", `- Category: ${t.category}`, `- Variables: ${t.vars.map((v, i) => `{{${i + 1}}} = ${v}`).join(", ")}`, "");
  for (const [lang, code] of Object.entries(WA_LANG_CODE)) out.push(`### ${lang} (${code})`, "", "```", t.text[lang], "```", "");
}
writeFileSync(path.join(import.meta.dirname, "..", "docs", "whatsapp-templates.md"), out.join("\n"));
console.log("wrote docs/whatsapp-templates.md");
