export const DEFAULT_WAREHOUSE_TIME_ZONE = 'UTC';

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dayFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  dayFormatters.set(timeZone, formatter);
  return formatter;
}

export function resolveWarehouseTimeZone(raw: string | undefined): string {
  const candidate = raw?.trim();
  if (!candidate) return DEFAULT_WAREHOUSE_TIME_ZONE;
  try {
    dayFormatter(candidate);
  } catch {
    throw new Error('WAREHOUSE_TIME_ZONE must be a valid IANA time zone.');
  }
  return candidate;
}

export function warehouseDayKey(
  instant: number | string,
  timeZone: string,
): string {
  const parts = dayFormatter(timeZone).formatToParts(new Date(instant));
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}
