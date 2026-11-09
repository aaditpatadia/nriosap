/** Builds small valid PDFs with labelled text. Generated, so no real person's data is involved. */
export function pdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 12 Tf 40 ${780 - i * 20} Td (${l}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  objs.forEach((o, i) => (out += `${i + 1} 0 obj\n${o}\nendobj\n`));
  return Buffer.from(out + "trailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
}

export const SAMPLES = {
  policy: pdf(["HEALTH POLICY SCHEDULE", "Insurer: Sample General Insurance", "Policy No: SGI-44871-2026", "Sum Insured: Rs 7,50,000", "Renewal: 2027-02-14"]),
  blurry: pdf(["HEALTH POLICY SCHEDULE [blurry]", "Insurer: Sampl Gen Insurnce", "Policy No: SGI-4?871", "Renewal: 2027-02-14"]),
  bill: pdf(["ELECTRICITY BILL", "Payee: Sample Power Ltd", "Amount: Rs 2,310", "Due: 2026-12-01"]),
  discharge: pdf(["DISCHARGE SUMMARY", "Hospital: Sample Care Hospital, Pune", "Admitted: 2026-10-20", "Discharged: 2026-10-24"]),
  refused: pdf(["[fail]"]),
  eicar: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")]),
};
