import { describe, expect, it } from "vitest";
import { escapeHtml, isEmailKind, renderEmail } from "@/lib/email-templates";

const ctx = {
  name: "Ada",
  eventTitle: "Hack Night",
  orgName: "Hack Club",
  when: "Fri, Nov 7, 2026 · 6:00 PM EST",
  url: "https://hackclub.rsvp/hack-night",
};

describe("renderEmail", () => {
  it("renders a confirmation with the event details and link", () => {
    const mail = renderEmail("rsvp_confirmed", ctx);
    expect(mail.subject).toBe("You're going to Hack Night");
    expect(mail.text).toContain("Hey Ada,");
    expect(mail.text).toContain("Fri, Nov 7, 2026 · 6:00 PM EST");
    expect(mail.text).toContain("https://hackclub.rsvp/hack-night");
    expect(mail.html).toContain('href="https://hackclub.rsvp/hack-night"');
  });

  it("uses a different subject for each kind", () => {
    const subjects = (["rsvp_confirmed", "rsvp_waitlisted", "waitlist_promoted"] as const).map(
      (kind) => renderEmail(kind, ctx).subject,
    );
    expect(new Set(subjects).size).toBe(3);
  });

  it("only mentions cancelling for people who have a spot", () => {
    expect(renderEmail("rsvp_confirmed", ctx).text).toContain("Cancel");
    expect(renderEmail("waitlist_promoted", ctx).text).toContain("Cancel");
    expect(renderEmail("rsvp_waitlisted", ctx).text).not.toContain("Cancel");
  });

  it("falls back to a plain greeting without a name", () => {
    expect(renderEmail("rsvp_confirmed", { ...ctx, name: null }).text).toMatch(/^Hey,/);
  });

  it("escapes event text in the html part", () => {
    const mail = renderEmail("rsvp_confirmed", { ...ctx, eventTitle: "<script>x</script>" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("helpers", () => {
  it("recognises only known kinds", () => {
    expect(isEmailKind("rsvp_confirmed")).toBe(true);
    expect(isEmailKind("toString")).toBe(false);
    expect(isEmailKind("nope")).toBe(false);
  });

  it("escapes all html special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
