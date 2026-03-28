import { describe, expect, it } from "vitest";

import { resolveMailIdentity } from "../src/identity/trust.js";

describe("resolveMailIdentity", () => {
  it("grants aligned DMARC plus allowlisted domains a higher trust level", () => {
    const identity = resolveMailIdentity({
      from: "alice@example.com",
      replyTo: [],
      sender: undefined,
      headers: [
        {
          name: "Authentication-Results",
          value:
            "mx.example; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com"
        }
      ],
      allowDomains: ["example.com"]
    });

    expect(identity.trustLevel).toBe("T3");
    expect(identity.canonicalUserId).toBe("email:alice@example.com");
    expect(identity.risks).toEqual([]);
  });

  it("keeps unaligned authenticated mail at a lower trust level", () => {
    const identity = resolveMailIdentity({
      from: "alice@example.com",
      replyTo: [],
      sender: undefined,
      headers: [
        {
          name: "Authentication-Results",
          value:
            "mx.example; spf=pass smtp.mailfrom=mailer.other.example; dkim=pass header.d=mailer.other.example; dmarc=fail header.from=example.com"
        }
      ]
    });

    expect(identity.trustLevel).toBe("T1");
    expect(identity.canonicalUserId).toBe("unverified:alice@example.com");
  });

  it("flags reply-to changes and unauthenticated mail as risky", () => {
    const identity = resolveMailIdentity({
      from: "alice@example.com",
      replyTo: ["broker@elsewhere.example"],
      sender: "relay@relay.example",
      headers: [],
      internalDomains: ["example.com"]
    });

    expect(identity.trustLevel).toBe("T0");
    expect(identity.risks).toEqual(
      expect.arrayContaining(["reply_to_domain_mismatch", "sender_domain_mismatch", "unauthenticated"])
    );
  });
});
