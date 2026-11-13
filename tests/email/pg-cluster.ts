import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { createServer } from "node:net";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

export type TestCluster = {
  createDatabase(name: string): Promise<string>;
  stop(): Promise<void>;
};

const USER = "wp_test";
const PASSWORD = "wp_test_pw";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function startTestCluster(): Promise<TestCluster> {
  const dir = join(tmpdir(), `wp-pg-${randomUUID()}`);
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: join(dir, "data"),
    user: USER,
    password: PASSWORD,
    port,
    persistent: false,
    createPostgresUser: true,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();

  return {
    async createDatabase(name: string) {
      await server.createDatabase(name);
      return `postgres://${USER}:${PASSWORD}@127.0.0.1:${port}/${name}`;
    },
    async stop() {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function openClient(connectionString: string): pg.Client {
  return new pg.Client({ connectionString });
}
