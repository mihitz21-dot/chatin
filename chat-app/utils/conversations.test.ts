import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOtherUsers, fetchConversations, getOrCreateConversation } from "./conversations";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("fetchOtherUsers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects users excluding myUid", async () => {
    const neq = vi.fn().mockResolvedValue({
      data: [{ id: "u2", username: "budi", name: "Budi", avatar_url: null }],
    });
    const select = vi.fn().mockReturnValue({ neq });
    (supabase.from as any).mockReturnValue({ select });

    const result = await fetchOtherUsers("u1");

    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(select).toHaveBeenCalledWith("id, username, name, avatar_url");
    expect(neq).toHaveBeenCalledWith("id", "u1");
    expect(result).toEqual([{ id: "u2", username: "budi", name: "Budi", avatar_url: null }]);
  });
});

describe("getOrCreateConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("orders ids canonically and returns an existing conversation", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "conv-1" } });
    const eqB = vi.fn().mockReturnValue({ maybeSingle });
    const eqA = vi.fn().mockReturnValue({ eq: eqB });
    const select = vi.fn().mockReturnValue({ eq: eqA });
    (supabase.from as any).mockReturnValue({ select });

    const result = await getOrCreateConversation("u2", "u1");

    expect(eqA).toHaveBeenCalledWith("user_a_id", "u1");
    expect(eqB).toHaveBeenCalledWith("user_b_id", "u2");
    expect(result).toEqual({ id: "conv-1", error: null });
  });

  it("creates a new conversation when none exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null });
    const eqB = vi.fn().mockReturnValue({ maybeSingle });
    const eqA = vi.fn().mockReturnValue({ eq: eqB });
    const select = vi.fn().mockReturnValue({ eq: eqA });
    const single = vi.fn().mockResolvedValue({ data: { id: "conv-new" }, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    (supabase.from as any).mockReturnValue({ select, insert });

    const result = await getOrCreateConversation("u1", "u2");

    expect(insert).toHaveBeenCalledWith({ user_a_id: "u1", user_b_id: "u2" });
    expect(result).toEqual({ id: "conv-new", error: null });
  });
});
