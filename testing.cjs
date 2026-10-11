'use strict';

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

// src/errors/constants.ts
var REDACTED = "[REDACTED]";
var FINGERPRINT_SEPARATOR = "\u241F";
var SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|password|passwd|pwd|secret|apikey|accesskey|privatekey|credential|session|signature|bearer|otp|^auth$|email|phone)/;
var JWT_PATTERN = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
var AUTH_SCHEME_PATTERN = /\b(Bearer|Basic|Token)\s+[\w.~+/=-]{6,}/gi;
var EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
var KV_SECRET_PATTERNS = [
  /((?:token|access_token|refresh_token|id_token)["']?\s*[=:]\s*["']?)([^\s&"',;]+)/gi,
  /((?:password|pwd|secret|client_secret)["']?\s*[=:]\s*["']?)([^\s&"',;]+)/gi,
  /((?:api_key|api-key|apikey|session|sessionid)["']?\s*[=:]\s*["']?)([^\s&"',;]+)/gi,
  // `phone` is in SENSITIVE_KEY_PATTERN, so free text has to honour it too —
  // otherwise `phone=+1415…` in a log message would survive while the same value
  // under a `phone` object key would not.
  /((?:phone|mobile|msisdn|telephone|email)["']?\s*[=:]\s*["']?)([^\s&"',;]+)/gi
];
var STACK_QUERY_PATTERN = /\?[^\s:)]*(?=:\d+(?::\d+)?)/g;
var LONG_SECRET_TEXT_PATTERN = /(^|[^\w-])([\w-]{32,200})(?=[^\w-]|$)/g;
var CHUNK_ERROR_PATTERN = /(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError|Unable to preload CSS|Failed to load module script)/i;
var DIGITS_ONLY_PATTERN = /^\d+$/;
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var LONG_HEX_PATTERN = /^[0-9a-f]{24,}$/i;
var LONG_SECRET_PATTERN = /^[\w-]{32,}$/;
var HARD_TEXT_CAP = 2e4;
var MAX_DEPTH = 4;
var MAX_KEYS = 30;
var MAX_ARRAY_ITEMS = 20;
var MAX_STRING_LENGTH = 2e3;
var MAX_MESSAGE_LENGTH = 1e3;
var MAX_STACK_LENGTH = 8e3;
var MAX_CAUSE_DEPTH = 3;
var MAX_AGGREGATE_ERRORS = 5;
var MAX_TAGS = 20;
var MAX_URL_LENGTH = 2e3;
var MAX_ALLOWED_QUERY_VALUE_LENGTH = 100;
var DEFAULT_ALLOWED_QUERY_PARAMS = [
  "limit",
  "offset",
  "page",
  "pageSize",
  "size",
  "sort",
  "order",
  "scope",
  "lng",
  "lang",
  "type"
];
function truncationSuffix(dropped) {
  return `\u2026[truncated ${String(dropped)}]`;
}

// src/core/ids.ts
var counter = 0;
function b36(n) {
  return n.toString(36);
}
function unfingerprintedId(attempt) {
  counter += 1;
  return `unfingerprinted-${b36(Date.now())}-${b36(attempt + counter)}`;
}

