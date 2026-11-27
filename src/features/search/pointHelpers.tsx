import type { Ionicons } from '@expo/vector-icons';

/**
 * Shared by the Points screen and the "Boarding / dropping points" viewer on the Results cards.
 * Reads the provider's boarding / dropping data and prepares it for display.
 */

export type Point = { [key: string]: any };
export type Kind = 'boarding' | 'dropping';
export type IconName = keyof typeof Ionicons.glyphMap;

export function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function asArray(value: unknown): Point[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

export function str(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

export function firstValue(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function pointId(point: Point, kind: Kind): string {
  const p = kind;
  const value = firstValue(point, [
    `${p}_Id`, `${p}_ID`, `${p}Id`, `${p}_Point_Id`, `${p}_Point_ID`,
    `${p}_Point_Key`, `${p}PointKey`, `${p}PointId`,
    'point_Id', 'point_ID', 'pointId', 'id',
  ]);
  return value == null ? '' : String(value);
}

export function rawName(point: Point, kind: Kind): string {
  return stripPhones(
    String(
      firstValue(point, [
        `${kind}_Name`, `${kind}Name`, 'point_Name', 'pointName', 'name', `${kind}_Address`,
      ]) ?? 'Location'
    )
  );
}

// Things we treat as a "heads-up" note rather than part of the address.
const NOTE_RE =
  /\bvan\b|shuttle|feeder|metro|might require|may require|pick[\s-]?up (?:by|from|at|in|via|required)|transfer|\bcab\b/i;

export function isNoise(part: string): boolean {
  return (
    /^\d{1,2}:\d{2}(\s*(AM|PM))?$/i.test(part) ||
    /^\d+$/.test(part) ||
    /^N\/?A$/i.test(part) ||
    /^(true|false|yes|no|null|undefined)$/i.test(part)
  );
}

/**
 * Operators send their contact number themselves after booking, so phone numbers are never shown.
 * Removes "Ph: 98450 12345", "+91-9071997773", "080 2234 5678" and the dangling "-" they leave.
 */
const PHONE_LABEL_RE = /\b(?:ph(?:one)?|mob(?:ile)?|contact|tel|call|cell|whatsapp)\.?\s*(?:no\.?|number|nos\.?)?\s*[:\-]?\s*/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s-]*)?(?:\d[\s-]?){8,11}\d/g;

/** Providers often send names in ALL CAPS. Shows them in a calm "Title case" instead (short acronyms such as LB stay). */
export function calmCase(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return text;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (upper / letters.length < 0.6) return text;
  return text
    .split(' ')
    .map(word =>
      word.length <= 2 && /^[A-Z]+$/.test(word) && !/^(UP|AT|IN|ON|OF|TO|BY|OR)$/.test(word)
        ? word
        : word.toLowerCase().replace(/[a-z]/, c => c.toUpperCase())
    )
    .join(' ');
}

export function stripPhones(text: string): string {
  return text
    .replace(new RegExp(`(?:${PHONE_LABEL_RE.source})(?:${PHONE_RE.source})(?:\\s*[,/&]\\s*(?:${PHONE_RE.source}))*`, 'gi'), '')
    .replace(PHONE_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[-,:;/&]+\s*$/g, '')
    .replace(/^\s*[-,:;/&]+\s*/g, '')
    // a "Contact number" label left behind once the number itself is removed
    .replace(/\s*\b(?:contact|phone|mobile|mob|ph)\s*(?:number|no\.?)?\s*[:\-]?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function segments(value: any): string[] {
  if (value === undefined || value === null || typeof value === 'object') return [];
  return String(value)
    .split('^')
    .map(part => stripPhones(part.trim()))
    .filter(part => part && !isNoise(part));
}

export function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter(item => {
    const k = item.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function humanize(key: string): string {
  const words = key
    .replace(/^(is|has)_?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

const FLAG_KEY_RE = /van|metro|pick[\s_-]?up|shuttle|feeder|note|remark|instruction/i;
const SKIP_KEY_RE = /name|time|(^|_)id$|key|lat|lon|phone|mobile|contact/i;

/** Display name without a "(Van pickup)" style suffix. */
export function pointName(point: Point, kind: Kind): string {
  let name = rawName(point, kind);
  name = name.replace(/\(([^)]*)\)/g, (whole, inner) => (NOTE_RE.test(inner) ? '' : whole));
  name = segments(name)[0] || name.trim();
  return calmCase(name.replace(/\s{2,}/g, ' ').trim()) || 'Location';
}

/** Notes such as "Might require van pickup" or "Metro pickup", gathered from any field. */
export function pointNotes(point: Point, kind: Kind): { text: string; icon: IconName }[] {
  const found: string[] = [];

  // Parenthetical in the name, e.g. "Kukatpally (Van pickup)"
  for (const m of rawName(point, kind).matchAll(/\(([^)]*)\)/g)) {
    if (NOTE_RE.test(m[1])) found.push(m[1].trim());
  }

  for (const key of Object.keys(point)) {
    const value = point[key];
    if (SKIP_KEY_RE.test(key) && !FLAG_KEY_RE.test(key)) continue;

    // Flag fields: is_Van_Pickup: true
    if (FLAG_KEY_RE.test(key) && (value === true || /^(true|y|yes|1)$/i.test(String(value)))) {
      const label = humanize(key);
      if (label && !/^(note|remark|instruction)s?$/i.test(label)) found.push(label);
      continue;
    }

    for (const part of segments(value)) {
      if (NOTE_RE.test(part) || (FLAG_KEY_RE.test(key) && part.length > 2)) found.push(part);
    }
  }

  return dedupe(found)
    .slice(0, 3)
    .map(text => ({
      text,
      icon: /metro/i.test(text)
        ? 'train-outline'
        : /van|shuttle|feeder|cab|transfer/i.test(text)
          ? 'car-outline'
          : 'information-circle-outline',
    }));
}

export function pointAddress(point: Point, kind: Kind): string {
  const name = pointName(point, kind).toLowerCase();
  const parts = dedupe(
    [point?.[`${kind}_Address`], point?.[`${kind}_Landmark`]]
      .flatMap(segments)
      .filter(part => !NOTE_RE.test(part))
  ).filter(part => part.toLowerCase() !== name);
  return parts.map(calmCase).join(' · ');
}

export function pointTime(point: Point, kind: Kind): string {
  const value = point?.[`${kind}_Time`] ?? point?.time;
  if (!value) return '';
  const raw = String(value).trim();
  if (/am|pm/i.test(raw)) return raw.toUpperCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = Number(match[1]);
    return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
  }
  return raw;
}

export function formatDate(value: string): string {
  if (!value) return '';
  const date = value.includes('/')
    ? (() => {
        const [m, d, y] = value.split('/');
        return new Date(Number(y), Number(m) - 1, Number(d));
      })()
    : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* =====================================================
   Data prepared once per list
===================================================== */

export type Item = {
  id: string;
  point: Point;
  name: string;
  address: string;
  time: string;
  notes: { text: string; icon: IconName }[];
};

export function buildItems(points: Point[], kind: Kind): Item[] {
  return points.map((point, index) => {
    const name = pointName(point, kind);
    return {
      id: pointId(point, kind) || `${kind}-${index}`,
      point,
      name,
      address: pointAddress(point, kind),
      time: pointTime(point, kind),
      // a note that only repeats the point's name adds nothing
      notes: pointNotes(point, kind)
        .map(note => ({ ...note, text: calmCase(note.text) }))
        .filter(note => note.text.toLowerCase() !== name.toLowerCase()),
    };
  });
}

/** Lower-case text used when searching points. */
export function searchText(item: Item): string {
  return `${item.name} ${item.address}`.toLowerCase();
}

/** Keeps the points whose name or address contains every word typed. */
export function filterItems(items: Item[], query: string): Item[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter(item => {
    const text = searchText(item);
    return words.every(word => text.includes(word));
  });
}