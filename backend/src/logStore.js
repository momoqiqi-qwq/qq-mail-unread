'use strict';

class LogStore {
  constructor(limit = 300) {
    this.limit = Math.max(50, Math.min(2000, Number(limit) || 300));
    this.entries = [];
  }

  add(level, message, meta = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toISOString(),
      level,
      message: String(message || ''),
      meta
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.limit) this.entries.length = this.limit;
    return entry;
  }

  list({ level, limit } = {}) {
    let rows = this.entries;
    if (level && level !== 'all') rows = rows.filter((entry) => entry.level === level);
    const size = Math.max(1, Math.min(1000, Number(limit) || this.limit));
    return rows.slice(0, size);
  }

  clear() {
    const count = this.entries.length;
    this.entries = [];
    return count;
  }
}

module.exports = { LogStore };
