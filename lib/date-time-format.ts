export type TimeFormat = 'H12' | 'H24';
export type DateFormat = 'DD_MM_YYYY' | 'MM_DD_YYYY' | 'YYYY_MM_DD';

export type DateTimeSettings = {
  timezone?: string | null;
  timeFormat?: TimeFormat | string | null;
  dateFormat?: DateFormat | string | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const offsetPattern = /(?:z|[+-]\d{2}:?\d{2})$/i;
const weekdayFormatters = {
  short: new Intl.DateTimeFormat('en-US', { weekday: 'short' }),
  long: new Intl.DateTimeFormat('en-US', { weekday: 'long' }),
};
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

export function formatClinicDate(value: string | Date, settings?: DateTimeSettings, weekday?: 'short' | 'long') {
  const parts = getDateParts(value, settings);
  const date = localDateFromParts(parts);
  const formattedDate = formatDateParts(parts, settings?.dateFormat);
  return weekday ? `${weekdayFormatters[weekday].format(date)}, ${formattedDate}` : formattedDate;
}

export function formatClinicTime(value: string | Date, settings?: DateTimeSettings) {
  const { hour, minute } = getDateParts(value, settings);
  if (settings?.timeFormat === 'H12') {
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatClinicDateTime(value: string | Date, settings?: DateTimeSettings) {
  return `${formatClinicDate(value, settings, 'long')} at ${formatClinicTime(value, settings)}`;
}

function getDateParts(value: string | Date, settings?: DateTimeSettings): DateParts {
  if (typeof value === 'string' && !offsetPattern.test(value)) {
    return parseLocalDateTime(value);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return parseLocalDateTime(String(value));
  }

  return partsFromDate(date, settings?.timezone || undefined);
}

function parseLocalDateTime(value: string): DateParts {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (!match) {
    const fallback = new Date(value);
    return partsFromDate(Number.isNaN(fallback.getTime()) ? new Date() : fallback);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
  };
}

function partsFromDate(date: Date, timezone?: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '00' : parts.hour),
    minute: Number(parts.minute),
  };
}

function formatDateParts(parts: DateParts, dateFormat?: string | null) {
  const dd = String(parts.day).padStart(2, '0');
  const month = monthFormatter.format(localDateFromParts(parts));

  if (dateFormat === 'DD_MM_YYYY') return `${dd} ${month}`;
  return `${month} ${dd}`;
}

function localDateFromParts(parts: DateParts) {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}
