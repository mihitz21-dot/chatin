import { describe, it, expect } from "vitest";
import { isValidUsername, validateImageFile, validateVideoFile } from "./validation";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe("isValidUsername", () => {
  it("accepts alphanumeric 3-20 chars", () => {
    expect(isValidUsername("budi123")).toBe(true);
  });
  it("rejects spaces and symbols", () => {
    expect(isValidUsername("budi 123!")).toBe(false);
  });
  it("rejects too short", () => {
    expect(isValidUsername("ab")).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("accepts a valid jpg under 5MB", () => {
    const file = makeFile("a.jpg", "image/jpeg", 1024);
    expect(validateImageFile(file)).toBeNull();
  });
  it("rejects unsupported type", () => {
    const file = makeFile("a.bmp", "image/bmp", 1024);
    expect(validateImageFile(file)).toMatch(/format/i);
  });
  it("rejects file over 5MB", () => {
    const file = makeFile("a.png", "image/png", 6 * 1024 * 1024);
    expect(validateImageFile(file)).toMatch(/5MB/);
  });
});

describe("validateVideoFile", () => {
  it("accepts a valid mp4 under 20MB", () => {
    const file = makeFile("a.mp4", "video/mp4", 1024);
    expect(validateVideoFile(file)).toBeNull();
  });
  it("rejects file over 20MB", () => {
    const file = makeFile("a.mp4", "video/mp4", 21 * 1024 * 1024);
    expect(validateVideoFile(file)).toMatch(/20MB/);
  });
});
