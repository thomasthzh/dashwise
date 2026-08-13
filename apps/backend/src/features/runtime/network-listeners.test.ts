import { expect, test } from "bun:test";

import {
  resolveDashboardListenHost,
  resolvePocketBaseListenAddress,
} from "./network-listeners";

test("keeps PocketBase on loopback unless an explicit address is provided", () => {
  expect(resolvePocketBaseListenAddress(undefined)).toBe("127.0.0.1:8090");
  expect(resolvePocketBaseListenAddress(" 127.0.0.1:8092 ")).toBe("127.0.0.1:8092");
});

test("allows the dashboard to bind the IPv6 any-address for dual-stack access", () => {
  expect(resolveDashboardListenHost(undefined)).toBe("0.0.0.0");
  expect(resolveDashboardListenHost(" :: ")).toBe("::");
});
