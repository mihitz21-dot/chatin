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
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as never);

    const file = makeFile("a.jpg", "image/jpeg", 1024);
    const result = await uploadChatMedia(file, "user-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("media");
    expect(result.error).toBeNull();
    expect(result.type).toBe("image");
    expect(result.url).toBe("https://example.com/media/user-1/123-a.jpg");
  });

  it("stores the file under {uid}/{timestamp}-{filename}", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/media/user-1/x" },
    });
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as never);

    await uploadChatMedia(makeFile("a.jpg", "image/jpeg", 1024), "user-1");

    const path = upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^user-1\/\d+-a\.jpg$/);
  });

  it("returns the storage error message when upload fails", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "some storage error" } });
    const getPublicUrl = vi.fn();
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as never);

    const result = await uploadChatMedia(makeFile("a.jpg", "image/jpeg", 1024), "user-1");

    expect(result).toEqual({ url: null, error: "some storage error", type: null });
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("rejects files whose MIME type is neither image nor video", async () => {
    const file = makeFile("doc.pdf", "application/pdf", 1024);
    const result = await uploadChatMedia(file, "user-1");

    expect(result).toEqual({ url: null, error: "Format file tidak didukung.", type: null });
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("uploads a valid video and returns type video", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/media/user-1/123-clip.mp4" },
    });
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as never);

    const file = makeFile("clip.mp4", "video/mp4", 1024);
    const result = await uploadChatMedia(file, "user-1");

    expect(result.error).toBeNull();
    expect(result.type).toBe("video");
    expect(result.url).toBe("https://example.com/media/user-1/123-clip.mp4");
  });
});
