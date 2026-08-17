import {
  type DevinCloudSettings,
  type ModelCapabilities,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpClient } from "effect/unstable/http";

import { makeDevinCloudApi } from "../DevinCloudApi.ts";
import { buildServerProvider, type ServerProviderDraft } from "../providerSnapshot.ts";

const PRESENTATION = {
  displayName: "Devin Cloud",
  badgeLabel: "Cloud",
  showInteractionModeToggle: false,
  requiresNewThreadForModelChange: true,
} as const;

const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({ optionDescriptors: [] });
const MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "devin-cloud",
    name: "Devin Cloud",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

export function buildInitialDevinCloudProviderSnapshot(
  settings: DevinCloudSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    if (!settings.enabled) {
      return buildSnapshot(settings, checkedAt, "warning", "unknown", "Devin Cloud is disabled.");
    }
    if (!settings.apiKey || !settings.organizationId) {
      return buildSnapshot(
        settings,
        checkedAt,
        "warning",
        "unauthenticated",
        "Add a Devin service-user API key and organization ID.",
      );
    }
    return buildSnapshot(
      settings,
      checkedAt,
      "warning",
      "unknown",
      "Checking Devin Cloud credentials...",
    );
  });
}

export const checkDevinCloudProviderStatus = Effect.fn("checkDevinCloudProviderStatus")(function* (
  settings: DevinCloudSettings,
) {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  if (!settings.enabled || !settings.apiKey || !settings.organizationId) {
    return yield* buildInitialDevinCloudProviderSnapshot(settings);
  }
  const httpClient = yield* HttpClient.HttpClient;
  const result = yield* makeDevinCloudApi(settings, httpClient).getSelf.pipe(Effect.result);
  if (result._tag === "Success") {
    return buildSnapshot(
      settings,
      checkedAt,
      "ready",
      "authenticated",
      "Connected to Devin Cloud.",
    );
  }
  return buildSnapshot(settings, checkedAt, "error", "unauthenticated", result.failure.message);
});

function buildSnapshot(
  settings: DevinCloudSettings,
  checkedAt: string,
  status: "ready" | "warning" | "error",
  authStatus: "authenticated" | "unauthenticated" | "unknown",
  message: string,
): ServerProviderDraft {
  return buildServerProvider({
    presentation: PRESENTATION,
    enabled: settings.enabled,
    checkedAt,
    models: MODELS,
    probe: {
      installed: true,
      version: null,
      status,
      auth: { status: authStatus },
      message,
    },
  });
}
