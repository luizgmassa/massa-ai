/**
 * WriterQueue unit tests — covers the getters (pendingCount, maxPendingCount,
 * saturated), enqueue success/rejection paths, and chain failure isolation.
 *
 * Pure async tests — no IO, no mocks.
 */
import { describe, test, expect } from "bun:test";
import { WriterQueue, QueueSaturatedError } from "../services/hooks/writer-queue.js";

describe("WriterQueue getters", () => {
  test("maxPendingCount returns the configured cap", () => {
    const q = new WriterQueue(5);
    expect(q.maxPendingCount).toBe(5);
  });

  test("pendingCount starts at 0", () => {
    const q = new WriterQueue(3);
    expect(q.pendingCount).toBe(0);
  });

  test("saturated is false when pending < maxPending", () => {
    const q = new WriterQueue(3);
    expect(q.saturated).toBe(false);
  });

  test("saturated is true when pending >= maxPending", async () => {
    const q = new WriterQueue(1);
    let release: () => void = () => {};
    const block = new Promise<void>((r) => (release = r));
    // Don't await — the work stays in-flight.
    void q.enqueue(async () => {
      await block;
    });
    // Give the chain a tick to increment pending.
    await new Promise((r) => setTimeout(r, 10));
    expect(q.saturated).toBe(true);
    release();
  });
});

describe("WriterQueue enqueue", () => {
  test("enqueued work runs in order and pendingCount tracks in-flight", async () => {
    const q = new WriterQueue(10);
    const order: number[] = [];
    await q.enqueue(async () => {
      order.push(1);
    });
    await q.enqueue(async () => {
      order.push(2);
    });
    expect(order).toEqual([1, 2]);
    expect(q.pendingCount).toBe(0);
  });

  test("throws QueueSaturatedError when full and does not enqueue", async () => {
    const q = new WriterQueue(1);
    let release: () => void = () => {};
    const block = new Promise<void>((r) => (release = r));
    void q.enqueue(async () => {
      await block;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(() => q.enqueue(async () => {})).toThrow(QueueSaturatedError);
    release();
  });

  test("a rejecting work item does not poison the chain", async () => {
    const q = new WriterQueue(5);

    // First work rejects — but the chain must continue.
    await q.enqueue(async () => {
      throw new Error("boom");
    }).catch(() => {});

    // Second work must still run (chain not poisoned).
    let ran = false;
    await q.enqueue(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("QueueSaturatedError has default retryAfterSeconds=1", () => {
    const e = new QueueSaturatedError();
    expect(e.retryAfterSeconds).toBe(1);
    expect(e.message).toContain("saturated");
  });

  test("QueueSaturatedError accepts custom retryAfterSeconds", () => {
    const e = new QueueSaturatedError(5);
    expect(e.retryAfterSeconds).toBe(5);
  });

  test("pendingCount decrements after work completes", async () => {
    const q = new WriterQueue(5);
    await q.enqueue(async () => {});
    expect(q.pendingCount).toBe(0);
  });

  test("pendingCount decrements after work rejects", async () => {
    const q = new WriterQueue(5);
    // Swallow the rejection so the test doesn't fail.
    await q.enqueue(async () => {
      throw new Error("x");
    }).catch(() => {});
    expect(q.pendingCount).toBe(0);
  });
});