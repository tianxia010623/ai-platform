import { describe, expect, it } from "vitest";
import { errorMessage, formatErrorDetail } from "../errors";

describe("formatErrorDetail", () => {
  it("passes plain string details through", () => {
    expect(formatErrorDetail("Incorrect email or password", "x")).toBe("Incorrect email or password");
  });

  it("turns pydantic validation lists into readable sentences", () => {
    const detail = [
      { type: "string_too_short", loc: ["body", "username"], msg: "too short", ctx: { min_length: 3 } },
      { type: "value_error", loc: ["body", "email"], msg: "value is not a valid email address" },
      { type: "string_too_short", loc: ["body", "password"], msg: "too short", ctx: { min_length: 6 } },
    ];
    expect(formatErrorDetail(detail, "x")).toBe(
      "Username must be at least 3 characters. Please enter a valid email address. Password must be at least 6 characters."
    );
  });

  it("never produces [object Object]", () => {
    expect(formatErrorDetail([{ loc: ["body", "weird"] }], "x")).not.toContain("[object Object]");
    expect(formatErrorDetail({ nested: true }, "Fallback")).toBe("Fallback");
  });
});

describe("errorMessage", () => {
  it("explains network failures", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toMatch(/Can't reach the server/);
  });
});
