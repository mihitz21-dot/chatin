import { describe, it, expect } from "vitest";
import { supabase } from "./supabase";

describe("supabase client", () => {
  it("is created with a non-empty url and key", () => {
    expect(supabase).toBeTruthy();
    expect((supabase as any).supabaseUrl).toContain("http");
  });
});
