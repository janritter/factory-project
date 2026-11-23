# Lint rules backlog

Mechanical rules removed from `CODING_STANDARDS.md` in the retro of that file.
None of them is enforced yet. Apply them, then delete this file.

## Wiring (do first)

- `package.json`: add `"format:check": "prettier --check ."` and
  `"lint": "eslint ."`; append both to `check`.
- Pre-commit hook (husky or lefthook): run prettier on staged files.
- CI: one job running `npm run check`.
- `tsconfig.json`: add `"noUncheckedIndexedAccess": true`.

## Prettier (already configured in `.prettierrc`, not yet enforced)

Two-space indent, semicolons, double quotes, trailing commas (`es5`), 80
columns, `arrowParens: always`, no trailing whitespace, final newline.

## ESLint

| Former rule                       | Rule                                                                      |
| --------------------------------- | ------------------------------------------------------------------------- |
| No `any`                          | `@typescript-eslint/no-explicit-any`                                      |
| No `!`                            | `@typescript-eslint/no-non-null-assertion`                                |
| `===`, never `==`                 | `eqeqeq`                                                                  |
| `const` unless reassigned         | `prefer-const`, `no-var`                                                  |
| No `console.log`                  | `no-console` with `allow: ["error"]`                                      |
| Throw `Error`, never a string     | `no-throw-literal`                                                        |
| No catch-and-rethrow              | `no-useless-catch`                                                        |
| Files under 500 lines             | `max-lines` (500, skip blanks and comments)                               |
| Functions under 50 lines          | `max-lines-per-function` (50)                                             |
| At most 3 parameters              | `max-params` (3)                                                          |
| At most 3 nesting levels          | `max-depth` (3)                                                           |
| No abbreviations                  | `id-denylist`: `req`, `res`, `e`, `err`, `ctx`                            |
| TODO has name and date            | `no-warning-comments` with a pattern, or a small custom rule              |
| Default exports only for routes   | `import/no-default-export`, override off for `app/routes/**`              |
| Imports sorted                    | `import/order` (packages, aliases, relative; alphabetise)                 |
| Stable list keys                  | `react/no-array-index-key`                                                |
| Effects declare dependencies      | `react-hooks/exhaustive-deps` (error)                                     |
| `rel="noopener noreferrer"`       | `react/jsx-no-target-blank`                                               |
| Alt text on images                | `jsx-a11y/alt-text`                                                       |
| Label on every input              | `jsx-a11y/label-has-associated-control`                                   |
| No positive `tabIndex`            | `jsx-a11y/tabindex-no-positive`                                           |
| Semantic elements                 | `jsx-a11y/click-events-have-key-events`, `no-static-element-interactions` |
| Heading order                     | `jsx-a11y/heading-has-content`; order needs a custom check                |
| No skipped tests                  | `vitest/no-disabled-tests`, `vitest/no-focused-tests`                     |
| No commented-out code             | `eslint-plugin-no-commented-code` or equivalent                           |
| `interface` for object shapes     | `@typescript-eslint/consistent-type-definitions: interface`               |
| No type the compiler can infer    | `@typescript-eslint/no-inferrable-types`                                  |
| Arrow functions for callbacks     | `prefer-arrow-callback`                                                   |
| Prefer composition over `variant` | not mechanical; stays in the standards file                               |

### `no-restricted-syntax` entries

- `formData.get(...) as string`: selector
  `TSAsExpression > CallExpression[callee.property.name="get"]`.
- `Date.now()` and `new Date()` outside tests and `app/lib/clock`: selector on
  `MemberExpression[object.name="Date"][property.name="now"]`.
- Raw hex in `className` or `style`: `Literal[value=/#[0-9a-fA-F]{3,8}\b/]`
  inside JSX attributes. Use the design tokens.
- Inline `style` other than a computed value: `JSXAttribute[name.name="style"]`
  whose value is an object of literals.
- One export per line: `ExportNamedDeclaration` with several specifiers.

### Decision made during the retro

`interface` versus `type` contradicted itself (object shapes took `interface`,
component props took `type`). Resolution: `interface` for object shapes,
`type` for unions, and props follow the same rule. Add a
`consistent-type-definitions` override only if the team wants props as `type`.

## dependency-cruiser (`.dependency-cruiser.cjs`)

- Forbid `app/routes/**` importing `~/db` or `drizzle-orm`.
- Forbid `app/routes/**` importing the progress table; routes use
  `progressCache`.

## Git hooks and CI

- Fail on a lockfile change that no `package.json` change explains.
- Fail on committed generated files (`.react-router`, build output).
- Branch name matches the ticket: a `commit-msg` or `pre-push` check.
- Conventional Commits subject at most 72 characters (`commitlint`).
- Rebase and squash before landing: repository setting, not a rule.

## Schema test (vitest)

- No money column uses `real` or a float type; money columns are integers.
- Timestamp columns are text holding ISO strings.
