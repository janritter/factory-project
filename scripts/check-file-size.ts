// Pre-commit check: fail if any staged file is over MAX_TOKENS.
// Token estimate is bytes / 4 (cheap approximation).
import { statSync } from "node:fs";

const MAX_TOKENS = 5000;
const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /^drizzle\//,
  /\.(png|jpe?g|gif|webp|ico|svg|woff2?|db|lock)$/,
];

const files = process.argv
  .slice(2)
  .filter((f) => !IGNORED.some((re) => re.test(f)));

const tooBig: { file: string; tokens: number }[] = [];
for (const file of files) {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    continue; // deleted or unreadable
  }
  const tokens = Math.ceil(size / 4);
  if (tokens > MAX_TOKENS) tooBig.push({ file, tokens });
}

if (tooBig.length > 0) {
  console.error(
    `\nCommit blocked: ${tooBig.length} file(s) exceed ${MAX_TOKENS} tokens (estimated as bytes / 4).\n`
  );
  for (const { file, tokens } of tooBig) {
    console.error(`  ${file}  (~${tokens} tokens)`);
  }
  console.error(`
Large files are hard for agents to read and edit. Split each file above:
  1. Read the file and group its contents by responsibility
     (e.g. types, data access, pure logic, UI components, helpers).
  2. Move each group into its own file next to the original, named for
     what it does. Aim for each new file to be well under ${MAX_TOKENS} tokens.
  3. For a module under app/modules/, keep the public interface in the
     existing entry file and re-export from it, so importers don't change
     (see app/modules/README.md).
  4. For a route file, extract components, loaders/actions logic and helpers
     into sibling files and import them back into the route.
  5. For a test file, split by behaviour/feature into multiple *.test.ts files.
  6. Do not shrink the file by deleting code or comments, and do not bypass
     this hook with --no-verify.
  7. Run \`npm run check\`, then re-stage and commit.
`);
  process.exit(1);
}
