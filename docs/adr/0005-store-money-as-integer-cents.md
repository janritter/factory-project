# Store every amount of money as integer cents

Every amount Cadence stores — a course's price, what a Purchase paid, what a Refund gave back — is a whole number of cents in an `integer` column. A floating-point dollar amount drifts under arithmetic (a 30% purchasing-power discount on $79.00 is not exactly representable), and SQLite has no true decimal type to fall back on. Discounts are worked out in cents and rounded once, with `Math.round`, when the Purchase is made.

## Considered Options

- **`real` columns holding dollars.** Rejected: rounding errors show up in totals and Refunds.
- **Decimal strings.** Rejected: every comparison and sum would need parsing, and SQLite would sort them as text.

## Consequences

Any new money column must be an integer of cents. Moving away from this later means migrating every money column and every place that compares amounts.
