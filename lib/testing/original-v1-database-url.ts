const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_PORT = "5432";
const WORKING_DATABASE_NAMES = new Set([
  "bits",
  "postgres",
  "template0",
  "template1",
]);

export type PostgresTargetIdentity = {
  hostname: string;
  port: string;
  database: string;
  username: string;
};

function normalizeHostname(value: string) {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) return "";
  return LOOPBACK_HOSTS.has(hostname) || LOOPBACK_HOSTS.has(`[${hostname}]`)
    ? "loopback"
    : hostname;
}

export function parsePostgresTargetIdentity(
  url: string,
): PostgresTargetIdentity | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
      return null;
    }

    // Match the installed `pg` driver: `host` and `port` query params override
    // the URL authority. `hostaddr` is parsed onto the leftover config object
    // and never applied as the connection host.
    const hostOverride = parsed.searchParams.get("host")?.trim() || "";
    const hostname = normalizeHostname(hostOverride || parsed.hostname);
    const port =
      parsed.searchParams.get("port")?.trim() || parsed.port || DEFAULT_PORT;
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).split(
      "/",
    )[0];
    if (!hostname || !database) return null;

    return {
      hostname,
      port,
      database,
      username: decodeURIComponent(parsed.username),
    };
  } catch {
    return null;
  }
}

export function postgresTargetIdentityKey(identity: PostgresTargetIdentity) {
  return [identity.hostname, identity.port, identity.database].join("\0");
}

export function postgresTargetsAreEquivalent(left: string, right: string) {
  const a = parsePostgresTargetIdentity(left);
  const b = parsePostgresTargetIdentity(right);
  if (!a || !b) return false;
  return postgresTargetIdentityKey(a) === postgresTargetIdentityKey(b);
}

export function isolatedDatabaseNameIsDedicated(name: string) {
  const database = name.trim().toLowerCase();
  if (!database || WORKING_DATABASE_NAMES.has(database)) {
    return false;
  }
  return /(^|[_-])e2e([_-]|$)/.test(database) || database.endsWith("e2e");
}

export function describePostgresTarget(url: string) {
  const identity = parsePostgresTargetIdentity(url);
  if (!identity) {
    return { ok: false as const, database: null, hostKind: null };
  }
  return {
    ok: true as const,
    database: identity.database,
    hostKind: identity.hostname === "loopback" ? "loopback" : "remote",
    port: identity.port,
  };
}
