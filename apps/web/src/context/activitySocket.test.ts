import { describe, expect, test } from "bun:test";

import { closeActivitySocket } from "./activitySocket";

function fakeSocket(readyState: number) {
  let closeCount = 0;
  const socket = {
    readyState,
    onopen: null as (() => void) | null,
    onclose: () => undefined,
    onmessage: () => undefined,
    close: () => { closeCount += 1; },
  };
  return { socket, closeCount: () => closeCount };
}

describe("activity socket cleanup", () => {
  test("waits for a connecting socket to open before closing it", () => {
    const { socket, closeCount } = fakeSocket(0);

    closeActivitySocket(socket as unknown as WebSocket);

    expect(closeCount()).toBe(0);
    expect(socket.onclose).toBeNull();
    expect(socket.onmessage).toBeNull();
    socket.onopen?.();
    expect(closeCount()).toBe(1);
  });

  test("closes an established socket immediately", () => {
    const { socket, closeCount } = fakeSocket(1);

    closeActivitySocket(socket as unknown as WebSocket);

    expect(closeCount()).toBe(1);
  });
});
