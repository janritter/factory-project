# Modules

Each folder here is a **deep module**: a lot of behaviour behind a small
interface. A module's public surface is its **entry points**, the files at its
root. Everything in its subfolders is private.

```
app/modules/
  <name>/
    index.ts        ← entry point (public). Import this from outside.
    server.ts       ← another entry point. A module may expose several.
    lib/            ← implementation: private, free to import itself.
    tests/          ← tests and fixtures: private to the module's tests.
```

Starter template: `app/modules/example/`. Copy it or delete it.

Run the boundary check with `npm run lint:boundaries` (dependency-cruiser,
config in `.dependency-cruiser.cjs`). It runs over all of `app/`, because the
app-side rule only bites on importers it scans.

## The four rules

**Entry-point boundary.** Code outside a module (routes, other modules) imports
only its entry points, never anything in its subfolders. The route imports
`~/modules/<name>` or `~/modules/<name>/server`, not `~/modules/<name>/lib/...`.

**Intra-module freedom.** A module's own files import each other freely. Only
cross-module and outside-in imports are restricted.

**Tests through entry points.** Files under `tests/` import entry points and
their own `tests/` fixtures. They never import a module's `lib/` or other
internals, not even their own. A test that needs internals is a sign the
interface is missing something.

**No cycles.** No dependency cycles anywhere under `app/`.

## Prefer small entry points to barrels

Don't add a barrel: an `index.ts` that re-exports a whole subtree. Expose
several small entry points instead (`index.ts` for the pure interface,
`server.ts` for the production wiring), each re-exporting only what callers
need. Keep the implementation in subfolders.
