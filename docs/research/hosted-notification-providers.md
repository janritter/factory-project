# Hosted notification providers for Cadence in-app notifications

Research for GitHub issue #3 (child of wayfinder map #2). Checked on 2026-11-13.

## Question

Which hosted notification provider should Cadence use for v1 in-app notifications (feed/inbox, unread badge, read/unread, mark-all-read, link-only, event-triggered)? Hard requirement: a usable free tier. Nice to have: EU data residency. Preferences and other channels are a plus for later.

## Recommendation

**Novu Cloud, with the account created in the EU (Frankfurt) region.**

- It is the only candidate that meets every criterion on a free plan: EU region on Free, a prebuilt `<Inbox />` plus headless hooks, HMAC-signed subscriber hashes, a server SDK, and preferences.
- The main open risk is a 24-hour feed retention limit on Free (see caveats). Confirm it before committing.

## Runner-up

**Knock.** Best prebuilt popover DX, a clear signed-token model (RS256 JWT), and a generous message quota on Free. Two blockers today: no EU data residency yet (Knock says "by the end of 2026"), and a Free cap of 500 in-app "guide" recipients per month.

Courier is the fallback if EU residency becomes a hard requirement and a paid plan is acceptable: its EU datacenter is available on Business and Enterprise only.

## Comparison

| | Novu Cloud | Knock | Courier | MagicBell | SuprSend |
|---|---|---|---|---|---|
| React in-app UI | Prebuilt `<Inbox />` (`@novu/react`) and headless hooks | Prebuilt `NotificationFeedPopover`, `NotificationIconButton`, `NotificationFeed` (`@knocklabs/react`); headless also exists | Prebuilt `CourierInbox` and `CourierInboxPopupMenu` (`@trycourier/courier-react`); headless APIs exist per Courier blog | Prebuilt `Inbox` and `FloatingInbox` (`@magicbell/react`); headless `useNotifications` hook per search (unverified in docs) | Prebuilt drop-in (`@suprsend/react`) and headless (`@suprsend/react-core`) |
| Real-time | Socket (`wss://socket.novu.co`, EU `wss://eu.socket.novu.co`) | Socket; reconnects after tab inactivity | WebSocket (`wss://realtime.courier.io`, EU `wss://realtime.eu.courier.io`) | Not documented | Not documented |
| Free tier | $0: 10,000 workflow runs/month; subscribers "unlimited"; 24h feed retention | $0: 10,000 messages/month; 500 guide (in-app) recipients/month; unlimited profiles | $0 Developer: up to 10k sends/month, US only | $0 Builder: 1,000 deliveries/month (per channel), 1 project | $0 Free: 10,000 notifications/month; in-app feed shows SuprSend branding |
| EU residency | Yes: Frankfurt, on all plans. Chosen at account creation, bound to the account (no self-migration) | Not yet ("expected by end of 2026") | Only on paid Business and Enterprise ($0.005/send, EU Ireland) | Not documented | Workspace data region includes EU per security docs; no EU API host found |
| Server Node SDK | `@novu/api` (`trigger`, `serverURL` for EU) | `@knocklabs/node` (`workflows.trigger`) | `@trycourier/courier` (`client.send.message`), Node 20+ | `magicbell-js` (`broadcasts.createBroadcast`) | SuprSend Node SDK (`workflows.trigger`) |
| User identity / client auth | `subscriberId` (string; Cadence int as string). HMAC-SHA256 `subscriberHash` computed server-side; mandatory in production | `user` id plus signed user token (JWT, RS256, `sub` required, `exp` recommended) when enhanced security is on | `courier.shared.signIn({ userId, jwt })`; JWT from backend with API key | User JWT generated on backend with secret key and API key | Signed JWT user tokens (claims not extracted) |
| Preferences | Yes (Inbox sub-component); not gated by plan per fetched pages | Yes, all plans; per-tenant is Enterprise | Hosted preference center; embedding documented (plan not confirmed) | Not checked | Business plan ($250/mo) and up |
| Other channels | Email, in-app, SMS, chat, push on Free | All channels on all plans | Multi-channel | Multi-channel, billed per delivery | Email, SMS, WhatsApp, push, Slack, Teams, webhook; all on Free |
| React Router 7 SSR | Not documented. Prebuilt UI needs client-only render (inference) | Not documented. Browser SDK (inference) | Not documented; inbox calls Courier from the browser per CSP docs | Not documented. `redirectUrl` uses `location.href` | Not documented |

