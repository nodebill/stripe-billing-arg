import { config as loadEnv } from "dotenv";
import type { BootstrapAdminInput } from "@/modules/bootstrap/types";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

type ParsedArgs = {
  help: boolean;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
};

function readOption(argv: string[], index: number, name: string) {
  const current = argv[index];
  const prefix = `${name}=`;

  if (current === name) {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${name}`);
    }

    return {
      value: next,
      consumed: 2,
    };
  }

  if (current.startsWith(prefix)) {
    return {
      value: current.slice(prefix.length),
      consumed: 1,
    };
  }

  return null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
  };

  for (let index = 0; index < argv.length; ) {
    const arg = argv[index];

    if (arg === "--") {
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      index += 1;
      continue;
    }

    const email = readOption(argv, index, "--admin-email");
    if (email) {
      parsed.adminEmail = email.value;
      index += email.consumed;
      continue;
    }

    const name = readOption(argv, index, "--admin-name");
    if (name) {
      parsed.adminName = name.value;
      index += name.consumed;
      continue;
    }

    const password = readOption(argv, index, "--admin-password");
    if (password) {
      parsed.adminPassword = password.value;
      index += password.consumed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(
    [
      "Usage: pnpm bootstrap:seed -- --admin-email=... --admin-name=... --admin-password=...",
      "",
      "Options:",
      "  --admin-email      Email for the first admin if auth is empty",
      "  --admin-name       Name for the first admin if auth is empty",
      "  --admin-password   Password for the first admin if auth is empty",
      "  --help             Show this message",
      "",
      "Environment fallbacks:",
      "  PENTOS_BOOTSTRAP_ADMIN_EMAIL",
      "  PENTOS_BOOTSTRAP_ADMIN_NAME",
      "  PENTOS_BOOTSTRAP_ADMIN_PASSWORD",
    ].join("\n")
  );
}

function resolveAdminInput(parsed: ParsedArgs): BootstrapAdminInput | undefined {
  const email =
    parsed.adminEmail ?? process.env.PENTOS_BOOTSTRAP_ADMIN_EMAIL ?? "";
  const name = parsed.adminName ?? process.env.PENTOS_BOOTSTRAP_ADMIN_NAME ?? "";
  const password =
    parsed.adminPassword ?? process.env.PENTOS_BOOTSTRAP_ADMIN_PASSWORD ?? "";

  if (!email && !name && !password) {
    return undefined;
  }

  return {
    email,
    name,
    password,
  };
}

async function closeRuntimeConnections() {
  const runtime = globalThis as typeof globalThis & {
    __stripeBillingPGlite?: { close: () => Promise<void> };
    __stripeBillingPool?: { end: () => Promise<void> };
  };

  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    return;
  }

  const { bootstrapAccountAndCatalog } = await import("@/modules/bootstrap/service");
  const result = await bootstrapAccountAndCatalog({
    admin: resolveAdminInput(parsed),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRuntimeConnections();
  });
