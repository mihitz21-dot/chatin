import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_URL = "https://test-project.supabase.co";
const TEST_ANON_KEY = "test-anon-key";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function restoreEnv() {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
}

describe("supabase client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("is created with the configured url and key", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = TEST_ANON_KEY;

    const { supabase } = await import("./supabase");

    expect(supabase).toBeTruthy();
    expect((supabase as unknown as { supabaseUrl: string }).supabaseUrl).toBe(TEST_URL);
  });

  it("throws a clear error when the env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    await expect(import("./supabase")).rejects.toThrow(
      /Missing NEXT_PUBLIC_SUPABASE_URL \/ NEXT_PUBLIC_SUPABASE_ANON_KEY/
    );
  });
});