## Per-provider notes

### Novu Cloud (recommended)

- **Pricing:** Free $0, Pro from $30/mo, Team from $250/mo. Free includes 10,000 workflow runs/month, 5 workflows, 2 environments, 3 team members, and "US + EU data residency." Overage on Pro is $1.20 per 1K runs. [novu.co/pricing](https://www.novu.co/pricing)
- **EU region:** Frankfurt, Germany, on all plans. The region is chosen at account creation and API keys are bound to it. Pointing an SDK at the other region's endpoint with the same key returns 401. Switching regions needs sales. EU endpoint `https://eu.api.novu.co/v1` (from a search snippet of Novu's docs, not fetched; verify). [Novu security](https://docs.novu.co/platform/additional-resources/security)
- **Inbox:** `@novu/react` `<Inbox />` encapsulates bell, notifications, and preferences. Headless hooks from `@novu/react` or `@novu/js` are available for a custom UI. React 18 or 19 required. Unread count on the bell is real time. Mark-as-read is supported; mark-all-read is not mentioned in the Inbox overview. [Inbox overview](https://docs.novu.co/platform/inbox/overview), [headless mode](https://docs.novu.co/platform/inbox/headless-mode)
- **Auth:** Subscriber ID is a string, so Cadence integer ids map as `"42"`. HMAC-SHA256 over the subscriber ID with the Novu secret key, computed on the server, lowercase hex. Mandatory in production; the Inbox won't load without it. Secret key must never reach the client. [Prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)
- **Server SDK:** `@novu/api` with `trigger` and a `workflowId` plus recipients. Subscriber objects use `subscriberId`. [Novu TypeScript SDK](https://docs.novu.co/platform/sdks/server/typescript)
- **Retention:** Activity feed retention is 24 hours on Free, 7 days on Pro, 90 days on Team. The page wording is "activity feed"; unclear whether this covers Inbox items. Must confirm.

### Knock

- **Pricing:** Free $0, Starter $250/mo plus usage, Enterprise custom. Free: up to 10,000 messages/month, up to 500 guide recipients/month, up to 500 agent credits/month. Unlimited profiles, workflow triggers, feeds per recipient, and feed retention. Knock does not hard-cap overages; it asks you to set up billing. [knock.app/pricing](https://knock.app/pricing). Knock's plans doc says Free was "formerly known as our Developer plan" and defers current volumes to the pricing page. [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)
- **EU residency:** Not available. Quote: "We expect to support EU data residency by the end of 2026." [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)
- **React:** `@knocklabs/react` is "pre-built" with a real-time feed. Components: `KnockProvider` (`apiKey`, `user`), `KnockFeedProvider` (`feedId`, `colorMode`, `defaultFeedOptions`), `NotificationIconButton` (`badgeCountType="unread"`), `NotificationFeedPopover`, `NotificationFeed`. Feed marks items seen when the popover opens by default; use `onOpen` plus `markAsRead` to change. [Feed component](https://docs.knock.app/in-app-ui/react/feed), [KnockFeedProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-feed-provider)
- **Security:** Enhanced security mode is off by default and must be turned on for production. When on, Knock rejects requests without a signed user token: RS256 JWT, `sub` required, `iat`/`exp` recommended, key from Platform > API keys. [Security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication)
- **Server SDK:** `@knocklabs/node`, `workflows.trigger` (formerly `notify()` per v1 migration). [knock-node](https://github.com/knocklabs/knock-node), [Node migration](https://docs.knock.app/developer-tools/migration-guides/node)
- **Preferences:** Available on all plans; per-tenant preferences are Enterprise.

### Courier

- **Pricing:** Developer "Free," up to 10k sends/month. Business $0.005 per send, pay-as-you-go, with no included sends. Enterprise custom. [courier.com/pricing](https://www.courier.com/pricing)
- **EU residency:** EU datacenter (Ireland) is "available on every paid plan: Business and Enterprise." Self-serve setup in the EU console. The Free plan cannot use it. [EU datacenter](https://www.courier.com/docs/platform/workspaces/eu-datacenter)
- **React:** `@trycourier/courier-react`; `CourierInbox` (inline) and `CourierInboxPopupMenu` (bell popover with unread badge); `useCourier` hook. Real-time via WebSocket. Components style themselves inline, so CSP needs `style-src 'unsafe-inline'`. [Add an inbox](https://www.courier.com/docs/in-app/add-an-inbox)
- **Auth:** `courier.shared.signIn({ userId, jwt })`; JWT issued by backend using the API key. Required claims are on a separate page not fetched.
- **Server SDK:** `@trycourier/courier` v9.x, `client.send.message()`, reads `COURIER_API_KEY`, Node 20+. [Courier Node SDK](https://www.courier.com/docs/sdk-libraries/node)
- **Note:** Courier's own docs flag a different, older README API surface on npm. Use the current docs.

### MagicBell

- **Pricing:** Builder $0: 1,000 deliveries/month, 1 project, unlimited users. Startup $249/mo: 50,000 deliveries, 5 projects. Enterprise custom. Deliveries are counted per channel: one notification to 100 users, 50 of them also emailed, counts as 150. [magicbell.com/pricing](https://www.magicbell.com/pricing)
- **EU residency:** Not found. The only "eu" option in the API reference is for the Mailgun integration's sending region, which is unrelated. The API host is `api.magicbell.com`. [API reference](https://www.magicbell.com/docs/api/reference)
- **React:** `@magicbell/react` with `Inbox`, `FloatingInbox`, `ContextProvider` (`token`). Headless hooks not in the docs page checked.
- **Auth:** User JWT generated on the backend from the secret key and API key. Claims not extracted. [API authentication](https://www.magicbell.com/docs/api/authentication)
- **Server SDK:** `magicbell-js` client with `broadcasts.createBroadcast`. Older `magicbell` 3.x package also exists. [Browser/Node client](https://www.magicbell.com/docs/libraries/magicbell-js)

### SuprSend

- **Pricing:** Free $0: 10,000 notifications/month, unlimited channels, in-app feed with SuprSend branding, unlimited team members. Essentials $100/mo: 50,000 notifications, in-app without branding. Business $250/mo: user preferences, batching/digest, i18n. Enterprise custom: RBAC, SSO, multi-tenant. [suprsend.com/pricing](https://www.suprsend.com/pricing)
- **EU residency:** Security docs say each workspace has a data region including EU. No EU-specific API host found. Verify in the dashboard before relying on it. [Security](https://docs.suprsend.com/docs/security)
- **React:** `@suprsend/react-inbox` is end of support; the current package is `@suprsend/react`. Drop-in components and headless `@suprsend/react-core`. Toasts are not included in the Inbox by default. [Inbox React](https://docs.suprsend.com/docs/inbox-react)
- **Auth:** Moved from HMAC `subscriber_id` to signed JWT user tokens. Claims not extracted.
- **Server SDK:** `workflows.trigger` with a workflow slug; `tenant_id`, `idempotency_key`; up to 100 recipients per trigger. [Node trigger](https://docs.suprsend.com/docs/node-trigger-workflow-from-api)

## Caveats

1. **Novu 24h retention on Free** may mean the in-app feed drops items after a day. If it applies to Inbox items, Free is not usable for Cadence's feed. Confirm with Novu before committing.
2. **Knock 500 guide recipients/month on Free** caps in-app delivery. Fine for a small cohort; check against expected users.
3. **EU residency is not uniform.** Only Novu (all plans) and Courier (paid plans) document EU hosting. Knock's EU is not live. Novu's region is fixed at account creation.
4. **Real-time and SSR were not verified** for MagicBell and SuprSend, and SSR was not documented for any provider. All prebuilt React inbox components are browser-only, so render them client-side under React Router 7 SSR (inference; verify in the prototype).
5. **Pricing and free-tier figures** come from fetched pricing pages (summarised by a fetch model) and search snippets. Verify on the vendor's page before signing up. Knock, Novu and Courier pages show no last-updated date.
6. **Data quality:** one SuprSend search result contained embedded instructions aimed at an AI agent. They were ignored and not acted on.

## Implications for open tickets

- **UI prototype (#5):** Every candidate ships a prebuilt bell/popover. Novu's `<Inbox />` and Knock's `NotificationFeedPopover` are the closest to Cadence's v1 shape. A headless build is also possible on Novu (hooks) and Knock (headless docs). Prototype the Novu Inbox first.
- **Integration (#6):** Novu requires a server-computed `subscriberHash` (HMAC-SHA256 with the secret key) and an EU account at creation. Knock requires an RS256-signed user JWT (`sub`). Both are doable from Cadence's session-cookie backend. Trigger from route actions with `@novu/api` or `@knocklabs/node`.

## Sources

Primary vendor pages and docs, fetched 2026-11-13:

- Knock pricing: https://knock.app/pricing
- Knock plans: https://docs.knock.app/manage-your-account/knock-plans
- Knock React feed: https://docs.knock.app/in-app-ui/react/feed
- Knock React SDK overview: https://docs.knock.app/in-app-ui/react/sdk/overview
- Knock KnockFeedProvider: https://docs.knock.app/in-app-ui/react/sdk/components/knock-feed-provider
- Knock security and auth: https://docs.knock.app/in-app-ui/security-and-authentication
- Knock Node SDK: https://github.com/knocklabs/knock-node
- Novu pricing: https://www.novu.co/pricing
- Novu security: https://docs.novu.co/platform/additional-resources/security
- Novu Inbox overview: https://docs.novu.co/platform/inbox/overview
- Novu headless mode: https://docs.novu.co/platform/inbox/headless-mode
- Novu prepare for production (HMAC): https://docs.novu.co/platform/inbox/prepare-for-production
- Novu TypeScript SDK: https://docs.novu.co/platform/sdks/server/typescript
- Courier pricing: https://www.courier.com/pricing
- Courier EU datacenter: https://www.courier.com/docs/platform/workspaces/eu-datacenter
- Courier add an inbox: https://www.courier.com/docs/in-app/add-an-inbox
- Courier Node SDK: https://www.courier.com/docs/sdk-libraries/node
- MagicBell pricing: https://www.magicbell.com/pricing
- MagicBell React: https://www.magicbell.com/docs/libraries/react-headless
- MagicBell API authentication: https://www.magicbell.com/docs/api/authentication
- MagicBell API reference: https://www.magicbell.com/docs/api/reference
- MagicBell JS client: https://www.magicbell.com/docs/libraries/magicbell-js
- SuprSend pricing: https://www.suprsend.com/pricing
- SuprSend security: https://docs.suprsend.com/docs/security
- SuprSend Inbox React: https://docs.suprsend.com/docs/inbox-react
- SuprSend Node trigger: https://docs.suprsend.com/docs/node-trigger-workflow-from-api

Not included: Stream Feeds. One search showed a browser-only React SDK with no SSR and no confirmed free tier or EU residency. It was not pursued further.
