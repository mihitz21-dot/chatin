import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadChatMedia } from "./upload";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe("uploadChatMedia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid files without calling storage", async () => {
    const file = makeFile("a.bmp", "image/bmp", 1024);
    const result = await uploadChatMedia(file, "user-1");
    expect(result.error).toMatch(/format/i);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("uploads a valid image and returns its public url", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/media/user-1/123-a.jpg" },
    });
    (supabase.storage.from as any).mockReturnValue({ upload, getPublicUrl });

    const file = makeFile("a.jpg", "image/jpeg", 1024);
    const result = await uploadChatMedia(file, "user-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("media");
    expect(result.error).toBeNull();
    expect(result.type).toBe("image");
    expect(result.url).toBe("https://example.com/media/user-1/123-a.jpg");
  });
});
