"use client";

export interface UploadResult { ok: boolean; reason?: string; documentId?: string; needsCheck?: boolean }

/** Uses XMLHttpRequest because fetch cannot report upload progress. */
export function uploadFile(input: { familyId: string; file: File; purposes: string[]; category?: string; onProgress?: (fraction: number) => void }): Promise<UploadResult> {
  const body = new FormData();
  body.set("familyId", input.familyId);
  body.set("file", input.file);
  if (input.category) body.set("category", input.category);
  input.purposes.forEach((p) => body.append("purpose", p));
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) input.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
      } catch {
        resolve({ ok: false, reason: "That file was too large or did not upload." });
      }
    };
    xhr.onerror = () => resolve({ ok: false, reason: "That did not upload. Please try again." });
    xhr.send(body);
  });
}
