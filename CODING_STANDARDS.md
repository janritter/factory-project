# Coding standards

Formatting, banned syntax and import shape are enforced by tooling, not by this
file. This file holds the judgement calls.

## Fail with a thrown response

A loader or an action that cannot continue throws. The route then has one
success path; a returned error shape gives every component a second path to
forget about.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

Throw `Error` objects, never strings. Catch the narrowest error you can: a bare
`catch` that swallows everything hides the bug you are about to spend a day on.
Log the error itself, not just its message, because the stack is the useful
part.

## Parse untrusted input once, at the edge

Form data, search parameters and request bodies get a zod schema before the
values reach any query. After that the value has a type and nothing checks it
again. `Number("")` is `0`, and `0` is a valid id in most schemas: an empty
`lessonId` once opened lesson 0 for every learner.

## Check permission in the action, not only the loader

A loader guard does not protect an action. They are separate requests. For a
week anybody who was signed in could approve a refund by posting to
`/admin/refunds`.

## Wrap related writes in a transaction

Two writes that must both land, or neither, go in a transaction. (The refund
bug: the refund was approved, the enrollment was never ended, and the learner
kept the course.)

## Soft-delete anything a person can point at

If another row references it, or a person has a link to it, mark it deleted and
filter it out on read. Deleting a lesson used to take the learners' notes and
bookmarks with it.

## Migrations are forward-only

Never edit a migration that has been applied. Write another one.

## Paginate anything that can grow

If the row count is a function of how long the product has been alive, add a
limit. A query with no limit is fine on a seeded database and fatal on a real
one. The instructor's students page timed out on the first big course.

## Query in bulk

One query in a loop is N+1 queries. Use a join, or one query with an `IN`. The
notes loader ran one query per lesson, forty lessons per course.

## Store money as integer cents

Floats cannot hold a tenth. Regional prices came out as `19.990000000000002`.

## Store timestamps as ISO strings in UTC

A local time in a column is a bug waiting for somebody in another country. The
refund window closed a day early for learners in Sydney.

## Inject the clock

Take the time as an argument rather than calling `Date.now()`, so a test can
fix the moment. The refund window tests failed every night at midnight.

## Keep enumerations in the schema file

A status string that the code compares against is an enum in `app/db/schema.ts`,
not a literal repeated in six places. Refund status was `"pending"` in four
files and `"Pending"` in one.

## Let a module own its data

A route asks the module for data and does not import `~/db` or `drizzle-orm`
itself. Import a module through its entry points only, as described in
[app/modules/README.md](./app/modules/README.md). A query in the loader splits
the feature's rules across two files, and the module's tests stop covering what
the page shows.

Read lesson progress through `progressCache`, which falls back to the progress
service when it is cold.

## Arrange tests through the module under test

Test setup calls the module's own functions. When the function you need does
not exist, add it to the module rather than inserting rows directly, so a
change to how the module stores its data leaves its tests alone.

## Name tests for behaviour

`"refuses a refund after the window closes"`, not `"refund test 3"`. Write the
test before the fix, so you know the fix worked. Keep each fixture close to its
test: a shared fixture that every test bends is worse than a little duplication.

## Explain why, not what

Name and extract until a comment is unnecessary. A comment earns its place only
for a _why_ the code cannot express: a constraint, a decision, a link to the
ADR behind it.

## Derive, do not store

If a value can be worked out from another value you already hold, work it out.
Storing it gives you two things that must agree, and one day they will not.

```ts
const [items, setItems] = useState(rows);
const count = items.length;
```

## Compose instead of configuring

A function that takes a `mode` flag and branches on it is two functions that
have not been separated yet. The same goes for a component with a `variant`
prop that changes what it renders rather than how it looks.

## Split a component when it grows a second reason to change

A component that both fetches and lays out is two components. Pull the layout
out and pass it what it needs.

## Keep render pure

Rendering works out what the output is. Anything that touches the outside world
belongs in an effect or an action.

## Prefer pure functions

If a function can be written without reading the clock, the database or the
network, write it that way. It is the only kind of function that is pleasant to
test.

## Copy, then change the copy

Take a copy, change the copy, hand the copy back. A caller that passed you
something does not expect to find it different afterwards.

## Name a boolean as a question

`isPublished`, `hasSeats`, `canRefund`.

## Name a function for what it returns

`getPendingRefunds`, not `queryRefundsTableFilteredByStatus`.

## Select the columns you need

Name the columns. `select *` reads data you do not want and ties the caller to
the shape of the table.

## Index every foreign key

Add the index in the same change that adds the key. Without it, every join is a
table scan.

## Escape what a person typed

Escape anything a person typed before you render it as HTML. Build queries with
parameters, never by joining strings, so a quote in somebody's name cannot take
the page down.

## Keep secrets out of the client bundle

Anything the browser can read is public. Never log a secret.

## Do not abbreviate

`request`, not `req`. `error`, not `e`. The exceptions are `id` and `url`.

## Do one thing per pull request

If the title needs an "and", it is two pull requests. A commit message says
why; the diff already says what.
