import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import { previewOrApplyFirstAdminBootstrap } from "@/server/services/staff-first-admin-bootstrap";

loadOriginalV1AcceptanceEnvFiles();

function arg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const applyAuthorized = process.env.BITS_STAFF_BOOTSTRAP_APPLY === "1";
  const result = await previewOrApplyFirstAdminBootstrap({
    organizationId: arg("organization-id"),
    clerkUserId: arg("clerk-user-id"),
    approvalNote: arg("approval-note"),
    apply,
    applyAuthorized,
  });

  if (!result.ok) {
    process.stderr.write(`${result.code}: ${result.message}\n`);
    process.exit(2);
  }

  process.stdout.write(`${result.message}\n`);
  if (result.applied) {
    process.stdout.write(
      `membership ${result.membershipId} granted on organization ${result.organizationId}\n`,
    );
  } else {
    process.stdout.write(
      `dry-run organization=${result.organizationId} clerkUser=${result.clerkUserId} createUserAccount=${result.wouldCreateUserAccount}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "first-admin bootstrap failed"}\n`,
  );
  process.exit(2);
});
