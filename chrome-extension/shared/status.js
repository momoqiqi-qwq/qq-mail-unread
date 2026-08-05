export function getAccounts(statusPayload) {
  if (!statusPayload || !statusPayload.accounts || typeof statusPayload.accounts !== 'object') return {};
  return statusPayload.accounts;
}

export function getAccountEntries(statusPayload) {
  return Object.entries(getAccounts(statusPayload));
}

export function calcTotalUnread(statusPayload) {
  return getAccountEntries(statusPayload).reduce((sum, [, acc]) => {
    if (!acc || acc.status === 'error' || acc.status === 'stopped') return sum;
    const count = Number(acc.unreadCount || 0);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);
}

export function countErrorAccounts(statusPayload) {
  return getAccountEntries(statusPayload).filter(([, acc]) => acc && acc.status === 'error').length;
}

export function countOkAccounts(statusPayload) {
  return getAccountEntries(statusPayload).filter(([, acc]) => acc && acc.status === 'ok').length;
}

export function countStoppedAccounts(statusPayload) {
  return getAccountEntries(statusPayload).filter(([, acc]) => acc && (acc.status === 'stopped' || acc.stopped)).length;
}

export function sortAccountEntries(statusPayload) {
  return getAccountEntries(statusPayload).sort((a, b) => {
    const [, accA] = a;
    const [, accB] = b;
    const stoppedA = accA.status === 'stopped' || accA.stopped ? 1 : 0;
    const stoppedB = accB.status === 'stopped' || accB.stopped ? 1 : 0;
    if (stoppedA !== stoppedB) return stoppedB - stoppedA;

    const errorA = accA.status === 'error' ? 1 : 0;
    const errorB = accB.status === 'error' ? 1 : 0;
    if (errorA !== errorB) return errorB - errorA;

    const unreadA = Number(accA.unreadCount || 0);
    const unreadB = Number(accB.unreadCount || 0);
    if (unreadA !== unreadB) return unreadB - unreadA;

    return String(accA.nickname || accA.id).localeCompare(String(accB.nickname || accB.id), 'zh-CN');
  });
}

export function isStaleStatus(statusPayload, maxAgeMinutes = 5) {
  if (!statusPayload || !statusPayload.fetchedAt) return false;
  const fetched = new Date(statusPayload.fetchedAt).getTime();
  if (!Number.isFinite(fetched)) return false;
  return Date.now() - fetched > maxAgeMinutes * 60 * 1000;
}

export function toUnreadMap(statusPayload) {
  const map = {};
  for (const [id, acc] of getAccountEntries(statusPayload)) {
    map[id] = Number(acc && acc.unreadCount ? acc.unreadCount : 0);
  }
  return map;
}

export function findNewUnreadAccounts(previousMap, statusPayload) {
  const changed = [];
  for (const [id, acc] of getAccountEntries(statusPayload)) {
    if (!acc || acc.status === 'error' || acc.status === 'stopped') continue;
    const previous = Number(previousMap[id] || 0);
    const current = Number(acc.unreadCount || 0);
    if (current > previous) {
      changed.push({ id, account: acc, delta: current - previous, current, previous });
    }
  }
  return changed;
}

export function sortMailsByDate(mails, order = 'desc') {
  const direction = order === 'asc' ? 1 : -1;
  return [...(Array.isArray(mails) ? mails : [])].sort((a, b) => {
    const timeA = new Date(a && a.date ? a.date : 0).getTime() || 0;
    const timeB = new Date(b && b.date ? b.date : 0).getTime() || 0;
    if (timeA !== timeB) return direction * (timeA - timeB);
    const uidA = Number(a && a.uid ? a.uid : 0);
    const uidB = Number(b && b.uid ? b.uid : 0);
    return direction * (uidA - uidB);
  });
}
