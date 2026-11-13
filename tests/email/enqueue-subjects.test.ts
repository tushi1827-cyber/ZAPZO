import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { EMAIL_TEMPLATES, templateSubject } from "../../supabase/functions/_shared/email-templates.ts";
import { openClient, startTestCluster, type TestCluster } from "./pg-cluster.ts";

const baseSchema = readFileSync(new URL("./base-schema.sql", import.meta.url), "utf8");
const subjectsMigration = readFileSync(new URL("./enqueue_email_workpixo_subjects.sql", import.meta.url), "utf8");

let cluster: TestCluster;

describe("enqueue_email subjects match the email templates", () => {
  before(async () => {
    cluster = await startTestCluster();
  });

  after(async () => {
    await cluster.stop();
  });

  it("stores the same subject the template renders for every template", async () => {
    const url = await cluster.createDatabase(`s_${randomUUID().replaceAll("-", "")}`);
    const client = openClient(url);
    await client.connect();
    try {
      await client.query(baseSchema);
      await client.query("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);");
      await client.query(subjectsMigration);

      const userId = randomUUID();
      await client.query("INSERT INTO auth.users (id, email) VALUES ($1, 'user@example.com')", [userId]);

      for (const template of EMAIL_TEMPLATES) {
        await client.query("SELECT public.enqueue_email($1, $2, '{}'::jsonb, NULL)", [userId, template]);
        const res = await client.query<{ subject: string }>(
          "SELECT subject FROM public.email_queue WHERE template_name = $1",
          [template],
        );
        assert.equal(res.rows[0].subject, templateSubject(template), template);
      }
    } finally {
      await client.end();
    }
  });

  it("does not grant enqueue_email to anon or authenticated", async () => {
    const url = await cluster.createDatabase(`g_${randomUUID().replaceAll("-", "")}`);
    const client = openClient(url);
    await client.connect();
    try {
      await client.query(baseSchema);
      await client.query("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);");
      await client.query(subjectsMigration);
      const res = await client.query<{ anon: boolean; authed: boolean }>(`
        SELECT
          has_function_privilege('anon', 'public.enqueue_email(uuid,text,jsonb,text)', 'EXECUTE') AS anon,
          has_function_privilege('authenticated', 'public.enqueue_email(uuid,text,jsonb,text)', 'EXECUTE') AS authed
      `);
      assert.equal(res.rows[0].anon, false);
      assert.equal(res.rows[0].authed, false);
    } finally {
      await client.end();
    }
  });
});
