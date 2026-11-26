// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginRateKey } from "@/server/auth/rate-limit";

const h = (xff?: string) => ({ get: (n: string) => (n.toLowerCase() === "x-forwarded-for" ? (xff ?? null) : null) });

afterEach(() => vi.unstubAllEnvs());

describe("loginRateKey client IP", () => {
  it("ignores X-Forwarded-For when TRUST_PROXY_HOPS is unset (app published directly)", () => {
    expect(loginRateKey("A@b.c", h("1.2.3.4"))).toBe("a@b.c|local");
  });

  it("TRUST_PROXY_HOPS=1 takes the entry the proxy appended (last), not a client-supplied one", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    expect(loginRateKey("a@b.c", h("6.6.6.6, 203.0.113.7"))).toBe("a@b.c|203.0.113.7");
  });

  it("TRUST_PROXY_HOPS=2 counts two proxies from the right", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    expect(loginRateKey("a@b.c", h("6.6.6.6, 203.0.113.7, 10.0.0.2"))).toBe("a@b.c|203.0.113.7");
  });

  it("falls back to local when the header is missing or has fewer entries than hops", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    expect(loginRateKey("a@b.c", h())).toBe("a@b.c|local");
    expect(loginRateKey("a@b.c", h("203.0.113.7"))).toBe("a@b.c|local");
  });

  it("treats an invalid value as 0", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "abc");
    expect(loginRateKey("a@b.c", h("1.2.3.4"))).toBe("a@b.c|local");
  });
});
