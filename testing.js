// src/testing/fakeTransport.ts
function createFakeTransport(options = {}) {
  const requests = [];
  let sends = 0;
  const statusFor = (request, index) => {
    if (typeof options.status === "function") {
      try {
        return options.status(request, index);
      } catch {
        return 500;
      }
    }
    return options.status ?? 202;
  };
  return {
    name: "fake",
    get requests() {
      return requests;
    },
    get sendCount() {
      return sends;
    },
    send: async (request) => {
      const index = sends;
      sends += 1;
      requests.push(request);
      try {
        options.onSend?.(request, index);
      } catch {
      }
      if (options.failTimes !== void 0 && index < options.failTimes) {
        throw new Error("fake transport: simulated network failure");
      }
      const status = statusFor(request, index);
      return options.retryAfterMs === void 0 ? { status } : { status, retryAfterMs: options.retryAfterMs };
    },
    lastBody() {
      const last = requests[requests.length - 1];
      if (last === void 0) return void 0;
      try {
        return JSON.parse(last.body);
      } catch {
        return void 0;
      }
    },
    reset() {
      requests.length = 0;
      sends = 0;
    }
  };
}

// src/testing/memoryRepository.ts
function result(failure, value) {
  return failure === void 0 ? { ok: true, value } : { ok: false, reason: failure };
}
function createMemoryRepository(options = {}) {
  const errorRows = /* @__PURE__ */ new Map();
  const logRows = /* @__PURE__ */ new Map();
  const writeFailure = (size) => {
    if (options.failWith !== void 0) return options.failWith;
    if (options.quotaAt !== void 0 && size >= options.quotaAt) return "quota";
    return void 0;
  };
  const cleanup = (rows, policy, timestampOf) => {
    const now = Date.now();
    const cutoff = policy.retentionDays > 0 ? now - policy.retentionDays * 864e5 : Number.NEGATIVE_INFINITY;
    let removed = 0;
    for (const [id, row] of [...rows]) {
      if (timestampOf(row) < cutoff) {
        rows.delete(id);
        removed += 1;
      }
    }
    if (policy.maxRecords > 0 && rows.size > policy.maxRecords) {
      const sorted = [...rows.values()].sort((a, b) => timestampOf(a) - timestampOf(b));
      const surplus = sorted.slice(0, rows.size - policy.maxRecords);
      for (const row of surplus) {
        rows.delete(row.id);
        removed += 1;
      }
    }
    return removed;
  };
  const pendingCount = (rows) => {
    let total = 0;
    for (const row of rows.values()) {
      if (row.uploadStatus === "pending" || row.uploadStatus === "uploading") total += 1;
    }
    return total;
  };
  const errors = {
    initialize: async () => result(options.failWith, void 0),
    save: async (record) => {
      const failure = writeFailure(errorRows.size);
      if (failure !== void 0) return { ok: false, reason: failure };
      for (const [id, existing] of errorRows) {
        if (existing.fingerprint === record.fingerprint && existing.uploadStatus === "pending") {
          errorRows.set(id, {
            ...existing,
            occurrenceCount: existing.occurrenceCount + record.occurrenceCount,
            firstSeen: Math.min(existing.firstSeen, record.firstSeen),
            lastSeen: Math.max(existing.lastSeen, record.lastSeen)
          });
          return { ok: true, value: void 0 };
        }
      }
      errorRows.set(record.id, record);
      return { ok: true, value: void 0 };
    },
    get: async (id) => result(options.failWith, errorRows.get(id)),
    getAll: async () => result(
      options.failWith,
      [...errorRows.values()].sort((a, b) => b.lastSeen - a.lastSeen)
    ),
    getPending: async (limit = 100) => {
      const pending = [...errorRows.values()].filter((row) => row.uploadStatus === "pending").sort((a, b) => b.lastSeen - a.lastSeen);
      return result(options.failWith, limit > 0 ? pending.slice(0, limit) : pending);
    },
    claimPending: async (limit, now) => {
      const claimed = [];
      const candidates = [...errorRows.values()].filter((row) => row.uploadStatus === "pending").sort((a, b) => b.lastSeen - a.lastSeen);
      for (const row of candidates) {
        if (claimed.length >= limit) break;
        const updated = {
          ...row,
          uploadStatus: "uploading",
          uploadAttempts: row.uploadAttempts + 1,
          claimedAt: now
        };
        errorRows.set(row.id, updated);
        claimed.push(updated);
      }
      return result(options.failWith, claimed);
    },
    requeueStale: async (olderThanMs, now) => {
      let requeued = 0;
      for (const [id, row] of [...errorRows]) {
        if (row.uploadStatus !== "uploading") continue;
        if (row.claimedAt !== void 0 && now - row.claimedAt <= olderThanMs) continue;
        const updated = { ...row, uploadStatus: "pending" };
        delete updated.claimedAt;
        errorRows.set(id, updated);
        requeued += 1;
      }
      return result(options.failWith, requeued);
    },
    getFailed: async () => result(
      options.failWith,
      [...errorRows.values()].filter((row) => row.uploadStatus === "failed")
    ),
    delete: async (ids) => {
      let removed = 0;
      for (const id of ids) if (errorRows.delete(id)) removed += 1;
      return result(options.failWith, removed);
    },
    updateUploadStatus: async (ids, status) => {
      let updated = 0;
      for (const id of ids) {
        const row = errorRows.get(id);
        if (row === void 0) continue;
        const next = { ...row, uploadStatus: status };
        if (status === "uploading") next.claimedAt = Date.now();
        else delete next.claimedAt;
        errorRows.set(id, next);
        updated += 1;
      }
      return result(options.failWith, updated);
    },
    count: async () => result(options.failWith, errorRows.size),
    pendingCount: async () => result(options.failWith, pendingCount(errorRows)),
    cleanup: async (policy) => result(
      options.failWith,
      cleanup(errorRows, policy, (row) => row.lastSeen)
    ),
    clear: async () => {
      const before = errorRows.size;
      errorRows.clear();
      return result(options.failWith, before);
    },
    close: () => void 0,
    all: () => [...errorRows.values()].sort((a, b) => b.lastSeen - a.lastSeen),
    reset: () => {
      errorRows.clear();
    }
  };
  const logs = {
    initialize: async () => result(options.failWith, void 0),
    saveBatch: async (records) => {
      const failure = writeFailure(logRows.size);
      if (failure !== void 0) return { ok: false, reason: failure };
      for (const record of records) logRows.set(record.id, record);
      return { ok: true, value: void 0 };
    },
    get: async (id) => result(options.failWith, logRows.get(id)),
    getAll: async () => result(
      options.failWith,
      [...logRows.values()].sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq)
    ),
    getPending: async (limit = 100) => {
      const pending = [...logRows.values()].filter((row) => row.uploadStatus === "pending").sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq);
      return result(options.failWith, limit > 0 ? pending.slice(0, limit) : pending);
    },
    claimPending: async (limit, now) => {
      const claimed = [];
      const candidates = [...logRows.values()].filter((row) => row.uploadStatus === "pending").sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq);
      for (const row of candidates) {
        if (claimed.length >= limit) break;
        const updated = {
          ...row,
          uploadStatus: "uploading",
          uploadAttempts: row.uploadAttempts + 1,
          claimedAt: now
        };
        logRows.set(row.id, updated);
        claimed.push(updated);
      }
      return result(options.failWith, claimed);
    },
    requeueStale: async (olderThanMs, now) => {
      let requeued = 0;
      for (const [id, row] of [...logRows]) {
        if (row.uploadStatus !== "uploading") continue;
        if (row.claimedAt !== void 0 && now - row.claimedAt <= olderThanMs) continue;
        const updated = { ...row, uploadStatus: "pending" };
        delete updated.claimedAt;
        logRows.set(id, updated);
        requeued += 1;
      }
      return result(options.failWith, requeued);
    },
    getFailed: async () => result(
      options.failWith,
      [...logRows.values()].filter((row) => row.uploadStatus === "failed")
    ),
    delete: async (ids) => {
      let removed = 0;
      for (const id of ids) if (logRows.delete(id)) removed += 1;
      return result(options.failWith, removed);
    },
    updateUploadStatus: async (ids, status) => {
      let updated = 0;
      for (const id of ids) {
        const row = logRows.get(id);
        if (row === void 0) continue;
        const next = { ...row, uploadStatus: status };
        if (status === "uploading") next.claimedAt = Date.now();
        else delete next.claimedAt;
        logRows.set(id, next);
        updated += 1;
      }
      return result(options.failWith, updated);
    },
    count: async () => result(options.failWith, logRows.size),
    pendingCount: async () => result(options.failWith, pendingCount(logRows)),
    cleanup: async (policy) => result(
      options.failWith,
      cleanup(logRows, policy, (row) => row.timestamp)
    ),
    clear: async () => {
      const before = logRows.size;
      logRows.clear();
      return result(options.failWith, before);
    },
    close: () => void 0,
    all: () => [...logRows.values()].sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq),
    reset: () => {
      logRows.clear();
    }
  };
  return {
    errors,
    logs,
    initialize: async () => result(options.failWith, void 0),
    close: () => void 0,
    reset: () => {
      errorRows.clear();
      logRows.clear();
    }
  };
}

export { createFakeTransport, createMemoryRepository };
//# sourceMappingURL=testing.js.map
//# sourceMappingURL=testing.js.map