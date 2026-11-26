// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/server/db/client";

/** Every route handler under src/app/api, found on disk so a new route cannot be forgotten. */
const API_DIR = path.resolve(__dirname, "../../src/app/api");
const ROUTE_FILES = (fs.readdirSync(API_DIR, { recursive: true }) as string[])
  .filter((f) => path.basename(f) === "route.ts")
  .map((f) => path.join(API_DIR, f))
  .sort();
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

let dataDir: string;
beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-api-auth-"));
  process.env.DATA_DIR = dataDir;
  resetDbForTests();
  getDb();
});
afterAll(() => {
  resetDbForTests();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("API routes without a session cookie", () => {
  it("finds the route files", () => {
    expect(ROUTE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(ROUTE_FILES.map((f) => [path.relative(API_DIR, f).replaceAll("\\", "/"), f]))(
    "%s answers 401 for every method",
    async (_rel, file) => {
      const mod = (await import(/* @vite-ignore */ file)) as Partial<Record<(typeof METHODS)[number], Handler>>;
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length).toBeGreaterThan(0);
      for (const m of handlers) {
        const req = new Request("http://t/api/x?h=x&name=a.wav", {
          method: m,
          ...(m === "GET" || m === "HEAD" ? {} : { body: new Uint8Array([1, 2, 3]) }),
        });
        const res = await mod[m]!(req, { params: Promise.resolve({ id: "x" }) });
        expect(res.status, `${m} ${file}`).toBe(401);
      }
    },
  );
});
