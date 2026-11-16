/**
 * PROTOTYPE, throwaway (issue #25). Not for main; lives on prototype/knock-spike.
 * A tester for the Knock feed against the real app: switch users in the DevUI
 * panel and watch the feed switch. The browser talks to Knock directly with the
 * server-signed user token; the buttons trigger through the Node SDK.
 */
import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Knock, signUserToken } from "@knocklabs/node";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import { Button } from "~/components/ui/button";

const API = "https://api.knock.app/v1";
const OFF = (on: boolean) => ({
  workflows: { "new-enrollment": { channel_types: { in_app_feed: on } } },
});
const knock = () => new Knock({ apiKey: process.env.KNOCK_SECRET_API_KEY! });

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw new Response("Select a user from the DevUI panel", { status: 401 });
  const id = String(userId);
  const k = knock();
  await k.users.update(id, { name: `Cadence user ${id}` });
  const prefs: any = await k.users.getPreferences(id, "default");
  return {
    userId: id,
    token: await signUserToken(id, { expiresInSeconds: 3600 }),
    publicKey: process.env.KNOCK_PUBLIC_API_KEY!,
    channelId: process.env.KNOCK_FEED_CHANNEL_ID!,
    enrollmentOptIn: prefs?.workflows?.["new-enrollment"]?.channel_types?.in_app_feed === true,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw new Response("No user", { status: 401 });
  const id = String(userId);
  const form = await request.formData();
  const intent = form.get("intent");
  const k = knock();
  if (intent === "reply") {
    await k.workflows.trigger("discussion-reply", {
      recipients: [id],
      data: { lessonTitle: "Intro", courseTitle: "Prototype course", replyExcerpt: "Great question!" },
    });
  } else if (intent === "enrollment") {
    await k.workflows.trigger("new-enrollment", {
      recipients: [id],
      data: { courseTitle: "Prototype course", studentName: "Student" },
    });
  } else if (intent === "optin") {
    await k.users.setPreferences(id, "default", OFF(form.get("on") === "true") as any);
  }
  return { ok: true };
}

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { userId, token, publicKey, channelId, enrollmentOptIn } = loaderData;
  const fetcher = useFetcher();
  const [feed, setFeed] = useState<{ entries: any[]; meta: any } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${publicKey}`,
          "x-knock-user-token": token,
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return res.status === 204 ? null : res.json();
    },
    [publicKey, token],
  );

  const refresh = useCallback(async () => {
    try {
      setFeed(await call(`/users/${userId}/feeds/${channelId}?page_size=50`));
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [call, userId, channelId]);

  useEffect(() => {
    setFeed(null);
    refresh();
    const t = setInterval(refresh, 3000); // polling stands in for the socket
    return () => clearInterval(t);
  }, [refresh]);

  const mark = async (kind: "seen" | "read" | "unread" | "archived", ids: string[]) => {
    if (!ids.length) return;
    await call(`/messages/batch/${kind}`, { method: "POST", body: JSON.stringify({ message_ids: ids }) });
    refresh();
  };
  const unreadIds = (feed?.entries ?? []).filter((e) => !e.read_at).map((e) => e.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Knock feed tester (PROTOTYPE)</h1>
        <p className="text-sm text-muted-foreground">
          Signed in to Knock as user <b>{userId}</b> via a server-signed RS256 token. Switch users in the DevUI panel and the feed switches.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="reply" />
          <Button size="sm" type="submit">Trigger Discussion Reply → me</Button>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="enrollment" />
          <Button size="sm" variant="outline" type="submit">Trigger new Enrollment → me</Button>
        </fetcher.Form>
      </div>

      <fetcher.Form method="post" className="flex items-center gap-3 rounded-md border p-3 text-sm">
        <input type="hidden" name="intent" value="optin" />
        <input type="hidden" name="on" value={String(!enrollmentOptIn)} />
        <span>
          new Enrollment notifications (in-app): <b>{enrollmentOptIn ? "opted in" : "off (default)"}</b>
        </span>
        <Button size="sm" variant="secondary" type="submit">{enrollmentOptIn ? "Opt out" : "Opt in"}</Button>
      </fetcher.Form>

      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b p-3 text-sm">
          <span>
            Feed · unread <b>{feed?.meta?.unread_count ?? "…"}</b> · unseen <b>{feed?.meta?.unseen_count ?? "…"}</b> · total {feed?.meta?.total_count ?? "…"}
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => mark("seen", (feed?.entries ?? []).filter((e) => !e.seen_at).map((e) => e.id))}>Mark all seen</Button>
            <Button size="sm" variant="ghost" onClick={() => mark("read", unreadIds)}>Mark all read</Button>
          </span>
        </div>
        {err && <p className="p-3 text-sm text-red-600">Feed error: {err}</p>}
        <ul className="divide-y">
          {(feed?.entries ?? []).map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <div className={e.read_at ? "text-muted-foreground" : "font-medium"}>
                  {e.blocks?.map((b: any) => b.rendered ?? b.content ?? "").join(" ").replace(/<[^>]+>/g, "") || e.source?.key}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.source?.key} · {new Date(e.inserted_at).toLocaleTimeString()} · {e.read_at ? "read" : "unread"}
                </div>
              </div>
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => mark(e.read_at ? "unread" : "read", [e.id])}>{e.read_at ? "Unread" : "Read"}</Button>
                <Button size="sm" variant="ghost" onClick={() => mark("archived", [e.id])}>Archive</Button>
              </span>
            </li>
          ))}
          {feed && feed.entries.length === 0 && <li className="p-3 text-sm text-muted-foreground">Empty. Trigger one above.</li>}
        </ul>
      </div>
    </div>
  );
}
