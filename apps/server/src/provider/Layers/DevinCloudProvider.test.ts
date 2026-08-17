import { describe, expect, it } from "@effect/vitest";
import { DevinCloudSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import {
  buildInitialDevinCloudProviderSnapshot,
  checkDevinCloudProviderStatus,
} from "./DevinCloudProvider.ts";

const decodeSettings = Schema.decodeSync(DevinCloudSettings);

describe("DevinCloudProvider", () => {
  it.effect("asks for credentials before enabling cloud tasks", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialDevinCloudProviderSnapshot(decodeSettings({}));
      expect(snapshot.status).toBe("warning");
      expect(snapshot.auth.status).toBe("unauthenticated");
      expect(snapshot.models.map((model) => model.slug)).toEqual(["devin-cloud"]);
    }),
  );

  it.effect("reports a valid service-user token as connected", () =>
    checkDevinCloudProviderStatus(
      decodeSettings({ apiKey: "cog_test", organizationId: "org-test" }),
    ).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(request, Response.json({ service_user_id: "user-test" })),
          ),
        ),
      ),
      Effect.tap((snapshot) =>
        Effect.sync(() => {
          expect(snapshot.status).toBe("ready");
          expect(snapshot.auth.status).toBe("authenticated");
        }),
      ),
    ),
  );
});