// src/errors/fingerprint.ts
var ID_SEGMENT = ":id";
var FINGERPRINT_STACK_FRAMES = 5;
var FINGERPRINT_COMPONENT_FRAMES = 3;
function cyrb53(input, seed = 0) {
  let h1 = 3735928559 ^ seed;
  let h2 = 1103547991 ^ seed;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function hex14(value) {
  return value.toString(16).padStart(14, "0");
}
function normalizePathForFingerprint(input) {
  if (input === void 0 || input.length === 0) return "";
  try {
    let path = input;
    const hashIndex = path.indexOf("#");
    if (hashIndex >= 0) path = path.slice(0, hashIndex);
    const queryIndex = path.indexOf("?");
    if (queryIndex >= 0) path = path.slice(0, queryIndex);
    return path.split("/").map((segment) => {
      if (segment.length === 0) return segment;
      if (DIGITS_ONLY_PATTERN.test(segment)) return ID_SEGMENT;
      if (UUID_PATTERN.test(segment)) return ID_SEGMENT;
      if (LONG_HEX_PATTERN.test(segment)) return ID_SEGMENT;
      return segment;
    }).join("/");
  } catch {
    return "";
  }
}
function topStackFrames(stack, count) {
  if (stack === void 0 || stack.length === 0) return "";
  const frames = [];
  try {
    for (const line of stack.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("at ") || trimmed.includes("@")) {
        frames.push(trimmed);
        if (frames.length >= count) break;
      }
    }
  } catch {
    return "";
  }
  return frames.join("|");
}
function fingerprintParts(input) {
  const parts = [
    String(input.source),
    String(input.category),
    input.name,
    input.message,
    topStackFrames(input.stack, FINGERPRINT_STACK_FRAMES),
    topStackFrames(input.componentStack, FINGERPRINT_COMPONENT_FRAMES),
    normalizePathForFingerprint(input.route)
  ];
  const api = input.api;
  if (api !== void 0) {
    parts.push(
      String(api.kind ?? ""),
      String(api.method ?? "").toUpperCase(),
      normalizePathForFingerprint(api.url)
    );
    parts.push(api.status === void 0 ? "" : String(api.status));
  } else {
    parts.push("", "", "", "");
  }
  const event = input.event;
  if (event !== void 0) {
    parts.push(
      String(event.type ?? ""),
      normalizePathForFingerprint(event.resourceUrl),
      String(event.directive ?? "")
    );
  } else {
    parts.push("", "", "");
  }
  const hasStack = topStackFrames(input.stack, 1).length > 0;
  if (!hasStack) {
    const location = input.location;
    parts.push(
      location === void 0 ? "" : `${String(location.source ?? "")}:${String(location.line ?? "")}:${String(location.column ?? "")}`
    );
  } else {
    parts.push("");
  }
  return parts;
}
var fallbackAttempt = 0;
function fingerprint(input) {
  try {
    const joined = fingerprintParts(input).join(FINGERPRINT_SEPARATOR);
    const first = hex14(cyrb53(joined, 1));
    const second = hex14(cyrb53(joined, 2));
    return `${first}${second}`;
  } catch {
    fallbackAttempt += 1;
    return unfingerprintedId(fallbackAttempt);
  }
}

// src/core/env.ts
function safeGet(target, key) {
  if (target === null || typeof target !== "object" && typeof target !== "function") {
    return void 0;
  }
  try {
    return target[key];
  } catch {
    return void 0;
  }
}

