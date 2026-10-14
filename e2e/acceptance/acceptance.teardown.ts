import { test as teardown } from "@playwright/test";

import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";

import { runOriginalV1FixtureCli } from "./helpers/fixture-cli";

loadOriginalV1AcceptanceEnvFiles();

teardown("cleanup owned original v1 fixtures", async () => {
  runOriginalV1FixtureCli(["cleanup"], true);
});
