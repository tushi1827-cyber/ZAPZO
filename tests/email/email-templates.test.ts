import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEMPLATES, renderEmail, templateSubject } from "../../supabase/functions/_shared/email-templates.ts";

const sample: Record<string, Record<string, unknown>> = {
  welcome: { user_name: "Asha" },
  withdrawal_requested: { user_name: "Asha", amount: 500, withdrawal_method: "UPI" },
  withdrawal_approved: { user_name: "Asha", amount: 500, withdrawal_method: "UPI", reference: "ref-1" },
  withdrawal_rejected: { user_name: "Asha", amount: 500, withdrawal_method: "UPI", reason: "Invalid UPI ID" },
  withdrawal_paid: { user_name: "Asha", amount: 500, withdrawal_method: "UPI", reference: "ref-1" },
  gift_card_fulfilled: { user_name: "Asha", amount: 1000, gift_card: "Amazon Gift Card", reference: "ref-2" },
  task_approved: { user_name: "Asha", task_title: "Survey", amount: 20 },
  task_rejected: { user_name: "Asha", task_title: "Survey", reason: "Proof unclear" },
  support_reply: { user_name: "Asha", ticket_subject: "Help", message_preview: "We fixed it" },
  ticket_status_changed: { user_name: "Asha", ticket_subject: "Help", ticket_status: "resolved" },
  account_suspended: { user_name: "Asha", reason: "Fraud review" },
};

describe("renderEmail", () => {
  it("renders every template with the WorkPixo subject and a complete document", () => {
    for (const template of EMAIL_TEMPLATES) {
      const out = renderEmail(template, sample[template], "fallback");
      assert.equal(out.subject, templateSubject(template));
      assert.doesNotMatch(out.subject, /ZAPZO/);
      assert.match(out.html, /^<!DOCTYPE html>/);
      assert.match(out.html, /<\/html>$/);
    }
  });

  it("labels amounts in Coins, not rupees", () => {
    const html = renderEmail("withdrawal_paid", { amount: 1500 }, "x").html;
    assert.match(html, /1,500 Coins/);
    assert.doesNotMatch(html, /₹/);
  });

  it("shows gift card fields for gift card fulfilment", () => {
    const html = renderEmail("gift_card_fulfilled", sample.gift_card_fulfilled, "x").html;
    assert.match(html, /Amazon Gift Card/);
    assert.match(html, /ref-2/);
    assert.match(html, /1,000 Coins/);
  });

  it("escapes user-controlled text", () => {
    const html = renderEmail("support_reply", {
      user_name: "<img src=x onerror=alert(1)>",
      message_preview: "<script>alert(1)</script>",
    }, "x").html;
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it("renders a CTA only for http and https links", () => {
    const good = renderEmail("welcome", { cta_url: "https://workpixo.example/tasks" }, "x").html;
    assert.match(good, /href="https:\/\/workpixo\.example\/tasks"/);

    const bad = renderEmail("welcome", { cta_url: "javascript:alert(1)" }, "x").html;
    assert.doesNotMatch(bad, /javascript:/);
    assert.doesNotMatch(bad, /<a href/);
  });

  it("escapes quotes in CTA URLs so an attribute cannot be broken out of", () => {
    const html = renderEmail("welcome", { cta_url: 'https://a.example/"onmouseover="x' }, "x").html;
    assert.doesNotMatch(html, /onmouseover="x/);
  });

  it("ignores non-string payload values instead of failing", () => {
    const html = renderEmail("withdrawal_requested", { user_name: 42, amount: { n: 1 } }, "x").html;
    assert.match(html, /Hello,/);
    assert.doesNotMatch(html, /Coins/);
  });

  it("falls back to the stored subject for unknown templates", () => {
    const out = renderEmail("not_a_template", {}, "Stored subject");
    assert.equal(out.subject, "Stored subject");
    assert.match(out.html, /Stored subject/);
  });
});