// src/errors/sanitize.ts
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var OVERFLOW_KEY = "\u2026";
function testRe(re, value) {
  if (re.global || re.sticky) {
    re.lastIndex = 0;
    const result2 = re.test(value);
    re.lastIndex = 0;
    return result2;
  }
  return re.test(value);
}
function replaceAll(value, re, replacement) {
  re.lastIndex = 0;
  const result2 = value.replace(re, replacement);
  re.lastIndex = 0;
  return result2;
}
function truncate(value, max) {
  if (value.length <= max) return value;
  if (max <= 0) return "";
  const suffix = truncationSuffix(value.length);
  if (suffix.length >= max) return value.slice(0, max);
  const keep = max - suffix.length;
  const dropped = value.length - keep;
  return value.slice(0, keep) + truncationSuffix(dropped);
}
function toText(input) {
  if (typeof input === "string") return input;
  if (input === null || input === void 0) return "";
  if (typeof input === "object") {
    const message = safeGet(input, "message");
    if (typeof message === "string") return message;
  }
  try {
    return String(input);
  } catch {
    return REDACTED;
  }
}
function normalizeKeyName(key) {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
function domKind(value) {
  const nodeType = safeGet(value, "nodeType");
  const tagName = safeGet(value, "tagName");
  if (nodeType === 1 && typeof tagName === "string") {
    return `[Element ${tagName.toLowerCase()}]`;
  }
  const type = safeGet(value, "type");
  const hasTarget = safeGet(value, "target") !== void 0;
  const hasPreventDefault = typeof safeGet(value, "preventDefault") === "function";
  if (typeof type === "string" && hasTarget && hasPreventDefault) {
    return `[Event ${type}]`;
  }
  return void 0;
}
function isErrorLike(value) {
  const name = safeGet(value, "name");
  const message = safeGet(value, "message");
  if (typeof message !== "string") return false;
  return typeof name === "string" || typeof safeGet(value, "stack") === "string";
}
function createSanitizer(config = {}) {
  const extraKeys = Array.isArray(config.extraSensitiveKeys) ? config.extraSensitiveKeys.filter(
    (entry) => typeof entry === "string" || entry instanceof RegExp
  ) : [];
  const extraPatterns = Array.isArray(config.extraPatterns) ? config.extraPatterns.filter((entry) => entry instanceof RegExp) : [];
  const allowedQueryParams = new Set(
    (Array.isArray(config.allowedQueryParams) ? config.allowedQueryParams : DEFAULT_ALLOWED_QUERY_PARAMS).filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase())
  );
  const isSensitiveKey = (key) => {
    try {
      const normalized = normalizeKeyName(key);
      if (testRe(SENSITIVE_KEY_PATTERN, normalized)) return true;
      for (const extra of extraKeys) {
        if (typeof extra === "string") {
          if (normalizeKeyName(extra) === normalized) return true;
        } else if (testRe(extra, key) || testRe(extra, normalized)) {
          return true;
        }
      }
      return false;
    } catch {
      return true;
    }
  };
  const isAllowedQueryKey = (key) => {
    const lower = key.toLowerCase();
    return allowedQueryParams.has(lower) && !isSensitiveKey(key);
  };
  const scrub = (input, maxLength) => {
    let text = input.length > HARD_TEXT_CAP ? input.slice(0, HARD_TEXT_CAP) : input;
    text = text.replace(/\b(?:https?|blob):\/\/[^\s"'<>()[\]]+/gi, (match) => {
      const sanitized = sanitizeUrlValue(match, MAX_URL_LENGTH);
      return sanitized ?? REDACTED;
    });
    text = text.replace(/\bdata:[^\s"'<>]+/gi, "data:[REDACTED]");
    text = replaceAll(text, JWT_PATTERN, REDACTED);
    text = replaceAll(text, AUTH_SCHEME_PATTERN, "$1 [REDACTED]");
    for (const pattern of KV_SECRET_PATTERNS) {
      text = replaceAll(text, pattern, "$1[REDACTED]");
    }
    text = replaceAll(text, LONG_SECRET_TEXT_PATTERN, `$1${REDACTED}`);
    text = replaceAll(text, EMAIL_PATTERN, REDACTED);
    for (const pattern of extraPatterns) {
      text = replaceAll(text, pattern, REDACTED);
    }
    return truncate(text, maxLength);
  };
  const sanitizeSegment = (segment) => {
    if (segment.length === 0) return segment;
    try {
      const decoded = safeDecode(segment);
      if (testRe(EMAIL_PATTERN, decoded)) return REDACTED;
      if (decoded.startsWith("eyJ")) return REDACTED;
      if (LONG_SECRET_PATTERN.test(decoded)) return REDACTED;
      return segment;
    } catch {
      return REDACTED;
    }
  };
  const sanitizePath = (pathname) => {
    if (pathname.length === 0) return pathname;
    return pathname.split("/").map(sanitizeSegment).join("/");
  };
  const buildQuery = (pairs, prefix) => {
    if (pairs.length === 0) return "";
    const parts = [];
    for (const [key, value] of pairs) {
      if (isAllowedQueryKey(key)) {
        const kept = truncate(value, MAX_ALLOWED_QUERY_VALUE_LENGTH);
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(kept)}`);
      } else {
        parts.push(`${encodeURIComponent(key)}=${REDACTED}`);
      }
    }
    return parts.length > 0 ? `${prefix}${parts.join("&")}` : "";
  };
  const readPairs = (params) => {
    const pairs = [];
    try {
      params.forEach((value, key) => {
        pairs.push([key, value]);
      });
    } catch {
    }
    return pairs;
  };
  const sanitizeUrlValue = (input, maxLength) => {
    const raw = input.trim();
    if (raw.length === 0) return void 0;
    try {
      const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
      if (absolute) {
        let parsed;
        try {
          parsed = new URL(raw);
        } catch {
          return truncate(raw.split(/[?#]/)[0] ?? raw, maxLength);
        }
        const scheme = parsed.protocol.toLowerCase();
        if (scheme === "data:") return "data:[REDACTED]";
        if (scheme !== "http:" && scheme !== "https:") return `${scheme}${REDACTED}`;
        const origin = `${parsed.protocol}//${parsed.host}`;
        const path = sanitizePath(parsed.pathname);
        const query2 = buildQuery(readPairs(parsed.searchParams), "?");
        return truncate(`${origin}${path}${query2}`, maxLength);
      }
      if (/\s/.test(raw)) {
        const cut2 = raw.search(/[?#]/);
        return truncate(cut2 >= 0 ? raw.slice(0, cut2) : raw, maxLength);
      }
      let rest = raw;
      const hashIndex = rest.indexOf("#");
      if (hashIndex >= 0) rest = rest.slice(0, hashIndex);
      const queryIndex = rest.indexOf("?");
      const pathPart = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
      const queryPart = queryIndex >= 0 ? rest.slice(queryIndex + 1) : "";
      const query = queryPart.length > 0 ? buildQuery(readPairs(new URLSearchParams(queryPart)), "?") : "";
      return truncate(`${sanitizePath(pathPart)}${query}`, maxLength);
    } catch {
      const cut2 = raw.search(/[?#]/);
      return truncate(cut2 >= 0 ? raw.slice(0, cut2) : raw, maxLength);
    }
  };
  const walk = (value, key, depth, seen) => {
    try {
      if (key !== void 0 && isSensitiveKey(key)) return REDACTED;
      if (value === null) return null;
      if (depth > MAX_DEPTH) return "[MaxDepth]";
      switch (typeof value) {
        case "string":
          return scrub(value, MAX_STRING_LENGTH);
        case "number":
          return Number.isFinite(value) ? value : String(value);
        case "boolean":
          return value;
        case "bigint":
          return String(value);
        case "symbol":
          return String(value);
        case "undefined":
          return null;
        case "function":
          return "[Function]";
        default:
          break;
      }
      const object = value;
      if (seen.has(object)) return "[Circular]";
      if (typeof globalThis.Event !== "undefined" && object instanceof Event) {
        return `[Event ${String(safeGet(object, "type"))}]`;
      }
      if (typeof globalThis.Element !== "undefined" && object instanceof Element) {
        const tagName = safeGet(object, "tagName");
        return `[Element ${typeof tagName === "string" ? tagName.toLowerCase() : "unknown"}]`;
      }
      const dom = domKind(object);
      if (dom !== void 0) return dom;
      if (object instanceof Date) {
        const time = object.getTime();
        return Number.isFinite(time) ? object.toISOString() : "Invalid Date";
      }
      if (object instanceof Error || isErrorLike(object)) {
        return {
          name: scrub(toText(safeGet(object, "name")), MAX_MESSAGE_LENGTH),
          message: scrub(toText(safeGet(object, "message")), MAX_MESSAGE_LENGTH)
        };
      }
      seen.add(object);
      if (Array.isArray(object)) {
        const output = [];
        const length = Math.min(object.length, MAX_ARRAY_ITEMS);
        for (let index = 0; index < length; index += 1) {
          output.push(walk(object[index], void 0, depth + 1, seen));
        }
        if (object.length > MAX_ARRAY_ITEMS) {
          output.push(`[+${String(object.length - MAX_ARRAY_ITEMS)}]`);
        }
        seen.delete(object);
        return output;
      }
      if (object instanceof Set) {
        const output = [];
        let index = 0;
        for (const entry of object) {
          if (index >= MAX_ARRAY_ITEMS) break;
          output.push(walk(entry, void 0, depth + 1, seen));
          index += 1;
        }
        if (object.size > MAX_ARRAY_ITEMS) {
          output.push(`[+${String(object.size - MAX_ARRAY_ITEMS)}]`);
        }
        seen.delete(object);
        return output;
      }
      if (object instanceof Map) {
        const entries2 = [];
        let index = 0;
        for (const [entryKey, entryValue] of object) {
          if (index >= MAX_KEYS) break;
          const name = typeof entryKey === "string" ? entryKey : toText(entryKey);
          entries2.push([name, walk(entryValue, name, depth + 1, seen)]);
          index += 1;
        }
        if (object.size > MAX_KEYS) {
          entries2.push([OVERFLOW_KEY, `[+${String(object.size - MAX_KEYS)} keys]`]);
        }
        seen.delete(object);
        return Object.fromEntries(entries2);
      }
      let names;
      try {
        names = Object.keys(object);
      } catch {
        return "[Unserializable]";
      }
      const entries = [];
      const limit = Math.min(names.length, MAX_KEYS);
      for (let index = 0; index < limit; index += 1) {
        const name = names[index];
        if (name === void 0 || FORBIDDEN_KEYS.has(name)) continue;
        let child;
        try {
          child = object[name];
        } catch {
          entries.push([name, "[Unserializable]"]);
          continue;
        }
        entries.push([name, walk(child, name, depth + 1, seen)]);
      }
      if (names.length > MAX_KEYS) {
        entries.push([OVERFLOW_KEY, `[+${String(names.length - MAX_KEYS)} keys]`]);
      }
      seen.delete(object);
      return Object.fromEntries(entries);
    } catch {
      return "[Unserializable]";
    }
  };
  return {
    text: (input, maxLength = MAX_STRING_LENGTH) => {
      try {
        return scrub(toText(input), maxLength);
      } catch {
        return REDACTED;
      }
    },
    stack: (input, maxLength = MAX_STACK_LENGTH) => {
      try {
        const raw = toText(input);
        const bounded = raw.length > HARD_TEXT_CAP ? raw.slice(0, HARD_TEXT_CAP) : raw;
        return scrub(replaceAll(bounded, STACK_QUERY_PATTERN, ""), maxLength);
      } catch {
        return REDACTED;
      }
    },
    url: (input, maxLength = MAX_URL_LENGTH) => {
      try {
        if (typeof input !== "string") return void 0;
        return sanitizeUrlValue(input, maxLength);
      } catch {
        return REDACTED;
      }
    },
    value: (input, key) => {
      try {
        return walk(input, key, 0, /* @__PURE__ */ new WeakSet());
      } catch {
        return "[Unserializable]";
      }
    },
    isSensitiveKey
  };
}
var builtInSanitizer = createSanitizer();
var activeSanitizer = builtInSanitizer;
function sanitizeStack(input, maxLength) {
  return activeSanitizer.stack(input, maxLength);
}
function sanitizeValue(input, key) {
  return activeSanitizer.value(input, key);
}

// src/errors/contextPatch.ts
function applyErrorContextPatch(record, patch) {
  try {
    let changed = false;
    const next = { ...record };
    const severity = patch.severity;
    if (severity !== void 0 && severity !== record.severity) {
      next.severity = severity;
      changed = true;
    }
    const tags = patch.tags;
    if (tags !== void 0) {
      const merged = { ...record.tags ?? {} };
      let added = false;
      for (const [key, value] of Object.entries(tags)) {
        if (Object.keys(merged).length >= MAX_TAGS && merged[key] === void 0) break;
        if (merged[key] !== value) {
          merged[key] = value;
          added = true;
        }
      }
      if (added) {
        next.tags = merged;
        changed = true;
      }
    }
    const extra = patch.extra;
    if (extra !== void 0) {
      const merged = { ...record.extra ?? {} };
      let added = false;
      let count = Object.keys(merged).length;
      for (const [key, value] of Object.entries(extra)) {
        if (count >= MAX_KEYS && merged[key] === void 0) break;
        if (merged[key] !== value) {
          merged[key] = value;
          added = true;
        }
        count += 1;
      }
      if (added) {
        next.extra = merged;
        changed = true;
      }
    }
    const source = patch.source;
    if (source !== void 0 && source !== record.source) {
      next.source = source;
      next.fingerprint = fingerprint({
        source,
        category: record.category,
        name: record.name,
        message: record.message,
        stack: record.stack ?? void 0,
        componentStack: record.componentStack ?? void 0,
        route: record.page.route,
        api: record.api ?? void 0,
        event: record.event ?? void 0,
        location: record.location ?? void 0
      });
      changed = true;
    }
    return changed ? next : null;
  } catch {
    return null;
  }
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
    // Mirrors the IndexedDB repository: pending-only, read-modify-write, and a
    // non-pending or missing row is a `null` value rather than a failure.
    mergeContext: async (id, patch) => {
      if (options.failWith !== void 0) return { ok: false, reason: options.failWith };
      const row = errorRows.get(id);
      if (row === void 0 || row.uploadStatus !== "pending") {
        return { ok: true, value: void 0 };
      }
      const merged = applyErrorContextPatch(row, patch);
      if (merged === null) return { ok: true, value: row };
      errorRows.set(id, merged);
      return { ok: true, value: merged };
    },
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

// src/errors/normalize.ts
var MAX_SUMMARY_LENGTH = 200;
var NON_ERROR_OBJECT_NAME = "NonErrorObject";
var NON_ERROR_MESSAGE_PREFIX = "Non-Error value thrown";
var UNNORMALIZABLE = {
  name: "Error",
  message: "Unnormalizable error value",
  thrownType: "other",
  isChunkError: false,
  isCrossOrigin: false,
  category: "runtime"
};
function cut(text, max) {
  return text.length <= max ? text : text.slice(0, max);
}
function isErrorLike2(value) {
  const message = safeGet(value, "message");
  if (typeof message !== "string") return false;
  const name = safeGet(value, "name");
  const stack = safeGet(value, "stack");
  return typeof name === "string" || typeof stack === "string";
}
function summarize(value) {
  try {
    if (typeof value === "string") return cut(value, MAX_SUMMARY_LENGTH);
    const sanitized = sanitizeValue(value);
    const json = JSON.stringify(sanitized);
    return cut(json ?? String(sanitized), MAX_SUMMARY_LENGTH);
  } catch {
    return REDACTED;
  }
}
function readString(target, key) {
  const value = safeGet(target, key);
  return typeof value === "string" ? value : void 0;
}
function aggregateErrorCtor() {
  try {
    const ctor = Reflect.get(globalThis, "AggregateError");
    return typeof ctor === "function" ? ctor : void 0;
  } catch {
    return void 0;
  }
}
function isAggregate(value) {
  const ctor = aggregateErrorCtor();
  if (ctor !== void 0) {
    try {
      if (value instanceof ctor) return true;
    } catch {
    }
  }
  if (readString(value, "name") !== "AggregateError") return false;
  return Array.isArray(safeGet(value, "errors"));
}
function isDomEvent(value) {
  const type = safeGet(value, "type");
  return typeof type === "string" && typeof safeGet(value, "preventDefault") === "function" && safeGet(value, "target") !== void 0;
}
function fromErrorLike(value) {
  const rawName = readString(value, "name");
  let name = rawName !== void 0 && rawName.length > 0 ? rawName : "";
  if (name.length === 0) {
    const ctor = safeGet(value, "constructor");
    const constructorName = readString(ctor, "name");
    name = constructorName !== void 0 && constructorName.length > 0 ? constructorName : "Error";
  }
  const rawMessage = readString(value, "message") ?? "";
  const stack = readString(value, "stack");
  const result2 = {
    name: cut(name, MAX_MESSAGE_LENGTH),
    message: cut(rawMessage, MAX_MESSAGE_LENGTH)
  };
  if (stack !== void 0) result2.stack = stack;
  return result2;
}
function readCauses(root) {
  const causes = [];
  const seen = /* @__PURE__ */ new Set();
  if (root !== null && typeof root === "object") seen.add(root);
  let current = safeGet(root, "cause");
  while (current !== void 0 && current !== null && causes.length < MAX_CAUSE_DEPTH) {
    if (typeof current === "object") {
      if (seen.has(current)) break;
      seen.add(current);
    } else if (seen.has(current)) {
      break;
    } else {
      seen.add(current);
    }
    causes.push(causeFrom(current));
    current = safeGet(current, "cause");
  }
  return causes.length > 0 ? causes : void 0;
}
function causeFrom(value) {
  if (value !== null && typeof value === "object" && isErrorLike2(value)) {
    const { name, message, stack } = fromErrorLike(value);
    const cause = { name, message };
    if (stack !== void 0) {
      return { ...cause, stack: sanitizeStack(stack, MAX_STACK_LENGTH) };
    }
    return cause;
  }
  return {
    name: "NonErrorCause",
    message: cut(`${NON_ERROR_MESSAGE_PREFIX}: ${summarize(value)}`, MAX_MESSAGE_LENGTH)
  };
}
function nonErrorExtra(value, thrownType) {
  return { thrownValue: sanitizeValue(value), thrownType };
}
function build(partial) {
  const isChunk = partial.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(partial.message) || CHUNK_ERROR_PATTERN.test(partial.name);
  const isCrossOrigin = partial.message.trim() === "Script error.";
  const out = {
    name: partial.name,
    message: partial.message,
    thrownType: partial.thrownType,
    isChunkError: isChunk,
    isCrossOrigin
  };
  if (partial.stack !== void 0) out.stack = partial.stack;
  if (partial.causes !== void 0) out.causes = partial.causes;
  if (partial.aggregatedCount !== void 0) out.aggregatedCount = partial.aggregatedCount;
  if (partial.extra !== void 0) out.extra = partial.extra;
  if (isChunk) out.category = "chunk";
  return out;
}
function normalizeError(input) {
  try {
    if (input === null) {
      return build({
        name: "ThrownNull",
        message: `${NON_ERROR_MESSAGE_PREFIX}: null`,
        thrownType: "null",
        extra: nonErrorExtra(input, "null")
      });
    }
    if (input === void 0) {
      return build({
        name: "ThrownUndefined",
        message: `${NON_ERROR_MESSAGE_PREFIX}: undefined`,
        thrownType: "undefined",
        extra: nonErrorExtra(input, "undefined")
      });
    }
    const type = typeof input;
    if (type === "string") {
      const text = input;
      return build({
        name: "ThrownString",
        message: cut(text, MAX_MESSAGE_LENGTH),
        thrownType: "string",
        extra: nonErrorExtra(input, "string")
      });
    }
    if (type === "number") {
      return build({
        name: "ThrownNumber",
        message: `${NON_ERROR_MESSAGE_PREFIX}: ${String(input)}`,
        thrownType: "number",
        extra: nonErrorExtra(input, "number")
      });
    }
    if (type === "boolean") {
      return build({
        name: "ThrownBoolean",
        message: `${NON_ERROR_MESSAGE_PREFIX}: ${String(input)}`,
        thrownType: "boolean",
        extra: nonErrorExtra(input, "boolean")
      });
    }
    if (type === "bigint") {
      let rendered;
      try {
        rendered = `${String(input)}n`;
      } catch {
        rendered = REDACTED;
      }
      return build({
        name: "ThrownBigInt",
        message: `${NON_ERROR_MESSAGE_PREFIX}: ${rendered}`,
        thrownType: "other",
        extra: nonErrorExtra(input, "other")
      });
    }
    if (type === "symbol" || type === "function") {
      let rendered;
      try {
        rendered = type === "function" ? "[Function]" : String(input);
      } catch {
        rendered = REDACTED;
      }
      return build({
        name: type === "function" ? "ThrownFunction" : "ThrownSymbol",
        message: `${NON_ERROR_MESSAGE_PREFIX}: ${cut(rendered, MAX_SUMMARY_LENGTH)}`,
        thrownType: "other",
        extra: nonErrorExtra(input, "other")
      });
    }
    const object = input;
    if (isDomEvent(object)) {
      const inner = safeGet(object, "error");
      if (inner !== void 0 && inner !== null) {
        return normalizeError(inner);
      }
      const eventType = readString(object, "type") ?? "unknown";
      return build({
        name: "ErrorEvent",
        message: `${eventType} event`,
        thrownType: "object",
        extra: { eventType }
      });
    }
    if (isAggregate(object)) {
      const raw = safeGet(object, "errors");
      const list = Array.isArray(raw) ? raw : [];
      const subErrors = [];
      const limit = Math.min(list.length, MAX_AGGREGATE_ERRORS);
      for (let index = 0; index < limit; index += 1) {
        subErrors.push(causeFrom(list[index]));
      }
      const own = fromErrorLike(object);
      const extra = {
        aggregatedCount: list.length,
        aggregatedErrors: subErrors.map((entry) => ({
          name: entry.name,
          message: entry.message
        }))
      };
      return build({
        name: own.name === "Error" ? "AggregateError" : own.name,
        message: own.message,
        thrownType: "error",
        stack: own.stack !== void 0 ? sanitizeStack(own.stack, MAX_STACK_LENGTH) : void 0,
        causes: subErrors.length > 0 ? subErrors : void 0,
        aggregatedCount: list.length,
        extra
      });
    }
    if (isErrorLike2(object)) {
      const { name, message, stack } = fromErrorLike(object);
      const causes = readCauses(object);
      return build({
        name,
        message,
        thrownType: "error",
        stack: stack !== void 0 ? sanitizeStack(stack, MAX_STACK_LENGTH) : void 0,
        causes
      });
    }
    return build({
      name: NON_ERROR_OBJECT_NAME,
      message: `${NON_ERROR_MESSAGE_PREFIX}: ${summarize(object)}`,
      thrownType: "object",
      extra: nonErrorExtra(object, "object")
    });
  } catch {
    return UNNORMALIZABLE;
  }
}

// src/logger/logger.constants.ts
var LOG_LEVEL_PRIORITY = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

// src/testing/mocks.ts
function createCaptureErrorMock() {
  const calls = [];
  const captureError = (error, ctx) => {
    let message;
    try {
      message = normalizeError(error).message;
    } catch {
      message = "";
    }
    calls.push({ error, ctx, message });
  };
  return {
    captureError,
    calls,
    last: () => calls[calls.length - 1],
    count: () => calls.length,
    messages: () => calls.map((call) => call.message),
    withSource: (source) => calls.filter((call) => call.ctx?.source === source),
    reset: () => {
      calls.length = 0;
    }
  };
}
function createLoggerMock(options = {}) {
  const calls = [];
  const sinks = [];
  let level = options.level ?? "warn";
  let enabled = options.enabled ?? true;
  const record = (callLevel, message, args) => {
    if (!enabled) return;
    calls.push({
      level: callLevel,
      // The real facade coerces a non-string message; so does this, guarded.
      message: typeof message === "string" ? message : "",
      args
    });
  };
  const logger = {
    trace: (message, ...args) => {
      record("trace", message, args);
    },
    debug: (message, ...args) => {
      record("debug", message, args);
    },
    info: (message, ...args) => {
      record("info", message, args);
    },
    warn: (message, ...args) => {
      record("warn", message, args);
    },
    error: (message, ...args) => {
      record("error", message, args);
    },
    addSink: (sink) => {
      sinks.push(sink);
      return () => {
        const index = sinks.indexOf(sink);
        if (index >= 0) sinks.splice(index, 1);
      };
    },
    setLevel: (next) => {
      level = next;
    },
    setEnabled: (value) => {
      enabled = value === true;
    },
    getConfig: () => ({
      level,
      enabled
    })
  };
  const priority = (value) => LOG_LEVEL_PRIORITY[value] ?? 0;
  return {
    logger,
    calls,
    atLevel: (value) => calls.filter((call) => call.level === value),
    atLeast: (value) => calls.filter((call) => priority(call.level) >= priority(value)),
    last: () => calls[calls.length - 1],
    messages: () => calls.map((call) => call.message),
    sinks,
    reset: () => {
      calls.length = 0;
      sinks.length = 0;
      level = options.level ?? "warn";
      enabled = options.enabled ?? true;
    }
  };
}

exports.createCaptureErrorMock = createCaptureErrorMock;
exports.createFakeTransport = createFakeTransport;
exports.createLoggerMock = createLoggerMock;
exports.createMemoryRepository = createMemoryRepository;
