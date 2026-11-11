import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Same evaluation steps as Railway CLI 5.71.0 src/iac/eval.rs.
const file = process.argv[2];
const input = JSON.parse(process.env.RAILWAY_IAC_CONTEXT || "{}");
const environment = input.environment ?? input.environmentName ?? undefined;

function fallbackContext(payload) {
  return {
    ...payload,
    ...(environment ? { environment, environmentName: environment } : {}),
    isEnvironment: (name) => environment === name,
    randomString: (label = "random", bytes = 12) =>
      createHash("sha256")
        .update(`railway-iac:${environment ?? "default"}:${label}`)
        .digest("hex")
        .slice(0, bytes * 2),
    shared: new Proxy(
      {},
      {
        get: (_target, name) => {
          if (typeof name !== "string" || name.startsWith("_")) return undefined;
          return { type: "sharedReference", name };
        },
      },
    ),
  };
}

let ctx = fallbackContext(input);
try {
  const iac = await import("railway/iac");
  if (typeof iac.createRailwayContext === "function") {
    ctx = iac.createRailwayContext(input);
  }
} catch {
  // The CLI falls back when the SDK import is unavailable.
}

const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
const partial = mod.partial ?? mod.PARTIAL ?? mod.Partial ?? undefined;
let exported = mod.default ?? mod.main ?? mod.Railway ?? mod;
while (
  exported &&
  typeof exported === "object" &&
  "default" in exported &&
  exported.name == null &&
  exported.resources == null
) {
  exported = exported.default;
}
const projectFactory = (name, definition = {}) => {
  const resources =
    (definition.resources ?? definition.services ?? []).flat?.() ??
    definition.resources ??
    [];
  return { name, ...definition, resources };
};
const project =
  typeof exported === "function" ? await exported(ctx, projectFactory) : exported;
const graph =
  project && typeof project === "object" && "to_graph" in project
    ? project.to_graph()
    : project;
process.stdout.write(JSON.stringify({ partial, project: graph }));
