/** Personal records are independent of Session plans, settings, and model memory. */
export const DAILY_RECORDS_KEY = 'dsh.personal-workbench.v1'

/** A personal to-do with an optional planned time and completion state. */
export interface DailyTask { id: string; title: string; time: string; done: boolean }
/** A named HTTP or HTTPS website shortcut. */
export interface DailyLink { id: string; name: string; url: string }
/** A saved plain-text thought with its original creation timestamp. */
export interface DailyNote { id: string; text: string; created: number }
/** The versioned local document shared by the personal organizer views. */
export interface DailyRecords {
  version: 1
  revision: number
  tasks: DailyTask[]
  links: DailyLink[]
  notes: DailyNote[]
}

/**
 * Accept only ordinary web links; reject executable and local-file URLs.
 * @param value - User-entered website URL.
 * @returns the normalized web URL, or undefined for a rejected URL.
 */
export function dailyURL(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch (_error) {
    // Invalid user-entered URLs stay in the form for correction.
    return undefined
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

/**
 * Reject an incompatible document in full rather than replacing stored records.
 * @param raw - Stored document bytes, or null when no personal records exist.
 * @returns validated records, or undefined when the stored document cannot be read.
 */
export function parseDailyRecords(raw: string | null): DailyRecords | undefined {
  if (raw === null) return { version: 1, revision: 0, tasks: [], links: [], notes: [] }
  let value: unknown
  try { value = JSON.parse(raw) } catch (_error) {
    // Preserve malformed bytes in storage; the UI refuses writes.
    return undefined
  }
  if (!record(value) || value.version !== 1 || !Number.isSafeInteger(value.revision)
    || typeof value.revision !== 'number' || value.revision < 0
    || !Array.isArray(value.tasks) || !Array.isArray(value.links) || !Array.isArray(value.notes)) return undefined
  const tasks: DailyTask[] = []
  const links: DailyLink[] = []
  const notes: DailyNote[] = []
  for (const item of value.tasks) {
    if (!record(item) || !text(item.id, 100) || !text(item.title, 80)
      || typeof item.time !== 'string' || !/^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/.test(item.time)
      || typeof item.done !== 'boolean') return undefined
    tasks.push({ id: item.id, title: item.title, time: item.time, done: item.done })
  }
  for (const item of value.links) {
    if (!record(item) || !text(item.id, 100) || !text(item.name, 40)
      || typeof item.url !== 'string' || dailyURL(item.url) === undefined) return undefined
    links.push({ id: item.id, name: item.name, url: item.url })
  }
  for (const item of value.notes) {
    if (!record(item) || !text(item.id, 100) || !text(item.text, 3000)
      || typeof item.created !== 'number' || !Number.isFinite(item.created)
      || Number.isNaN(new Date(item.created).getTime())) return undefined
    notes.push({ id: item.id, text: item.text, created: item.created })
  }
  if ([tasks, links, notes].some(items => new Set(items.map(item => item.id)).size !== items.length)) return undefined
  return { version: 1, revision: value.revision, tasks, links, notes }
}
