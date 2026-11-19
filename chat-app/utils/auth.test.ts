import { describe, it, expect } from "vitest";
import { usernameToEmail } from "./auth";

describe("usernameToEmail", () => {
  it("appends the synthetic domain", () => {
    expect(usernameToEmail("budi")).toBe("budi@chatapp.local");
  });

  it("lowercases the username", () => {
    expect(usernameToEmail("Budi123")).toBe("budi123@chatapp.local");
  });
});
