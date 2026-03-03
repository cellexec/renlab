/**
 * Strip internal Node.js / Next.js env vars that leak from the parent process
 * and break child processes.
 *
 * - NODE_CHANNEL_FD causes EBADF on posix_spawn
 * - __NEXT_PROCESSED_ENV makes child Next.js skip .env loading
 * - __NEXT_PRIVATE_ORIGIN sets wrong origin for child servers
 * - NEXT_* / __NEXT_* vars generally bleed parent config into children
 */
const STRIP_VARS = [
  "NODE_CHANNEL_FD",
  "NODE_CHANNEL_SERIALIZATION_MODE",
];

const STRIP_PREFIXES = [
  "__NEXT_",
  "NEXT_",
];

export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  for (const key of STRIP_VARS) {
    delete env[key];
  }
  for (const key of Object.keys(env)) {
    if (STRIP_PREFIXES.some((p) => key.startsWith(p))) {
      delete env[key];
    }
  }
  return env;
}
