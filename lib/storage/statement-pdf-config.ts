import type { StatementPdfBackend } from "@/lib/storage/statement-pdf-ref";

export const STATEMENT_PDF_MAX_BYTES = 15 * 1024 * 1024;
export const STATEMENT_PDF_OPERATION_TIMEOUT_MS = 15_000;

export type StatementPdfConfigError =
  | "MISSING_DURABLE_CONFIG"
  | "INVALID_CONFIG";

export type StatementPdfWriteConfig =
  | { ok: true; backend: "local" }
  | {
      ok: true;
      backend: "s3";
      bucket: string;
      region: string;
      endpoint?: string;
      forcePathStyle: boolean;
      prefix: string;
      allowInsecureHttp: boolean;
    }
  | { ok: false; reason: StatementPdfConfigError; message: string };

export type StatementPdfS3Config = Extract<
  StatementPdfWriteConfig,
  { ok: true; backend: "s3" }
>;

export type StatementPdfEnv = Record<string, string | undefined>;

function read(env: StatementPdfEnv, key: string) {
  return env[key]?.trim() || "";
}

function validatePrefix(prefix: string) {
  if (!prefix) return "";
  const normalized = prefix.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\0") ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    return null;
  }
  return `${normalized}/`;
}

export function resolveStatementPdfWriteConfig(
  env: StatementPdfEnv = process.env,
  nodeEnv = process.env.NODE_ENV,
): StatementPdfWriteConfig {
  const requested = read(env, "BITS_STATEMENT_PDF_BACKEND").toLowerCase();
  const allowLocalProduction =
    read(env, "BITS_STATEMENT_ALLOW_LOCAL_PRODUCTION") === "1";
  const backend: StatementPdfBackend | "" =
    requested === "local" || requested === "s3"
      ? requested
      : requested
        ? ""
        : nodeEnv === "production" && !allowLocalProduction
          ? ""
          : "local";

  if (backend !== "local" && backend !== "s3") {
    return {
      ok: false,
      reason: requested ? "INVALID_CONFIG" : "MISSING_DURABLE_CONFIG",
      message: requested
        ? "BITS_STATEMENT_PDF_BACKEND must be local or s3."
        : "Production statement writes require BITS_STATEMENT_PDF_BACKEND=s3.",
    };
  }

  if (backend === "local") {
    if (nodeEnv === "production" && !allowLocalProduction) {
      return {
        ok: false,
        reason: "MISSING_DURABLE_CONFIG",
        message:
          "Production statement writes require a configured private object store. Set BITS_STATEMENT_PDF_BACKEND=s3 or explicitly allow local writes.",
      };
    }
    return { ok: true, backend: "local" };
  }

  return resolveStatementPdfS3Config(env);
}

export function resolveStatementPdfS3Config(
  env: StatementPdfEnv = process.env,
): StatementPdfWriteConfig {
  const bucket = read(env, "BITS_STATEMENT_S3_BUCKET");
  const region = read(env, "BITS_STATEMENT_S3_REGION");
  const endpoint = read(env, "BITS_STATEMENT_S3_ENDPOINT");
  const allowInsecureHttp =
    read(env, "BITS_STATEMENT_S3_ALLOW_INSECURE_HTTP") === "1";
  const prefix = validatePrefix(read(env, "BITS_STATEMENT_S3_PREFIX"));
  if (!bucket || !region) {
    return {
      ok: false,
      reason: "MISSING_DURABLE_CONFIG",
      message:
        "S3 statement storage requires BITS_STATEMENT_S3_BUCKET and BITS_STATEMENT_S3_REGION.",
    };
  }
  if (prefix == null) {
    return {
      ok: false,
      reason: "INVALID_CONFIG",
      message: "BITS_STATEMENT_S3_PREFIX is not a safe object prefix.",
    };
  }
  if (endpoint) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      return {
        ok: false,
        reason: "INVALID_CONFIG",
        message: "BITS_STATEMENT_S3_ENDPOINT is not a valid URL.",
      };
    }
    if (parsed.protocol === "http:" && !allowInsecureHttp) {
      return {
        ok: false,
        reason: "INVALID_CONFIG",
        message:
          "BITS_STATEMENT_S3_ENDPOINT must use HTTPS unless insecure HTTP is explicitly allowed for local tests.",
      };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        reason: "INVALID_CONFIG",
        message: "BITS_STATEMENT_S3_ENDPOINT must be HTTP or HTTPS.",
      };
    }
  }

  return {
    ok: true,
    backend: "s3",
    bucket,
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: read(env, "BITS_STATEMENT_S3_FORCE_PATH_STYLE") === "1",
    prefix,
    allowInsecureHttp,
  };
}

export function statementStorageDiagnostics(env: StatementPdfEnv = process.env) {
  const write = resolveStatementPdfWriteConfig(env);
  return {
    writeBackend: write.ok ? write.backend : "unconfigured",
    ready: write.ok,
    reason: write.ok ? null : write.reason,
    message: write.ok ? "Statement write backend is configured." : write.message,
    hasBucket: Boolean(read(env, "BITS_STATEMENT_S3_BUCKET")),
    hasRegion: Boolean(read(env, "BITS_STATEMENT_S3_REGION")),
    hasEndpoint: Boolean(read(env, "BITS_STATEMENT_S3_ENDPOINT")),
    endpointUsesHttps: (() => {
      const endpoint = read(env, "BITS_STATEMENT_S3_ENDPOINT");
      if (!endpoint) return null;
      try {
        return new URL(endpoint).protocol === "https:";
      } catch {
        return false;
      }
    })(),
    forcePathStyle: read(env, "BITS_STATEMENT_S3_FORCE_PATH_STYLE") === "1",
    allowLocalProduction:
      read(env, "BITS_STATEMENT_ALLOW_LOCAL_PRODUCTION") === "1",
  };
}
