# Send email through Postmark, and write it to `.outbox/` without a token

Cadence sends every email through Postmark's HTTP API when `POSTMARK_SERVER_TOKEN` is set, rather than running its own SMTP server. Without a token (local dev, tests) each message is written to `.outbox/` as a JSON file instead, so it can be read without sending anything.
