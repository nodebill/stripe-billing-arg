import { config as loadEnv } from "dotenv";
import {
  resetDatabase,
  type DatabaseResetScope,
} from "@/infrastructure/database/reset";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

function parseArgs(argv: string[]) {
  let scope: DatabaseResetScope = "billing";
  let force = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--all") {
      scope = "all";
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true as const, scope, force };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false as const, scope, force };
}

function printHelp() {
  console.log(
    [
      "Usage: pnpm db:reset [-- --all] [--force]",
      "",
      "Options:",
      "  --all     Also delete auth data, invites, API keys, and reopen /bootstrap.",
      "  --force   Required when DATABASE_URL is not local.",
    ].join("\n")
  );
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    return;
  }

  const result = await resetDatabase({
    scope: parsed.scope,
    force: parsed.force,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        scope: result.scope,
        tables: result.tables,
        reopenedBootstrap: result.scope === "all",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
