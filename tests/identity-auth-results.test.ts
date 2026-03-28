import { describe, expect, it } from "vitest";

import { parseAuthenticationResults } from "../src/identity/auth-results.js";

describe("parseAuthenticationResults", () => {
  it("extracts SPF, DKIM, and DMARC results with domains", () => {
    const parsed = parseAuthenticationResults(
      "mx.example; spf=pass smtp.mailfrom=mailer.example; dkim=pass header.d=mailer.example; dmarc=pass header.from=example.com"
    );

    expect(parsed.spf.result).toBe("pass");
    expect(parsed.spf.domain).toBe("mailer.example");
    expect(parsed.dkim.result).toBe("pass");
    expect(parsed.dkim.domain).toBe("mailer.example");
    expect(parsed.dmarc.result).toBe("pass");
    expect(parsed.dmarc.domain).toBe("example.com");
  });
});
