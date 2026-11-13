# A Student's country comes only from Cloudflare, and an unknown country means full price

`resolveCountry` trusts only Cloudflare's `CF-IPCountry` header (plus a dev-only session override). When the header is missing or `XX`, the country is unknown and the Student pays full price. No page waits on a network call to learn the country.

## Considered Options

- **Look up the first `X-Forwarded-For` address on ip-api.com** (ADR-0008). Rejected: it put a plain-HTTP, rate-limited network call into the course, purchase and lesson loaders.
