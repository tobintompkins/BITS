import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  diagnoseOriginalV1AcceptanceEnv,
  assertOriginalV1PreflightReady,
} from "@/lib/testing/original-v1-acceptance-preflight";

import { runOriginalV1FixtureCli } from "./helpers/fixture-cli";
import { assertIsolatedAcceptanceTarget } from "./helpers/target";

setup("original v1 preflight, Clerk, and isolated fixtures", async () => {
  loadOriginalV1AcceptanceEnvFiles();
  assertOriginalV1PreflightReady(diagnoseOriginalV1AcceptanceEnv());
  const config = parseOriginalV1AcceptanceConfig();
  await clerkSetup();
  await assertIsolatedAcceptanceTarget(config);
  runOriginalV1FixtureCli(["prepare"], true);
});
