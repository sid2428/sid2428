import { OWNER, PROFILE_REPO } from '../config.js';
import type { GameState } from '../game/state.js';

type ActivityItem = GameState['activity']['items'][number];

interface GitHubEvent {
  type?: string;
  created_at?: string;
  repo?: { name?: string };
  payload?: { size?: number; commits?: unknown[]; action?: string; ref_type?: string };
}

function describe(event: GitHubEvent, repo: string): string | null {
  const payload = event.payload ?? {};
  switch (event.type) {
    case 'PushEvent': {
      const count = payload.size || payload.commits?.length || 1;
      return `PUSHED ${count} COMMIT${count === 1 ? '' : 'S'} TO ${repo}`;
    }
    case 'PullRequestEvent':
      return `${payload.action ?? 'OPENED'} A PULL REQUEST IN ${repo}`;
    case 'CreateEvent':
      return payload.ref_type === 'repository' ? `CREATED A NEW REPO: ${repo}` : null;
    case 'WatchEvent':
      return `STARRED ${repo}`;
    case 'IssuesEvent':
      return `${payload.action ?? 'OPENED'} AN ISSUE IN ${repo}`;
    default:
      return null;
  }
}

export function summarize(events: readonly GitHubEvent[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const event of events) {
    const full = event.repo?.name;
    if (!full || full === PROFILE_REPO || !event.created_at) continue;
    const text = describe(event, full.split('/').slice(1).join('/') || full)?.toUpperCase();
    if (!text || out.at(-1)?.text === text) continue;
    out.push({ text, at: event.created_at });
    if (out.length === 5) break;
  }
  return out;
}

/** Returns null on any failure, so the caller keeps the last good list. */
export async function fetchActivity(fetchImpl: typeof fetch, token: string | undefined): Promise<ActivityItem[] | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'sid2428-oncall' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetchImpl(`https://api.github.com/users/${OWNER}/events/public?per_page=40`, { headers, signal: AbortSignal.timeout(6_000) });
    if (!response.ok) {
      console.error('activity fetch status', response.status);
      return null;
    }
    const body: unknown = await response.json();
    return Array.isArray(body) ? summarize(body as GitHubEvent[]) : null;
  } catch (error) {
    console.error('activity fetch failed', error instanceof Error ? error.message : error);
    return null;
  }
}
