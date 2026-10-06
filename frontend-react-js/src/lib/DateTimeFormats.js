import { DateTime } from 'luxon';

// Dates older than a day. "LLL d" = month name + DAY of the month. The old
// format (LLL then a capital L) printed the month NUMBER where the day belongs, so every
// October date showed "Oct 10", every September date "Sep 9" and every
// August date "Aug 8" (backlog #39). The year is added for other years.
function shortDate(created) {
  const now = DateTime.now();
  if (created.year === now.year) {
    return created.toFormat("LLL d");
  }
  return created.toFormat("LLL d, yyyy");
}

export function formatDateTime(value) {
  const created = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  return shortDate(created);
}

export function timeAgo(value) {
  const created = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  const now = DateTime.now();
  const diff_mins = now.diff(created, 'minutes').toObject().minutes;
  const diff_hours = now.diff(created, 'hours').toObject().hours;

  if (diff_hours > 24.0) {
    return shortDate(created);
  } else if (diff_hours > 1.0) {
    return `${Math.floor(diff_hours)}h ago`;
  } else if (diff_mins > 1.0) {
    return `${Math.round(diff_mins)}m ago`;
  } else {
    return 'now';
  }
}

// Returns null once the expiry time has passed, so the caller can hide the
// countdown instead of showing negative minutes such as "-53251m" (backlog #25).
export function formatTimeExpires(value) {
  const future = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  const now = DateTime.now();
  if (future <= now) {
    return null;
  }
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
