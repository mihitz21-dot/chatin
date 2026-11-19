import { describe, it, expect, vi, beforeEach } from "vitest";
import { usernameToEmail, registerUser, loginUser, logoutUser } from "./auth";
import { supabase } from "../lib/supabase";

describe("usernameToEmail", () => {
  it("appends the synthetic domain", () => {
    expect(usernameToEmail("budi")).toBe("budi@chatapp.local");
  });

  it("lowercases the username", () => {
    expect(usernameToEmail("Budi123")).toBe("budi123@chatapp.local");
  });
});

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe("registerUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid username without calling Supabase", async () => {
    const result = await registerUser("ab", "password123");
    expect(result.error).toMatch(/username/i);
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("signs up with synthetic email and inserts the user row", async () => {
    (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "users") return { insert };
      return {};
    });

    const result = await registerUser("budi123", "password123");

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "budi123@chatapp.local",
      password: "password123",
    });
    expect(result.error).toBeNull();
  });

  it("maps a 'user already registered' signUp error to Username sudah dipakai", async () => {
    (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered", code: "user_already_exists" },
    });

    const result = await registerUser("budi123", "password123");

    expect(result.error).toBe("Username sudah dipakai.");
  });

  it("maps a signUp error by code even if the message differs in casing", async () => {
    (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: null },
      error: { message: "USER ALREADY REGISTERED", code: "USER_ALREADY_EXISTS" },
    });

    const result = await registerUser("budi123", "password123");

    expect(result.error).toBe("Username sudah dipakai.");
  });
});

describe("loginUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("translates username to synthetic email and signs in", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });

    const result = await loginUser("budi123", "password123");

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "budi123@chatapp.local",
      password: "password123",
    });
    expect(result.error).toBeNull();
  });

  it("returns an error on failed login", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    const result = await loginUser("budi123", "wrong");

    expect(result.error).toBe("Invalid login credentials");
  });
});

describe("logoutUser", () => {
  it("calls supabase signOut", async () => {
    (supabase.auth.signOut as any).mockResolvedValue({ error: null });
    await logoutUser();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
