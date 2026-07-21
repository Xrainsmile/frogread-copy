// Fetches and parses YouTube subtitles into a flat list of timestamped
// fragments. Supports both the JSON3 (srv3) format returned by YouTube's
// caption endpoint and the TTML fallback.

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: string;
  vssId?: string;
}

export interface SubtitlesFragment {
  text: string;
  start: number;
  end: number;
  translation?: string;
}

export function extractCaptionTracks(playerResponse: any): CaptionTrack[] {
  const tracks: any[] =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks.map((t) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    kind: t.kind,
    name: t.name?.simpleText,
    vssId: t.vssId,
  }));
}

/**
 * Pick the best track. Priority: human subtitles (no name) > human (with name)
 * > auto-generated ASR > first available.
 */
export function selectTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const human = tracks.filter((t) => t.kind !== 'asr');
  const pool = human.length ? human : tracks;
  const noName = pool.find((t) => !t.name);
  return noName ?? pool[0];
}

export async function fetchSubtitles(track: CaptionTrack): Promise<SubtitlesFragment[]> {
  const res = await fetch(track.baseUrl);
  if (!res.ok) throw new Error(`字幕下载失败 (HTTP ${res.status})`);
  const text = await res.text();
  try {
    return parseJson3(text);
  } catch {
    return parseTtml(text);
  }
}

interface Json3Event {
  t?: number;
  d?: number;
  segs?: { utf8?: string }[];
}

function parseJson3(raw: string): SubtitlesFragment[] {
  const json = JSON.parse(raw) as { events?: Json3Event[] };
  const fragments: SubtitlesFragment[] = [];
  for (const ev of json.events ?? []) {
    if (ev.t === undefined) continue; // metadata-only events
    const text = (ev.segs ?? []).map((s) => s.utf8 ?? '').join('');
    if (!text.trim()) continue;
    const start = Number(ev.t);
    const end = start + Number(ev.d ?? 0);
    fragments.push({ text: text.trim(), start, end });
  }
  return fragments;
}

function timeToMs(t: string): number {
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/(\d+):(\d+):(\d+)[.](\d+)/) || t.match(/(\d+):(\d+)[.](\d+)/);
  if (m) {
    if (m[4] !== undefined) {
      return +m[1] * 3600000 + +m[2] * 60000 + +m[3] * 1000 + +(`0.${m[4]}`) * 1000;
    }
    return +m[1] * 60000 + +m[2] * 1000 + +(`0.${m[3]}`) * 1000;
  }
  return 0;
}

function parseTtml(raw: string): SubtitlesFragment[] {
  const doc = new DOMParser().parseFromString(raw, 'text/xml');
  const ps = Array.from(doc.querySelectorAll('p'));
  const fragments: SubtitlesFragment[] = [];
  for (const p of ps) {
    const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const begin = p.getAttribute('begin') ?? '0';
    const endAttr = p.getAttribute('end');
    const durAttr = p.getAttribute('d');
    const start = timeToMs(begin);
    const end = endAttr ? timeToMs(endAttr) : start + (durAttr ? timeToMs(durAttr) : 2000);
    fragments.push({ text, start, end });
  }
  return fragments;
}
