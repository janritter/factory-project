/**
 * PROTOTYPE, throwaway. Answers: "Does Knock hold up against Cadence?" (issue #25)
 * Run: npm run prototype:knock -- <userA-id> <userB-id>
 * (ids = DevUI switcher user ids; they are used as Knock user ids as strings)
 *
 * Needs two workflows in the Knock Development environment, each with one
 * In-app feed step on the cadence feed channel:
 *   discussion-reply  (default preferences)
 *   new-enrollment    (no preference config needed; the script sets it per user)
 */
import { Knock, signUserToken } from "@knocklabs/node";

const [aId = "1", bId = "2"] = process.argv.slice(2);
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};
const PUBLIC = env("KNOCK_PUBLIC_API_KEY");
const CHANNEL = env("KNOCK_FEED_CHANNEL_ID");
const knock = new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });
const API = "https://api.knock.app/v1";

const results: Record<string, string> = {};
const record = (k: string, ok: boolean, detail: string) => {
  results[k] = `${ok ? "PASS" : "FAIL"} - ${detail}`;
  console.log(`${ok ? "✓" : "✗"} ${k}: ${detail}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Same endpoints @knocklabs/client uses, authenticated like the browser would.
async function clientCall(userId: string, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${PUBLIC}`,
      "x-knock-user-token": token,
      ...init.headers,
    },
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
}
const feed = (userId: string, token: string) =>
  clientCall(userId, token, `/users/${userId}/feeds/${CHANNEL}?page_size=50`);

async function main() {
  // identify both users (this is the "user sync" shape: id + name + email)
  for (const id of [aId, bId]) {
    await knock.users.update(id, { name: `Cadence user ${id}` });
  }

  // ── Check 1: signed tokens, switching users switches the feed
  const tokA = await signUserToken(aId, { expiresInSeconds: 600 });
  const tokB = await signUserToken(bId, { expiresInSeconds: 600 });
  const ownA = await feed(aId, tokA);
  const ownB = await feed(bId, tokB);
  const cross = await feed(bId, tokA); // A's token reading B's feed must fail
  const noTok = await feed(aId, "");
  record(
    "1 signed tokens",
    ownA.status === 200 && ownB.status === 200 && cross.status >= 400 && noTok.status >= 400,
    `own A=${ownA.status}, own B=${ownB.status}, A-token-on-B=${cross.status}, no-token=${noTok.status}`,
  );

  // ── Check 2: Node SDK triggers a real catalogue Notification
  const before = ownB.body?.meta?.total_count ?? 0;
  const run = await knock.workflows.trigger("discussion-reply", {
    recipients: [bId],
    actor: aId,
    data: { lessonTitle: "Intro", courseTitle: "Prototype course", replyExcerpt: "Great question!" },
  });
  let after = before;
  let latest = await feed(bId, tokB);
  for (let i = 0; i < 10 && after <= before; i++) {
    await sleep(1000);
    latest = await feed(bId, tokB);
    after = latest.body?.meta?.total_count ?? 0;
  }
  const aFeedAfter = await feed(aId, tokA);
  record(
    "2 triggering",
    after > before && (aFeedAfter.body?.meta?.total_count ?? 0) === (ownA.body?.meta?.total_count ?? 0),
    `workflow_run_id=${run.workflow_run_id}; B feed ${before}→${after}; A feed unchanged`,
  );

  // ── Check 3: headless feed API: list, unread count, mark seen/read
  const item = latest.body?.entries?.[0];
  const unread1 = latest.body?.meta?.unread_count;
  let ok3 = false;
  let d3 = "no item to test";
  if (item) {
    await clientCall(bId, tokB, "/messages/batch/seen", { method: "POST", body: JSON.stringify({ message_ids: [item.id] }) });
    const r = await clientCall(bId, tokB, "/messages/batch/read", { method: "POST", body: JSON.stringify({ message_ids: [item.id] }) });
    await sleep(500);
    const f2 = await feed(bId, tokB);
    const unread2 = f2.body?.meta?.unread_count;
    const seen = f2.body?.meta?.unseen_count;
    ok3 = r.status < 300 && unread2 === unread1 - 1;
    d3 = `list ${latest.body.entries.length} item(s); unread ${unread1}→${unread2}; unseen=${seen}; batch/read=${r.status}`;
  }
  record("3 headless feed API", ok3, d3);

  // ── Check 4: opt-in preference (new-enrollment is off by default for in_app_feed)
  // "Off by default" is applied in code: at user sync we write the opt-in-only
  // entries as false on the recipient. No dashboard default needed.
  const OFF = { workflows: { "new-enrollment": { channel_types: { in_app_feed: false } } } };
  await knock.users.setPreferences(bId, "default", OFF as any);
  const pref = await knock.users.getPreferences(bId, "default");
  const defaultState = JSON.stringify((pref as any).workflows?.["new-enrollment"] ?? "unset");
  const t0 = (await feed(bId, tokB)).body?.meta?.total_count ?? 0;
  await knock.workflows.trigger("new-enrollment", { recipients: [bId], actor: aId, data: { courseTitle: "Prototype course", studentName: "Student" } });
  await sleep(4000);
  const t1 = (await feed(bId, tokB)).body?.meta?.total_count ?? 0;
  const suppressed = t1 === t0;
  await knock.users.setPreferences(bId, "default", {
    workflows: { "new-enrollment": { channel_types: { in_app_feed: true } } },
  } as any);
  await knock.workflows.trigger("new-enrollment", { recipients: [bId], actor: aId, data: { courseTitle: "Prototype course", studentName: "Student" } });
  let t2 = t1;
  for (let i = 0; i < 10 && t2 <= t1; i++) {
    await sleep(1000);
    t2 = (await feed(bId, tokB)).body?.meta?.total_count ?? 0;
  }
  // reset to the off-by-default state so the spike is re-runnable
  await knock.users.setPreferences(bId, "default", OFF as any);
  record(
    "4 opt-in preferences",
    suppressed && t2 > t1,
    `default pref=${defaultState}; before opt-in ${t0}→${t1} (suppressed=${suppressed}); after opt-in →${t2}`,
  );

  console.log("\n" + JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("spike crashed:", e?.status ?? "", e?.message ?? e);
  process.exit(1);
});
