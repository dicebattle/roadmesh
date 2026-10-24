import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { startService } from "../tools/ingestion_service.js";
import type { ServiceConfig } from "../tools/ingestion_types.js";
test("Service uses persisted monotonic clock after IPC and old-config restart / 서비스는 IPC와 과거 설정 재시작 후 영속 단조 시계를 사용", async () => {
  const config: ServiceConfig = {
    store: {
      database_url: "private",
      namespace: "clock-test",
      graph_id: "a".repeat(64),
      matching_policy: "seoul-observed-v2",
    },
    credentials: [
      {
        token: "private-clock-token-".repeat(3),
        principal: {
          contributor_id: "person",
          vehicle_id: "car",
          consent_version: "pilot-consent-v1",
        },
      },
    ],
    event_time_utc: "2026-10-24T00:00:00Z",
  };
  let persisted = "2026-10-24T00:20:00.000Z";
  const received: string[] = [];
  const store = {
    initialize: async () => {},
    close: async () => {},
    advanceEventTime: async (time: string) => {
      if (Date.parse(time) > Date.parse(persisted))
        persisted = new Date(time).toISOString();
      return persisted;
    },
    accept: async (_principal: unknown, _value: unknown, time: string) => {
      received.push(time);
      return {
        code: "ACCEPTED" as const,
        trip_id: "trip",
        state: "READY" as const,
        sample_count: 1,
        batch_count: 1,
      };
    },
    inspect: async () => ({
      counts: {
        contributors: 0,
        trips: 0,
        batches: 0,
        samples: 0,
        raw_payloads: 0,
        traversals: 0,
        events: 0,
      },
      trips: [],
      traversals: [],
    }),
    revoke: async () => {},
  };
  const send = async (port: number) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/v1/observations/batches`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${config.credentials[0]!.token}` },
        body: "{}",
      },
    );
    assert.equal(response.status, 202);
    await response.json();
  };
  let service = await startService(config, store);
  try {
    await send(service.port);
    process.emit(
      "message",
      { type: "EVENT_TIME", event_time_utc: "2026-10-24T00:30:00.000Z" },
      undefined,
    );
    await setImmediate();
    await send(service.port);
  } finally {
    await service.close();
  }
  service = await startService(config, store);
  try {
    await send(service.port);
  } finally {
    await service.close();
  }
  assert.deepEqual(received, [
    "2026-10-24T00:20:00.000Z",
    "2026-10-24T00:30:00.000Z",
    "2026-10-24T00:30:00.000Z",
  ]);
});
