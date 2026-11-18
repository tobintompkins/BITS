import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { assertAgeRecipient } from "../lib/ops/independent-backup-guard";

const identityPath = join(
  homedir(),
  "Library",
  "Application Support",
  "BITS",
  "independent-backup",
  "age-identity.txt",
);

function main() {
  if (process.argv.includes("--print-path")) {
    process.stdout.write(`${identityPath}\n`);
    return;
  }
  if (existsSync(identityPath)) {
    process.stderr.write("An age identity already exists outside the repository. It was left unchanged.\n");
    process.exit(2);
  }
  mkdirSync(dirname(identityPath), { recursive: true, mode: 0o700 });
  const age = spawnSync("age-keygen", ["-o", identityPath], { encoding: "utf8" });
  if (age.error && "code" in age.error && age.error.code === "ENOENT") {
    process.stderr.write("age-keygen is not installed. Install age, then run this setup again.\n");
    process.exit(2);
  }
  if (age.status !== 0) {
    process.stderr.write("age-keygen did not create the identity file.\n");
    process.exit(age.status ?? 1);
  }
  chmodSync(identityPath, 0o600);
  const identity = readFileSync(identityPath, "utf8");
  const recipient = identity
    .split("\n")
    .find((line) => line.startsWith("# public key:"))
    ?.replace("# public key:", "")
    .trim();
  const publicKey = assertAgeRecipient(recipient);
  process.stdout.write(`${publicKey}\n`);
  process.stderr.write(
    "Private key written outside the repository. Copy it to one offline location. Do not commit it or paste it into chat.\n",
  );
}

main();
