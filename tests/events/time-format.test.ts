import { describe, expect, it } from "vitest";
import { formatTime, parseTime } from "@/lib/time-format";

describe("time format", () => {
  it("formats seconds as m:ss with optional tenths", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65.5)).toBe("1:05.5");
    expect(formatTime(59.96)).toBe("1:00");
  });
  it("parses m:ss, plain seconds and decimals", () => {
    expect(parseTime("0:05")).toBe(5);
    expect(parseTime("1:05.5")).toBe(65.5);
    expect(parseTime("65,5")).toBe(65.5);
    expect(parseTime("12")).toBe(12);
    expect(parseTime("1:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
});
