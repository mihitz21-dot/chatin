import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadAvatar, updateProfile, changePassword } from "./profile";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    storage: { from: vi.fn() },
    from: vi.fn(),
    auth: { signInWithPassword: vi.fn(), updateUser: vi.fn() },
  },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe("uploadAvatar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid files", async () => {
    const file = makeFile("a.bmp", "image/bmp", 1024);
    const result = await uploadAvatar(file, "user-1");
    expect(result.error).toMatch(/format/i);
  });

  it("uploads to the avatars bucket and returns the public url", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/avatars/user-1/123-a.jpg" },
    });
    (supabase.storage.from as any).mockReturnValue({ upload, getPublicUrl });

    const file = makeFile("a.jpg", "image/jpeg", 1024);
    const result = await uploadAvatar(file, "user-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("avatars");
    expect(result.url).toBe("https://example.com/avatars/user-1/123-a.jpg");
  });
});

describe("updateProfile", () => {
  it("updates name and avatar_url for the given uid", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockReturnValue({ update });

    const result = await updateProfile("user-1", "Budi", "https://example.com/a.jpg");

    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(update).toHaveBeenCalledWith({ name: "Budi", avatar_url: "https://example.com/a.jpg" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
    expect(result.error).toBeNull();
  });
});

describe("changePassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies the current password before updating", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });
    (supabase.auth.updateUser as any).mockResolvedValue({ error: null });

    const result = await changePassword("oldpass", "newpass123", "budi@chatapp.local");

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "budi@chatapp.local",
      password: "oldpass",
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "newpass123" });
    expect(result.error).toBeNull();
  });

  it("returns an error when the current password is wrong", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    const result = await changePassword("wrong", "newpass123", "budi@chatapp.local");

    expect(result.error).toMatch(/password lama/i);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
});
