# Giving the agent a browser

This is how you drive a page in the app, and ask it questions.

It uses [agent-browser](https://github.com/vercel-labs/agent-browser), a CLI
built for exactly this — one command per action, an answer on stdout.

## Once, per machine

For local use. CI installs agent-browser in its workflow.

```bash
npm install -g agent-browser
agent-browser install
```

## Signing in as a user

Most pages need a session. Open the page, then switch user with the form the
DevUI panel posts (`app/components/dev-ui.tsx`) to `/api/switch-user`
(`app/routes/api.switch-user.ts`), which sets the session cookie and redirects
to `redirectTo`:

```bash
agent-browser open http://localhost:5173/courses
agent-browser eval "fetch('/api/switch-user?redirectTo=/',{method:'POST',body:new URLSearchParams({userId:'5'})}).then(r=>r.status)"
```

User 5 is a student enrolled in `building-rest-apis-with-nodejs` in the seeded
database: `scripts/seed.ts` enrolls the first student it creates in that
course. To list the enrolled ids in your local `data.db`:

```bash
sqlite3 -readonly data.db "SELECT e.user_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.slug = 'building-rest-apis-with-nodejs';"
```

## Asking your own question

Start the app with `npm run dev` first. The examples below use
`http://localhost:5173`, the dev server's default address — if `npm run dev`
printed a different one, use that.

A screenshot is pixels. To verify a fix you need a yes or a no, so read the
DOM:

```bash
agent-browser open http://localhost:5173/courses
agent-browser find placeholder "Search courses..." fill "typescript"
agent-browser find role button click --name "Search"

# Did the search reach the URL?
agent-browser get url

# How many course cards came back?
agent-browser get count 'a[href^="/courses/"]'

# What does the empty state say, if there is one?
agent-browser get text main

# Did anything break?
agent-browser errors
agent-browser console
```

The commands worth knowing: `open`, `click`, `fill`,
`find <role|text|label|placeholder> …`, `wait`, `get text|html|attr|count|url`,
`is visible|enabled|checked`, `eval`, `snapshot` (the accessibility tree, with
refs), `screenshot`, `console`, `errors`, `close`. `agent-browser --help` has
the rest.

**Ask the page, do not ask the person.** A change you have not looked at is a
change you are reporting on trust.

Screenshots are PR evidence: a before and an after for a change that shows in
the UI.

## Before and after

Run `origin/main` on a second port beside your branch, with the same data, so
both screenshots come from the same seeded database. From the repo root:

```bash
git worktree add /tmp/before-wt origin/main
ln -s "$PWD/node_modules" /tmp/before-wt/node_modules
cp data.db* .env /tmp/before-wt/
(cd /tmp/before-wt && npx react-router dev --port 5174 &)
```

Sign in on each port (see above), open the same page on both, and take both
screenshots of the same element at the same viewport (`agent-browser screenshot --help`
lists the options). Then stop the second server and remove the worktree:

```bash
lsof -ti :5174 | xargs kill
rm /tmp/before-wt/node_modules
git worktree remove --force /tmp/before-wt
```

The `rm` unlinks the symlink first, so the worktree removal cannot touch the
real `node_modules`.

## Two things that will bite you

**Hydration lags "networkidle".** The button is in the server HTML before
React attaches its `onClick`, so the first click can be a silent no-op. Poll
for the click's effect and click again, rather than waiting a fixed time.

**Vite re-optimizes on the first load.** On a fresh checkout, the first page
load discovers dependencies Vite has not pre-bundled, and pushes a full-page
reload a moment after the response has finished. Absorb it once against a
throwaway load before the real loop; otherwise it lands mid-interaction and
every click after it hits a page that is already navigating away.
