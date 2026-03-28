import { describe, expect, it } from "vitest";

import { renderConsoleAppHtml } from "../src/presentation/console-app.js";

describe("console app html", () => {
  it("escapes inline bootstrap config so script-like values do not break the page shell", () => {
    const html = renderConsoleAppHtml({
      serviceName: 'MailClaw </script><script>alert("x")</script>\u2028\u2029',
      initialPath: '/console?next=</script><script>alert("x")</script>\u2028\u2029',
      apiBasePath: "/api"
    });

    expect(html).toContain(
      '"initialPath":"/console?next=\\u003c/script\\u003e\\u003cscript\\u003ealert(\\"x\\")\\u003c/script\\u003e\\u2028\\u2029"'
    );
    expect(html).toContain("\\u2028");
    expect(html).toContain("\\u2029");
    expect(html).not.toContain("</script><script>alert(\"x\")</script>");
  });
});
