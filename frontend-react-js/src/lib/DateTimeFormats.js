import { DateTime } from 'luxon';

export function formatDateTime(value) {
  const created = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  return created.toFormat("LLL L");
}

export function timeAgo(value) {
  const created = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  const now = DateTime.now();
  const diff_mins = now.diff(created, 'minutes').toObject().minutes;
  const diff_hours = now.diff(created, 'hours').toObject().hours;

  if (diff_hours > 24.0) {
    return created.toFormat("LLL L");
  } else if (diff_hours > 1.0) {
    return `${Math.floor(diff_hours)}h ago`;
  } else if (diff_mins > 1.0) {
    return `${Math.round(diff_mins)}m ago`;
  } else {
    return 'now';
  }
}

export function formatTimeExpires(value) {
  const future = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  const now = DateTime.now();
  const diff_mins = future.diff(now, 'minutes').toObject().minutes;
  const diff_hours = future.diff(now, 'hours').toObject().hours;
  const diff_days = future.diff(now, 'days').toObject().days;

  if (diff_hours > 24.0) {
    return `${Math.floor(diff_days)}d`;
  } else if (diff_hours > 1.0) {
    return `${Math.floor(diff_hours)}h`;
  } else {
    return `${Math.round(diff_mins)}m`;
  }
}