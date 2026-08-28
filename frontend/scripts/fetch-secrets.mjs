#!/usr/bin/env node
// Pulls every parameter under /united-services/<APP_ENV>/ from AWS SSM
// Parameter Store and prints shell `export` statements for each one, one
// per line, to stdout. Deliberately prints nothing else to stdout (log
// lines go to stderr) — the caller (fetch-secrets.sh) does
// `eval "$(node fetch-secrets.mjs)"`, so any stray stdout output would
// get evaluated as a shell command.
//
// Only needs AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION to
// already be present in the environment (passed into the container from
// the host's .env via docker-compose.yml) — every other secret this app
// needs comes from here, not from a hardcoded default anywhere in the
// Docker files.
import {
  SSMClient,
  GetParametersByPathCommand,
} from '@aws-sdk/client-ssm';

const region = process.env.AWS_REGION;
if (!region) {
  console.error(
    '[fetch-secrets] AWS_REGION is not set — cannot reach SSM Parameter Store. ' +
      'Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION in the host .env.',
  );
  process.exit(1);
}

const appEnv = process.env.APP_ENV;
if (!appEnv) {
  console.error(
    '[fetch-secrets] APP_ENV is not set — cannot pick an SSM path. ' +
      'Set APP_ENV in the host .env (e.g. staging, production).',
  );
  process.exit(1);
}
const path = `/united-services/${appEnv}/`;

// Single-quoted, with embedded single quotes escaped the standard POSIX
// way ('"'"') — values here can contain anything (URLs with query
// strings, JSON, random secret bytes), so this must be bulletproof
// rather than assuming "no special characters."
function shellQuote(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function main() {
  const client = new SSMClient({ region });
  let nextToken;
  let count = 0;

  do {
    const result = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );
    for (const param of result.Parameters ?? []) {
      const name = param.Name.slice(path.length);
      if (!name || param.Value === undefined) continue;
      // stdout ONLY ever gets export lines — this is what fetch-secrets.sh
      // eval's directly.
      console.log(`export ${name}=${shellQuote(param.Value)}`);
      count += 1;
    }
    nextToken = result.NextToken;
  } while (nextToken);

  console.error(
    `[fetch-secrets] loaded ${count} parameter(s) from SSM path ${path}`,
  );
}

main().catch((err) => {
  console.error(`[fetch-secrets] failed to read from SSM: ${err.message}`);
  // Never fatal by itself — a var that's genuinely required (DATABASE_URL,
  // CLERK_SECRET_KEY, etc.) will make the app fail fast and loudly on its
  // own right after this script runs, which is a clearer failure than
  // this script deciding what's "required." A missing/misconfigured SSM
  // path shouldn't be a different kind of crash than a missing env var
  // ever was before this existed.
  process.exit(0);
});
