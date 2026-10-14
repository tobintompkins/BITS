import type { OriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";
import { timingSafeStringEquals } from "@/lib/testing/original-v1-target-token";

export async function assertIsolatedAcceptanceTarget(
  config: OriginalV1AcceptanceConfig,
) {
  const url = `${config.baseUrl}/api/e2e/original-v1-target`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${config.targetToken}` },
    });
  } catch {
    throw new Error(
      `Original v1 acceptance cannot reach ${config.baseUrl}. Start the app against the isolated database with BITS_E2E_ACCEPTANCE=1 and BITS_E2E_TARGET_TOKEN set. Live acceptance is blocked.`,
    );
  }

  if (response.status === 404) {
    throw new Error(
      "The server at PLAYWRIGHT_BASE_URL is not the isolated original-v1 acceptance target (BITS_E2E_ACCEPTANCE=1). Fixture mutations were not sent to it.",
    );
  }
  if (!response.ok) {
    throw new Error(
      "The isolated-target probe rejected the configured token. Live original-v1 acceptance is blocked.",
    );
  }

  const body = (await response.json()) as { fingerprint?: string };
  if (
    !body.fingerprint ||
    !timingSafeStringEquals(config.expectedFingerprint, body.fingerprint)
  ) {
    throw new Error(
      "The running server DATABASE_URL does not match BITS_E2E_DATABASE_URL. Original v1 acceptance refuses to continue against the wrong database.",
    );
  }
}
