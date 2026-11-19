import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage, fetchMessages, subscribeToMessages } from "./messages";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}));

describe("sendMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a message row scoped to the conversation", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValue({ insert });

    const result = await sendMessage("conv-1", "user-1", "budi", "text", "halo");

    expect(supabase.from).toHaveBeenCalledWith("messages");
    expect(insert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      uid: "user-1",
      name: "budi",
      type: "text",
      content: "halo",
    });
    expect(result.error).toBeNull();
  });
});

describe("fetchMessages", () => {
  it("returns ordered messages filtered by conversation", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockReturnValue({ select });

    const messages = await fetchMessages("conv-1");

    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("conversation_id", "conv-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(messages).toEqual([{ id: "1" }]);
  });
});

describe("subscribeToMessages", () => {
  it("subscribes with a conversation_id filter and returns an unsubscribe fn", () => {
    const on = vi.fn().mockReturnThis();
    const subscribe = vi.fn().mockReturnThis();
    const unsubscribe = vi.fn();
    (supabase.channel as any).mockReturnValue({ on, subscribe, unsubscribe });

    const onInsert = vi.fn();
    const unsub = subscribeToMessages("conv-1", onInsert);

    expect(supabase.channel).toHaveBeenCalledWith("messages-realtime-conv-1");
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq.conv-1",
      },
      expect.any(Function)
    );
    unsub();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
