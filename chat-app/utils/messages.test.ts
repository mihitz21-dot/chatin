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

  it("inserts a message row", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValue({ insert });

    const result = await sendMessage("user-1", "budi", "text", "halo");

    expect(supabase.from).toHaveBeenCalledWith("messages");
    expect(insert).toHaveBeenCalledWith({
      uid: "user-1",
      name: "budi",
      type: "text",
      content: "halo",
    });
    expect(result.error).toBeNull();
  });
});

describe("fetchMessages", () => {
  it("returns ordered messages", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    const select = vi.fn().mockReturnValue({ order });
    (supabase.from as any).mockReturnValue({ select });

    const messages = await fetchMessages();

    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(messages).toEqual([{ id: "1" }]);
  });
});

describe("subscribeToMessages", () => {
  it("subscribes to postgres_changes inserts on messages and returns an unsubscribe fn", () => {
    const on = vi.fn().mockReturnThis();
    const subscribe = vi.fn().mockReturnThis();
    const unsubscribe = vi.fn();
    (supabase.channel as any).mockReturnValue({ on, subscribe, unsubscribe });

    const onInsert = vi.fn();
    const unsub = subscribeToMessages(onInsert);

    expect(supabase.channel).toHaveBeenCalledWith("messages-realtime");
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      expect.any(Function)
    );
    unsub();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
