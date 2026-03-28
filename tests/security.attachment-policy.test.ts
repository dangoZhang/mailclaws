import { describe, expect, it } from "vitest";

import { evaluateAttachmentPolicy } from "../src/security/attachment-policy.js";

describe("evaluateAttachmentPolicy", () => {
  it("rejects oversized attachments", () => {
    const result = evaluateAttachmentPolicy({
      attachments: [
        {
          filename: "payload.pdf",
          contentType: "application/pdf",
          sizeBytes: 25 * 1024 * 1024
        }
      ],
      config: {
        maxAttachmentBytes: 20 * 1024 * 1024
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("size:payload.pdf");
  });

  it("rejects disallowed mime types", () => {
    const result = evaluateAttachmentPolicy({
      attachments: [
        {
          filename: "macro.docm",
          contentType: "application/vnd.ms-word.document.macroEnabled.12",
          sizeBytes: 1024
        }
      ],
      config: {
        allowedMimeTypes: ["application/pdf", "text/plain"]
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("mime:macro.docm");
  });

  it("accepts a bounded, allowed attachment set", () => {
    const result = evaluateAttachmentPolicy({
      attachments: [
        {
          filename: "notes.txt",
          contentType: "text/plain",
          sizeBytes: 512
        }
      ],
      config: {
        allowedMimeTypes: ["text/plain"],
        maxAttachmentBytes: 1024,
        maxAttachments: 3
      }
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});
