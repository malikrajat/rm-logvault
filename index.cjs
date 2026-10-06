'use strict';

// src/core/env.ts
function getGlobal(key) {
  try {
    return globalThis[key];
  } catch {
    return void 0;
  }
}
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
function getWindow() {
  const w = getGlobal("window");
  if (w === null || typeof w !== "object") return void 0;
  return w;
}
function getDocument() {
  const d = getGlobal("document");
  if (d === null || typeof d !== "object") return void 0;
  return d;
}
function getNavigator() {
  const n = getGlobal("navigator");
  if (n === null || typeof n !== "object") return void 0;
  return n;
}
function getWorkerScope() {
  if (getWindow() !== void 0) return void 0;
  const s = getGlobal("self");
  if (s === null || typeof s !== "object") return void 0;
  return s;
}
function isBrowser() {
  return getWindow() !== void 0 && getDocument() !== void 0;
}
function getEventTarget() {
  const w = getWindow();
  if (w !== void 0) return w;
  const s = getWorkerScope();
  if (s !== void 0 && typeof s.addEventListener === "function") {
    return s;
  }
  return void 0;
}
function now() {
  return Date.now();
}
function isOnline() {
  const n = getNavigator();
  if (n === void 0) return true;
  const value = safeGet(n, "onLine");
  return typeof value === "boolean" ? value : true;
}
function getVisibilityState() {
  const d = getDocument();
  if (d === void 0) return void 0;
  const value = safeGet(d, "visibilityState");
  return typeof value === "string" ? value : void 0;
}
function getUserAgent() {
  const n = getNavigator();
  if (n === void 0) return void 0;
  const value = safeGet(n, "userAgent");
  return typeof value === "string" ? value : void 0;
}
function getPlatform() {
  const n = getNavigator();
  if (n === void 0) return void 0;
  const direct = safeGet(n, "platform");
  if (typeof direct === "string" && direct.length > 0) return direct;
  const uaData = safeGet(n, "userAgentData");
  const fromUaData = safeGet(uaData, "platform");
  return typeof fromUaData === "string" ? fromUaData : void 0;
}
function getViewport() {
  const w = getWindow();
  if (w === void 0) return void 0;
  const width = safeGet(w, "innerWidth");
  const height = safeGet(w, "innerHeight");
  if (typeof width !== "number" || typeof height !== "number") return void 0;
  return `${String(width)}x${String(height)}`;
}
function getLocationHref() {
  const w = getWindow();
  if (w === void 0) return void 0;
  const loc = safeGet(w, "location");
  const href = safeGet(loc, "href");
  return typeof href === "string" ? href : void 0;
}
function readImportMetaEnv() {
  try {
    return undefined;
  } catch {
    return void 0;
  }
}
function readProcessEnv() {
  try {
    const proc = globalThis["process"];
    const env = safeGet(proc, "env");
    if (env === null || typeof env !== "object") return void 0;
    return env;
  } catch {
    return void 0;
  }
}
var DEFAULT_ENV_PREFIXES = ["VITE_", "NEXT_PUBLIC_", "REACT_APP_"];
function lookupEnv(key, prefixes, meta, proc) {
  for (const prefix of prefixes) {
    const full = `${prefix}${key}`;
    const fromMeta = meta === void 0 ? void 0 : safeGet(meta, full);
    if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
    const fromProc = proc === void 0 ? void 0 : proc[full];
    if (typeof fromProc === "string" && fromProc.length > 0) return fromProc;
  }
  return void 0;
}
function parseBool(value) {
  if (value === void 0) return void 0;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return void 0;
}
function parseNumber(value, options = {}) {
  if (value === void 0) return void 0;
  const trimmed = value.trim();
  if (trimmed === "") return void 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return void 0;
  return options.integer === true ? Math.floor(parsed) : parsed;
}
function lookupNamed(primary, legacy, prefixes, meta, proc) {
  const direct = lookupEnv(primary, prefixes, meta, proc);
  if (direct !== void 0) return direct;
  for (const name of legacy) {
    const value = lookupEnv(name, prefixes, meta, proc);
    if (value !== void 0) return value;
  }
  return void 0;
}
function fromEnv(prefix = DEFAULT_ENV_PREFIXES) {
  const prefixes = typeof prefix === "string" ? [prefix] : prefix.length > 0 ? prefix : DEFAULT_ENV_PREFIXES;
  let meta;
  let proc;
  try {
    meta = readImportMetaEnv();
    proc = readProcessEnv();
  } catch {
  }
  const out = {};
  const set = (key, value) => {
    if (value !== void 0) out[key] = value;
  };
  set("appName", lookupEnv("APP_NAME", prefixes, meta, proc));
  set("appVersion", lookupEnv("APP_VERSION", prefixes, meta, proc));
  set("buildId", lookupEnv("BUILD_ID", prefixes, meta, proc));
  set(
    "environment",
    lookupEnv("APP_ENV", prefixes, meta, proc) ?? lookupEnv("ENVIRONMENT", prefixes, meta, proc)
  );
  set("enabled", parseBool(lookupEnv("TELEMETRY_ENABLED", prefixes, meta, proc)));
  set("dbPrefix", lookupEnv("TELEMETRY_DB_PREFIX", prefixes, meta, proc));
  set(
    "openTimeoutMs",
    parseNumber(lookupEnv("TELEMETRY_OPEN_TIMEOUT_MS", prefixes, meta, proc), { integer: true })
  );
  set(
    "errorsEnabled",
    parseBool(
      lookupNamed("ERROR_TRACKING_ENABLED", ["TELEMETRY_ERRORS_ENABLED"], prefixes, meta, proc)
    )
  );
  set(
    "errorsRetentionDays",
    parseNumber(lookupEnv("ERROR_TRACKING_RETENTION_DAYS", prefixes, meta, proc))
  );
  set(
    "errorsMaxRecords",
    parseNumber(lookupEnv("ERROR_TRACKING_MAX_RECORDS", prefixes, meta, proc), { integer: true })
  );
  set(
    "errorsMaxPayloadBytes",
    parseNumber(lookupEnv("ERROR_TRACKING_MAX_PAYLOAD_BYTES", prefixes, meta, proc), {
      integer: true
    })
  );
  set(
    "errorsMaxEventsPerMinute",
    parseNumber(lookupEnv("ERROR_TRACKING_MAX_EVENTS_PER_MINUTE", prefixes, meta, proc), {
      integer: true
    })
  );
  const consoleLevel = lookupEnv("LOG_LEVEL", prefixes, meta, proc);
  const persistLevel = lookupNamed(
    "LOG_PERSIST_LEVEL",
    ["TELEMETRY_PERSIST_LEVEL"],
    prefixes,
    meta,
    proc
  );
  set(
    "logsEnabled",
    parseBool(lookupNamed("LOG_PERSIST_ENABLED", ["TELEMETRY_LOGS_ENABLED"], prefixes, meta, proc))
  );
  set("consoleLevel", consoleLevel);
  set("persistLevel", persistLevel);
  set("logLevel", lookupEnv("TELEMETRY_LOG_LEVEL", prefixes, meta, proc));
  set(
    "logsRetentionDays",
    parseNumber(lookupEnv("LOG_PERSIST_RETENTION_DAYS", prefixes, meta, proc))
  );
  set(
    "logsMaxRecords",
    parseNumber(lookupEnv("LOG_PERSIST_MAX_RECORDS", prefixes, meta, proc), { integer: true })
  );
  set(
    "logsMaxPayloadBytes",
    parseNumber(lookupEnv("LOG_PERSIST_MAX_PAYLOAD_BYTES", prefixes, meta, proc), {
      integer: true
    })
  );
  set(
    "logsMaxLogsPerMinute",
    parseNumber(lookupEnv("LOG_PERSIST_MAX_LOGS_PER_MINUTE", prefixes, meta, proc), {
      integer: true
    })
  );
  set(
    "logsWriteFlushMs",
    parseNumber(lookupEnv("LOG_PERSIST_WRITE_FLUSH_MS", prefixes, meta, proc), { integer: true })
  );
  set(
    "logsWriteBatchSize",
    parseNumber(lookupEnv("LOG_PERSIST_WRITE_BATCH_SIZE", prefixes, meta, proc), { integer: true })
  );
  set("restEnabled", parseBool(lookupEnv("TELEMETRY_REST_ENABLED", prefixes, meta, proc)));
  set(
    "errorsUrl",
    lookupNamed("ERROR_TRACKING_REST_URL", ["TELEMETRY_ERRORS_URL"], prefixes, meta, proc)
  );
  set(
    "logsUrl",
    lookupNamed("LOG_TRACKING_REST_URL", ["TELEMETRY_LOGS_URL"], prefixes, meta, proc)
  );
  set(
    "restIntervalMs",
    parseNumber(lookupEnv("TELEMETRY_SYNC_INTERVAL_MS", prefixes, meta, proc), { integer: true })
  );
  set(
    "restBatchSize",
    parseNumber(lookupEnv("TELEMETRY_SYNC_BATCH_SIZE", prefixes, meta, proc), { integer: true })
  );
  return out;
}

// src/core/ids.ts
var counter = 0;
function b36(n) {
  return n.toString(36);
}
function getCrypto() {
  try {
    const c = Reflect.get(globalThis, "crypto");
    return c !== null && typeof c === "object" ? c : void 0;
  } catch {
    return void 0;
  }
}
function tryRandomUuid(c) {
  if (c === void 0) return void 0;
  try {
    const fn = Reflect.get(c, "randomUUID");
    if (typeof fn !== "function") return void 0;
    const value = Reflect.apply(fn, c, []);
    return typeof value === "string" && value.length > 0 ? value : void 0;
  } catch {
    return void 0;
  }
}
function tryRandomHex(c) {
  if (c === void 0) return void 0;
  try {
    const fn = Reflect.get(c, "getRandomValues");
    if (typeof fn !== "function") return void 0;
    const bytes = new Uint8Array(16);
    Reflect.apply(fn, c, [bytes]);
    let out = "";
    for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
    return out;
  } catch {
    return void 0;
  }
}
function newId() {
  try {
    const c = getCrypto();
    const uuid = tryRandomUuid(c);
    if (uuid !== void 0) return uuid;
    const hex = tryRandomHex(c);
    if (hex !== void 0) return hex;
    counter += 1;
    const jitter = Math.floor(Math.random() * 16777215);
    return `${b36(Date.now())}-${b36(counter)}-${b36(jitter)}`;
  } catch {
    counter += 1;
    return `fallback-${b36(counter)}`;
  }
}
function newPageLoadId() {
  return newId();
}
function unfingerprintedId(attempt) {
  counter += 1;
  return `unfingerprinted-${b36(Date.now())}-${b36(attempt + counter)}`;
}

// src/errors/constants.ts
var SCHEMA_VERSION = 1;
var REDACTED = "[REDACTED]";
var FINGERPRINT_SEPARATOR = "\u241F";
var SINGLETON_KEY = /* @__PURE__ */ Symbol.for("logvault@1");
var RESERVED_LOG_PREFIXES = [
  "[ErrorTracking]",
  "[LogTracking]",
  "[Telemetry]",
  "[DiagnosticsExport]"
];
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
var MAX_COMPONENT_STACK_LENGTH = 4e3;
var MAX_CAUSE_DEPTH = 3;
var MAX_AGGREGATE_ERRORS = 5;
var MAX_TAGS = 20;
var MAX_TAG_KEY_LENGTH = 50;
var MAX_TAG_VALUE_LENGTH = 200;
var MAX_USER_AGENT_LENGTH = 500;
var MAX_LOG_ARGS = 5;
var PRE_INIT_ERROR_BUFFER_SIZE = 50;
var MAX_LOG_MESSAGE_LENGTH = 1e3;
var MAX_ROUTE_LENGTH = 300;
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
var UNHANDLED_SOURCES = /* @__PURE__ */ new Set([
  "window",
  "unhandledrejection",
  "resource",
  "chunk",
  "csp",
  "worker"
]);
function truncationSuffix(dropped) {
  return `\u2026[truncated ${String(dropped)}]`;
}

// src/errors/sanitize.ts
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var OVERFLOW_KEY = "\u2026";
function testRe(re, value) {
  if (re.global || re.sticky) {
    re.lastIndex = 0;
    const result = re.test(value);
    re.lastIndex = 0;
    return result;
  }
  return re.test(value);
}
function replaceAll(value, re, replacement) {
  re.lastIndex = 0;
  const result = value.replace(re, replacement);
  re.lastIndex = 0;
  return result;
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
  const isSensitiveKey2 = (key) => {
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
    return allowedQueryParams.has(lower) && !isSensitiveKey2(key);
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
        const cut3 = raw.search(/[?#]/);
        return truncate(cut3 >= 0 ? raw.slice(0, cut3) : raw, maxLength);
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
      const cut3 = raw.search(/[?#]/);
      return truncate(cut3 >= 0 ? raw.slice(0, cut3) : raw, maxLength);
    }
  };
  const walk = (value, key, depth, seen) => {
    try {
      if (key !== void 0 && isSensitiveKey2(key)) return REDACTED;
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
    isSensitiveKey: isSensitiveKey2
  };
}
var builtInSanitizer = createSanitizer();
var activeSanitizer = builtInSanitizer;
function setDefaultSanitizer(sanitizer) {
  activeSanitizer = sanitizer;
}
function resetDefaultSanitizer() {
  activeSanitizer = builtInSanitizer;
}
function sanitizeText(input, maxLength) {
  return activeSanitizer.text(input, maxLength);
}
function sanitizeUrl(input, maxLength) {
  return activeSanitizer.url(input, maxLength);
}
function sanitizeStack(input, maxLength) {
  return activeSanitizer.stack(input, maxLength);
}
function sanitizeValue(input, key) {
  return activeSanitizer.value(input, key);
}
function isSensitiveKey(key) {
  return activeSanitizer.isSensitiveKey(key);
}
function getDefaultSanitizer() {
  return activeSanitizer;
}

// src/core/state.ts
function createCleanupRegistry() {
  const teardowns = [];
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    for (let index = teardowns.length - 1; index >= 0; index -= 1) {
      const teardown = teardowns[index];
      if (teardown === void 0) continue;
      try {
        teardown();
      } catch {
      }
    }
    teardowns.length = 0;
  };
  return {
    add: (teardown) => {
      if (ran) {
        try {
          teardown();
        } catch {
        }
        return;
      }
      teardowns.push(teardown);
    },
    addListener: (target, type, handler, options) => {
      try {
        target.addEventListener(type, handler, options);
      } catch {
        return;
      }
      const capture = typeof options === "object" ? options.capture === true : options === true;
      teardowns.push(() => {
        try {
          target.removeEventListener(type, handler, capture);
        } catch {
        }
      });
    },
    setTimeout: (handler, ms) => {
      const id = setTimeout(() => {
        try {
          handler();
        } catch {
        }
      }, ms);
      teardowns.push(() => {
        clearTimeout(id);
      });
      return id;
    },
    setInterval: (handler, ms) => {
      const id = setInterval(() => {
        try {
          handler();
        } catch {
        }
      }, ms);
      teardowns.push(() => {
        clearInterval(id);
      });
      return id;
    },
    run,
    get ran() {
      return ran;
    }
  };
}
function isTelemetryState(value) {
  return value !== null && typeof value === "object" && value.__logvaultState === true;
}
function createState() {
  return {
    __logvaultState: true,
    initialized: false,
    options: null,
    repository: null,
    storageState: "disabled",
    pendingErrors: 0,
    pendingLogs: 0,
    pageLoadId: newPageLoadId(),
    teardown: null,
    flush: null,
    retryFailed: null,
    cleanup: createCleanupRegistry(),
    errorTracker: null,
    preInitErrors: [],
    captureSuppressed: false,
    eventEmitter: null
  };
}
function repairState(state) {
  const mutable = state;
  if (mutable.errorTracker === void 0) mutable.errorTracker = null;
  if (!Array.isArray(mutable.preInitErrors)) mutable.preInitErrors = [];
  if (typeof mutable.captureSuppressed !== "boolean") mutable.captureSuppressed = false;
  if (mutable.eventEmitter === void 0) mutable.eventEmitter = null;
  return state;
}
var cached;
function getState() {
  if (cached !== void 0) return cached;
  try {
    const existing = Reflect.get(globalThis, SINGLETON_KEY);
    if (isTelemetryState(existing)) {
      cached = repairState(existing);
      return cached;
    }
  } catch {
  }
  const fresh = createState();
  try {
    Object.defineProperty(globalThis, SINGLETON_KEY, {
      value: fresh,
      writable: false,
      enumerable: false,
      configurable: false
    });
  } catch {
  }
  cached = fresh;
  return cached;
}
function resetState() {
  const state = getState();
  state.initialized = false;
  state.options = null;
  state.repository = null;
  state.storageState = "disabled";
  state.pendingErrors = 0;
  state.pendingLogs = 0;
  state.teardown = null;
  state.flush = null;
  state.retryFailed = null;
  state.cleanup = createCleanupRegistry();
  state.errorTracker = null;
  state.captureSuppressed = false;
  state.eventEmitter = null;
  state.preInitErrors.length = 0;
}

// src/core/page.ts
function currentRoute() {
  try {
    const href = getLocationHref();
    if (href === void 0) return "unknown";
    const sanitized = getDefaultSanitizer().url(href, MAX_ROUTE_LENGTH);
    if (sanitized === void 0) return "unknown";
    const withoutOrigin = sanitized.replace(/^https?:\/\/[^/]*/i, "");
    return withoutOrigin.length > 0 ? withoutOrigin : "/";
  } catch {
    return "unknown";
  }
}
function currentPageInfo() {
  const state = getState();
  let url = "unknown";
  try {
    const sanitized = getDefaultSanitizer().url(getLocationHref());
    if (sanitized !== void 0) url = sanitized;
  } catch {
  }
  return { url, route: currentRoute(), pageLoadId: state.pageLoadId };
}
function currentEnvironment(options) {
  const sanitizer = getDefaultSanitizer();
  const out = {};
  if (options.appName !== void 0) out.appName = sanitizer.text(options.appName, 200);
  if (options.appVersion !== void 0) out.appVersion = sanitizer.text(options.appVersion, 200);
  if (options.buildId !== void 0) out.buildId = sanitizer.text(options.buildId, 200);
  if (options.environment !== void 0) out.environment = sanitizer.text(options.environment, 200);
  const userAgent = getUserAgent();
  if (userAgent !== void 0) out.userAgent = sanitizer.text(userAgent, MAX_USER_AGENT_LENGTH);
  const platform = getPlatform();
  if (platform !== void 0) out.platform = sanitizer.text(platform, 200);
  const viewport = getViewport();
  if (viewport !== void 0) out.viewport = viewport;
  out.online = isOnline();
  const visibility = getVisibilityState();
  if (visibility !== void 0) out.visibilityState = visibility;
  return out;
}
function currentLogEnvironment(options) {
  const out = {};
  if (options.appName !== void 0) out.appName = options.appName;
  if (options.appVersion !== void 0) out.appVersion = options.appVersion;
  if (options.buildId !== void 0) out.buildId = options.buildId;
  if (options.environment !== void 0) out.environment = options.environment;
  return out;
}

// src/logger/consoleCapture.ts
function resolveConsole() {
  try {
    const candidate = Reflect.get(globalThis, "console");
    if (candidate === null || typeof candidate !== "object") return void 0;
    return candidate;
  } catch {
    return void 0;
  }
}
var DEFAULT_LEVELS = ["warn", "error"];
function installConsoleCapture(options) {
  const levels = options.levels ?? DEFAULT_LEVELS;
  const restores = [];
  let ingesting = false;
  let restored = false;
  for (const level of levels) {
    const consoleObject = resolveConsole();
    if (consoleObject === void 0) break;
    const original = safeGet(consoleObject, level);
    const fallback = safeGet(consoleObject, "log");
    const target = typeof original === "function" ? original : fallback;
    if (typeof target !== "function") continue;
    const wrapper = function wrapper2(...args) {
      try {
        Reflect.apply(target, this ?? consoleObject, args);
      } catch {
      }
      if (ingesting) return;
      ingesting = true;
      try {
        options.onCall(level, args);
      } catch {
      } finally {
        ingesting = false;
      }
    };
    try {
      Object.defineProperty(wrapper, "name", { value: level, configurable: true });
    } catch {
    }
    let installed = false;
    try {
      Reflect.set(consoleObject, level, wrapper);
      installed = safeGet(consoleObject, level) === wrapper;
    } catch {
      installed = false;
    }
    if (!installed) continue;
    restores.push(() => {
      try {
        if (safeGet(consoleObject, level) !== wrapper) return;
        if (typeof original === "function") Reflect.set(consoleObject, level, original);
        else Reflect.deleteProperty(consoleObject, level);
      } catch {
      }
    });
  }
  return () => {
    if (restored) return;
    restored = true;
    for (const restore of restores) restore();
  };
}

// src/logger/logger.constants.ts
var LOG_LEVEL_PRIORITY = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};
var LOG_LEVELS = ["trace", "debug", "info", "warn", "error"];
var INTERNAL_PREFIXES = RESERVED_LOG_PREFIXES;
var CONSOLE_PREFIX = "[rm-logvault]";
var PRE_INIT_LOG_BUFFER_SIZE = 50;
var LOG_FLUSH_BATCH_SIZE = 50;
var LOG_FLUSH_INTERVAL_MS = 1e3;
function levelPriority(level) {
  return level === "off" ? Number.POSITIVE_INFINITY : LOG_LEVEL_PRIORITY[level];
}
function meetsLevel(actual, threshold) {
  if (threshold === "off") return false;
  return LOG_LEVEL_PRIORITY[actual] >= LOG_LEVEL_PRIORITY[threshold];
}

// src/logger/consoleWriter.ts
var PREFIX_STYLE = "color:#8a8a8a;font-weight:600";
var MESSAGE_STYLE = "color:inherit";
function resolveConsole2() {
  try {
    const candidate = Reflect.get(globalThis, "console");
    if (candidate === null || typeof candidate !== "object") return void 0;
    return candidate;
  } catch {
    return void 0;
  }
}
function supportsStyling() {
  try {
    return typeof Reflect.get(globalThis, "document") === "object";
  } catch {
    return false;
  }
}
function methodFor(level) {
  switch (level) {
    case "trace":
      return "trace";
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    default:
      return "error";
  }
}
function createConsoleWriter() {
  let available = false;
  const write = (level, message, args) => {
    try {
      const consoleObject = resolveConsole2();
      available = consoleObject !== void 0;
      if (consoleObject === void 0) return;
      const methodName = methodFor(level);
      let method = safeGet(consoleObject, methodName);
      if (typeof method !== "function") method = safeGet(consoleObject, "log");
      if (typeof method !== "function") return;
      const payload = supportsStyling() ? [`%c${CONSOLE_PREFIX}%c ${message}`, PREFIX_STYLE, MESSAGE_STYLE, ...args] : [`${CONSOLE_PREFIX} ${message}`, ...args];
      Reflect.apply(method, consoleObject, payload);
    } catch {
    }
  };
  return {
    write,
    isAvailable: () => {
      if (!available) available = resolveConsole2() !== void 0;
      return available;
    }
  };
}

// src/logger/sinkRegistry.ts
function createSinkRegistry() {
  const entries = /* @__PURE__ */ new Map();
  return {
    register: (key, sink) => {
      try {
        if (typeof key !== "string" || key.length === 0) return () => void 0;
        if (sink === null || typeof sink !== "object" || typeof sink.write !== "function") {
          return () => void 0;
        }
        entries.set(key, { key, name: sink.name, sink });
        return () => {
          if (entries.get(key)?.sink === sink) entries.delete(key);
        };
      } catch (error) {
        reportInternalFailure("sink-registry-register", error);
        return () => void 0;
      }
    },
    unregister: (key) => {
      try {
        return entries.delete(key);
      } catch (error) {
        reportInternalFailure("sink-registry-unregister", error);
        return false;
      }
    },
    get: (key) => {
      try {
        return entries.get(key)?.sink;
      } catch {
        return void 0;
      }
    },
    has: (key) => {
      try {
        return entries.has(key);
      } catch {
        return false;
      }
    },
    list: () => [...entries.values()],
    keys: () => [...entries.keys()],
    size: () => entries.size,
    write: (record) => {
      if (entries.size === 0) return;
      for (const entry of [...entries.values()]) {
        try {
          entry.sink.write(record);
        } catch (error) {
          reportInternalFailure("sink-write", error);
        }
      }
    },
    clear: () => {
      entries.clear();
    }
  };
}

// src/logger/logger.ts
function isInternalMessage(message) {
  for (const prefix of INTERNAL_PREFIXES) {
    if (message.startsWith(prefix)) return true;
  }
  return false;
}
function createLogger() {
  const registry = createSinkRegistry();
  const writer = createConsoleWriter();
  let consoleLevel = "warn";
  let enabled = true;
  let busy = false;
  let replaying = false;
  let seq = 0;
  let sinkSeq = 0;
  let restoreConsole;
  const buffer = [];
  const buildRecord = (level, message, args) => {
    const state = getState();
    const options = state.options;
    const sanitizer = getDefaultSanitizer();
    seq += 1;
    const record = {
      schemaVersion: 1,
      id: newId(),
      uploadStatus: "pending",
      uploadAttempts: 0,
      level,
      message: sanitizer.text(message, MAX_LOG_MESSAGE_LENGTH),
      pageLoadId: state.pageLoadId,
      environment: options === null ? {} : currentLogEnvironment(options),
      timestamp: now(),
      seq
    };
    if (args.length > 0) {
      record.data = args.slice(0, MAX_LOG_ARGS).map((arg) => sanitizer.value(arg));
    }
    const route = currentRoute();
    if (route !== "unknown") record.route = sanitizer.text(route, 300);
    return record;
  };
  const emit = (level, rawMessage, args) => {
    try {
      if (!enabled) return;
      if (busy) return;
      const message = typeof rawMessage === "string" ? rawMessage : String(rawMessage);
      const internal = isInternalMessage(message);
      const state = getState();
      if (!replaying && !state.initialized && registry.size() === 0) {
        if (buffer.length < PRE_INIT_LOG_BUFFER_SIZE) {
          buffer.push({ level, message, args: args.slice(0, MAX_LOG_ARGS) });
        }
      }
      busy = true;
      try {
        if (!internal) {
          const record = buildRecord(level, message, args);
          registry.write(record);
        }
        if (meetsLevel(level, consoleLevel)) {
          writer.write(level, message, args);
        }
      } finally {
        busy = false;
      }
    } catch (error) {
      reportInternalFailure("log-emit", error);
    }
  };
  const logger2 = {
    trace: (message, ...args) => {
      emit("trace", message, args);
    },
    debug: (message, ...args) => {
      emit("debug", message, args);
    },
    info: (message, ...args) => {
      emit("info", message, args);
    },
    warn: (message, ...args) => {
      emit("warn", message, args);
    },
    error: (message, ...args) => {
      emit("error", message, args);
    },
    addSink: (sink) => {
      if (sink === null || typeof sink !== "object" || typeof sink.write !== "function") {
        return () => void 0;
      }
      sinkSeq += 1;
      const declared = typeof sink.name === "string" && sink.name.length > 0 ? sink.name : "sink";
      const remove = registry.register(`${declared}#${String(sinkSeq)}`, sink);
      if (registry.size() === 1 && buffer.length > 0) controller.replayPreInit();
      return remove;
    },
    setLevel: (level) => {
      consoleLevel = level;
    },
    setEnabled: (value) => {
      enabled = value === true;
    },
    getConfig: () => ({
      level: consoleLevel,
      enabled
    })
  };
  const controller = {
    logger: logger2,
    replayPreInit: () => {
      if (buffer.length === 0) return;
      const calls = buffer.splice(0, buffer.length);
      replaying = true;
      try {
        for (const call of calls) emit(call.level, call.message, call.args);
      } finally {
        replaying = false;
      }
    },
    bufferedCount: () => buffer.length,
    setConsoleCapture: (value) => {
      if (value) {
        if (restoreConsole !== void 0) return;
        restoreConsole = installConsoleCapture({
          levels: ["warn", "error"],
          onCall: (level, args) => {
            const first = args[0];
            const message = typeof first === "string" ? first : "[console]";
            const rest = typeof first === "string" ? args.slice(1) : args;
            emit(level, message, rest);
          }
        });
        return;
      }
      restoreConsole?.();
      restoreConsole = void 0;
    },
    emitInternal: (level, message, args) => {
      emit(level, message, args);
    },
    sinks: registry,
    reset: () => {
      restoreConsole?.();
      restoreConsole = void 0;
      registry.clear();
      buffer.length = 0;
      consoleLevel = "warn";
      enabled = true;
      busy = false;
      replaying = false;
      seq = 0;
      sinkSeq = 0;
    }
  };
  return controller;
}
var instance = createLogger();
var logger = instance.logger;
function getLoggerController() {
  return instance;
}
function getSinkRegistry() {
  return instance.sinks;
}

// src/core/internal.ts
var reported = /* @__PURE__ */ new Set();
function describe(error) {
  try {
    if (error === null) return "null";
    if (error === void 0) return "undefined";
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const name = error.name;
      const message = error.message;
      const parts = [
        typeof name === "string" ? name : "",
        typeof message === "string" ? message : ""
      ];
      const joined = parts.filter((part) => part.length > 0).join(": ");
      if (joined.length > 0) return joined;
      return Object.prototype.toString.call(error);
    }
    return String(error);
  } catch {
    return "[unprintable]";
  }
}
function reportInternalFailure(stage, error) {
  try {
    if (reported.has(stage)) return;
    reported.add(stage);
    const message = `[Telemetry] ${stage} failed: ${describe(error)}`;
    getLoggerController().emitInternal("warn", message, []);
    const onInternalError = getState().options?.onInternalError;
    if (onInternalError !== void 0) {
      try {
        onInternalError(stage, error);
      } catch {
      }
    }
  } catch {
  }
}
function reportInternalNote(stage, detail) {
  try {
    if (reported.has(stage)) return;
    reported.add(stage);
    getLoggerController().emitInternal("warn", `[Telemetry] ${stage}: ${detail}`, []);
    const onInternalError = getState().options?.onInternalError;
    if (onInternalError !== void 0) {
      try {
        onInternalError(stage, new Error(detail));
      } catch {
      }
    }
  } catch {
  }
}
function resetInternalFailures() {
  reported.clear();
}

// src/core/queue.ts
function createSerialQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  const push = (task) => {
    pending += 1;
    const run = tail.then(
      async () => {
        try {
          return await task();
        } catch {
          return void 0;
        } finally {
          pending -= 1;
        }
      },
      async () => {
        try {
          return await task();
        } catch {
          return void 0;
        } finally {
          pending -= 1;
        }
      }
    );
    tail = run.then(
      () => void 0,
      () => void 0
    );
    return run;
  };
  const drain = async () => {
    let previous;
    do {
      previous = tail;
      await previous;
    } while (previous !== tail);
  };
  return {
    push,
    drain,
    size: () => pending,
    clear: () => {
      tail = Promise.resolve();
      pending = 0;
    }
  };
}

// src/core/rateLimit.ts
var RATE_LIMIT_WINDOW_MS = 6e4;
function createRateLimiter(maxPerWindow, onWindowRoll) {
  const limit = typeof maxPerWindow === "number" && Number.isFinite(maxPerWindow) && maxPerWindow > 0 ? maxPerWindow : 0;
  let windowStart = now();
  let count = 0;
  let droppedCount = 0;
  const roll = (current) => {
    if (current - windowStart < RATE_LIMIT_WINDOW_MS) return;
    if (droppedCount > 0 && onWindowRoll !== void 0) {
      try {
        onWindowRoll(droppedCount);
      } catch {
      }
    }
    windowStart = current;
    count = 0;
    droppedCount = 0;
  };
  return {
    allow: () => {
      try {
        if (limit <= 0) return true;
        const current = now();
        roll(current);
        if (count >= limit) {
          droppedCount += 1;
          return false;
        }
        count += 1;
        return true;
      } catch {
        return true;
      }
    },
    dropped: () => droppedCount,
    admitted: () => count,
    reset: () => {
      windowStart = now();
      count = 0;
      droppedCount = 0;
    }
  };
}

// src/errors/apiContext.ts
var CORRELATION_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-trace-id",
  "traceparent"
];
var AUTH_ERROR_FLAG = "_isTokenFetchError";
function markAuthError(error) {
  if (error !== null && typeof error === "object") {
    try {
      Object.defineProperty(error, AUTH_ERROR_FLAG, {
        value: true,
        enumerable: false,
        configurable: true,
        writable: true
      });
    } catch {
    }
  }
  return error;
}
function isAuthError(error) {
  return safeGet(error, AUTH_ERROR_FLAG) === true;
}
function categoryForKind(kind) {
  switch (kind) {
    case "http":
      return "http";
    case "network":
      return "network";
    case "timeout":
      return "timeout";
    case "abort":
      return "abort";
    case "parse":
      return "parse";
    case "auth":
      return "auth";
    default:
      return "runtime";
  }
}
function severityForKind(kind, status) {
  if (kind === "abort") return "info";
  if (kind === "auth") return "warning";
  if (kind === "http") return status !== void 0 && status < 500 ? "warning" : "error";
  return "error";
}
function readNumber(target, key) {
  const value = safeGet(target, key);
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readString(target, key) {
  const value = safeGet(target, key);
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readStatus(error) {
  const response = safeGet(error, "response");
  const fromResponse = readNumber(response, "status");
  if (fromResponse !== void 0) return fromResponse;
  return readNumber(error, "status");
}
function readHeader(headers, name) {
  if (headers === null || headers === void 0) return void 0;
  try {
    const get = safeGet(headers, "get");
    if (typeof get === "function") {
      const value = Reflect.apply(get, headers, [name]);
      return typeof value === "string" && value.length > 0 ? value : void 0;
    }
  } catch {
    return void 0;
  }
  if (typeof headers !== "object") return void 0;
  try {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name && typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function readCorrelationId(error) {
  const headers = safeGet(safeGet(error, "response"), "headers");
  const fallbackHeaders = headers ?? safeGet(error, "headers");
  for (const name of CORRELATION_HEADERS) {
    const value = readHeader(fallbackHeaders, name);
    if (value !== void 0) return value;
  }
  return void 0;
}
function readDuration(startedAt) {
  if (startedAt === void 0 || !Number.isFinite(startedAt)) return void 0;
  const elapsed = now() - startedAt;
  return elapsed >= 0 ? elapsed : 0;
}
function buildContext(parts) {
  const sanitizer = getDefaultSanitizer();
  const out = { kind: parts.kind };
  if (parts.method !== void 0) out.method = parts.method.toUpperCase();
  if (parts.url !== void 0) {
    const url = sanitizer.url(parts.url);
    if (url !== void 0) out.url = url;
  }
  if (parts.status !== void 0) out.status = parts.status;
  if (parts.statusText !== void 0) out.statusText = sanitizer.text(parts.statusText, 200);
  if (parts.code !== void 0) out.code = parts.code;
  if (parts.timeout !== void 0) out.timeout = parts.timeout;
  if (parts.requestId !== void 0) out.requestId = sanitizer.text(parts.requestId, 200);
  return out;
}
function buildApiErrorContext(error, startedAt) {
  try {
    const name = readString(error, "name") ?? "";
    const code = readString(error, "code");
    const status = readStatus(error);
    const response = safeGet(error, "response");
    const statusText = readString(response, "statusText") ?? readString(error, "statusText");
    const config = safeGet(error, "config");
    const method = readString(config, "method") ?? readString(error, "method") ?? readString(safeGet(error, "request"), "method");
    const url = readString(config, "url") ?? readString(error, "url") ?? readString(safeGet(error, "request"), "url");
    const timeout = readNumber(config, "timeout") ?? readNumber(error, "timeout");
    const duration = readDuration(startedAt);
    const requestId = readCorrelationId(error);
    let kind;
    if (isAuthError(error)) {
      kind = "auth";
    } else if (code === "ERR_CANCELED" || name === "CanceledError" || name === "AbortError") {
      kind = safeGet(error, "timedOut") === true ? "timeout" : "abort";
    } else if (code === "ECONNABORTED" || code === "ETIMEDOUT" || name === "TimeoutError") {
      kind = "timeout";
    } else if (name === "SyntaxError" || code === "ERR_BAD_RESPONSE" && (status === void 0 || status >= 200 && status < 300)) {
      kind = "parse";
    } else if (status !== void 0) {
      kind = "http";
    } else if (code === "ERR_NETWORK" || response !== void 0) {
      kind = "network";
    } else {
      kind = "unknown";
    }
    const api = buildContext({
      kind,
      method,
      url,
      status,
      statusText,
      code,
      timeout,
      requestId
    });
    if (duration !== void 0) {
      return {
        api: { ...api, duration },
        category: categoryForKind(kind),
        severity: severityForKind(kind, status)
      };
    }
    return { api, category: categoryForKind(kind), severity: severityForKind(kind, status) };
  } catch {
    return {
      api: { kind: "unknown" },
      category: "runtime",
      severity: "error"
    };
  }
}
function buildFetchErrorContext(request, failure) {
  try {
    const response = failure.response;
    const status = readNumber(response, "status");
    const statusText = readString(response, "statusText");
    const error = failure.error;
    const name = readString(error, "name") ?? "";
    const code = readString(error, "code");
    const timedOut = failure.timedOut === true || safeGet(error, "timedOut") === true;
    const requestId = readCorrelationId(error) ?? readCorrelationId(response);
    const duration = readDuration(request.startedAt);
    const hasResponse = response !== void 0 && response !== null;
    const effectiveStatus = hasResponse ? status ?? 0 : void 0;
    let kind;
    if (isAuthError(error)) {
      kind = "auth";
    } else if (timedOut) {
      kind = "timeout";
    } else if (name === "AbortError" || code === "ERR_CANCELED") {
      kind = "abort";
    } else if (name === "TimeoutError" || code === "ETIMEDOUT") {
      kind = "timeout";
    } else if (name === "SyntaxError") {
      kind = "parse";
    } else if (effectiveStatus !== void 0 && effectiveStatus !== 0) {
      kind = "http";
    } else if (error !== void 0 || hasResponse) {
      kind = "network";
    } else {
      kind = "unknown";
    }
    const api = buildContext({
      kind,
      method: request.method,
      url: request.url,
      status: effectiveStatus,
      statusText,
      code,
      requestId
    });
    if (duration !== void 0) {
      return {
        api: { ...api, duration },
        category: categoryForKind(kind),
        severity: severityForKind(kind, effectiveStatus)
      };
    }
    return {
      api,
      category: categoryForKind(kind),
      severity: severityForKind(kind, effectiveStatus)
    };
  } catch {
    return {
      api: { kind: "unknown" },
      category: "runtime",
      severity: "error"
    };
  }
}

// src/errors/contextBuilders.ts
var builders = /* @__PURE__ */ new Map();
function registerErrorContextBuilder(builder) {
  try {
    if (builder === null || typeof builder !== "object") return () => void 0;
    const name = builder.name;
    if (typeof name !== "string" || name.length === 0) return () => void 0;
    if (typeof builder.canHandle !== "function" || typeof builder.build !== "function") {
      return () => void 0;
    }
    builders.set(name, builder);
    return () => {
      if (builders.get(name) === builder) builders.delete(name);
    };
  } catch (error) {
    reportInternalFailure("context-builder-register", error);
    return () => void 0;
  }
}
function unregisterErrorContextBuilder(name) {
  try {
    return builders.delete(name);
  } catch (error) {
    reportInternalFailure("context-builder-unregister", error);
    return false;
  }
}
function clearErrorContextBuilders() {
  builders.clear();
}
function listErrorContextBuilders() {
  return [...builders.values()];
}
function errorContextBuilderCount() {
  return builders.size;
}
function mergeContext(fromBuilder, fromCaller) {
  if (fromCaller === void 0) return fromBuilder;
  const builderTags = fromBuilder.tags;
  const callerTags = fromCaller.tags;
  const tags = builderTags === void 0 ? callerTags : callerTags === void 0 ? builderTags : { ...builderTags, ...callerTags };
  const builderExtra = fromBuilder.extra;
  const callerExtra = fromCaller.extra;
  const extra = builderExtra === void 0 ? callerExtra : callerExtra === void 0 ? builderExtra : { ...builderExtra, ...callerExtra };
  const merged = {
    ...fromBuilder,
    ...fromCaller
  };
  if (tags !== void 0) merged.tags = tags;
  if (extra !== void 0) merged.extra = extra;
  return merged;
}
function resolveErrorContext(error, ctx) {
  if (builders.size === 0) return ctx ?? {};
  try {
    for (const builder of builders.values()) {
      let matched = false;
      try {
        matched = builder.canHandle(error, ctx) === true;
      } catch (failure) {
        reportInternalFailure(`context-builder-match:${builder.name}`, failure);
        continue;
      }
      if (!matched) continue;
      let built = null;
      try {
        built = builder.build(error, ctx);
      } catch (failure) {
        reportInternalFailure(`context-builder-build:${builder.name}`, failure);
        continue;
      }
      if (built === null || typeof built !== "object") continue;
      return mergeContext(built, ctx);
    }
  } catch (failure) {
    reportInternalFailure("context-builder-resolve", failure);
  }
  return ctx ?? {};
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
function readString2(target, key) {
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
  if (readString2(value, "name") !== "AggregateError") return false;
  return Array.isArray(safeGet(value, "errors"));
}
function isDomEvent(value) {
  const type = safeGet(value, "type");
  return typeof type === "string" && typeof safeGet(value, "preventDefault") === "function" && safeGet(value, "target") !== void 0;
}
function fromErrorLike(value) {
  const rawName = readString2(value, "name");
  let name = rawName !== void 0 && rawName.length > 0 ? rawName : "";
  if (name.length === 0) {
    const ctor = safeGet(value, "constructor");
    const constructorName = readString2(ctor, "name");
    name = constructorName !== void 0 && constructorName.length > 0 ? constructorName : "Error";
  }
  const rawMessage = readString2(value, "message") ?? "";
  const stack = readString2(value, "stack");
  const result = {
    name: cut(name, MAX_MESSAGE_LENGTH),
    message: cut(rawMessage, MAX_MESSAGE_LENGTH)
  };
  if (stack !== void 0) result.stack = stack;
  return result;
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
      const eventType = readString2(object, "type") ?? "unknown";
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
function sanitizeNormalized(normalized) {
  const sanitizer = getDefaultSanitizer();
  try {
    const out = {
      name: sanitizer.text(normalized.name, MAX_MESSAGE_LENGTH),
      message: sanitizer.text(normalized.message, MAX_MESSAGE_LENGTH),
      thrownType: normalized.thrownType,
      isChunkError: normalized.isChunkError,
      isCrossOrigin: normalized.isCrossOrigin
    };
    if (normalized.stack !== void 0) {
      out.stack = sanitizer.stack(normalized.stack, MAX_STACK_LENGTH);
    }
    if (normalized.causes !== void 0) {
      out.causes = normalized.causes.map((cause) => {
        const mapped = {
          name: sanitizer.text(cause.name, MAX_MESSAGE_LENGTH),
          message: sanitizer.text(cause.message, MAX_MESSAGE_LENGTH)
        };
        return cause.stack !== void 0 ? { ...mapped, stack: sanitizer.stack(cause.stack, MAX_STACK_LENGTH) } : mapped;
      });
    }
    if (normalized.category !== void 0) out.category = normalized.category;
    if (normalized.aggregatedCount !== void 0) {
      out.aggregatedCount = normalized.aggregatedCount;
    }
    if (normalized.extra !== void 0) {
      const sanitized = sanitizer.value(normalized.extra);
      out.extra = sanitized !== null && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : { value: sanitized };
    }
    return out;
  } catch {
    return UNNORMALIZABLE;
  }
}

// src/errors/payload.ts
var TRUNCATED_TAG = "truncated";
var TIER1_CAUSE_LENGTH = 300;
var TIER1_STACK_LENGTH = 2e3;
var TIER1_COMPONENT_STACK_LENGTH = 1e3;
var TIER2_STACK_LENGTH = 500;
var TIER2_MESSAGE_LENGTH = 300;
var LOG_REDUCED_MESSAGE_LENGTH = 300;
function byteLength(value) {
  try {
    const json = JSON.stringify(value);
    if (json === void 0) return 0;
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(json).length;
    }
    return encodeURIComponent(json).replace(/%[0-9A-F]{2}/gi, "x").length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
function cut2(value, max) {
  return value.length <= max ? value : value.slice(0, max);
}
function trimCauses(causes, max) {
  return causes.slice(0, MAX_CAUSE_DEPTH).map((cause) => {
    const trimmed = {
      name: cause.name,
      message: cut2(cause.message, max)
    };
    if (cause.stack !== void 0) trimmed.stack = cut2(cause.stack, max);
    return trimmed;
  });
}
function withTruncatedTag(record) {
  const tags = { ...record.tags ?? {} };
  tags[TRUNCATED_TAG] = "true";
  return { ...record, tags };
}
function without(record, keys) {
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}
function reduceErrorPayload(record, maxBytes) {
  try {
    if (byteLength(record) <= maxBytes) return record;
    let current = withTruncatedTag(without(record, ["extra"]));
    if (byteLength(current) <= maxBytes) return current;
    const tier2 = { ...current };
    if (current.causes !== void 0) {
      tier2.causes = trimCauses(current.causes, TIER1_CAUSE_LENGTH);
    }
    if (current.stack !== void 0) {
      tier2.stack = cut2(current.stack, TIER1_STACK_LENGTH);
    }
    if (current.componentStack !== void 0) {
      tier2.componentStack = cut2(current.componentStack, TIER1_COMPONENT_STACK_LENGTH);
    }
    current = tier2;
    if (byteLength(current) <= maxBytes) return current;
    const minimal = { ...current };
    if (current.stack !== void 0) {
      minimal.stack = cut2(current.stack, TIER2_STACK_LENGTH);
    }
    minimal.message = cut2(current.message, TIER2_MESSAGE_LENGTH);
    minimal.causes = void 0;
    minimal.componentStack = void 0;
    current = minimal;
    if (byteLength(current) <= maxBytes) return current;
    return null;
  } catch {
    return null;
  }
}
function reduceLogPayload(record, maxBytes) {
  try {
    if (byteLength(record) <= maxBytes) return record;
    const tier1 = { ...record };
    tier1.data = void 0;
    let current = tier1;
    if (byteLength(current) <= maxBytes) return current;
    const tier2 = { ...current };
    tier2.message = cut2(current.message, LOG_REDUCED_MESSAGE_LENGTH);
    current = tier2;
    if (byteLength(current) <= maxBytes) return current;
    return null;
  } catch {
    return null;
  }
}

// src/errors/captureError.ts
function setCaptureSuppressed(value) {
  try {
    getState().captureSuppressed = value === true;
  } catch (failure) {
    reportInternalFailure("capture-suppression", failure);
  }
}
function sanitizeTags(tags) {
  if (tags === void 0) return void 0;
  const sanitizer = getDefaultSanitizer();
  const out = {};
  let count = 0;
  try {
    for (const [key, value] of Object.entries(tags)) {
      if (count >= MAX_TAGS) break;
      const safeKey = sanitizer.text(key, MAX_TAG_KEY_LENGTH);
      if (safeKey.length === 0) continue;
      out[safeKey] = sanitizer.text(
        typeof value === "string" ? value : String(value),
        MAX_TAG_VALUE_LENGTH
      );
      count += 1;
    }
  } catch {
    return void 0;
  }
  return count > 0 ? out : void 0;
}
function sanitizeExtra(extra) {
  if (extra === void 0) return void 0;
  try {
    const sanitized = getDefaultSanitizer().value(extra);
    if (sanitized !== null && typeof sanitized === "object" && !Array.isArray(sanitized)) {
      const entries = Object.entries(sanitized);
      return entries.length > 0 ? sanitized : void 0;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function isThenable(value) {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
function createErrorTracker(trackerOptions) {
  const { repository, options: config } = trackerOptions;
  const queue = createSerialQueue();
  const seen = /* @__PURE__ */ new WeakSet();
  const listeners = /* @__PURE__ */ new Set();
  let capturing = false;
  let destroyed = false;
  const limiter = createRateLimiter(config.errors.maxEventsPerMinute, (dropped) => {
    reportInternalNote("rate-limit", `${String(dropped)} dropped`);
  });
  const consentGranted = () => {
    const consent = config.consent;
    if (consent === void 0) return true;
    try {
      return consent() === true;
    } catch {
      return false;
    }
  };
  const emitRecord = (record) => {
    for (const listener of [...listeners]) {
      try {
        listener(record);
      } catch {
      }
    }
    try {
      trackerOptions.onRecord?.(record);
    } catch {
    }
  };
  const buildRecord = (normalized, ctx, timestamp) => {
    const sanitizer = getDefaultSanitizer();
    const source = ctx?.source ?? "manual";
    const name = sanitizer.text(normalized.name, MAX_MESSAGE_LENGTH);
    const message = sanitizer.text(normalized.message, MAX_MESSAGE_LENGTH);
    const stack = normalized.stack === void 0 ? void 0 : sanitizer.stack(normalized.stack, MAX_STACK_LENGTH);
    const componentStack = ctx?.componentStack === void 0 ? void 0 : sanitizer.stack(ctx.componentStack, MAX_COMPONENT_STACK_LENGTH);
    const causes = normalized.causes === void 0 ? void 0 : normalized.causes.map((cause) => {
      const mapped = {
        name: sanitizer.text(cause.name, MAX_MESSAGE_LENGTH),
        message: sanitizer.text(cause.message, MAX_MESSAGE_LENGTH)
      };
      if (cause.stack !== void 0) {
        mapped.stack = sanitizer.stack(cause.stack, MAX_STACK_LENGTH);
      }
      return mapped;
    });
    const page = currentPageInfo();
    const environment = currentEnvironment(config);
    const severity = ctx?.severity ?? (normalized.isChunkError ? "fatal" : "error");
    const category = ctx?.category ?? normalized.category ?? "runtime";
    const handled = ctx?.handled ?? !UNHANDLED_SOURCES.has(source);
    const fingerprintValue = fingerprint({
      source,
      category,
      name,
      message,
      stack,
      componentStack,
      route: page.route,
      api: ctx?.api,
      event: ctx?.event,
      location: ctx?.location
    });
    const record = {
      schemaVersion: 1,
      id: newId(),
      fingerprint: fingerprintValue,
      uploadStatus: "pending",
      uploadAttempts: 0,
      source,
      severity,
      category,
      handled,
      thrownType: normalized.thrownType,
      name,
      message,
      page,
      environment,
      timestamp,
      firstSeen: timestamp,
      lastSeen: timestamp,
      occurrenceCount: 1
    };
    if (stack !== void 0) record.stack = stack;
    if (causes !== void 0) record.causes = causes;
    if (componentStack !== void 0) record.componentStack = componentStack;
    if (ctx?.location !== void 0) record.location = ctx.location;
    if (ctx?.api !== void 0) record.api = ctx.api;
    if (ctx?.event !== void 0) record.event = ctx.event;
    const tags = sanitizeTags(ctx?.tags);
    if (tags !== void 0) record.tags = tags;
    const extra = sanitizeExtra(ctx?.extra);
    if (extra !== void 0) record.extra = extra;
    return record;
  };
  const ingest = (normalized, ctx, timestamp) => {
    if (destroyed) return;
    if (!config.errors.enabled) return;
    if (!consentGranted()) return;
    if (!limiter.allow()) return;
    let record = buildRecord(normalized, ctx, timestamp);
    const beforeCapture = config.errors.beforeCapture;
    if (beforeCapture !== void 0) {
      try {
        const replacement = beforeCapture(record);
        if (replacement === null) return;
        record = replacement;
      } catch (error) {
        reportInternalFailure("beforeCapture", error);
      }
    }
    const fitted = reduceErrorPayload(record, config.errors.maxPayloadBytes);
    if (fitted === null) {
      reportInternalFailure(
        "payload-limit",
        new Error("error record exceeded its payload budget at every reduction tier")
      );
      return;
    }
    void queue.push(() => repository.save(fitted)).then((result) => {
      if (result !== void 0 && !result.ok) {
        reportInternalFailure("error-persist", result.reason);
      }
    });
    emitRecord(fitted);
  };
  const acquire = () => {
    if (capturing) return false;
    capturing = true;
    return true;
  };
  return {
    capture: (error, ctx) => {
      try {
        if (destroyed || !config.errors.enabled) return;
        if (error !== null && (typeof error === "object" || typeof error === "function")) {
          const object = error;
          if (seen.has(object)) return;
          seen.add(object);
        }
        if (!acquire()) return;
        try {
          const enriched = resolveErrorContext(error, ctx);
          ingest(normalizeError(error), enriched, enriched.timestamp ?? now());
        } finally {
          capturing = false;
        }
      } catch (failure) {
        capturing = false;
        reportInternalFailure("capture", failure);
      }
    },
    captureNormalized: (normalized, ctx, timestamp) => {
      try {
        if (destroyed || !config.errors.enabled) return;
        if (!acquire()) return;
        try {
          ingest(normalized, ctx, timestamp);
        } finally {
          capturing = false;
        }
      } catch (failure) {
        capturing = false;
        reportInternalFailure("capture", failure);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    droppedByRateLimit: () => limiter.dropped(),
    destroy: () => {
      destroyed = true;
      listeners.clear();
      queue.clear();
    },
    flush: async () => {
      await queue.drain();
    }
  };
}
function captureError(error, ctx) {
  try {
    const state = getState();
    if (state.captureSuppressed) return;
    const tracker = state.errorTracker;
    if (tracker !== null) {
      tracker.capture(error, ctx);
      return;
    }
    const buffer = state.preInitErrors;
    if (buffer.length >= PRE_INIT_ERROR_BUFFER_SIZE) return;
    buffer.push({
      normalized: normalizeError(error),
      ctx: ctx ?? void 0,
      timestamp: ctx?.timestamp ?? now()
    });
  } catch (failure) {
    reportInternalFailure("capture", failure);
  }
}
function setErrorTracker(tracker) {
  try {
    getState().errorTracker = tracker;
  } catch (failure) {
    reportInternalFailure("set-tracker", failure);
  }
}
function flushPreInitErrors(tracker) {
  try {
    const buffer = getState().preInitErrors;
    if (buffer.length === 0) return 0;
    const buffered = buffer.splice(0, buffer.length);
    for (const entry of buffered) {
      try {
        tracker.captureNormalized(entry.normalized, entry.ctx, entry.timestamp);
      } catch {
      }
    }
    return buffered.length;
  } catch {
    return 0;
  }
}
function clearPreInitErrors() {
  try {
    getState().preInitErrors.length = 0;
  } catch {
  }
}
function withErrorCapture(handler, ctx) {
  const context = { ...ctx, source: ctx?.source ?? "event-handler" };
  try {
    const result = handler();
    if (isThenable(result)) {
      return result.then(
        (value) => value,
        (error) => {
          captureError(error, context);
          throw error;
        }
      );
    }
    return result;
  } catch (error) {
    captureError(error, context);
    throw error;
  }
}
function captureApiError(error, startedAt) {
  try {
    const classification = buildApiErrorContext(error, startedAt);
    captureError(error, {
      source: "api",
      api: classification.api,
      category: classification.category,
      severity: classification.severity
    });
  } catch (failure) {
    reportInternalFailure("capture-api", failure);
  }
}
function captureFetchError(request, failure) {
  try {
    const classification = buildFetchErrorContext(request, failure);
    const status = classification.api.status ?? 0;
    const error = failure.error ?? new Error(`Request failed with status ${String(status)}`);
    captureError(error, {
      source: "api",
      api: classification.api,
      category: classification.category,
      severity: classification.severity
    });
  } catch (failure2) {
    reportInternalFailure("capture-fetch", failure2);
  }
}

// src/storage/idbCore.ts
var DEFAULT_OPEN_TIMEOUT_MS = 5e3;
var QUOTA_ERROR_NAMES = /* @__PURE__ */ new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED"
]);
var SERIALIZATION_ERROR_NAMES = /* @__PURE__ */ new Set(["DataCloneError"]);
var STALE_CONNECTION_ERROR_NAMES = /* @__PURE__ */ new Set([
  "InvalidStateError",
  "DatabaseClosedError",
  "AbortError",
  "TransactionInactiveError"
]);
function errorName(error) {
  if (error === null || typeof error !== "object") return "";
  try {
    const name = error.name;
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}
function errorCode(error) {
  if (error === null || typeof error !== "object") return void 0;
  try {
    const code = error.code;
    return typeof code === "number" ? code : void 0;
  } catch {
    return void 0;
  }
}
function classifyStorageError(error) {
  const name = errorName(error);
  if (QUOTA_ERROR_NAMES.has(name) || errorCode(error) === 22) return "quota";
  if (SERIALIZATION_ERROR_NAMES.has(name)) return "serialization";
  return "transaction";
}
function isStaleConnectionError(error) {
  return STALE_CONNECTION_ERROR_NAMES.has(errorName(error));
}
function resolveFactory(factory) {
  if (factory !== void 0) return factory;
  try {
    const candidate = Reflect.get(globalThis, "indexedDB");
    if (candidate === null || typeof candidate !== "object") return void 0;
    if (typeof candidate.open !== "function") return void 0;
    return candidate;
  } catch {
    return "blocked";
  }
}
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IDBRequest failed"));
    };
  });
}
function promisifyTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Transaction aborted"));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Transaction failed"));
    };
  });
}
function createDbConnection(options) {
  const dbName = options.dbName;
  const storeName = options.storeName;
  const version = options.version;
  const timeoutMs = typeof options.openTimeoutMs === "number" && Number.isFinite(options.openTimeoutMs) && options.openTimeoutMs > 0 ? options.openTimeoutMs : DEFAULT_OPEN_TIMEOUT_MS;
  let connection = null;
  let opening = null;
  let permanentlyUnavailable = false;
  const report = (reason, error) => {
    try {
      options.onFailure?.(reason, error);
    } catch {
    }
  };
  const detach2 = (db) => {
    try {
      db.onclose = null;
      db.onversionchange = null;
    } catch {
    }
  };
  const drop = (db) => {
    if (connection === db) connection = null;
    if (db !== null) detach2(db);
  };
  const attach2 = (db) => {
    try {
      db.onversionchange = () => {
        db.close();
        drop(db);
      };
      db.onclose = () => {
        drop(db);
      };
    } catch {
    }
  };
  const open = () => {
    const factory = resolveFactory(options.indexedDB);
    if (factory === void 0 || factory === "blocked") {
      permanentlyUnavailable = true;
      report("unavailable", new Error("IndexedDB is not available"));
      return Promise.resolve({ ok: false, reason: "unavailable" });
    }
    return new Promise((resolve) => {
      let settled = false;
      let timedOut = false;
      let request;
      let timer;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timer !== void 0) clearTimeout(timer);
        resolve(result);
      };
      try {
        request = factory.open(dbName, version);
      } catch (error) {
        report("unavailable", error);
        finish({ ok: false, reason: "unavailable" });
        return;
      }
      timer = setTimeout(() => {
        timedOut = true;
        report("transaction", new Error(`IndexedDB open timed out after ${String(timeoutMs)}ms`));
        finish({ ok: false, reason: "transaction" });
      }, timeoutMs);
      request.onupgradeneeded = (event) => {
        try {
          const db = request?.result;
          const tx = request?.transaction;
          if (db === void 0 || db === null || tx === void 0 || tx === null) return;
          const oldVersion = event.oldVersion ?? 0;
          options.upgrade(db, oldVersion, tx);
        } catch (error) {
          report("transaction", error);
          try {
            request?.transaction?.abort();
          } catch {
          }
        }
      };
      request.onsuccess = () => {
        const db = request?.result;
        if (db === void 0 || db === null) {
          finish({ ok: false, reason: "unavailable" });
          return;
        }
        if (timedOut) {
          try {
            db.close();
          } catch {
          }
          return;
        }
        connection = db;
        attach2(db);
        finish({ ok: true, value: db });
      };
      request.onerror = () => {
        const error = request?.error;
        const reason = classifyStorageError(error);
        if (reason === "unavailable" || reason === "transaction") {
          if (errorName(error) === "SecurityError") permanentlyUnavailable = true;
        }
        report(reason, error);
        finish({ ok: false, reason });
      };
      request.onblocked = () => {
      };
    });
  };
  const ensureOpen = () => {
    if (connection !== null) {
      try {
        void connection.objectStoreNames.length;
        return Promise.resolve({ ok: true, value: connection });
      } catch {
        drop(connection);
      }
    }
    if (permanentlyUnavailable) {
      return Promise.resolve({ ok: false, reason: "unavailable" });
    }
    opening ?? (opening = open().finally(() => {
      opening = null;
    }));
    return opening;
  };
  const transaction = async (mode, work) => {
    const opened = await ensureOpen();
    if (!opened.ok) return { ok: false, reason: opened.reason };
    const db = opened.value;
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      drop(db);
      const reason = isStaleConnectionError(error) ? "transaction" : classifyStorageError(error);
      report(reason, error);
      return { ok: false, reason };
    }
    const done = promisifyTransaction(tx);
    try {
      const store = tx.objectStore(storeName);
      const result = await work(store, tx);
      if (mode === "readwrite") await done;
      else await done.catch(() => void 0);
      return { ok: true, value: result };
    } catch (error) {
      try {
        tx.abort();
      } catch {
      }
      await done.catch(() => void 0);
      if (isStaleConnectionError(error)) drop(db);
      const reason = classifyStorageError(error);
      report(reason, error);
      return { ok: false, reason };
    }
  };
  const deleteDatabase = async () => {
    const factory = resolveFactory(options.indexedDB);
    if (factory === void 0 || factory === "blocked") {
      return { ok: false, reason: "unavailable" };
    }
    close();
    return new Promise((resolve) => {
      let request;
      try {
        request = factory.deleteDatabase(dbName);
      } catch (error) {
        report("unavailable", error);
        resolve({ ok: false, reason: "unavailable" });
        return;
      }
      request.onsuccess = () => {
        resolve({ ok: true, value: void 0 });
      };
      request.onerror = () => {
        const reason = classifyStorageError(request.error);
        report(reason, request.error);
        resolve({ ok: false, reason });
      };
      request.onblocked = () => {
      };
    });
  };
  function close() {
    const db = connection;
    connection = null;
    if (db !== null) {
      detach2(db);
      try {
        db.close();
      } catch {
      }
    }
  }
  return {
    dbName,
    storeName,
    version,
    isOpen: () => connection !== null,
    ensureOpen,
    transaction,
    deleteDatabase,
    close
  };
}

// src/core/config.ts
var DEFAULT_DB_PREFIX = "rm-logvault";
var DEFAULT_SHORTCUT_KEY = "d";
var DEFAULT_FILENAME_PREFIX = "diagnostics-report";
var DEFAULT_OPTIONS = {
  enabled: true,
  dbPrefix: DEFAULT_DB_PREFIX,
  /** Shared with the storage layer, so the wrapper's own fallback cannot drift. */
  openTimeoutMs: DEFAULT_OPEN_TIMEOUT_MS,
  errors: {
    enabled: true,
    maxRecords: 500,
    retentionDays: 7,
    maxPayloadBytes: 16384,
    maxEventsPerMinute: 120,
    preventDefaultUnhandledRejection: false,
    captureResources: false,
    captureCsp: false,
    captureChunkErrors: true
  },
  logs: {
    enabled: true,
    level: "warn",
    /** No default: omitting it leaves the logger's own level untouched. */
    consoleLevel: void 0,
    maxRecords: 2e3,
    retentionDays: 3,
    maxPayloadBytes: 4096,
    maxLogsPerMinute: 600,
    /** Shared with the tracker, so its batching limits cannot drift from these. */
    writeFlushMs: LOG_FLUSH_INTERVAL_MS,
    writeBatchSize: LOG_FLUSH_BATCH_SIZE,
    captureConsole: false
  },
  rest: {
    intervalMs: 3e4,
    batchSize: 50,
    credentials: "same-origin",
    requireHttps: false
  }
};
var VALID_LOG_LEVELS = /* @__PURE__ */ new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "off",
  "none",
  "silent"
]);
function normalizeLevel(input) {
  if (typeof input !== "string") return void 0;
  const lower = input.trim().toLowerCase();
  if (!VALID_LOG_LEVELS.has(lower)) return void 0;
  if (lower === "none" || lower === "silent" || lower === "off") return "off";
  return lower;
}
function positiveNumber(input, fallback, options = {}) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  const minimum = options.allowZero === true ? 0 : 1;
  if (input < minimum) return fallback;
  return options.integer === true ? Math.floor(input) : input;
}
function nonEmptyString(input, fallback) {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
function regexList(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((entry) => entry instanceof RegExp);
}
function keyList(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry) => typeof entry === "string" || entry instanceof RegExp
  );
}
function stringList(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((entry) => typeof entry === "string" && entry.length > 0);
}
function resolveEnvLayer(options) {
  const env = options.env;
  if (env === true) return fromEnv(DEFAULT_ENV_PREFIXES);
  if (typeof env === "string" && env.length > 0) return fromEnv(env);
  if (Array.isArray(env) && env.length > 0) return fromEnv(env);
  return void 0;
}
function resolveOptions(options = {}) {
  try {
    return resolveOptionsUnsafe(options);
  } catch (error) {
    reportInternalFailure("config-resolve", error);
    return DEFAULT_RESOLVED;
  }
}
function resolveOptionsUnsafe(options) {
  const env = resolveEnvLayer(options);
  const pickBool = (explicit, fromEnvValue, fallback) => {
    if (typeof explicit === "boolean") return explicit;
    if (typeof fromEnvValue === "boolean") return fromEnvValue;
    return fallback;
  };
  const pick = (candidates, convert, fallback) => {
    for (const candidate of candidates) {
      const converted = convert(candidate);
      if (converted !== void 0) return converted;
    }
    return fallback;
  };
  const asString = (input) => nonEmptyString(input, void 0);
  const asBool = (input) => typeof input === "boolean" ? input : void 0;
  const asPositive = (options2 = {}) => (input) => {
    if (typeof input !== "number" || !Number.isFinite(input)) return void 0;
    const minimum = options2.allowZero === true ? 0 : 1;
    if (input < minimum) return void 0;
    return options2.integer === true ? Math.floor(input) : input;
  };
  const errorsIn = options.errors ?? {};
  const logsIn = options.logs ?? {};
  const redactionIn = options.redaction ?? {};
  const restIn = options.rest ?? {};
  const appName = pick(
    [options.appName, options.app, env?.appName],
    asString,
    void 0
  );
  const appVersion = pick(
    [options.appVersion, options.version, env?.appVersion],
    asString,
    void 0
  );
  const buildId = pick(
    [options.buildId, options.build, env?.buildId],
    asString,
    void 0
  );
  const environment = pick(
    [options.environment, env?.environment],
    asString,
    void 0
  );
  const dbPrefix = pick([options.dbPrefix, env?.dbPrefix], asString, DEFAULT_OPTIONS.dbPrefix);
  const openTimeoutMs = pick(
    [options.openTimeoutMs, env?.openTimeoutMs],
    asPositive({ integer: true }),
    DEFAULT_OPTIONS.openTimeoutMs
  );
  const errorAllowedQueryParams = errorsIn.allowedQueryParams !== void 0 ? stringList(errorsIn.allowedQueryParams) : redactionIn.allowedQueryParams !== void 0 ? stringList(redactionIn.allowedQueryParams) : void 0;
  const resolvedErrors = {
    enabled: pickBool(errorsIn.enabled, env?.errorsEnabled, DEFAULT_OPTIONS.errors.enabled),
    maxRecords: pick(
      [errorsIn.maxRecords, options.maxErrors, env?.errorsMaxRecords],
      asPositive({ integer: true }),
      DEFAULT_OPTIONS.errors.maxRecords
    ),
    retentionDays: pick(
      [errorsIn.retentionDays, options.errorRetentionDays, env?.errorsRetentionDays],
      asPositive({ allowZero: true }),
      DEFAULT_OPTIONS.errors.retentionDays
    ),
    maxPayloadBytes: positiveNumber(
      errorsIn.maxPayloadBytes ?? env?.errorsMaxPayloadBytes,
      DEFAULT_OPTIONS.errors.maxPayloadBytes,
      { integer: true }
    ),
    maxEventsPerMinute: positiveNumber(
      errorsIn.maxEventsPerMinute ?? env?.errorsMaxEventsPerMinute,
      DEFAULT_OPTIONS.errors.maxEventsPerMinute,
      { allowZero: true, integer: true }
    ),
    allowedQueryParams: errorAllowedQueryParams ?? [],
    preventDefaultUnhandledRejection: errorsIn.preventDefaultUnhandledRejection ?? DEFAULT_OPTIONS.errors.preventDefaultUnhandledRejection,
    captureResources: errorsIn.captureResources ?? DEFAULT_OPTIONS.errors.captureResources,
    captureCsp: errorsIn.captureCsp ?? DEFAULT_OPTIONS.errors.captureCsp,
    captureChunkErrors: errorsIn.captureChunkErrors ?? DEFAULT_OPTIONS.errors.captureChunkErrors,
    beforeCapture: typeof errorsIn.beforeCapture === "function" ? errorsIn.beforeCapture : void 0
  };
  const resolvedConsoleLevel = normalizeLevel(logsIn.consoleLevel) ?? normalizeLevel(options.consoleLevel) ?? normalizeLevel(env?.consoleLevel);
  const resolvedLevel = pick(
    [logsIn.level, options.level, env?.persistLevel, env?.logLevel, env?.consoleLevel],
    normalizeLevel,
    DEFAULT_OPTIONS.logs.level
  );
  const resolvedLogs = {
    enabled: pickBool(logsIn.enabled, env?.logsEnabled, DEFAULT_OPTIONS.logs.enabled),
    level: resolvedLevel,
    consoleLevel: resolvedConsoleLevel,
    maxRecords: pick(
      [logsIn.maxRecords, options.maxLogs, env?.logsMaxRecords],
      asPositive({ integer: true }),
      DEFAULT_OPTIONS.logs.maxRecords
    ),
    retentionDays: pick(
      [logsIn.retentionDays, options.logRetentionDays, env?.logsRetentionDays],
      asPositive({ allowZero: true }),
      DEFAULT_OPTIONS.logs.retentionDays
    ),
    maxPayloadBytes: positiveNumber(
      logsIn.maxPayloadBytes ?? env?.logsMaxPayloadBytes,
      DEFAULT_OPTIONS.logs.maxPayloadBytes,
      {
        integer: true
      }
    ),
    maxLogsPerMinute: positiveNumber(
      logsIn.maxLogsPerMinute ?? env?.logsMaxLogsPerMinute,
      DEFAULT_OPTIONS.logs.maxLogsPerMinute,
      {
        allowZero: true,
        integer: true
      }
    ),
    writeFlushMs: positiveNumber(
      logsIn.writeFlushMs ?? env?.logsWriteFlushMs,
      DEFAULT_OPTIONS.logs.writeFlushMs,
      { integer: true }
    ),
    writeBatchSize: positiveNumber(
      logsIn.writeBatchSize ?? env?.logsWriteBatchSize,
      DEFAULT_OPTIONS.logs.writeBatchSize,
      { integer: true }
    ),
    captureConsole: pick(
      [logsIn.captureConsole, options.captureConsole],
      asBool,
      DEFAULT_OPTIONS.logs.captureConsole
    ),
    beforeStore: typeof logsIn.beforeStore === "function" ? logsIn.beforeStore : void 0
  };
  const resolvedRedaction = {
    extraSensitiveKeys: keyList(redactionIn.extraSensitiveKeys),
    extraPatterns: regexList(redactionIn.extraPatterns),
    allowedQueryParams: redactionIn.allowedQueryParams !== void 0 ? stringList(redactionIn.allowedQueryParams) : errorsIn.allowedQueryParams !== void 0 ? stringList(errorsIn.allowedQueryParams) : void 0
  };
  const errorsUrl = pick(
    [restIn.errorsUrl, options.errorUrl, options.url, env?.errorsUrl],
    asString,
    void 0
  );
  const logsUrl = pick(
    [restIn.logsUrl, options.logUrl, options.url, env?.logsUrl],
    asString,
    void 0
  );
  const transport = restIn.transport;
  const restEnabledByDefault = transport !== void 0 || errorsUrl !== void 0 || logsUrl !== void 0;
  const resolvedRestEnabled = pickBool(restIn.enabled, env?.restEnabled, restEnabledByDefault);
  const explicitMode = options.mode === "local" || options.mode === "remote" ? options.mode : void 0;
  const mode = explicitMode ?? (resolvedRestEnabled ? "remote" : "local");
  const resolvedRest = {
    enabled: resolvedRestEnabled,
    errorsUrl,
    logsUrl,
    intervalMs: positiveNumber(
      restIn.intervalMs ?? env?.restIntervalMs,
      DEFAULT_OPTIONS.rest.intervalMs,
      {
        integer: true
      }
    ),
    batchSize: positiveNumber(
      restIn.batchSize ?? env?.restBatchSize,
      DEFAULT_OPTIONS.rest.batchSize,
      { integer: true }
    ),
    credentials: restIn.credentials === "omit" || restIn.credentials === "same-origin" || restIn.credentials === "include" ? restIn.credentials : DEFAULT_OPTIONS.rest.credentials,
    getHeaders: typeof restIn.getHeaders === "function" ? restIn.getHeaders : typeof options.headers === "function" ? options.headers : void 0,
    transport,
    requireHttps: restIn.requireHttps ?? DEFAULT_OPTIONS.rest.requireHttps,
    onTerminalFailure: typeof restIn.onTerminalFailure === "function" ? restIn.onTerminalFailure : void 0
  };
  let shortcut = false;
  if (options.shortcut !== false) {
    const shortcutIn = options.shortcut ?? {};
    shortcut = {
      key: nonEmptyString(shortcutIn.key, DEFAULT_SHORTCUT_KEY) ?? DEFAULT_SHORTCUT_KEY,
      ctrl: shortcutIn.ctrl ?? true,
      shift: shortcutIn.shift ?? true,
      alt: shortcutIn.alt ?? true,
      meta: shortcutIn.meta ?? false,
      target: shortcutIn.target,
      allow: typeof shortcutIn.allow === "function" ? shortcutIn.allow : void 0,
      filenamePrefix: nonEmptyString(shortcutIn.filenamePrefix, DEFAULT_FILENAME_PREFIX) ?? DEFAULT_FILENAME_PREFIX,
      onExported: typeof shortcutIn.onExported === "function" ? shortcutIn.onExported : void 0
    };
  }
  return Object.freeze({
    appName,
    appVersion,
    buildId,
    environment,
    enabled: typeof options.enabled === "boolean" ? options.enabled : env?.enabled ?? DEFAULT_OPTIONS.enabled,
    mode,
    dbPrefix,
    openTimeoutMs,
    errors: Object.freeze(resolvedErrors),
    logs: Object.freeze(resolvedLogs),
    redaction: Object.freeze(resolvedRedaction),
    rest: Object.freeze(resolvedRest),
    shortcut: shortcut === false ? false : Object.freeze(shortcut),
    consent: typeof options.consent === "function" ? options.consent : void 0,
    onInternalError: typeof options.onInternalError === "function" ? options.onInternalError : void 0,
    repository: options.repository,
    logSource: options.logSource
  });
}
var DEFAULT_RESOLVED = Object.freeze({
  appName: void 0,
  appVersion: void 0,
  buildId: void 0,
  environment: void 0,
  enabled: DEFAULT_OPTIONS.enabled,
  mode: "local",
  dbPrefix: DEFAULT_OPTIONS.dbPrefix,
  openTimeoutMs: DEFAULT_OPTIONS.openTimeoutMs,
  errors: Object.freeze({
    enabled: DEFAULT_OPTIONS.errors.enabled,
    maxRecords: DEFAULT_OPTIONS.errors.maxRecords,
    retentionDays: DEFAULT_OPTIONS.errors.retentionDays,
    maxPayloadBytes: DEFAULT_OPTIONS.errors.maxPayloadBytes,
    maxEventsPerMinute: DEFAULT_OPTIONS.errors.maxEventsPerMinute,
    allowedQueryParams: [],
    preventDefaultUnhandledRejection: DEFAULT_OPTIONS.errors.preventDefaultUnhandledRejection,
    captureResources: DEFAULT_OPTIONS.errors.captureResources,
    captureCsp: DEFAULT_OPTIONS.errors.captureCsp,
    captureChunkErrors: DEFAULT_OPTIONS.errors.captureChunkErrors,
    beforeCapture: void 0
  }),
  logs: Object.freeze({
    enabled: DEFAULT_OPTIONS.logs.enabled,
    level: DEFAULT_OPTIONS.logs.level,
    consoleLevel: void 0,
    maxRecords: DEFAULT_OPTIONS.logs.maxRecords,
    retentionDays: DEFAULT_OPTIONS.logs.retentionDays,
    maxPayloadBytes: DEFAULT_OPTIONS.logs.maxPayloadBytes,
    maxLogsPerMinute: DEFAULT_OPTIONS.logs.maxLogsPerMinute,
    writeFlushMs: DEFAULT_OPTIONS.logs.writeFlushMs,
    writeBatchSize: DEFAULT_OPTIONS.logs.writeBatchSize,
    captureConsole: DEFAULT_OPTIONS.logs.captureConsole,
    beforeStore: void 0
  }),
  redaction: Object.freeze({
    extraSensitiveKeys: [],
    extraPatterns: [],
    allowedQueryParams: void 0
  }),
  rest: Object.freeze({
    enabled: false,
    errorsUrl: void 0,
    logsUrl: void 0,
    intervalMs: DEFAULT_OPTIONS.rest.intervalMs,
    batchSize: DEFAULT_OPTIONS.rest.batchSize,
    credentials: DEFAULT_OPTIONS.rest.credentials,
    getHeaders: void 0,
    transport: void 0,
    requireHttps: DEFAULT_OPTIONS.rest.requireHttps,
    onTerminalFailure: void 0
  }),
  shortcut: Object.freeze({
    key: DEFAULT_SHORTCUT_KEY,
    ctrl: true,
    shift: true,
    alt: true,
    meta: false,
    target: void 0,
    allow: void 0,
    filenamePrefix: DEFAULT_FILENAME_PREFIX,
    onExported: void 0
  }),
  consent: void 0,
  onInternalError: void 0,
  repository: void 0,
  logSource: void 0
});
function databaseNames(dbPrefix) {
  let prefix = DEFAULT_DB_PREFIX;
  try {
    const candidate = `${dbPrefix}`;
    if (candidate.length > 0) prefix = candidate;
  } catch (error) {
    reportInternalFailure("database-names", error);
  }
  return { errors: `${prefix}-errors`, logs: `${prefix}-logs` };
}

// src/export/redactRecords.ts
function redactCauses(causes) {
  if (causes === void 0) return void 0;
  const sanitizer = getDefaultSanitizer();
  return causes.map((cause) => {
    const mapped = {
      name: sanitizer.text(cause.name, MAX_MESSAGE_LENGTH),
      message: sanitizer.text(cause.message, MAX_MESSAGE_LENGTH)
    };
    if (cause.stack !== void 0) mapped.stack = sanitizer.stack(cause.stack, MAX_STACK_LENGTH);
    return mapped;
  });
}
function sanitizeErrorRecord(record) {
  try {
    const sanitizer = getDefaultSanitizer();
    const out = { ...record };
    out.name = sanitizer.text(record.name, MAX_MESSAGE_LENGTH);
    out.message = sanitizer.text(record.message, MAX_MESSAGE_LENGTH);
    if (record.stack !== void 0) out.stack = sanitizer.stack(record.stack, MAX_STACK_LENGTH);
    if (record.componentStack !== void 0) {
      out.componentStack = sanitizer.stack(record.componentStack, MAX_STACK_LENGTH);
    }
    if (record.causes !== void 0) out.causes = redactCauses(record.causes);
    const extra = sanitizer.value(record.extra);
    out.extra = extra !== null && typeof extra === "object" && !Array.isArray(extra) ? extra : void 0;
    if (record.tags !== void 0) {
      const tags = /* @__PURE__ */ Object.create(null);
      for (const [key, value] of Object.entries(record.tags)) {
        tags[sanitizer.text(key, MAX_TAG_KEY_LENGTH)] = sanitizer.text(value, MAX_TAG_VALUE_LENGTH);
      }
      out.tags = Object.keys(tags).length > 0 ? tags : void 0;
    }
    if (record.page !== void 0) {
      const url = sanitizer.url(record.page.url);
      out.page = {
        ...record.page,
        url: url ?? "unknown",
        route: sanitizer.text(record.page.route, 300)
      };
    }
    if (record.api !== void 0) {
      const api = { ...record.api };
      if (record.api.url !== void 0) {
        const url = sanitizer.url(record.api.url);
        api.url = url;
      }
      if (record.api.statusText !== void 0) {
        api.statusText = sanitizer.text(record.api.statusText, 200);
      }
      if (record.api.requestId !== void 0) {
        api.requestId = sanitizer.text(record.api.requestId, 200);
      }
      out.api = api;
    }
    if (record.event !== void 0) {
      const event = { ...record.event };
      if (record.event.resourceUrl !== void 0) {
        event.resourceUrl = sanitizer.url(record.event.resourceUrl);
      }
      if (record.event.blockedURI !== void 0) {
        event.blockedURI = sanitizer.text(record.event.blockedURI, MAX_MESSAGE_LENGTH);
      }
      out.event = event;
    }
    if (record.environment !== void 0) {
      const environment = {
        ...record.environment
      };
      if (record.environment.appName !== void 0) {
        environment.appName = sanitizer.text(record.environment.appName, 200);
      }
      if (record.environment.userAgent !== void 0) {
        environment.userAgent = sanitizer.text(record.environment.userAgent, 500);
      }
      out.environment = environment;
    }
    return out;
  } catch {
    return record;
  }
}
function sanitizeLogRecord(record) {
  try {
    const sanitizer = getDefaultSanitizer();
    const out = { ...record };
    out.message = sanitizer.text(record.message, MAX_MESSAGE_LENGTH);
    if (record.data !== void 0) {
      out.data = record.data.map((entry) => sanitizer.value(entry));
    }
    if (record.route !== void 0) {
      out.route = sanitizer.text(record.route, 300);
    }
    if (record.environment !== void 0) {
      const environment = { ...record.environment };
      if (record.environment.appName !== void 0) {
        environment.appName = sanitizer.text(record.environment.appName, 200);
      }
      out.environment = environment;
    }
    return out;
  } catch {
    return record;
  }
}

// src/export/reportTemplate.ts
var REPORT_PRIVACY_BANNER = "This report may contain personal data (page URLs, browser details, application messages). Review before sharing.";
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeJsonText(json) {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function encodeJsonForHtml(value) {
  let json;
  try {
    json = JSON.stringify(value) ?? "null";
  } catch {
    json = "null";
  }
  return escapeJsonText(json);
}
function buildReportPayload(meta, errors, logs) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: meta.generatedAt,
    app: {
      appName: meta.appName,
      appVersion: meta.appVersion,
      buildId: meta.buildId,
      environment: meta.environment
    },
    page: { url: meta.url, userAgent: meta.userAgent, online: meta.online },
    errors,
    logs
  };
}
var STYLES = `
:root{color-scheme:light dark;--bg:#ffffff;--fg:#16181d;--muted:#5b6472;--line:#e3e6ea;--card:#f7f8fa;
--fatal:#b3261e;--error:#c0392b;--warning:#a26a00;--info:#1a5fb4;--accent:#1a5fb4}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8eaed;--muted:#9aa3b2;--line:#2b2f36;
--card:#1e222a;--fatal:#ff8a80;--error:#ff9e94;--warning:#ffcc66;--info:#8ab4f8;--accent:#8ab4f8}}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);
font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:16px;margin:28px 0 8px}
.sub{color:var(--muted);font-size:12px}
.banner{border:1px solid var(--warning);border-left-width:4px;border-radius:6px;padding:10px 12px;
background:var(--card);color:var(--fg);margin:16px 0;font-size:13px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 16px;
background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin-top:16px}
.meta div{min-width:0}
.meta dt{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin:0}
.meta dd{margin:2px 0 0;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:20px 0 8px;
position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);z-index:2}
input[type=search],select{background:var(--bg);color:var(--fg);border:1px solid var(--line);
border-radius:6px;padding:6px 8px;font:inherit;min-width:180px}
.count{color:var(--muted);font-size:12px;margin-left:auto}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid var(--line);
word-break:break-word;overflow-wrap:anywhere}
th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;
position:sticky;top:52px;background:var(--bg)}
tr.row{cursor:pointer}
tr.row:hover{background:var(--card)}
.sev{font-weight:600}
.sev-fatal{color:var(--fatal)}.sev-error{color:var(--error)}
.sev-warning{color:var(--warning)}.sev-info{color:var(--info)}
.lvl{font-weight:600}.lvl-error{color:var(--error)}.lvl-warn{color:var(--warning)}
.lvl-info{color:var(--info)}.lvl-debug,.lvl-trace{color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 7px;
margin:1px 3px 1px 0;font-size:11px;color:var(--muted)}
pre{margin:0;white-space:pre-wrap;word-break:break-word;background:var(--card);
border:1px solid var(--line);border-radius:6px;padding:10px;max-height:420px;overflow:auto;font-size:12px}
details>summary{cursor:pointer;color:var(--accent);font-size:12px}
.empty{color:var(--muted);padding:14px;border:1px dashed var(--line);border-radius:8px}
.pill{display:inline-block;border-radius:999px;border:1px solid var(--line);padding:0 8px;
font-size:11px;color:var(--muted);margin-left:6px}
tr.sel{background:var(--card);box-shadow:inset 2px 0 0 var(--accent)}
.drill{margin-top:18px;border:1px solid var(--line);border-radius:8px;padding:14px;background:var(--card)}
.drill h3{margin:0 0 10px;font-size:14px}
.drill h4{margin:14px 0 6px}
.drill .meta{background:var(--bg);margin-top:0}
tr.near{background:rgba(26,95,180,.10)}
@media print{body{padding:0}.controls{display:none}th{position:static}
tr.row{cursor:auto}pre{max-height:none}.banner{border-color:#999}}
`;
var VIEWER_SCRIPT = `
(function () {
  'use strict';
  var dataNode = document.getElementById('diagnostics-data');
  if (!dataNode) { return; }
  var payload;
  try { payload = JSON.parse(dataNode.textContent || '{}'); } catch (err) { payload = null; }
  if (!payload || typeof payload !== 'object') { return; }

  var errors = Array.isArray(payload.errors) ? payload.errors.slice() : [];
  var logs = Array.isArray(payload.logs) ? payload.logs.slice() : [];

  errors.sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
  logs.sort(function (a, b) {
    return (b.timestamp || 0) - (a.timestamp || 0) || (b.seq || 0) - (a.seq || 0);
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function str(value) {
    if (value === undefined || value === null) { return ''; }
    return typeof value === 'string' ? value : String(value);
  }

  function timeText(value) {
    if (typeof value !== 'number' || !isFinite(value)) { return ''; }
    try { return new Date(value).toISOString(); } catch (err) { return String(value); }
  }

  function renderMeta() {
    var host = document.getElementById('meta');
    if (!host) { return; }
    var rows = [
      ['Generated', payload.generatedAt],
      ['Application', str(payload.app && payload.app.appName)],
      ['Version', str(payload.app && payload.app.appVersion)],
      ['Build', str(payload.app && payload.app.buildId)],
      ['Environment', str(payload.app && payload.app.environment)],
      ['Page URL', str(payload.page && payload.page.url)],
      ['User agent', str(payload.page && payload.page.userAgent)],
      ['Online', payload.page && payload.page.online ? 'yes' : 'no'],
      ['Errors', String(errors.length)],
      ['Logs', String(logs.length)]
    ];
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < rows.length; i += 1) {
      var wrap = el('div');
      wrap.appendChild(el('dt', null, rows[i][0]));
      wrap.appendChild(el('dd', null, rows[i][1]));
      fragment.appendChild(wrap);
    }
    host.appendChild(fragment);
  }

  function tagsCell(tags) {
    var cell = el('td');
    if (tags && typeof tags === 'object') {
      var keys = Object.keys(tags);
      if (keys.length === 0) { cell.textContent = '\\u2014'; return cell; }
      for (var i = 0; i < keys.length; i += 1) {
        cell.appendChild(el('span', 'tag', keys[i] + '=' + str(tags[keys[i]])));
      }
      return cell;
    }
    cell.textContent = '\\u2014';
    return cell;
  }

  function safeJson(value) {
    try { return JSON.stringify(value, null, 2); }
    catch (err) { return '[unserializable]'; }
  }

  function rawDetails(record) {
    var details = el('details');
    details.appendChild(el('summary', null, 'Raw JSON'));
    var pre = el('pre', 'mono');
    pre.textContent = safeJson(record);
    details.appendChild(pre);
    return details;
  }

  function loadIdOf(record) {
    if (record && record.page && record.page.pageLoadId) {
      return String(record.page.pageLoadId);
    }
    return record && record.pageLoadId ? String(record.pageLoadId) : '';
  }

  function routeOf(record) {
    if (record && record.page && record.page.route) { return String(record.page.route); }
    return record && record.route ? String(record.route) : '';
  }

  function shortId(value) { return value ? String(value).slice(0, 8) : '\u2014'; }

  function durationText(from, to) {
    if (!from || !to || to < from) { return ''; }
    var ms = to - from;
    if (ms < 1000) { return ms + ' ms'; }
    if (ms < 60000) { return (ms / 1000).toFixed(1) + ' s'; }
    return Math.round(ms / 60000) + ' min';
  }

  var loads = [];
  var loadsById = {};
  var loadFilter = '';
  var selectedErrorId = null;

  function loadFor(id) {
    var found = loadsById[id];
    if (!found) {
      found = { id: id, route: '', errors: [], logs: [], first: 0, last: 0 };
      loadsById[id] = found;
      loads.push(found);
    }
    return found;
  }

  function spanPoint(current, value) {
    if (typeof value !== 'number' || !isFinite(value)) { return current; }
    if (current < 0 || value < current) { return value; }
    return current;
  }

  (function buildLoads() {
    var i;
    for (i = 0; i < errors.length; i += 1) {
      var load = loadFor(loadIdOf(errors[i]));
      load.errors.push(errors[i]);
      if (!load.route) { load.route = routeOf(errors[i]); }
    }
    for (i = 0; i < logs.length; i += 1) {
      var logLoad = loadFor(loadIdOf(logs[i]));
      logLoad.logs.push(logs[i]);
      if (!logLoad.route) { logLoad.route = routeOf(logs[i]); }
    }
    for (i = 0; i < loads.length; i += 1) {
      var entry = loads[i];
      var first = -1;
      var last = 0;
      var j;
      for (j = 0; j < entry.errors.length; j += 1) {
        first = spanPoint(first, entry.errors[j].firstSeen);
        last = Math.max(last, entry.errors[j].lastSeen || 0);
      }
      for (j = 0; j < entry.logs.length; j += 1) {
        first = spanPoint(first, entry.logs[j].timestamp);
        last = Math.max(last, entry.logs[j].timestamp || 0);
      }
      entry.first = first < 0 ? 0 : first;
      entry.last = last;
    }
    loads.sort(function (a, b) { return b.last - a.last; });
  })();

  var fingerprintCount = (function () {
    var seen = {};
    var count = 0;
    for (var i = 0; i < errors.length; i += 1) {
      var key = str(errors[i].fingerprint) || str(errors[i].id);
      if (!seen[key]) { seen[key] = 1; count += 1; }
    }
    return count;
  })();

  function emptyRow(colspan, message) {
    var row = el('tr');
    var cell = el('td');
    cell.colSpan = colspan;
    cell.appendChild(el('div', 'empty', message));
    row.appendChild(cell);
    return row;
  }

  function matchesSearch(record, term) {
    if (!term) { return true; }
    var haystack = [
      str(record.message), str(record.name), str(record.source), str(record.category),
      str(record.fingerprint), str(record.api && record.api.url), loadIdOf(record),
      routeOf(record)
    ].join(' ').toLowerCase();
    return haystack.indexOf(term) !== -1;
  }

  function inLoad(record) {
    return loadFilter === '' || loadIdOf(record) === loadFilter;
  }

  function groupByFingerprint(term, severity) {
    var groups = [];
    var seen = {};
    for (var i = 0; i < errors.length; i += 1) {
      var record = errors[i];
      if (!inLoad(record)) { continue; }
      if (severity && str(record.severity) !== severity) { continue; }
      if (!matchesSearch(record, term)) { continue; }
      var key = str(record.fingerprint) || str(record.id);
      var group = seen[key];
      if (!group) {
        group = { records: [], occurrences: 0 };
        seen[key] = group;
        groups.push(group);
      }
      group.records.push(record);
      group.occurrences += record.occurrenceCount || 1;
    }
    return groups;
  }

  function renderErrors(term, severity) {
    var body = document.getElementById('errors-body');
    if (!body) { return 0; }
    while (body.firstChild) { body.removeChild(body.firstChild); }
    var groups = groupByFingerprint(term, severity);
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var record = group.records[0];
      var row = el('tr', 'row' + (record.id === selectedErrorId ? ' sel' : ''));
      row.appendChild(el('td', 'sev sev-' + str(record.severity), str(record.severity)));
      row.appendChild(el('td', null, str(record.source)));
      row.appendChild(el('td', 'mono', timeText(record.lastSeen)));
      row.appendChild(el('td', null, str(record.name)));

      var messageCell = el('td');
      messageCell.appendChild(el('div', null, str(record.message)));
      var detail = el('div');
      detail.appendChild(el('span', 'pill', '\\u00d7' + str(group.occurrences)));
      if (routeOf(record)) { detail.appendChild(el('span', 'pill', routeOf(record))); }
      if (record.api && record.api.status !== undefined) {
        detail.appendChild(el('span', 'pill', str(record.api.status)));
      }
      if (group.records.length > 1) {
        detail.appendChild(el('span', 'pill', group.records.length + ' rows'));
      }
      messageCell.appendChild(detail);
      messageCell.appendChild(rawDetails(group.records.length === 1 ? record : group.records));
      row.appendChild(messageCell);

      row.appendChild(tagsCell(record.tags));
      row.addEventListener('click', (function (id) {
        return function () { selectError(id); };
      })(record.id));
      body.appendChild(row);
    }
    if (groups.length === 0) {
      body.appendChild(emptyRow(6, errors.length === 0
        ? 'No errors were recorded.'
        : 'No errors match the current filters.'));
    }
    return groups.length;
  }

  function renderLogs(term, level) {
    var body = document.getElementById('logs-body');
    if (!body) { return 0; }
    while (body.firstChild) { body.removeChild(body.firstChild); }
    var shown = 0;
    for (var i = 0; i < logs.length; i += 1) {
      var record = logs[i];
      if (!inLoad(record)) { continue; }
      if (level && str(record.level) !== level) { continue; }
      if (!matchesSearch(record, term)) { continue; }
      shown += 1;

      var row = el('tr', 'row');
      row.appendChild(el('td', 'lvl lvl-' + str(record.level), str(record.level)));
      row.appendChild(el('td', 'mono', timeText(record.timestamp)));

      var messageCell = el('td');
      messageCell.appendChild(el('div', null, str(record.message)));
      var detail = el('div');
      if (routeOf(record)) { detail.appendChild(el('span', 'pill', routeOf(record))); }
      detail.appendChild(el('span', 'pill', shortId(loadIdOf(record))));
      messageCell.appendChild(detail);
      messageCell.appendChild(rawDetails(record));
      row.appendChild(messageCell);

      row.appendChild(tagsCell(record.environment));
      body.appendChild(row);
    }
    if (shown === 0) {
      body.appendChild(emptyRow(4, logs.length === 0
        ? 'No logs were recorded.'
        : 'No logs match the current filters.'));
    }
    return shown;
  }

  function metaList(rows) {
    var list = el('dl', 'meta');
    for (var i = 0; i < rows.length; i += 1) {
      var wrap = el('div');
      wrap.appendChild(el('dt', null, rows[i][0]));
      wrap.appendChild(el('dd', null, rows[i][1]));
      list.appendChild(wrap);
    }
    return list;
  }

  function focusLoad(id) {
    loadFilter = loadFilter === id ? '' : id;
    selectedErrorId = null;
    update();
  }

  /** Drill down to one error: fill the detail panel and bring it into view. */
  function selectError(id) {
    selectedErrorId = id;
    update();
    var host = document.getElementById('drill');
    if (host && typeof host.scrollIntoView === 'function') {
      try { host.scrollIntoView(true); } catch (err) { /* scrolling is cosmetic */ }
    }
  }

  function renderLoads(term) {
    var body = document.getElementById('loads-body');
    if (!body) { return 0; }
    while (body.firstChild) { body.removeChild(body.firstChild); }
    var shown = 0;
    for (var i = 0; i < loads.length; i += 1) {
      var load = loads[i];
      if (term && (load.id + ' ' + load.route).toLowerCase().indexOf(term) === -1) { continue; }
      shown += 1;
      var row = el('tr', 'row' + (load.id === loadFilter ? ' sel' : ''));
      row.appendChild(el('td', 'mono', shortId(load.id)));
      row.appendChild(el('td', null, load.route || '\u2014'));
      row.appendChild(el('td', 'mono', timeText(load.first)));
      row.appendChild(el('td', null, durationText(load.first, load.last) || '\u2014'));
      row.appendChild(el('td', null, String(load.errors.length)));
      row.appendChild(el('td', null, String(load.logs.length)));
      row.addEventListener('click', (function (id) {
        return function () { focusLoad(id); };
      })(load.id));
      body.appendChild(row);
    }
    if (shown === 0) {
      body.appendChild(emptyRow(6, loads.length === 0
        ? 'No records were captured in this report.'
        : 'No page loads match the current search.'));
    }
    return shown;
  }

  function renderDrill() {
    var host = document.getElementById('drill');
    if (!host) { return; }
    while (host.firstChild) { host.removeChild(host.firstChild); }

    var record = null;
    for (var i = 0; i < errors.length; i += 1) {
      if (errors[i].id === selectedErrorId) { record = errors[i]; }
    }
    if (!record) {
      host.appendChild(el('p', 'sub', 'Select an error row for its stack, the logs recorded ' +
        'around it, and everything else from the same load.'));
      return;
    }

    host.appendChild(el('h3', 'sev sev-' + str(record.severity), str(record.severity) + ' \xB7 ' +
      (str(record.name) || 'Error')));
    var message = el('pre', 'mono');
    message.textContent = str(record.message);
    host.appendChild(message);

    var rows = [
      ['Fingerprint', str(record.fingerprint)],
      ['Page load', loadIdOf(record) || '\u2014'],
      ['Route', routeOf(record) || '\u2014'],
      ['First seen', timeText(record.firstSeen)],
      ['Last seen', timeText(record.lastSeen)],
      ['Occurrences', String(record.occurrenceCount || 1)],
      ['Source', str(record.source)],
      ['Category', str(record.category)],
      ['Handled', record.handled ? 'yes' : 'no'],
      ['Upload status', str(record.uploadStatus)]
    ];
    if (record.api) {
      rows.push(['Request', str(record.api.method) + ' ' + str(record.api.url)]);
      rows.push(['Response', str(record.api.status) + ' ' + str(record.api.statusText)]);
      if (record.api.duration !== undefined) {
        rows.push(['Duration', str(record.api.duration) + ' ms']);
      }
    }
    host.appendChild(metaList(rows));

    function block(title, text) {
      if (!text) { return; }
      host.appendChild(el('h4', 'sub', title));
      var pre = el('pre', 'mono');
      pre.textContent = String(text);
      host.appendChild(pre);
    }
    block('Stack', record.stack);
    block('Raw JSON', safeJson(record));

    var load = loadIdOf(record) ? loadsById[loadIdOf(record)] : undefined;
    var related = load ? load.logs.slice() : [];
    related.sort(function (a, b) {
      return (a.timestamp || 0) - (b.timestamp || 0) || (a.seq || 0) - (b.seq || 0);
    });
    host.appendChild(el('h4', 'sub', 'Logs in this page load (' + related.length + ')'));
    var table = el('table');
    var head = el('thead');
    var headRow = el('tr');
    headRow.appendChild(el('th', null, 'Time'));
    headRow.appendChild(el('th', null, 'Level'));
    headRow.appendChild(el('th', null, 'Message'));
    head.appendChild(headRow);
    table.appendChild(head);
    var tbody = el('tbody');
    var from = (record.firstSeen || 0) - 5000;
    var to = (record.lastSeen || 0) + 5000;
    for (var j = 0; j < related.length; j += 1) {
      var entry = related[j];
      var at = entry.timestamp || 0;
      var logRow = el('tr', at >= from && at <= to ? 'near' : null);
      logRow.appendChild(el('td', 'mono', timeText(entry.timestamp)));
      logRow.appendChild(el('td', 'lvl lvl-' + str(entry.level), str(entry.level)));
      var logCell = el('td');
      logCell.appendChild(el('div', null, str(entry.message)));
      if (entry.data && entry.data.length) { logCell.appendChild(rawDetails(entry.data)); }
      logRow.appendChild(logCell);
      tbody.appendChild(logRow);
    }
    if (related.length === 0) {
      tbody.appendChild(emptyRow(3, 'No logs were recorded in this page load.'));
    }
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function update() {
    var search = document.getElementById('search');
    var severity = document.getElementById('severity');
    var level = document.getElementById('level');
    var term = search ? String(search.value || '').trim().toLowerCase() : '';
    var sev = severity ? String(severity.value || '') : '';
    var lvl = level ? String(level.value || '') : '';

    var groupsShown = renderErrors(term, sev);
    var logsShown = renderLogs(term, lvl);
    var loadsShown = renderLoads(term);
    renderDrill();

    var errorCount = document.getElementById('errors-count');
    if (errorCount) {
      errorCount.textContent = groupsShown + ' of ' + fingerprintCount + ' fingerprints';
    }
    var logCount = document.getElementById('logs-count');
    if (logCount) { logCount.textContent = logsShown + ' of ' + logs.length; }
    var loadCount = document.getElementById('loads-count');
    if (loadCount) { loadCount.textContent = loadsShown + ' of ' + loads.length; }
  }

  var searchInput = document.getElementById('search');
  if (searchInput) { searchInput.addEventListener('input', update); }
  var severitySelect = document.getElementById('severity');
  if (severitySelect) { severitySelect.addEventListener('change', update); }
  var levelSelect = document.getElementById('level');
  if (levelSelect) { levelSelect.addEventListener('change', update); }

  renderMeta();
  update();
})();
`;
function renderDiagnosticsReport(meta, errors, logs, encodedPayload) {
  const payloadJson = encodedPayload ?? encodeJsonForHtml(buildReportPayload(meta, errors, logs));
  const title = `Diagnostics report \u2014 ${meta.appName.length > 0 ? meta.appName : "application"}`;
  const severityOptions = ["", "fatal", "error", "warning", "info"];
  const levelOptions = ["", "error", "warn", "info", "debug", "trace"];
  const severityMarkup = severityOptions.map(
    (value) => value === "" ? '<option value="">All severities</option>' : `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("");
  const levelMarkup = levelOptions.map(
    (value) => value === "" ? '<option value="">All levels</option>' : `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="sub">Self-contained offline report generated by @codewithrajat/rm-logvault. Nothing was uploaded automatically. Errors are grouped by fingerprint.</p>

<p class="banner">${escapeHtml(REPORT_PRIVACY_BANNER)}</p>

<dl class="meta" id="meta"></dl>

<div class="controls">
<label for="search" class="sub">Search</label>
<input type="search" id="search" placeholder="message, name, source, url, load id" autocomplete="off">
<label for="severity" class="sub">Severity</label>
<select id="severity">${severityMarkup}</select>
<label for="level" class="sub">Level</label>
<select id="level">${levelMarkup}</select>
</div>

<h2>Page loads <span class="sub" id="loads-count">0 of 0</span></h2>
<p class="sub">Select a load to filter the errors and the logs down to it; select it again to clear.</p>
<table>
<thead><tr><th style="width:13%">Load</th><th style="width:20%">Route</th><th style="width:18%">First event</th><th style="width:11%">Span</th><th style="width:9%">Errors</th><th style="width:9%">Logs</th></tr></thead>
<tbody id="loads-body"></tbody>
</table>

<div class="drill" id="drill"></div>

<h2>Errors <span class="sub" id="errors-count">0 of 0</span></h2>
<table>
<thead><tr><th style="width:9%">Severity</th><th style="width:11%">Source</th><th style="width:16%">Last seen</th><th style="width:16%">Name</th><th>Message</th><th style="width:14%">Tags</th></tr></thead>
<tbody id="errors-body"></tbody>
</table>

<h2>Logs <span class="sub" id="logs-count">0 of 0</span></h2>
<table>
<thead><tr><th style="width:9%">Level</th><th style="width:18%">Timestamp</th><th>Message</th><th style="width:22%">Environment</th></tr></thead>
<tbody id="logs-body"></tbody>
</table>

<script type="application/json" id="diagnostics-data">${payloadJson}</script>
<script>${VIEWER_SCRIPT}</script>
</body>
</html>
`;
}

// src/export/diagnosticsExport.ts
var EXPORT_SLICE_SIZE = 500;
var inFlight = false;
function isExportInFlight() {
  return inFlight;
}
function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
async function mapInSlices(items, project) {
  const out = [];
  for (let index = 0; index < items.length; index += EXPORT_SLICE_SIZE) {
    const slice = items.slice(index, index + EXPORT_SLICE_SIZE);
    for (const item of slice) out.push(project(item));
    if (index + EXPORT_SLICE_SIZE < items.length) await yieldToEventLoop();
  }
  return out;
}
async function stringifyInSlices(items, onSlice) {
  if (items.length === 0) return "[]";
  const parts = [];
  for (let index = 0; index < items.length; index += EXPORT_SLICE_SIZE) {
    const slice = items.slice(index, index + EXPORT_SLICE_SIZE);
    const encoded = [];
    for (const item of slice) {
      let json;
      try {
        json = JSON.stringify(item);
      } catch {
        json = void 0;
      }
      encoded.push(json ?? "null");
    }
    parts.push(encoded.join(","));
    if (index + EXPORT_SLICE_SIZE < items.length) {
      onSlice?.(Math.min(index + EXPORT_SLICE_SIZE, items.length));
      await yieldToEventLoop();
    }
  }
  return `[${parts.join(",")}]`;
}
function toJsonLine(value) {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "null";
  }
}
function parseArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function csvValue(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "[unserializable]";
  }
}
function escapeCsv(value) {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}
function toCsv(columns, rows) {
  const lines = [columns.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsv).join(","));
  return `${lines.join("\r\n")}\r
`;
}
var DIAGNOSTICS_CSV_COLUMNS = [
  "kind",
  "id",
  "timestamp",
  "severity",
  "source",
  "category",
  "name",
  "message",
  "occurrenceCount",
  "fingerprint",
  "route",
  "method",
  "url",
  "status"
];
function apiField(record, key) {
  const api = record.api;
  if (api === void 0 || api === null) return "";
  const value = api[key];
  return value === void 0 || value === null ? "" : csvValue(value);
}
function errorCsvRow(record) {
  return [
    "error",
    record.id,
    new Date(record.timestamp).toISOString(),
    record.severity,
    record.source,
    record.category,
    record.name,
    record.message,
    String(record.occurrenceCount),
    record.fingerprint,
    record.page?.route ?? "",
    apiField(record, "method"),
    apiField(record, "url"),
    apiField(record, "status")
  ];
}
function logCsvRow(record) {
  return [
    "log",
    record.id,
    new Date(record.timestamp).toISOString(),
    record.level,
    "",
    "",
    "",
    record.message,
    "",
    "",
    record.route ?? "",
    "",
    "",
    ""
  ];
}
function buildMeta(errors, logs) {
  const state = getState();
  const options = state.options;
  const sanitizer = getDefaultSanitizer();
  let url = "unknown";
  try {
    const href = safeGet(safeGet(getWindow(), "location"), "href");
    if (typeof href === "string") {
      const sanitized = sanitizer.url(href);
      if (sanitized !== void 0) url = sanitized;
    }
  } catch {
  }
  let userAgent = "";
  try {
    const raw = safeGet(getNavigator(), "userAgent");
    if (typeof raw === "string") userAgent = sanitizer.text(raw, MAX_USER_AGENT_LENGTH);
  } catch {
  }
  return {
    generatedAt: new Date(now()).toISOString(),
    appName: options?.appName ?? "",
    appVersion: options?.appVersion ?? "",
    buildId: options?.buildId ?? "",
    environment: options?.environment ?? "",
    url: sanitizer.text(url, MAX_URL_LENGTH),
    userAgent,
    online: isOnline(),
    errorCount: errors.length,
    logCount: logs.length
  };
}
function resolvePrefix(explicit) {
  if (typeof explicit === "string" && explicit.trim().length > 0) return explicit.trim();
  const shortcut = getState().options?.shortcut;
  if (shortcut !== void 0 && shortcut !== false && shortcut.filenamePrefix.length > 0) {
    return shortcut.filenamePrefix;
  }
  return DEFAULT_FILENAME_PREFIX;
}
function diagnosticsFilename(prefix, extension) {
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, "-");
  let safePrefix = DEFAULT_FILENAME_PREFIX;
  let safeExtension = "html";
  try {
    const rendered = `${prefix}`;
    if (rendered.length > 0) safePrefix = rendered;
  } catch (error) {
    reportInternalFailure("diagnostics-filename-prefix", error);
  }
  try {
    const rendered = `${extension}`;
    if (rendered.length > 0) safeExtension = rendered;
  } catch (error) {
    reportInternalFailure("diagnostics-filename-extension", error);
  }
  return `${safePrefix}-${stamp}.${safeExtension}`;
}
function downloadText(content, filename, mimeType) {
  try {
    const doc = getDocument();
    const win = getWindow();
    if (doc === void 0 || win === void 0) return false;
    const BlobCtor = safeGet(win, "Blob") ?? safeGet(globalThis, "Blob");
    if (typeof BlobCtor !== "function") return false;
    const urlObject = safeGet(win, "URL") ?? safeGet(globalThis, "URL");
    const createObjectURL = safeGet(urlObject, "createObjectURL");
    if (typeof createObjectURL !== "function") return false;
    const revokeObjectURL = safeGet(urlObject, "revokeObjectURL");
    const blob = Reflect.construct(BlobCtor, [
      [content],
      { type: mimeType }
    ]);
    const objectUrl = Reflect.apply(createObjectURL, urlObject, [blob]);
    if (typeof objectUrl !== "string") return false;
    const anchor = doc.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.setAttribute("style", "display:none");
    const host = doc.body ?? doc.documentElement;
    host.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      try {
        host.removeChild(anchor);
      } catch {
      }
      try {
        if (typeof revokeObjectURL === "function") {
          Reflect.apply(revokeObjectURL, urlObject, [objectUrl]);
        }
      } catch {
      }
    }, 1e3);
    return true;
  } catch (error) {
    reportInternalFailure("diagnostics-download", error);
    return false;
  }
}
async function copyText(content) {
  try {
    const navigatorObject = getNavigator();
    if (navigatorObject === void 0) return false;
    const clipboard = safeGet(navigatorObject, "clipboard");
    const writeText = safeGet(clipboard, "writeText");
    if (typeof writeText !== "function") return false;
    await Reflect.apply(writeText, clipboard, [content]);
    return true;
  } catch (error) {
    reportInternalFailure("diagnostics-clipboard", error);
    return false;
  }
}
async function runExport(options) {
  const format = resolveFormat(options.format);
  if (!isBrowser()) return { ok: false, format, bytes: 0 };
  const state = getState();
  const repository = state.repository;
  if (repository === null) return { ok: false, format, bytes: 0 };
  try {
    await state.flush?.();
  } catch (error) {
    reportInternalFailure("diagnostics-flush", error);
  }
  const errorsResult = await repository.errors.getAll();
  const logsResult = await repository.logs.getAll();
  if (!errorsResult.ok) reportInternalFailure("diagnostics-read-errors", errorsResult.reason);
  if (!logsResult.ok) reportInternalFailure("diagnostics-read-logs", logsResult.reason);
  let errors = errorsResult.ok ? errorsResult.value : [];
  let logs = logsResult.ok ? logsResult.value : [];
  if (options.redactAgain === true) {
    errors = await mapInSlices(errors, sanitizeErrorRecord);
    logs = await mapInSlices(logs, sanitizeLogRecord);
  }
  const total = errors.length + logs.length;
  const progress = (processed) => {
    if (typeof options.onProgress !== "function") return;
    try {
      options.onProgress(Math.min(processed, total), total);
    } catch (error) {
      reportInternalFailure("diagnostics-progress", error);
    }
  };
  let reportedUpTo = 0;
  const reportSlice = (upTo) => {
    if (upTo > reportedUpTo) {
      reportedUpTo = upTo;
      progress(upTo);
    }
  };
  const meta = buildMeta(errors, logs);
  const appBlock = {
    appName: meta.appName,
    appVersion: meta.appVersion,
    buildId: meta.buildId,
    environment: meta.environment
  };
  const pageBlock = { url: meta.url, userAgent: meta.userAgent, online: meta.online };
  const pretty = options.pretty === true;
  const buildJson = async () => {
    const errorsJson = await stringifyInSlices(errors, (count) => {
      reportSlice(count);
    });
    const logsJson = await stringifyInSlices(logs, (count) => {
      reportSlice(errors.length + count);
    });
    const payload = {
      schemaVersion: 1,
      generatedAt: meta.generatedAt,
      app: appBlock,
      page: pageBlock,
      errors: parseArray(errorsJson),
      logs: parseArray(logsJson)
    };
    try {
      return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
    } catch (error) {
      reportInternalFailure("diagnostics-json", error);
      return '{"schemaVersion":1,"errors":[],"logs":[]}';
    }
  };
  const buildJsonLines = async () => {
    const lines = [];
    for (let index = 0; index < errors.length; index += EXPORT_SLICE_SIZE) {
      for (const record of errors.slice(index, index + EXPORT_SLICE_SIZE)) {
        lines.push(toJsonLine({ kind: "error", ...record }));
      }
      if (index + EXPORT_SLICE_SIZE < errors.length) {
        reportSlice(Math.min(index + EXPORT_SLICE_SIZE, errors.length));
        await yieldToEventLoop();
      }
    }
    reportSlice(errors.length);
    for (let index = 0; index < logs.length; index += EXPORT_SLICE_SIZE) {
      for (const record of logs.slice(index, index + EXPORT_SLICE_SIZE)) {
        lines.push(toJsonLine({ kind: "log", ...record }));
      }
      if (index + EXPORT_SLICE_SIZE < logs.length) {
        reportSlice(errors.length + Math.min(index + EXPORT_SLICE_SIZE, logs.length));
        await yieldToEventLoop();
      }
    }
    reportSlice(total);
    return lines.join("\n");
  };
  const buildHtml = async () => {
    const errorsJson = await stringifyInSlices(errors, (count) => {
      reportSlice(count);
    });
    const logsJson = await stringifyInSlices(logs, (count) => {
      reportSlice(errors.length + count);
    });
    const payloadJson = `{"schemaVersion":1,"generatedAt":${JSON.stringify(
      meta.generatedAt
    )},"app":${JSON.stringify(appBlock)},"page":${JSON.stringify(pageBlock)},"errors":${errorsJson},"logs":${logsJson}}`;
    return renderDiagnosticsReport(meta, errors, logs, escapeJsonText(payloadJson));
  };
  let content;
  switch (format) {
    case "json":
      content = await buildJson();
      break;
    case "jsonl":
      content = await buildJsonLines();
      break;
    case "csv":
      content = toCsv(DIAGNOSTICS_CSV_COLUMNS, [
        ...errors.map(errorCsvRow),
        ...logs.map(logCsvRow)
      ]);
      reportSlice(total);
      break;
    default:
      content = await buildHtml();
      break;
  }
  reportSlice(total);
  const bytes = byteLength(content);
  if (options.copyToClipboard === true) {
    const ok = await copyText(content);
    notifyExported(options.onExported, ok);
    return { ok, format, bytes };
  }
  const downloaded = downloadText(
    content,
    diagnosticsFilename(resolvePrefix(options.filenamePrefix), FORMAT_EXTENSIONS[format]),
    FORMAT_MIME_TYPES[format]
  );
  notifyExported(options.onExported, downloaded);
  return { ok: downloaded, format, bytes };
}
function resolveFormat(requested) {
  switch (requested) {
    case "json":
    case "jsonl":
    case "csv":
    case "html":
      return requested;
    default:
      return "html";
  }
}
var FORMAT_EXTENSIONS = {
  html: "html",
  json: "json",
  jsonl: "jsonl",
  csv: "csv"
};
var FORMAT_MIME_TYPES = {
  html: "text/html;charset=utf-8",
  json: "application/json;charset=utf-8",
  jsonl: "application/x-ndjson;charset=utf-8",
  csv: "text/csv;charset=utf-8"
};
function notifyExported(callback, ok) {
  if (typeof callback !== "function") return;
  try {
    callback(ok);
  } catch (error) {
    reportInternalFailure("diagnostics-on-exported", error);
  }
}
async function exportDiagnosticsReport(options = {}) {
  try {
    const format = resolveFormat(options.format);
    if (inFlight) return { ok: false, format, bytes: 0 };
    inFlight = true;
    try {
      return await runExport(options);
    } catch (error) {
      reportInternalFailure("diagnostics-export", error);
      notifyExported(options.onExported, false);
      return { ok: false, format, bytes: 0 };
    } finally {
      inFlight = false;
    }
  } catch (error) {
    reportInternalFailure("diagnostics-export-options", error);
    return { ok: false, format: "html", bytes: 0 };
  }
}

// src/export/shortcut.ts
var DEFAULT_KEY = "d";
var DEFAULT_SHORTCUT_CONFIG = {
  key: DEFAULT_KEY,
  ctrl: true,
  shift: true,
  alt: true,
  meta: false
};
var EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]'
].join(",");
function expectedCode(key) {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return void 0;
}
function matchesShortcut(event, config) {
  try {
    if (event.ctrlKey !== config.ctrl) return false;
    if (event.shiftKey !== config.shift) return false;
    if (event.altKey !== config.alt) return false;
    if (event.metaKey !== config.meta) return false;
    const code = expectedCode(config.key);
    const eventCode = typeof event.code === "string" ? event.code : "";
    if (code !== void 0 && eventCode === code) return true;
    const eventKey = typeof event.key === "string" ? event.key : "";
    return eventKey.toLowerCase() === config.key.toLowerCase();
  } catch {
    return false;
  }
}
function isEditableTarget(target) {
  if (target === null || target === void 0) return false;
  try {
    const closest = Reflect.get(target, "closest");
    if (typeof closest === "function") {
      const match = Reflect.apply(closest, target, [EDITABLE_SELECTOR]);
      if (match !== null && match !== void 0) return true;
    }
  } catch {
  }
  try {
    const tagName = Reflect.get(target, "tagName");
    if (typeof tagName === "string") {
      const tag = tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
    }
  } catch {
  }
  return false;
}
function resolveConfig(config) {
  const key = typeof config?.key === "string" && config.key.trim().length > 0 ? config.key.trim() : DEFAULT_SHORTCUT_CONFIG.key;
  return {
    key,
    ctrl: config?.ctrl ?? DEFAULT_SHORTCUT_CONFIG.ctrl,
    shift: config?.shift ?? DEFAULT_SHORTCUT_CONFIG.shift,
    alt: config?.alt ?? DEFAULT_SHORTCUT_CONFIG.alt,
    meta: config?.meta ?? DEFAULT_SHORTCUT_CONFIG.meta,
    target: config?.target,
    allow: config?.allow
  };
}
function installShortcut(config, onTrigger) {
  const resolved = resolveConfig(config);
  const target = resolved.target ?? getDocument() ?? getEventTarget();
  if (target === void 0) {
    return () => void 0;
  }
  const handler = (event) => {
    try {
      const keyboard = event;
      if (!matchesShortcut(keyboard, resolved)) return;
      if (isEditableTarget(keyboard.target)) return;
      if (resolved.allow !== void 0) {
        try {
          if (resolved.allow() !== true) return;
        } catch {
          return;
        }
      }
      event.preventDefault();
    } catch {
      return;
    }
    try {
      onTrigger();
    } catch {
    }
  };
  try {
    target.addEventListener("keydown", handler, true);
  } catch {
    return () => void 0;
  }
  return () => {
    try {
      target.removeEventListener("keydown", handler, true);
    } catch {
    }
  };
}
function installDiagnosticsExportShortcut(options) {
  if (options === false) return () => void 0;
  const { filenamePrefix, exportOptions, onExported, ...shortcut } = options ?? {};
  return installShortcut(shortcut, () => {
    void exportDiagnosticsReport({
      ...exportOptions,
      ...filenamePrefix !== void 0 ? { filenamePrefix } : {},
      ...onExported !== void 0 ? { onExported } : {}
    });
  });
}

// src/handlers/globalHandlers.ts
var CRITICAL_RESOURCE_TAGS = /* @__PURE__ */ new Set(["script", "link", "style"]);
var registrations = /* @__PURE__ */ new Set();
var active = false;
var attached = false;
var chainedOnerror = null;
var listenerTarget;
function wantsResources() {
  for (const registration of registrations) {
    if (registration.options.captureResources === true) return true;
  }
  return false;
}
function wantsCsp() {
  for (const registration of registrations) {
    if (registration.options.captureCsp === true) return true;
  }
  return false;
}
function wantsPreventDefault() {
  for (const registration of registrations) {
    if (registration.options.preventDefaultUnhandledRejection === true) return true;
  }
  return false;
}
function wantsChunkCapture() {
  for (const registration of registrations) {
    if (registration.options.captureChunkErrors !== false) return true;
  }
  return false;
}
function dispatch(error, ctx) {
  dispatchWhere(() => true, error, ctx);
}
function dispatchWhere(predicate, error, ctx) {
  if (!active) return;
  for (const registration of [...registrations]) {
    if (!predicate(registration.options)) continue;
    try {
      registration.options.onError(error, ctx);
    } catch {
    }
  }
}
function isChunkMessage(message) {
  return CHUNK_ERROR_PATTERN.test(message);
}
function captureWindowError(message, source, line, column, error, origin = "window") {
  try {
    const text = typeof message === "string" ? message : "Script error.";
    const sourceFile = typeof source === "string" && source.length > 0 ? source : void 0;
    const lineNumber = typeof line === "number" ? line : void 0;
    const columnNumber = typeof column === "number" ? column : void 0;
    const location = sourceFile === void 0 ? void 0 : {
      source: sanitizeText(sourceFile, MAX_MESSAGE_LENGTH),
      ...lineNumber !== void 0 ? { line: lineNumber } : {},
      ...columnNumber !== void 0 ? { column: columnNumber } : {}
    };
    const classify = () => {
      if (wantsChunkCapture() && isChunkMessage(text)) return "chunk";
      return origin;
    };
    if (error !== null && error !== void 0) {
      const chunk2 = wantsChunkCapture() && isChunkMessage(text);
      dispatch(error, {
        source: classify(),
        ...chunk2 ? { severity: "fatal", category: "chunk" } : {},
        ...location !== void 0 ? { location } : {}
      });
      return;
    }
    const crossOrigin = text.trim() === "Script error.";
    const chunk = wantsChunkCapture() && isChunkMessage(text);
    const synthetic = { name: chunk ? "ChunkLoadError" : "WindowError", message: text };
    dispatch(synthetic, {
      source: classify(),
      ...chunk ? { severity: "fatal", category: "chunk" } : {},
      ...location !== void 0 ? { location } : {},
      ...crossOrigin && origin === "window" ? { tags: { crossOrigin: "true" } } : {},
      event: {
        type: "error",
        crossOrigin: crossOrigin && origin === "window" ? "true" : void 0
      }
    });
  } catch {
  }
}
function globalOnerror(message, source, lineno, colno, error) {
  try {
    const hasError = error !== null && error !== void 0;
    const hasMessage = typeof message === "string" && message.length > 0;
    if (active && (hasError || hasMessage)) {
      captureWindowError(message, source, lineno, colno, error);
    }
  } catch {
  }
  if (typeof chainedOnerror === "function") {
    try {
      return Reflect.apply(
        chainedOnerror,
        this ?? globalThis,
        [message, source, lineno, colno, error]
      );
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function onUnhandledRejection(event) {
  try {
    if (!active) return;
    if (wantsPreventDefault()) {
      const prevent = safeGet(event, "preventDefault");
      if (typeof prevent === "function") {
        try {
          Reflect.apply(prevent, event, []);
        } catch {
        }
      }
    }
    const reason = safeGet(event, "reason");
    captureWindowError(reason, void 0, void 0, void 0, reason, "unhandledrejection");
  } catch {
  }
}
function onResourceError(event) {
  try {
    if (!active) return;
    const target = safeGet(event, "target");
    if (target === null || target === void 0) return;
    if (safeGet(target, "message") !== void 0) return;
    const tagName = safeGet(target, "tagName");
    if (typeof tagName !== "string" || tagName.length === 0) return;
    const tag = tagName.toLowerCase();
    const src = safeGet(target, "src") ?? safeGet(target, "href") ?? safeGet(target, "currentSrc");
    const resourceUrl = typeof src === "string" ? src : void 0;
    const severity = CRITICAL_RESOURCE_TAGS.has(tag) ? "error" : "warning";
    const chunk = wantsChunkCapture() && tag === "script" && resourceUrl !== void 0 && isChunkMessage(resourceUrl);
    dispatchWhere(
      (options) => options.captureResources === true,
      {
        name: "ResourceLoadError",
        message: `Failed to load <${tag}>: ${resourceUrl ?? "unknown"}`
      },
      {
        source: chunk ? "chunk" : "resource",
        category: "resource",
        severity,
        event: {
          type: "error",
          targetTag: tag,
          ...resourceUrl !== void 0 ? { resourceUrl } : {}
        }
      }
    );
  } catch {
  }
}
function onPreloadError(event) {
  try {
    if (!active) return;
    const payload = safeGet(event, "payload");
    const error = payload ?? { name: "ChunkLoadError", message: "Failed to preload module" };
    dispatch(error, {
      source: "chunk",
      severity: "fatal",
      category: "chunk",
      tags: { bundler: "vite" }
    });
  } catch {
  }
}
function onSecurityPolicyViolation(event) {
  try {
    if (!active) return;
    const effective = safeGet(event, "effectiveDirective");
    const violated = safeGet(event, "violatedDirective");
    const directive = typeof effective === "string" && effective.length > 0 ? effective : typeof violated === "string" && violated.length > 0 ? violated : void 0;
    const blockedURI = safeGet(event, "blockedURI");
    const blocked = typeof blockedURI === "string" && blockedURI.length > 0 ? blockedURI : void 0;
    const sourceFile = safeGet(event, "sourceFile");
    const lineNumber = safeGet(event, "lineNumber");
    const columnNumber = safeGet(event, "columnNumber");
    const isUrl = blocked?.includes("/") === true;
    const location = typeof sourceFile === "string" && sourceFile.length > 0 ? {
      source: sanitizeText(sourceFile, MAX_MESSAGE_LENGTH),
      ...typeof lineNumber === "number" ? { line: lineNumber } : {},
      ...typeof columnNumber === "number" ? { column: columnNumber } : {}
    } : void 0;
    dispatchWhere(
      (options) => options.captureCsp === true,
      {
        name: "SecurityPolicyViolation",
        message: `Content-Security-Policy violation: ${directive ?? "unknown directive"}`
      },
      {
        source: "csp",
        category: "security",
        severity: "warning",
        ...location !== void 0 ? { location } : {},
        ...isUrl || blocked !== void 0 ? { tags: isUrl ? {} : { blocked: sanitizeText(blocked, 200) } } : {},
        event: {
          type: "securitypolicyviolation",
          ...directive !== void 0 ? { directive } : {},
          ...isUrl && blocked !== void 0 ? { resourceUrl: sanitizeText(blocked, MAX_MESSAGE_LENGTH) } : {},
          ...isUrl && blocked !== void 0 ? { blockedURI: sanitizeText(blocked, MAX_MESSAGE_LENGTH) } : {}
        }
      }
    );
  } catch {
  }
}
function attach() {
  if (attached) return;
  const target = getEventTarget();
  if (target === void 0) {
    return;
  }
  listenerTarget = target;
  try {
    const win = getWindow();
    const scope = win ?? getWorkerScope();
    if (scope !== void 0) {
      const existing = safeGet(scope, "onerror");
      chainedOnerror = existing ?? null;
      Reflect.set(scope, "onerror", globalOnerror);
    }
    target.addEventListener("unhandledrejection", onUnhandledRejection);
    target.addEventListener("vite:preloadError", onPreloadError);
    if (wantsResources()) {
      target.addEventListener("error", onResourceError, true);
    }
    if (wantsCsp()) {
      target.addEventListener("securitypolicyviolation", onSecurityPolicyViolation);
    }
    attached = true;
    active = true;
  } catch {
  }
}
function detach() {
  if (!attached) {
    active = false;
    return;
  }
  const target = listenerTarget;
  try {
    target?.removeEventListener("unhandledrejection", onUnhandledRejection);
    target?.removeEventListener("vite:preloadError", onPreloadError);
    target?.removeEventListener("error", onResourceError, true);
    target?.removeEventListener("securitypolicyviolation", onSecurityPolicyViolation);
  } catch {
  }
  try {
    const win = getWindow();
    const scope = win ?? getWorkerScope();
    if (scope !== void 0) {
      if (safeGet(scope, "onerror") === globalOnerror) {
        Reflect.set(scope, "onerror", chainedOnerror);
        active = false;
      } else {
        active = false;
      }
    } else {
      active = false;
    }
  } catch {
    active = false;
  }
  listenerTarget = void 0;
  attached = false;
}
function installGlobalErrorHandlers(options) {
  const registration = { options };
  try {
    registrations.add(registration);
    if (!attached) attach();
    else if (wantsResources() || wantsCsp()) {
      detach();
      attach();
    }
  } catch {
  }
  return () => {
    try {
      registrations.delete(registration);
      if (registrations.size === 0) detach();
    } catch {
    }
  };
}
function globalHandlerCount() {
  return registrations.size;
}
function globalHandlersAttached() {
  return attached;
}

// src/logger/logTracker.ts
function createLogTracker(trackerOptions) {
  const { repository, options: config } = trackerOptions;
  const queue = createSerialQueue();
  let pending = [];
  let timer = null;
  let destroyed = false;
  const limiter = createRateLimiter(config.logs.maxLogsPerMinute, (dropped) => {
    reportInternalNote("rate-limit", `${String(dropped)} dropped`);
  });
  const consentGranted = () => {
    const consent = config.consent;
    if (consent === void 0) return true;
    try {
      return consent() === true;
    } catch {
      return false;
    }
  };
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const flushNow = async () => {
    clearTimer();
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    const result = await queue.push(() => repository.saveBatch(batch));
    if (result !== void 0 && !result.ok) {
      reportInternalFailure("persist", result.reason);
    }
  };
  const sink = {
    name: "@codewithrajat/rm-logvault-indexeddb",
    write: (record) => {
      try {
        if (destroyed) return;
        if (!config.logs.enabled) return;
        if (!meetsLevel(record.level, config.logs.level)) return;
        if (!consentGranted()) return;
        if (!limiter.allow()) return;
        let candidate = record;
        const beforeStore = config.logs.beforeStore;
        if (beforeStore !== void 0) {
          try {
            const replacement = beforeStore(candidate);
            if (replacement === null) return;
            candidate = replacement;
          } catch (error) {
            reportInternalFailure("beforeStore", error);
          }
        }
        const fitted = reduceLogPayload(candidate, config.logs.maxPayloadBytes);
        if (fitted === null) {
          reportInternalFailure(
            "payload-limit",
            new Error("log record exceeded its payload budget at every reduction tier")
          );
          return;
        }
        pending.push(fitted);
        try {
          trackerOptions.onRecord?.(fitted);
        } catch {
        }
        if (pending.length >= config.logs.writeBatchSize) {
          void flushNow();
        } else if (timer === null) {
          timer = setTimeout(() => {
            timer = null;
            void flushNow();
          }, config.logs.writeFlushMs);
        }
      } catch (error) {
        reportInternalFailure("log-tracker", error);
      }
    }
  };
  return {
    sink,
    flush: async () => {
      await flushNow();
      await queue.drain();
    },
    droppedByRateLimit: () => limiter.dropped(),
    destroy: async () => {
      if (destroyed) return;
      try {
        await flushNow();
      } catch {
      }
      destroyed = true;
      clearTimer();
      pending = [];
      queue.clear();
    }
  };
}

// src/storage/repositoryUtils.ts
async function deleteMatching(store, match, onMalformed) {
  let deleted = 0;
  await new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => {
      reject(request.error ?? new Error("cursor failed"));
    };
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve();
        return;
      }
      const value = cursor.value;
      const malformed = onMalformed?.(value) ?? false;
      if (malformed || match(value)) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
  });
  return deleted;
}
async function cleanupStore(store, policy, timestampOf, now2, isValid) {
  let removed = 0;
  const cutoff = policy.retentionDays > 0 ? now2 - policy.retentionDays * 864e5 : Number.NEGATIVE_INFINITY;
  removed += await deleteMatching(
    store,
    (value) => {
      const timestamp = timestampOf(value);
      return !Number.isFinite(timestamp) || timestamp < cutoff;
    },
    (value) => !isValid(value)
  );
  if (!Number.isFinite(policy.maxRecords) || policy.maxRecords <= 0) {
    return removed;
  }
  const survivors = [];
  await new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => {
      reject(request.error ?? new Error("cursor failed"));
    };
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve();
        return;
      }
      const value = cursor.value;
      if (isValid(value)) {
        survivors.push({ key: cursor.primaryKey, timestamp: timestampOf(value) });
      }
      cursor.continue();
    };
  });
  if (survivors.length <= policy.maxRecords) return removed;
  survivors.sort((a, b) => a.timestamp - b.timestamp);
  const surplus = survivors.slice(0, survivors.length - policy.maxRecords);
  for (const entry of surplus) {
    await promisifyRequest(store.delete(entry.key));
    removed += 1;
  }
  return removed;
}
async function updateStatuses(store, ids, status, now2) {
  let updated = 0;
  for (const id of ids) {
    const raw = await promisifyRequest(store.get(id));
    if (raw === null || raw === void 0 || typeof raw !== "object") continue;
    const record = { ...raw };
    record["uploadStatus"] = status;
    if (status === "uploading") record["claimedAt"] = now2;
    else delete record["claimedAt"];
    await promisifyRequest(store.put(record));
    updated += 1;
  }
  return updated;
}
async function deleteByIds(store, ids) {
  let deleted = 0;
  for (const id of ids) {
    await promisifyRequest(store.delete(id));
    deleted += 1;
  }
  return deleted;
}
function halvedPolicy(policy) {
  return {
    retentionDays: policy.retentionDays,
    maxRecords: Math.max(1, Math.floor(policy.maxRecords / 2))
  };
}
function sortNewestFirst(items, timestampOf) {
  return items.sort((a, b) => timestampOf(b) - timestampOf(a));
}

// src/storage/storage.constants.ts
var ERRORS_DB_VERSION = 1;
var LOGS_DB_VERSION = 1;
var ERRORS_STORE = "errors";
var LOGS_STORE = "logs";
var ERRORS_INDEX_FINGERPRINT_STATUS = "by_fingerprint_status";
var ERRORS_INDEX_STATUS = "by_status";
var LOGS_INDEX_STATUS_TIMESTAMP = "by_status_timestamp";
var LOGS_INDEX_TIMESTAMP = "by_timestamp";
var ERROR_CLEANUP_EVERY_WRITES = 25;
var LOG_CLEANUP_EVERY_WRITES = 200;
var DEFAULT_PENDING_LIMIT = 100;

// src/storage/validate.ts
var UPLOAD_STATUSES = /* @__PURE__ */ new Set([
  "pending",
  "uploading",
  "uploaded",
  "failed"
]);
var LOG_LEVELS2 = /* @__PURE__ */ new Set(["trace", "debug", "info", "warn", "error"]);
function prop(value, key) {
  if (value === null || typeof value !== "object") return void 0;
  try {
    return value[key];
  } catch {
    return void 0;
  }
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isErrorRecord(value) {
  if (value === null || typeof value !== "object") return false;
  if (prop(value, "schemaVersion") !== SCHEMA_VERSION) return false;
  if (!isNonEmptyString(prop(value, "id"))) return false;
  if (!isNonEmptyString(prop(value, "fingerprint"))) return false;
  const status = prop(value, "uploadStatus");
  if (typeof status !== "string" || !UPLOAD_STATUSES.has(status)) return false;
  if (!isFiniteNumber(prop(value, "uploadAttempts"))) return false;
  if (!isNonEmptyString(prop(value, "name"))) return false;
  if (!isNonEmptyString(prop(value, "source"))) return false;
  if (!isNonEmptyString(prop(value, "severity"))) return false;
  if (!isNonEmptyString(prop(value, "category"))) return false;
  if (typeof prop(value, "handled") !== "boolean") return false;
  if (!isFiniteNumber(prop(value, "timestamp"))) return false;
  if (!isFiniteNumber(prop(value, "firstSeen"))) return false;
  if (!isFiniteNumber(prop(value, "lastSeen"))) return false;
  if (!isFiniteNumber(prop(value, "occurrenceCount"))) return false;
  const page = prop(value, "page");
  if (!isNonEmptyString(prop(page, "pageLoadId"))) return false;
  return true;
}
function isLogRecord(value) {
  if (value === null || typeof value !== "object") return false;
  if (prop(value, "schemaVersion") !== SCHEMA_VERSION) return false;
  if (!isNonEmptyString(prop(value, "id"))) return false;
  const status = prop(value, "uploadStatus");
  if (typeof status !== "string" || !UPLOAD_STATUSES.has(status)) return false;
  if (!isFiniteNumber(prop(value, "uploadAttempts"))) return false;
  const level = prop(value, "level");
  if (typeof level !== "string" || !LOG_LEVELS2.has(level)) return false;
  if (typeof prop(value, "message") !== "string") return false;
  if (!isNonEmptyString(prop(value, "pageLoadId"))) return false;
  if (!isFiniteNumber(prop(value, "timestamp"))) return false;
  if (!isFiniteNumber(prop(value, "seq"))) return false;
  return true;
}

// src/storage/errorRepository.ts
function upgradeErrors(db, _oldVersion, transaction) {
  if (!db.objectStoreNames.contains(ERRORS_STORE)) {
    const store2 = db.createObjectStore(ERRORS_STORE, { keyPath: "id" });
    store2.createIndex(ERRORS_INDEX_FINGERPRINT_STATUS, ["fingerprint", "uploadStatus"], {
      unique: false
    });
    store2.createIndex(ERRORS_INDEX_STATUS, "uploadStatus", { unique: false });
    return;
  }
  const store = transaction.objectStore(ERRORS_STORE);
  if (!store.indexNames.contains(ERRORS_INDEX_FINGERPRINT_STATUS)) {
    store.createIndex(ERRORS_INDEX_FINGERPRINT_STATUS, ["fingerprint", "uploadStatus"], {
      unique: false
    });
  }
  if (!store.indexNames.contains(ERRORS_INDEX_STATUS)) {
    store.createIndex(ERRORS_INDEX_STATUS, "uploadStatus", { unique: false });
  }
}
function onlyKeyRange(key) {
  try {
    const ctor = Reflect.get(globalThis, "IDBKeyRange");
    if (typeof ctor === "function") {
      return ctor.only(key);
    }
  } catch {
  }
  return void 0;
}
function createErrorRepository(options) {
  const connectionOptions = {
    dbName: options.dbName,
    version: ERRORS_DB_VERSION,
    storeName: ERRORS_STORE,
    upgrade: upgradeErrors,
    ...options.indexedDB !== void 0 ? { indexedDB: options.indexedDB } : {},
    ...options.onFailure !== void 0 ? { onFailure: options.onFailure } : {},
    ...options.openTimeoutMs !== void 0 ? { openTimeoutMs: options.openTimeoutMs } : {}
  };
  const connection = createDbConnection(connectionOptions);
  const cleanupEvery = Math.max(1, options.cleanupEveryWrites ?? ERROR_CLEANUP_EVERY_WRITES);
  let writesSinceCleanup = 0;
  let cleanupDisabled = false;
  const policy = () => options.cleanupPolicy;
  const runCleanup = async (override) => {
    const active3 = override ?? policy();
    if (active3 === void 0) return { ok: true, value: 0 };
    const now2 = Date.now();
    return connection.transaction(
      "readwrite",
      (store) => cleanupStore(store, active3, (record) => record.lastSeen, now2, isErrorRecord)
    );
  };
  const save = async (record) => {
    const attempt = async () => connection.transaction("readwrite", async (store) => {
      const index = store.index(ERRORS_INDEX_FINGERPRINT_STATUS);
      const range = onlyKeyRange([record.fingerprint, "pending"]);
      const existing = await findAggregateTarget(store, index, record.fingerprint, range);
      if (existing === void 0) {
        await promisifyRequest(store.put(record));
        return;
      }
      const merged = {
        ...existing,
        occurrenceCount: existing.occurrenceCount + record.occurrenceCount,
        firstSeen: Math.min(existing.firstSeen, record.firstSeen),
        lastSeen: Math.max(existing.lastSeen, record.lastSeen)
      };
      await promisifyRequest(store.put(merged));
    });
    let result = await attempt();
    if (!result.ok && result.reason === "quota") {
      const active3 = policy();
      if (active3 !== void 0) {
        await runCleanup(halvedPolicy(active3));
        result = await attempt();
      }
    }
    if (result.ok) {
      writesSinceCleanup += 1;
      if (!cleanupDisabled && writesSinceCleanup >= cleanupEvery) {
        writesSinceCleanup = 0;
        const cleaned = await runCleanup();
        if (!cleaned.ok) cleanupDisabled = true;
      }
    }
    return result;
  };
  const readAllValidated = async () => {
    const first = await connection.transaction("readonly", async (store) => {
      const raw = await promisifyRequest(store.getAll());
      const valid = [];
      const malformed = [];
      for (const entry of raw) {
        if (isErrorRecord(entry)) valid.push(entry);
        else if (entry !== null && typeof entry === "object") {
          const id = entry.id;
          if (typeof id === "string") malformed.push(id);
        }
      }
      return { valid, malformed };
    });
    if (!first.ok) return first;
    if (first.value.malformed.length > 0) {
      await connection.transaction(
        "readwrite",
        (store) => deleteByIds(store, first.value.malformed)
      );
    }
    return {
      ok: true,
      value: sortNewestFirst(first.value.valid, (record) => record.lastSeen)
    };
  };
  const readByStatus = async (status, limit) => connection.transaction("readonly", async (store) => {
    const range = onlyKeyRange(status);
    const index = store.index(ERRORS_INDEX_STATUS);
    const collected = [];
    await new Promise((resolve, reject) => {
      const request = range === void 0 ? index.openCursor() : index.openCursor(range);
      request.onerror = () => {
        reject(request.error ?? new Error("cursor failed"));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) {
          resolve();
          return;
        }
        const value = cursor.value;
        if (isErrorRecord(value) && value.uploadStatus === status) collected.push(value);
        cursor.continue();
      };
    });
    const sorted = sortNewestFirst(collected, (record) => record.lastSeen);
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  });
  const claimPending = async (limit, now2) => connection.transaction("readwrite", async (store) => {
    const index = store.index(ERRORS_INDEX_STATUS);
    const range = onlyKeyRange("pending");
    const claimed = [];
    await new Promise((resolve, reject) => {
      const request = range === void 0 ? index.openCursor() : index.openCursor(range);
      request.onerror = () => {
        reject(request.error ?? new Error("cursor failed"));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null || claimed.length >= limit) {
          resolve();
          return;
        }
        const value = cursor.value;
        if (isErrorRecord(value) && value.uploadStatus === "pending") {
          const updated = {
            ...value,
            uploadStatus: "uploading",
            uploadAttempts: value.uploadAttempts + 1,
            claimedAt: now2
          };
          cursor.update(updated);
          claimed.push(updated);
        }
        cursor.continue();
      };
    });
    return claimed;
  });
  const requeueStale = async (olderThanMs, now2) => connection.transaction("readwrite", async (store) => {
    const index = store.index(ERRORS_INDEX_STATUS);
    const range = onlyKeyRange("uploading");
    let requeued = 0;
    await new Promise((resolve, reject) => {
      const request = range === void 0 ? index.openCursor() : index.openCursor(range);
      request.onerror = () => {
        reject(request.error ?? new Error("cursor failed"));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) {
          resolve();
          return;
        }
        const value = cursor.value;
        if (isErrorRecord(value) && value.uploadStatus === "uploading") {
          const claimedAt = value.claimedAt;
          const stale = claimedAt === void 0 || now2 - claimedAt > olderThanMs;
          if (stale) {
            const updated = { ...value, uploadStatus: "pending" };
            delete updated.claimedAt;
            cursor.update(updated);
            requeued += 1;
          }
        }
        cursor.continue();
      };
    });
    return requeued;
  });
  return {
    initialize: async () => {
      const opened = await connection.ensureOpen();
      if (!opened.ok) return { ok: false, reason: opened.reason };
      const cleaned = await runCleanup();
      if (!cleaned.ok) {
        options.onFailure?.(cleaned.reason, new Error("initial cleanup failed"));
      }
      return { ok: true, value: void 0 };
    },
    save,
    get: async (id) => connection.transaction("readonly", async (store) => {
      const raw = await promisifyRequest(store.get(id));
      return isErrorRecord(raw) ? raw : void 0;
    }),
    getAll: readAllValidated,
    getPending: (limit = DEFAULT_PENDING_LIMIT) => readByStatus("pending", limit),
    claimPending,
    requeueStale,
    getFailed: () => readByStatus("failed", 0),
    delete: async (ids) => connection.transaction("readwrite", (store) => deleteByIds(store, ids)),
    updateUploadStatus: async (ids, status) => connection.transaction(
      "readwrite",
      (store) => updateStatuses(store, ids, status, Date.now())
    ),
    count: async () => connection.transaction("readonly", (store) => promisifyRequest(store.count())),
    pendingCount: async () => connection.transaction("readonly", async (store) => {
      let total = 0;
      await new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onerror = () => {
          reject(request.error ?? new Error("cursor failed"));
        };
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) {
            resolve();
            return;
          }
          const value = cursor.value;
          if (isErrorRecord(value) && (value.uploadStatus === "pending" || value.uploadStatus === "uploading")) {
            total += 1;
          }
          cursor.continue();
        };
      });
      return total;
    }),
    cleanup: (activePolicy) => runCleanup(activePolicy),
    clear: async () => connection.transaction("readwrite", async (store) => {
      const before = await promisifyRequest(store.count());
      await promisifyRequest(store.clear());
      return before;
    }),
    close: () => {
      connection.close();
    }
  };
}
async function findAggregateTarget(store, index, fingerprint2, range) {
  if (range !== void 0) {
    const found = await promisifyRequest(index.get(range));
    return isErrorRecord(found) && found.uploadStatus === "pending" ? found : void 0;
  }
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => {
      reject(request.error ?? new Error("cursor failed"));
    };
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve(void 0);
        return;
      }
      const value = cursor.value;
      if (isErrorRecord(value) && value.uploadStatus === "pending" && value.fingerprint === fingerprint2) {
        resolve(value);
        return;
      }
      cursor.continue();
    };
  });
}

// src/storage/logRepository.ts
function upgradeLogs(db, _oldVersion, transaction) {
  if (!db.objectStoreNames.contains(LOGS_STORE)) {
    const store2 = db.createObjectStore(LOGS_STORE, { keyPath: "id" });
    store2.createIndex(LOGS_INDEX_STATUS_TIMESTAMP, ["uploadStatus", "timestamp"], {
      unique: false
    });
    store2.createIndex(LOGS_INDEX_TIMESTAMP, "timestamp", { unique: false });
    return;
  }
  const store = transaction.objectStore(LOGS_STORE);
  if (!store.indexNames.contains(LOGS_INDEX_STATUS_TIMESTAMP)) {
    store.createIndex(LOGS_INDEX_STATUS_TIMESTAMP, ["uploadStatus", "timestamp"], {
      unique: false
    });
  }
  if (!store.indexNames.contains(LOGS_INDEX_TIMESTAMP)) {
    store.createIndex(LOGS_INDEX_TIMESTAMP, "timestamp", { unique: false });
  }
}
function keyRangeFactory() {
  try {
    const ctor = Reflect.get(globalThis, "IDBKeyRange");
    return typeof ctor === "function" ? ctor : void 0;
  } catch {
    return void 0;
  }
}
function statusKeyRange(status) {
  const factory = keyRangeFactory();
  if (factory === void 0) return void 0;
  try {
    return factory.bound([status], [status, []], false, true);
  } catch {
    return void 0;
  }
}
function createLogRepository(options) {
  const connectionOptions = {
    dbName: options.dbName,
    version: LOGS_DB_VERSION,
    storeName: LOGS_STORE,
    upgrade: upgradeLogs,
    ...options.indexedDB !== void 0 ? { indexedDB: options.indexedDB } : {},
    ...options.onFailure !== void 0 ? { onFailure: options.onFailure } : {},
    ...options.openTimeoutMs !== void 0 ? { openTimeoutMs: options.openTimeoutMs } : {}
  };
  const connection = createDbConnection(connectionOptions);
  const cleanupEvery = Math.max(1, options.cleanupEveryWrites ?? LOG_CLEANUP_EVERY_WRITES);
  let writesSinceCleanup = 0;
  let cleanupDisabled = false;
  const policy = () => options.cleanupPolicy;
  const runCleanup = async (override) => {
    const active3 = override ?? policy();
    if (active3 === void 0) return { ok: true, value: 0 };
    const now2 = Date.now();
    return connection.transaction(
      "readwrite",
      (store) => cleanupStore(store, active3, (record) => record.timestamp, now2, isLogRecord)
    );
  };
  const saveBatch = async (records) => {
    if (records.length === 0) return { ok: true, value: void 0 };
    const attempt = async () => connection.transaction("readwrite", async (store) => {
      for (const record of records) {
        await promisifyRequest(store.put(record));
      }
    });
    let result = await attempt();
    if (!result.ok && result.reason === "quota") {
      const active3 = policy();
      if (active3 !== void 0) {
        await runCleanup(halvedPolicy(active3));
        result = await attempt();
      }
    }
    if (result.ok) {
      writesSinceCleanup += records.length;
      if (!cleanupDisabled && writesSinceCleanup >= cleanupEvery) {
        writesSinceCleanup = 0;
        const cleaned = await runCleanup();
        if (!cleaned.ok) cleanupDisabled = true;
      }
    }
    return result;
  };
  const readAllValidated = async () => {
    const first = await connection.transaction("readonly", async (store) => {
      const raw = await promisifyRequest(store.getAll());
      const valid = [];
      const malformed = [];
      for (const entry of raw) {
        if (isLogRecord(entry)) valid.push(entry);
        else if (entry !== null && typeof entry === "object") {
          const id = entry.id;
          if (typeof id === "string") malformed.push(id);
        }
      }
      return { valid, malformed };
    });
    if (!first.ok) return first;
    if (first.value.malformed.length > 0) {
      await connection.transaction(
        "readwrite",
        (store) => deleteByIds(store, first.value.malformed)
      );
    }
    return {
      ok: true,
      value: first.value.valid.sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq)
    };
  };
  const readByStatus = async (status, limit) => connection.transaction("readonly", async (store) => {
    const index = store.index(LOGS_INDEX_STATUS_TIMESTAMP);
    const range = statusKeyRange(status);
    const collected = [];
    await new Promise((resolve, reject) => {
      const request = range === void 0 ? index.openCursor() : index.openCursor(range);
      request.onerror = () => {
        reject(request.error ?? new Error("cursor failed"));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) {
          resolve();
          return;
        }
        const value = cursor.value;
        if (isLogRecord(value) && value.uploadStatus === status) collected.push(value);
        cursor.continue();
      };
    });
    const sorted = collected.sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq);
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  });
  const claimPending = async (limit, now2) => connection.transaction("readwrite", async (store) => {
    const index = store.index(LOGS_INDEX_STATUS_TIMESTAMP);
    const range = statusKeyRange("pending");
    const claimed = [];
    await new Promise((resolve, reject) => {
      const request = range === void 0 ? index.openCursor() : index.openCursor(range);
      request.onerror = () => {
        reject(request.error ?? new Error("cursor failed"));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null || claimed.length >= limit) {
          resolve();
          return;
        }
        const value = cursor.value;
        if (isLogRecord(value) && value.uploadStatus === "pending") {
          const updated = {
            ...value,
            uploadStatus: "uploading",
            uploadAttempts: value.uploadAttempts + 1,
            claimedAt: now2
          };
          cursor.update(updated);
          claimed.push(updated);
        }
        cursor.continue();
      };
    });
    return claimed;
  });
  const requeueStale = async (olderThanMs, now2) => connection.transaction("readwrite", async (store) => {
    const index = store.index(LOGS_INDEX_STATUS_TIMESTAMP);
    const range = statusKeyRange("uploading");
    let requeued = 0;
    await new Promise((resolve, reject) => {
      const request = range === void 0 ? index.openCursor() : index.openCursor(range);
      request.onerror = () => {
        reject(request.error ?? new Error("cursor failed"));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) {
          resolve();
          return;
        }
        const value = cursor.value;
        if (isLogRecord(value) && value.uploadStatus === "uploading") {
          const claimedAt = value.claimedAt;
          if (claimedAt === void 0 || now2 - claimedAt > olderThanMs) {
            const updated = { ...value, uploadStatus: "pending" };
            delete updated.claimedAt;
            cursor.update(updated);
            requeued += 1;
          }
        }
        cursor.continue();
      };
    });
    return requeued;
  });
  return {
    initialize: async () => {
      const opened = await connection.ensureOpen();
      if (!opened.ok) return { ok: false, reason: opened.reason };
      const cleaned = await runCleanup();
      if (!cleaned.ok) {
        options.onFailure?.(cleaned.reason, new Error("initial cleanup failed"));
      }
      return { ok: true, value: void 0 };
    },
    saveBatch,
    get: async (id) => connection.transaction("readonly", async (store) => {
      const raw = await promisifyRequest(store.get(id));
      return isLogRecord(raw) ? raw : void 0;
    }),
    getAll: readAllValidated,
    getPending: (limit = DEFAULT_PENDING_LIMIT) => readByStatus("pending", limit),
    claimPending,
    requeueStale,
    getFailed: () => readByStatus("failed", 0),
    delete: async (ids) => connection.transaction("readwrite", (store) => deleteByIds(store, ids)),
    updateUploadStatus: async (ids, status) => connection.transaction(
      "readwrite",
      (store) => updateStatuses(store, ids, status, Date.now())
    ),
    count: async () => connection.transaction("readonly", (store) => promisifyRequest(store.count())),
    pendingCount: async () => connection.transaction("readonly", async (store) => {
      let total = 0;
      await new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onerror = () => {
          reject(request.error ?? new Error("cursor failed"));
        };
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) {
            resolve();
            return;
          }
          const value = cursor.value;
          if (isLogRecord(value) && (value.uploadStatus === "pending" || value.uploadStatus === "uploading")) {
            total += 1;
          }
          cursor.continue();
        };
      });
      return total;
    }),
    cleanup: (activePolicy) => runCleanup(activePolicy),
    clear: async () => connection.transaction("readwrite", async (store) => {
      const before = await promisifyRequest(store.count());
      await promisifyRequest(store.clear());
      return before;
    }),
    close: () => {
      connection.close();
    }
  };
}

// src/storage/storage.types.ts
var EMPTY_FLUSH_SUMMARY = {
  claimed: 0,
  uploaded: 0,
  retried: 0,
  failed: 0,
  stopped: false
};

// src/sync/sync.types.ts
var TERMINAL_STATUSES = /* @__PURE__ */ new Set([
  400,
  401,
  403,
  404,
  405,
  410,
  413,
  415,
  422
]);
var BACKOFF_BASE_MS = 15e3;
var BACKOFF_MAX_MS = 9e5;
var CLAIM_LEASE_MS = 3e5;
var FIRST_FLUSH_DELAY_MS = 5e3;
var NOTIFY_DEBOUNCE_MS = 5e3;
var MAX_BATCHES_PER_FLUSH = 10;
var REQUEST_TIMEOUT_MS = 1e4;
var KEEPALIVE_MAX_BYTES = 6e4;
function backoffDelay(failureCount) {
  if (failureCount <= 0) return 0;
  const exponent = Math.min(failureCount - 1, 20);
  const delay = BACKOFF_BASE_MS * 2 ** exponent;
  return Math.min(delay, BACKOFF_MAX_MS);
}
function parseRetryAfter(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  if (trimmed.length === 0) return void 0;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(seconds)) return void 0;
    return Math.min(Math.max(seconds * 1e3, 0), BACKOFF_MAX_MS);
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return void 0;
  return Math.min(Math.max(timestamp - Date.now(), 0), BACKOFF_MAX_MS);
}

// src/sync/restSync.ts
var FORBIDDEN_SCHEMES = /^(javascript|data|vbscript|file|blob|about|chrome|chrome-extension):/i;
var LOCAL_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0"
]);
function resolveEndpoint(raw, requireHttps) {
  if (raw === void 0) return void 0;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return void 0;
  if (FORBIDDEN_SCHEMES.test(trimmed)) return void 0;
  try {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    let base;
    if (!isAbsolute) {
      const origin = getLocationHref();
      if (origin === void 0) return void 0;
      try {
        base = new URL(origin).origin;
      } catch {
        return void 0;
      }
    }
    const parsed = base === void 0 ? new URL(trimmed) : new URL(trimmed, base);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return void 0;
    if (requireHttps && protocol === "http:" && !LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
      return void 0;
    }
    return parsed.toString();
  } catch {
    return void 0;
  }
}
function classifyResponse(status) {
  if (status >= 200 && status < 300) return "ok";
  if (TERMINAL_STATUSES.has(status)) return "terminal";
  return "retryable";
}
function buildRestBody(kind, records, options, sentAt) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind,
    sentAt,
    app: {
      appName: options.appName ?? "",
      appVersion: options.appVersion ?? "",
      buildId: options.buildId ?? "",
      environment: options.environment ?? ""
    },
    records
  };
}
function isSyncConfigured(options) {
  const rest = options.rest;
  if (!rest.enabled) return false;
  const errors = resolveEndpoint(rest.errorsUrl, rest.requireHttps);
  const logs = resolveEndpoint(rest.logsUrl, rest.requireHttps);
  return errors !== void 0 || logs !== void 0;
}
function resolveEndpoints(options) {
  return {
    errorsUrl: resolveEndpoint(options.rest.errorsUrl, options.rest.requireHttps),
    logsUrl: resolveEndpoint(options.rest.logsUrl, options.rest.requireHttps)
  };
}

// src/sync/remoteTransport.ts
function resolveFetch(override) {
  if (override !== void 0) return override;
  try {
    const candidate = Reflect.get(globalThis, "fetch");
    return typeof candidate === "function" ? candidate : void 0;
  } catch {
    return void 0;
  }
}
function createFetchTransport(options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  return {
    name: "fetch",
    send: async (request) => {
      const fetchImpl = resolveFetch(options.fetchImpl);
      if (fetchImpl === void 0) {
        throw new Error("fetch is not available in this environment");
      }
      const controller = typeof AbortController !== "undefined" ? new AbortController() : void 0;
      const timer = controller === void 0 ? void 0 : setTimeout(() => {
        try {
          controller.abort();
        } catch {
        }
      }, timeoutMs);
      try {
        const response = await fetchImpl(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...request.headers },
          body: request.body,
          credentials: request.credentials,
          keepalive: request.keepalive,
          redirect: "follow",
          ...controller !== void 0 ? { signal: controller.signal } : {}
        });
        let retryAfterMs;
        try {
          retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        } catch {
          retryAfterMs = void 0;
        }
        return retryAfterMs === void 0 ? { status: response.status } : { status: response.status, retryAfterMs };
      } finally {
        if (timer !== void 0) clearTimeout(timer);
      }
    }
  };
}

// src/sync/syncManager.ts
function noBatch() {
  return {
    summary: { ...EMPTY_FLUSH_SUMMARY },
    stop: false,
    failed: false,
    terminal: false,
    retryAfterMs: 0
  };
}
function createSyncManager(syncOptions) {
  const config = syncOptions.options;
  const rest = config.rest;
  const endpoints = resolveEndpoints(config);
  const transport = rest.transport ?? createFetchTransport();
  const enabled = config.mode === "remote" && rest.enabled && (endpoints.errorsUrl !== void 0 || endpoints.logsUrl !== void 0);
  let disposed = false;
  let timer = null;
  let notifyTimer = null;
  let onlineHandler = null;
  let onlineTarget;
  let running = null;
  let failures = 0;
  let retryAfterMs = 0;
  let lastSyncAt;
  let currentStatus = "idle";
  let nextRunAt = 0;
  const clearScheduled = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (notifyTimer !== null) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
  };
  const runScheduled = () => {
    timer = null;
    void flush(false);
  };
  const schedule = (delay) => {
    if (disposed || !enabled) return;
    if (timer !== null) clearTimeout(timer);
    nextRunAt = now() + delay;
    timer = setTimeout(runScheduled, Math.max(0, delay));
  };
  const target = (kind) => kind === "errors" ? { repo: syncOptions.errors, url: endpoints.errorsUrl } : { repo: syncOptions.logs, url: endpoints.logsUrl };
  const consentGranted = () => {
    const consent = config.consent;
    if (consent === void 0) return true;
    try {
      return consent() === true;
    } catch {
      return false;
    }
  };
  const flushBatch = async (kind, keepalive) => {
    const { repo, url } = target(kind);
    if (repo === null || url === void 0) return noBatch();
    const claimedAt = now();
    const claimed = await repo.claimPending(rest.batchSize, claimedAt);
    if (!claimed.ok) {
      reportInternalFailure("claim", claimed.reason);
      return {
        summary: { ...EMPTY_FLUSH_SUMMARY },
        stop: true,
        failed: false,
        terminal: false,
        retryAfterMs: 0
      };
    }
    const records = claimed.value;
    if (records.length === 0) {
      return {
        summary: { ...EMPTY_FLUSH_SUMMARY, stopped: true },
        stop: true,
        failed: false,
        terminal: false,
        retryAfterMs: 0
      };
    }
    const ids = records.map((record) => record.id);
    let provided = {};
    if (rest.getHeaders !== void 0) {
      try {
        const resolved = await rest.getHeaders();
        if (resolved !== null && typeof resolved === "object") provided = resolved;
      } catch (error) {
        await repo.updateUploadStatus(ids, "pending");
        reportInternalFailure("headers", error);
        return {
          summary: {
            claimed: ids.length,
            uploaded: 0,
            retried: ids.length,
            failed: 0,
            stopped: true
          },
          stop: true,
          failed: true,
          terminal: false,
          retryAfterMs: 0
        };
      }
    }
    const body = JSON.stringify(buildRestBody(kind, records, config, claimedAt));
    const useKeepalive = keepalive && body.length < KEEPALIVE_MAX_BYTES;
    let response;
    try {
      response = await transport.send({
        url,
        headers: provided,
        credentials: rest.credentials,
        body,
        timeoutMs: REQUEST_TIMEOUT_MS,
        keepalive: useKeepalive,
        kind
      });
    } catch (error) {
      const restored2 = await repo.updateUploadStatus(ids, "pending");
      if (!restored2.ok) reportInternalFailure("requeue", restored2.reason);
      reportInternalFailure("flush", error);
      return {
        summary: {
          claimed: ids.length,
          uploaded: 0,
          retried: ids.length,
          failed: 0,
          stopped: true
        },
        stop: true,
        failed: true,
        terminal: false,
        retryAfterMs: 0
      };
    }
    const outcome = classifyResponse(response.status);
    if (outcome === "ok") {
      const deleted = await repo.delete(ids);
      if (!deleted.ok) reportInternalFailure("delete-after-upload", deleted.reason);
      return {
        summary: {
          claimed: ids.length,
          uploaded: ids.length,
          retried: 0,
          failed: 0,
          stopped: false
        },
        stop: false,
        failed: false,
        terminal: false,
        retryAfterMs: 0
      };
    }
    if (outcome === "terminal") {
      const marked = await repo.updateUploadStatus(ids, "failed");
      if (!marked.ok) reportInternalFailure("mark-failed", marked.reason);
      rest.onTerminalFailure?.(
        response.status,
        records.map((record) => ({ id: record.id }))
      );
      return {
        summary: {
          claimed: ids.length,
          uploaded: 0,
          retried: 0,
          failed: ids.length,
          stopped: true
        },
        stop: true,
        failed: true,
        terminal: true,
        retryAfterMs: 0
      };
    }
    const restored = await repo.updateUploadStatus(ids, "pending");
    if (!restored.ok) reportInternalFailure("requeue", restored.reason);
    return {
      summary: { claimed: ids.length, uploaded: 0, retried: ids.length, failed: 0, stopped: true },
      stop: true,
      failed: true,
      terminal: false,
      retryAfterMs: Math.min(response.retryAfterMs ?? 0, BACKOFF_MAX_MS)
    };
  };
  const merge = (total, part) => ({
    claimed: total.claimed + part.claimed,
    uploaded: total.uploaded + part.uploaded,
    retried: total.retried + part.retried,
    failed: total.failed + part.failed,
    stopped: total.stopped || part.stopped
  });
  const runFlush = async (keepalive) => {
    let errorSummary = { ...EMPTY_FLUSH_SUMMARY };
    let logSummary = { ...EMPTY_FLUSH_SUMMARY };
    if (!enabled || disposed || !syncOptions.isStorageReady()) {
      currentStatus = "idle";
      return { errors: errorSummary, logs: logSummary };
    }
    if (!consentGranted()) {
      currentStatus = "idle";
      errorSummary = { ...EMPTY_FLUSH_SUMMARY, stopped: true };
      logSummary = { ...EMPTY_FLUSH_SUMMARY, stopped: true };
      return { errors: errorSummary, logs: logSummary };
    }
    if (!isOnline()) {
      currentStatus = "offline";
      errorSummary = { ...EMPTY_FLUSH_SUMMARY, stopped: true };
      logSummary = { ...EMPTY_FLUSH_SUMMARY, stopped: true };
      return { errors: errorSummary, logs: logSummary };
    }
    currentStatus = "running";
    let errorsDone = syncOptions.errors === null || endpoints.errorsUrl === void 0;
    let logsDone = syncOptions.logs === null || endpoints.logsUrl === void 0;
    let failedThisRun = false;
    let terminalThisRun = false;
    let hint = 0;
    for (let index = 0; index < MAX_BATCHES_PER_FLUSH; index += 1) {
      if (disposed || errorsDone && logsDone) break;
      if (!isOnline()) break;
      if (!errorsDone) {
        const outcome = await flushBatch("errors", keepalive);
        errorSummary = merge(errorSummary, outcome.summary);
        errorsDone = outcome.stop;
        failedThisRun = failedThisRun || outcome.failed;
        terminalThisRun = terminalThisRun || outcome.terminal;
        hint = Math.max(hint, outcome.retryAfterMs);
      }
      if (!logsDone) {
        const outcome = await flushBatch("logs", keepalive);
        logSummary = merge(logSummary, outcome.summary);
        logsDone = outcome.stop;
        failedThisRun = failedThisRun || outcome.failed;
        terminalThisRun = terminalThisRun || outcome.terminal;
        hint = Math.max(hint, outcome.retryAfterMs);
      }
    }
    if (failedThisRun) {
      failures += 1;
      retryAfterMs = hint;
      currentStatus = terminalThisRun ? "error" : "retry";
    } else {
      failures = 0;
      retryAfterMs = 0;
      currentStatus = "ok";
      lastSyncAt = now();
    }
    if (!disposed) {
      if (failures > 0) schedule(Math.max(backoffDelay(failures), retryAfterMs));
      else schedule(rest.intervalMs);
    }
    return { errors: errorSummary, logs: logSummary };
  };
  const flush = (keepalive = false) => {
    if (running !== null) return running;
    if (!enabled || disposed) {
      return Promise.resolve({
        errors: { ...EMPTY_FLUSH_SUMMARY },
        logs: { ...EMPTY_FLUSH_SUMMARY }
      });
    }
    const run = runFlush(keepalive);
    running = run;
    void run.then(
      () => {
        if (running === run) running = null;
      },
      () => {
        if (running === run) running = null;
      }
    );
    return run;
  };
  const requeueStale = async () => {
    const at = now();
    for (const repo of [syncOptions.errors, syncOptions.logs]) {
      if (repo === null) continue;
      const result = await repo.requeueStale(CLAIM_LEASE_MS, at);
      if (!result.ok) reportInternalFailure("requeue-stale", result.reason);
    }
  };
  return {
    start: () => {
      if (disposed || !enabled) return;
      void requeueStale().then(() => {
        if (!disposed) schedule(FIRST_FLUSH_DELAY_MS);
      });
      if (onlineHandler === null) {
        const candidate = (() => {
          try {
            const win = Reflect.get(globalThis, "window");
            return win !== null && typeof win === "object" ? win : void 0;
          } catch {
            return void 0;
          }
        })();
        if (candidate !== void 0) {
          onlineTarget = candidate;
          onlineHandler = () => {
            if (!disposed) schedule(5e3);
          };
          try {
            candidate.addEventListener("online", onlineHandler);
          } catch {
            onlineHandler = null;
            onlineTarget = void 0;
          }
        }
      }
    },
    stop: () => {
      clearScheduled();
      if (onlineTarget !== void 0 && onlineHandler !== null) {
        try {
          onlineTarget.removeEventListener("online", onlineHandler);
        } catch {
        }
      }
      onlineHandler = null;
      onlineTarget = void 0;
    },
    flush,
    notifyNewRecords: () => {
      if (disposed || !enabled) return;
      if (running !== null || failures > 0) return;
      if (notifyTimer !== null) return;
      notifyTimer = setTimeout(() => {
        notifyTimer = null;
        if (disposed || running !== null || failures > 0) return;
        if (timer === null) return;
        if (nextRunAt - now() <= NOTIFY_DEBOUNCE_MS) return;
        schedule(0);
      }, NOTIFY_DEBOUNCE_MS);
    },
    status: () => currentStatus,
    lastSync: () => lastSyncAt,
    retryFailed: async () => {
      let moved = 0;
      for (const [repo, kind] of [
        [syncOptions.errors, "errors"],
        [syncOptions.logs, "logs"]
      ]) {
        if (repo === null) continue;
        const failed = await repo.getFailed();
        if (!failed.ok) {
          reportInternalFailure(`retry-failed-read (${kind})`, failed.reason);
          continue;
        }
        if (failed.value.length === 0) continue;
        const ids = failed.value.map((record) => record.id);
        const updated = await repo.updateUploadStatus(ids, "pending");
        if (!updated.ok) {
          reportInternalFailure(`retry-failed-write (${kind})`, updated.reason);
          continue;
        }
        moved += updated.value;
      }
      if (moved > 0) {
        failures = 0;
        retryAfterMs = 0;
        schedule(0);
      }
      return moved;
    },
    isEnabled: () => enabled,
    dispose: () => {
      disposed = true;
      clearScheduled();
      if (onlineTarget !== void 0 && onlineHandler !== null) {
        try {
          onlineTarget.removeEventListener("online", onlineHandler);
        } catch {
        }
      }
      onlineHandler = null;
      onlineTarget = void 0;
    }
  };
}

// src/core/events.ts
function isThenable2(value) {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
function invoke(listener, event) {
  try {
    const result = listener(event);
    if (isThenable2(result)) {
      void Promise.resolve(result).catch((error) => {
        reportInternalFailure("event-listener", error);
      });
    }
  } catch (error) {
    reportInternalFailure("event-listener", error);
  }
}
function createEventEmitter() {
  const listeners = /* @__PURE__ */ new Map();
  const anyListeners = /* @__PURE__ */ new Set();
  let emitting = false;
  let deferred = null;
  let nestingReported = false;
  let deliveringNested = false;
  const dispatch2 = (event) => {
    const forType = listeners.get(event.type);
    if (forType !== void 0 && forType.size > 0) {
      for (const listener of [...forType]) invoke(listener, event);
    }
    if (anyListeners.size > 0) {
      for (const listener of [...anyListeners]) invoke(listener, event);
    }
  };
  const process = (event, isNested) => {
    emitting = true;
    try {
      dispatch2(event);
    } catch (error) {
      reportInternalFailure("event-dispatch", error);
    } finally {
      emitting = false;
    }
    if (isNested) {
      deliveringNested = false;
      deferred = null;
      return;
    }
    const next = deferred;
    deferred = null;
    if (next === null) return;
    deliveringNested = true;
    void Promise.resolve().then(() => {
      process(next, true);
    });
  };
  const add = (set, listener) => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
  return {
    on: (type, listener) => {
      if (typeof listener !== "function") return () => void 0;
      let set = listeners.get(type);
      if (set === void 0) {
        set = /* @__PURE__ */ new Set();
        listeners.set(type, set);
      }
      return add(set, listener);
    },
    onAny: (listener) => {
      if (typeof listener !== "function") return () => void 0;
      return add(anyListeners, listener);
    },
    off: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    emit: (event) => {
      try {
        if (event === null || typeof event !== "object") return;
        if (listeners.size === 0 && anyListeners.size === 0) return;
        const stamped = typeof event.timestamp === "number" ? event : { ...event, timestamp: now() };
        if (emitting || deliveringNested) {
          deferred = stamped;
          if (!nestingReported) {
            nestingReported = true;
            reportInternalNote(
              "event-nesting",
              "a listener emitted during dispatch; one nested event is delivered asynchronously and further nesting is dropped"
            );
          }
          return;
        }
        process(stamped, false);
      } catch (error) {
        reportInternalFailure("event-emit", error);
      }
    },
    listenerCount: (type) => {
      if (type === void 0) {
        let total = anyListeners.size;
        for (const set of listeners.values()) total += set.size;
        return total;
      }
      return listeners.get(type)?.size ?? 0;
    },
    clear: () => {
      listeners.clear();
      anyListeners.clear();
      deferred = null;
    }
  };
}

// src/core/init.ts
function setupTelemetry(options = {}) {
  try {
    return initTelemetry(options);
  } catch (error) {
    reportInternalFailure("setup", error);
    return disabledHandle();
  }
}
var active2 = null;
var currentEmitter = null;
var reportedDrops = { errors: 0, logs: 0 };
function emitEvent(event) {
  currentEmitter?.emit(event);
}
var stableEmitter = {
  on: (type, listener) => currentEmitter?.on(type, listener) ?? (() => void 0),
  onAny: (listener) => currentEmitter?.onAny(listener) ?? (() => void 0),
  off: (type, listener) => {
    currentEmitter?.off(type, listener);
  },
  emit: (event) => {
    currentEmitter?.emit(event);
  },
  listenerCount: (type) => currentEmitter?.listenerCount(type) ?? 0,
  clear: () => {
    currentEmitter?.clear();
  }
};
function emitSyncStarted(kind, recordCount) {
  if (recordCount <= 0) return;
  const event = {
    type: "sync:started",
    timestamp: Date.now(),
    kind,
    recordCount
  };
  emitEvent(event);
}
function emitSyncOutcome(kind, summary) {
  if (summary.claimed <= 0 && summary.uploaded <= 0 && summary.failed <= 0) return;
  const timestamp = Date.now();
  const completed = {
    type: "sync:completed",
    timestamp,
    kind,
    uploaded: summary.uploaded,
    retried: summary.retried,
    failed: summary.failed
  };
  emitEvent(completed);
  if (summary.failed > 0) {
    const failed = {
      type: "sync:failed",
      timestamp,
      kind,
      // `FlushSummary` carries no HTTP status, deliberately: it is a per-kind
      // aggregate over several batch attempts, which can fail for different
      // reasons. `0` therefore means "not captured", not "network failure" — see
      // the note on `SyncFailedEvent.status`.
      status: 0,
      recordCount: summary.failed
    };
    emitEvent(failed);
  }
}
function emitDroppedByRateLimit(errors, logs) {
  const timestamp = Date.now();
  const errorDelta = Math.max(0, Math.floor(errors) - reportedDrops.errors);
  const logDelta = Math.max(0, Math.floor(logs) - reportedDrops.logs);
  reportedDrops.errors = Math.max(reportedDrops.errors, Math.floor(errors));
  reportedDrops.logs = Math.max(reportedDrops.logs, Math.floor(logs));
  if (errorDelta > 0) {
    const event = {
      type: "record:dropped",
      timestamp,
      kind: "errors",
      reason: "rate-limit",
      count: errorDelta
    };
    emitEvent(event);
  }
  if (logDelta > 0) {
    const event = {
      type: "record:dropped",
      timestamp,
      kind: "logs",
      reason: "rate-limit",
      count: logDelta
    };
    emitEvent(event);
  }
}
function createIdbRepository(dbPrefix, errorsPolicy, logsPolicy, openTimeoutMs, onFailure) {
  const names = databaseNames(dbPrefix);
  const errors = createErrorRepository({
    dbName: names.errors,
    cleanupPolicy: errorsPolicy,
    openTimeoutMs,
    onFailure
  });
  const logs = createLogRepository({
    dbName: names.logs,
    cleanupPolicy: logsPolicy,
    openTimeoutMs,
    onFailure
  });
  return {
    errors,
    logs,
    initialize: async () => {
      const errorResult = await errors.initialize();
      const logResult = await logs.initialize();
      if (!errorResult.ok && !logResult.ok) return errorResult;
      return { ok: true, value: void 0 };
    },
    close: () => {
      errors.close();
      logs.close();
    }
  };
}
async function refreshPendingCounts() {
  const state = getState();
  const repository = state.repository;
  if (repository === null) {
    state.pendingErrors = 0;
    state.pendingLogs = 0;
    return;
  }
  try {
    const [errors, logs] = await Promise.all([
      repository.errors.pendingCount(),
      repository.logs.pendingCount()
    ]);
    state.pendingErrors = errors.ok ? errors.value : 0;
    state.pendingLogs = logs.ok ? logs.value : 0;
  } catch {
  }
}
function sharedHandle(state) {
  return {
    appName: state.options?.appName,
    pageLoadId: state.pageLoadId,
    enabled: state.captureSuppressed !== true,
    storage: state.storageState,
    events: stableEmitter,
    destroy: () => {
      destroyTelemetry();
    },
    flush: flushTelemetry,
    sync: syncTelemetry
  };
}
function disabledHandle() {
  const state = getState();
  return {
    appName: state.options?.appName,
    pageLoadId: state.pageLoadId,
    enabled: false,
    storage: "disabled",
    events: stableEmitter,
    destroy: () => {
      destroyTelemetry();
    },
    flush: async () => void 0,
    sync: async () => ({
      errors: { ...EMPTY_FLUSH_SUMMARY },
      logs: { ...EMPTY_FLUSH_SUMMARY }
    })
  };
}
function initTelemetry(options = {}) {
  try {
    const state = getState();
    if (state.initialized) {
      if (active2 !== null) return active2.handle;
      return sharedHandle(state);
    }
    resetInternalFailures();
    const resolved = resolveOptions(options);
    state.options = resolved;
    reportedDrops = { errors: 0, logs: 0 };
    const emitter = createEventEmitter();
    currentEmitter = emitter;
    state.eventEmitter = emitter;
    setDefaultSanitizer(
      createSanitizer({
        extraSensitiveKeys: resolved.redaction.extraSensitiveKeys,
        extraPatterns: resolved.redaction.extraPatterns,
        allowedQueryParams: resolved.redaction.allowedQueryParams
      })
    );
    const cleanup = createCleanupRegistry();
    state.cleanup = cleanup;
    if (!resolved.enabled) {
      state.initialized = true;
      state.storageState = "disabled";
      state.repository = null;
      setErrorTracker(null);
      setCaptureSuppressed(true);
      const handle2 = disabledHandle();
      active2 = null;
      return handle2;
    }
    setCaptureSuppressed(false);
    const onFailure = (reason, error) => {
      reportInternalFailure(`storage (${reason})`, error);
    };
    const repository = resolved.repository ?? createIdbRepository(
      resolved.dbPrefix,
      { retentionDays: resolved.errors.retentionDays, maxRecords: resolved.errors.maxRecords },
      { retentionDays: resolved.logs.retentionDays, maxRecords: resolved.logs.maxRecords },
      resolved.openTimeoutMs,
      onFailure
    );
    state.repository = repository;
    state.storageState = "initializing";
    let storageReady = false;
    const readyPromise = repository.initialize().then((result) => {
      storageReady = result.ok;
      state.storageState = result.ok ? "ready" : "unavailable";
      return result.ok;
    }).catch((error) => {
      reportInternalFailure("storage-init", error);
      state.storageState = "unavailable";
      return false;
    });
    const syncManagerRef = { current: null };
    const errorTracker = createErrorTracker({
      repository: repository.errors,
      options: resolved,
      onRecord: (record) => {
        state.pendingErrors += 1;
        syncManagerRef.current?.notifyNewRecords();
        const event = {
          type: "error:captured",
          timestamp: record.timestamp,
          recordId: record.id,
          fingerprint: record.fingerprint,
          severity: record.severity,
          source: record.source,
          category: record.category,
          handled: record.handled,
          occurrenceCount: record.occurrenceCount
        };
        emitter.emit(event);
      }
    });
    setErrorTracker(errorTracker);
    const logTracker = createLogTracker({
      repository: repository.logs,
      options: resolved,
      onRecord: (record) => {
        state.pendingLogs += 1;
        syncManagerRef.current?.notifyNewRecords();
        const event = {
          type: "log:written",
          timestamp: record.timestamp,
          recordId: record.id,
          level: record.level,
          message: record.message
        };
        emitter.emit(event);
      }
    });
    const removeSink = logger.addSink(logTracker.sink);
    cleanup.add(removeSink);
    if (resolved.logs.consoleLevel !== void 0) {
      logger.setLevel(resolved.logs.consoleLevel);
    }
    if (resolved.logSource !== void 0) {
      try {
        const detach2 = resolved.logSource.addSink(logTracker.sink);
        if (typeof detach2 === "function") cleanup.add(detach2);
      } catch (error) {
        reportInternalFailure("log-source", error);
      }
    }
    if (resolved.errors.enabled) {
      const removeHandlers = installGlobalErrorHandlers({
        preventDefaultUnhandledRejection: resolved.errors.preventDefaultUnhandledRejection,
        captureResources: resolved.errors.captureResources,
        captureCsp: resolved.errors.captureCsp,
        captureChunkErrors: resolved.errors.captureChunkErrors,
        onError: (error, ctx) => {
          captureError(error, ctx);
        }
      });
      cleanup.add(removeHandlers);
    }
    if (resolved.logs.enabled && resolved.logs.captureConsole) {
      getLoggerController().setConsoleCapture(true);
      cleanup.add(() => {
        getLoggerController().setConsoleCapture(false);
      });
    }
    if (resolved.shortcut !== false) {
      const shortcut = resolved.shortcut;
      const removeShortcut = installDiagnosticsExportShortcut({
        key: shortcut.key,
        ctrl: shortcut.ctrl,
        shift: shortcut.shift,
        alt: shortcut.alt,
        meta: shortcut.meta,
        target: shortcut.target,
        allow: shortcut.allow,
        filenamePrefix: shortcut.filenamePrefix,
        onExported: shortcut.onExported
      });
      cleanup.add(removeShortcut);
    }
    const syncManager = createSyncManager({
      errors: resolved.errors.enabled ? repository.errors : null,
      logs: resolved.logs.enabled ? repository.logs : null,
      options: resolved,
      isStorageReady: () => storageReady
    });
    syncManagerRef.current = syncManager;
    const configured = resolveEndpoints(resolved);
    const hasEndpoint = configured.errorsUrl !== void 0 || configured.logsUrl !== void 0 || resolved.rest.transport !== void 0;
    if (resolved.mode === "remote" && !syncManager.isEnabled() && !hasEndpoint) {
      reportInternalNote(
        "mode-remote-without-endpoint",
        'mode is "remote" but no valid REST endpoint is configured, so records are being kept in IndexedDB only'
      );
    }
    void readyPromise.then((ok) => {
      if (ok) syncManager.start();
    });
    const flushBuffered = async (keepalive = false) => {
      await errorTracker.flush();
      await logTracker.flush();
      if (keepalive && syncManager.isEnabled()) {
        try {
          await syncManager.flush(true);
        } catch {
        }
      }
      await refreshPendingCounts();
    };
    const windowObject = getWindow();
    if (windowObject !== null && windowObject !== void 0) {
      const onPageHide = () => {
        void flushBuffered(true);
      };
      cleanup.addListener(windowObject, "pagehide", onPageHide);
    }
    const documentObject = getDocument();
    if (documentObject !== void 0 && documentObject !== null) {
      const onVisibilityChange = () => {
        if (getVisibilityState() === "hidden") void flushBuffered(true);
      };
      cleanup.addListener(documentObject, "visibilitychange", onVisibilityChange);
    }
    state.initialized = true;
    flushPreInitErrors(errorTracker);
    getLoggerController().replayPreInit();
    const handle = {
      appName: resolved.appName,
      pageLoadId: state.pageLoadId,
      enabled: true,
      storage: state.storageState,
      events: stableEmitter,
      destroy: () => {
        destroyTelemetry();
      },
      flush: async () => {
        await flushBuffered(false);
      },
      sync: () => syncTelemetry()
    };
    active2 = {
      handle,
      errorTracker,
      logTracker,
      syncManager,
      repository,
      cleanup,
      storageReady: () => storageReady
    };
    void refreshPendingCounts();
    return handle;
  } catch (error) {
    reportInternalFailure("init", error);
    try {
      const state = getState();
      state.initialized = true;
      state.storageState = "unavailable";
    } catch {
    }
    return disabledHandle();
  }
}
function destroyTelemetry() {
  try {
    const state = getState();
    const installation = active2;
    if (installation === null && !state.initialized) return;
    active2 = null;
    state.initialized = false;
    setErrorTracker(null);
    setCaptureSuppressed(false);
    if (installation !== null) {
      emitDroppedByRateLimit(
        installation.errorTracker.droppedByRateLimit(),
        installation.logTracker.droppedByRateLimit()
      );
    }
    currentEmitter?.clear();
    currentEmitter = null;
    state.eventEmitter = null;
    installation?.cleanup.run();
    installation?.syncManager.dispose();
    if (installation !== null) {
      void (async () => {
        try {
          await installation.errorTracker.flush();
        } catch {
        }
        try {
          await installation.logTracker.destroy();
        } catch {
        }
        try {
          installation.repository.close();
        } catch {
        }
      })();
    }
    try {
      getLoggerController().reset();
    } catch {
    }
    resetDefaultSanitizer();
    clearPreInitErrors();
    resetState();
  } catch (error) {
    reportInternalFailure("destroy", error);
  }
}
async function flushTelemetry() {
  try {
    const installation = active2;
    if (installation === null) return;
    await installation.errorTracker.flush();
    await installation.logTracker.flush();
    await refreshPendingCounts();
  } catch (error) {
    reportInternalFailure("flush", error);
  }
}
async function syncTelemetry() {
  try {
    const installation = active2;
    if (installation === null) {
      return { errors: { ...EMPTY_FLUSH_SUMMARY }, logs: { ...EMPTY_FLUSH_SUMMARY } };
    }
    await installation.errorTracker.flush();
    await installation.logTracker.flush();
    const state = getState();
    await refreshPendingCounts();
    emitSyncStarted("errors", state.pendingErrors);
    emitSyncStarted("logs", state.pendingLogs);
    const result = await installation.syncManager.flush(false);
    emitSyncOutcome("errors", result.errors);
    emitSyncOutcome("logs", result.logs);
    await refreshPendingCounts();
    emitDroppedByRateLimit(
      installation.errorTracker.droppedByRateLimit(),
      installation.logTracker.droppedByRateLimit()
    );
    return result;
  } catch (error) {
    reportInternalFailure("sync", error);
    return { errors: { ...EMPTY_FLUSH_SUMMARY }, logs: { ...EMPTY_FLUSH_SUMMARY } };
  }
}
async function retryFailedTelemetry() {
  try {
    const installation = active2;
    if (installation === null) return 0;
    const moved = await installation.syncManager.retryFailed();
    await refreshPendingCounts();
    return moved;
  } catch (error) {
    reportInternalFailure("retry-failed", error);
    return 0;
  }
}
async function clearTelemetryData() {
  try {
    const state = getState();
    const repository = state.repository;
    if (repository === null) return false;
    const errors = await repository.errors.clear();
    const logs = await repository.logs.clear();
    clearPreInitErrors();
    await refreshPendingCounts();
    return errors.ok && logs.ok;
  } catch (error) {
    reportInternalFailure("clear", error);
    return false;
  }
}
function getTelemetryStatus() {
  try {
    const state = getState();
    const installation = active2;
    return {
      initialized: state.initialized,
      mode: state.options?.mode ?? "local",
      storage: state.storageState,
      online: isOnline(),
      pending: { errors: state.pendingErrors, logs: state.pendingLogs },
      droppedByRateLimit: (installation?.errorTracker.droppedByRateLimit() ?? 0) + (installation?.logTracker.droppedByRateLimit() ?? 0),
      lastSync: installation?.syncManager.lastSync(),
      syncStatus: installation?.syncManager.status() ?? "idle"
    };
  } catch {
    return {
      initialized: false,
      mode: "local",
      storage: "unavailable",
      online: true,
      pending: { errors: 0, logs: 0 },
      droppedByRateLimit: 0,
      lastSync: void 0,
      syncStatus: "idle"
    };
  }
}
function isTelemetryInitialized() {
  return getState().initialized;
}

// src/adapters/descriptors.ts
var ADAPTERS = /* @__PURE__ */ Object.freeze([
  {
    key: "react",
    name: "React",
    framework: "react",
    entryPoint: "@codewithrajat/rm-logvault/react",
    inCore: false,
    targets: "React >= 17, including 19 root error hooks",
    exports: [
      "TelemetryErrorBoundary",
      "reactRootErrorHandlers",
      "useErrorCapture",
      "TelemetryErrorBoundaryProps",
      "ReactRootErrorHandlers"
    ],
    description: "An error boundary that captures and chains, plus React 19 root error hooks.",
    kind: "framework"
  },
  {
    key: "vue",
    name: "Vue",
    framework: "vue",
    entryPoint: "@codewithrajat/rm-logvault/vue",
    inCore: false,
    targets: "Vue >= 3",
    exports: [
      "createTelemetryVuePlugin",
      "attachVueTelemetry",
      "TelemetryVuePlugin",
      "VueAdapterOptions"
    ],
    description: "A Vue plugin that chains app.config.errorHandler instead of replacing it.",
    kind: "framework"
  },
  {
    key: "angular",
    name: "Angular",
    framework: "angular",
    entryPoint: "@codewithrajat/rm-logvault/angular",
    inCore: false,
    targets: "Angular >= 15",
    exports: ["TelemetryErrorHandler", "provideTelemetryErrorHandler", "getPreviousErrorHandler"],
    description: "An ErrorHandler that captures and then delegates to the previous handler.",
    kind: "framework"
  },
  {
    key: "axios",
    name: "Axios",
    framework: "axios",
    entryPoint: "@codewithrajat/rm-logvault/axios",
    inCore: false,
    targets: "axios >= 1",
    exports: ["attachAxios"],
    description: "A response interceptor that captures API failures with request context.",
    kind: "http-client"
  },
  {
    key: "fetch",
    name: "Fetch",
    framework: "fetch",
    entryPoint: "@codewithrajat/rm-logvault/fetch",
    inCore: false,
    targets: "any environment with fetch",
    exports: ["instrumentFetch", "registerTelemetryUrl", "InstrumentFetchOptions"],
    description: "A fetch wrapper that captures a failure and rethrows the original value.",
    kind: "http-client"
  },
  {
    key: "react-query",
    name: "TanStack Query",
    framework: "tanstack-query",
    entryPoint: "@codewithrajat/rm-logvault/react-query",
    inCore: false,
    targets: "TanStack Query >= 4",
    exports: ["attachQueryClient"],
    description: "A query-client attachment that captures cache-level failures.",
    kind: "framework"
  },
  {
    key: "http",
    name: "HTTP client",
    framework: "core",
    entryPoint: "@codewithrajat/rm-logvault/http",
    inCore: false,
    targets: "any environment with fetch",
    exports: [
      // The contract
      "HttpClient",
      "HttpClientOptions",
      "HttpError",
      "HttpInterceptor",
      "HttpMethod",
      "HttpRequest",
      "HttpResponse",
      "NonRetryableHttpError",
      // The implementation and its auth seam
      "createFetchHttpClient",
      "AuthProvider",
      "AuthHeaderProvider",
      "AuthHeaderProviderOptions",
      "createAuthHeaderProvider",
      "createAuthInterceptor",
      // Classification helpers
      "buildHttpErrorContext",
      "categoryForHttpStatus",
      "severityForHttpError",
      "isRetryableStatus",
      "resolveRequestUrl",
      "DEFAULT_HTTP_TIMEOUT_MS",
      "DEFAULT_HTTP_RETRY_DELAY_MS"
    ],
    description: "A fetch HTTP client implementing the core contract, with auth header support.",
    kind: "http-client"
  },
  {
    key: "storage",
    name: "Storage encryption",
    framework: "core",
    entryPoint: "@codewithrajat/rm-logvault/storage",
    inCore: false,
    targets: "any environment with IndexedDB and, for AES, crypto.subtle",
    exports: [
      "EncryptionProvider",
      "EncryptableRepository",
      "EncryptingRepository",
      "EncryptingRepositoryOptions",
      "AesGcmEncryptionProviderOptions",
      "createBase64EncryptionProvider",
      "createAesGcmEncryptionProvider",
      "createWebCryptoEncryptionProvider",
      "createEncryptingRepository",
      "deriveAesKey",
      "encryptRecordFields",
      "decryptRecordFields",
      "CleanupPolicy",
      "StorageFailureReason"
    ],
    description: "Encryption providers and a repository wrapper that encrypts chosen fields.",
    kind: "storage"
  },
  {
    key: "testing",
    name: "Testing doubles",
    framework: "core",
    entryPoint: "@codewithrajat/rm-logvault/testing",
    inCore: false,
    targets: "Vitest, Jest, any test runner",
    exports: ["createMemoryRepository", "createFakeTransport"],
    description: "An in-memory repository and a recording transport, for tests.",
    kind: "transport"
  }
]);
function adapterFor(key) {
  if (typeof key !== "string" || key.length === 0) return void 0;
  return ADAPTERS.find((adapter) => adapter.key === key);
}
function adapterFrameworks() {
  return [...new Set(ADAPTERS.map((adapter) => adapter.framework))].sort();
}

// src/errors/builtinContextBuilders.ts
function safeGet2(target, key) {
  if (target === null || typeof target !== "object" && typeof target !== "function") {
    return void 0;
  }
  try {
    return target[key];
  } catch {
    return void 0;
  }
}
function looksLikeHttpError(error) {
  if (error === null || typeof error !== "object") return false;
  const response = safeGet2(error, "response");
  if (response === null || typeof response !== "object") return false;
  const status = safeGet2(response, "status");
  return typeof status === "number" && Number.isFinite(status) && status > 0;
}
function readDirectStatus(error) {
  const status = safeGet2(error, "status");
  if (typeof status === "number" && Number.isFinite(status) && status > 0) return status;
  const statusCode = safeGet2(error, "statusCode");
  if (typeof statusCode === "number" && Number.isFinite(statusCode) && statusCode > 0) {
    return statusCode;
  }
  return void 0;
}
var httpErrorContextBuilder = {
  name: "http",
  canHandle: (error) => looksLikeHttpError(error) || readDirectStatus(error) !== void 0,
  build: (error) => {
    try {
      const classification = buildApiErrorContext(error);
      const context = {
        category: classification.category,
        severity: classification.severity,
        api: classification.api
      };
      const tags = {};
      tags.kind = classification.api.kind;
      if (classification.api.method !== void 0) tags.method = classification.api.method;
      if (classification.api.status !== void 0) tags.status = String(classification.api.status);
      return { ...context, tags };
    } catch (failure) {
      reportInternalFailure("context-builder-http", failure);
      return null;
    }
  }
};
var TIMEOUT_PATTERN = /\b(?:timeout|timed out|ETIMEDOUT|ECONNABORTED)\b/i;
var timeoutErrorContextBuilder = {
  name: "timeout",
  canHandle: (error) => {
    if (typeof error === "string") return TIMEOUT_PATTERN.test(error);
    if (error === null || typeof error !== "object") return false;
    const code = safeGet2(error, "code");
    if (code === "ETIMEDOUT" || code === "ECONNABORTED") return true;
    const message = safeGet2(error, "message");
    return typeof message === "string" && TIMEOUT_PATTERN.test(message);
  },
  build: () => ({
    category: "timeout",
    severity: "warning",
    tags: { kind: "timeout" }
  })
};
var typeErrorContextBuilder = {
  name: "type-error",
  canHandle: (error) => {
    if (error === null || typeof error !== "object") return false;
    if (safeGet2(error, "name") === "TypeError") return true;
    const ctor = safeGet2(error, "constructor");
    return safeGet2(ctor, "name") === "TypeError";
  },
  build: () => ({
    category: "runtime",
    severity: "error",
    tags: { kind: "type-error" }
  })
};
function installBuiltinContextBuilders() {
  try {
    const removers = [
      registerErrorContextBuilder(timeoutErrorContextBuilder),
      registerErrorContextBuilder(httpErrorContextBuilder),
      registerErrorContextBuilder(typeErrorContextBuilder)
    ];
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      for (const remove of removers) {
        try {
          remove();
        } catch (failure) {
          reportInternalFailure("context-builder-uninstall", failure);
        }
      }
    };
  } catch (failure) {
    reportInternalFailure("context-builder-install", failure);
    return () => void 0;
  }
}

exports.ADAPTERS = ADAPTERS;
exports.CORRELATION_HEADERS = CORRELATION_HEADERS;
exports.DEFAULT_ALLOWED_QUERY_PARAMS = DEFAULT_ALLOWED_QUERY_PARAMS;
exports.DEFAULT_ENV_PREFIXES = DEFAULT_ENV_PREFIXES;
exports.DEFAULT_OPTIONS = DEFAULT_OPTIONS;
exports.DIAGNOSTICS_CSV_COLUMNS = DIAGNOSTICS_CSV_COLUMNS;
exports.ERROR_CLEANUP_EVERY_WRITES = ERROR_CLEANUP_EVERY_WRITES;
exports.EXPORT_SLICE_SIZE = EXPORT_SLICE_SIZE;
exports.LOG_CLEANUP_EVERY_WRITES = LOG_CLEANUP_EVERY_WRITES;
exports.LOG_LEVELS = LOG_LEVELS;
exports.LOG_LEVEL_PRIORITY = LOG_LEVEL_PRIORITY;
exports.MAX_ARRAY_ITEMS = MAX_ARRAY_ITEMS;
exports.MAX_CAUSE_DEPTH = MAX_CAUSE_DEPTH;
exports.MAX_COMPONENT_STACK_LENGTH = MAX_COMPONENT_STACK_LENGTH;
exports.MAX_DEPTH = MAX_DEPTH;
exports.MAX_KEYS = MAX_KEYS;
exports.MAX_LOG_ARGS = MAX_LOG_ARGS;
exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
exports.MAX_STACK_LENGTH = MAX_STACK_LENGTH;
exports.MAX_STRING_LENGTH = MAX_STRING_LENGTH;
exports.MAX_TAGS = MAX_TAGS;
exports.PRE_INIT_ERROR_BUFFER_SIZE = PRE_INIT_ERROR_BUFFER_SIZE;
exports.PRE_INIT_LOG_BUFFER_SIZE = PRE_INIT_LOG_BUFFER_SIZE;
exports.REDACTED = REDACTED;
exports.REPORT_PRIVACY_BANNER = REPORT_PRIVACY_BANNER;
exports.SENSITIVE_KEY_PATTERN = SENSITIVE_KEY_PATTERN;
exports.TERMINAL_STATUSES = TERMINAL_STATUSES;
exports.UNHANDLED_SOURCES = UNHANDLED_SOURCES;
exports.UNNORMALIZABLE = UNNORMALIZABLE;
exports.adapterFor = adapterFor;
exports.adapterFrameworks = adapterFrameworks;
exports.backoffDelay = backoffDelay;
exports.buildApiErrorContext = buildApiErrorContext;
exports.buildFetchErrorContext = buildFetchErrorContext;
exports.buildReportPayload = buildReportPayload;
exports.buildRestBody = buildRestBody;
exports.byteLength = byteLength;
exports.captureApiError = captureApiError;
exports.captureError = captureError;
exports.captureFetchError = captureFetchError;
exports.categoryForKind = categoryForKind;
exports.classifyResponse = classifyResponse;
exports.classifyStorageError = classifyStorageError;
exports.clearErrorContextBuilders = clearErrorContextBuilders;
exports.clearTelemetryData = clearTelemetryData;
exports.createDbConnection = createDbConnection;
exports.createErrorRepository = createErrorRepository;
exports.createEventEmitter = createEventEmitter;
exports.createFetchTransport = createFetchTransport;
exports.createLogRepository = createLogRepository;
exports.createLogger = createLogger;
exports.createRateLimiter = createRateLimiter;
exports.createSanitizer = createSanitizer;
exports.createSerialQueue = createSerialQueue;
exports.createSinkRegistry = createSinkRegistry;
exports.createSyncManager = createSyncManager;
exports.cyrb53 = cyrb53;
exports.databaseNames = databaseNames;
exports.destroyTelemetry = destroyTelemetry;
exports.diagnosticsFilename = diagnosticsFilename;
exports.encodeJsonForHtml = encodeJsonForHtml;
exports.errorContextBuilderCount = errorContextBuilderCount;
exports.escapeHtml = escapeHtml;
exports.escapeJsonText = escapeJsonText;
exports.expectedCode = expectedCode;
exports.exportDiagnosticsReport = exportDiagnosticsReport;
exports.fingerprint = fingerprint;
exports.fingerprintParts = fingerprintParts;
exports.flushTelemetry = flushTelemetry;
exports.fromEnv = fromEnv;
exports.getDefaultSanitizer = getDefaultSanitizer;
exports.getGlobal = getGlobal;
exports.getSinkRegistry = getSinkRegistry;
exports.getState = getState;
exports.getTelemetryStatus = getTelemetryStatus;
exports.globalHandlerCount = globalHandlerCount;
exports.globalHandlersAttached = globalHandlersAttached;
exports.httpErrorContextBuilder = httpErrorContextBuilder;
exports.initTelemetry = initTelemetry;
exports.installBuiltinContextBuilders = installBuiltinContextBuilders;
exports.installDiagnosticsExportShortcut = installDiagnosticsExportShortcut;
exports.installGlobalErrorHandlers = installGlobalErrorHandlers;
exports.installShortcut = installShortcut;
exports.isAuthError = isAuthError;
exports.isBrowser = isBrowser;
exports.isEditableTarget = isEditableTarget;
exports.isErrorRecord = isErrorRecord;
exports.isExportInFlight = isExportInFlight;
exports.isLogRecord = isLogRecord;
exports.isSensitiveKey = isSensitiveKey;
exports.isSyncConfigured = isSyncConfigured;
exports.isTelemetryInitialized = isTelemetryInitialized;
exports.levelPriority = levelPriority;
exports.listErrorContextBuilders = listErrorContextBuilders;
exports.logger = logger;
exports.markAuthError = markAuthError;
exports.matchesShortcut = matchesShortcut;
exports.meetsLevel = meetsLevel;
exports.newId = newId;
exports.newPageLoadId = newPageLoadId;
exports.normalizeError = normalizeError;
exports.normalizePathForFingerprint = normalizePathForFingerprint;
exports.parseRetryAfter = parseRetryAfter;
exports.promisifyRequest = promisifyRequest;
exports.reduceErrorPayload = reduceErrorPayload;
exports.reduceLogPayload = reduceLogPayload;
exports.registerErrorContextBuilder = registerErrorContextBuilder;
exports.renderDiagnosticsReport = renderDiagnosticsReport;
exports.reportInternalFailure = reportInternalFailure;
exports.reportInternalNote = reportInternalNote;
exports.resolveEndpoint = resolveEndpoint;
exports.resolveEndpoints = resolveEndpoints;
exports.resolveErrorContext = resolveErrorContext;
exports.resolveOptions = resolveOptions;
exports.retryFailedTelemetry = retryFailedTelemetry;
exports.safeGet = safeGet;
exports.sanitizeErrorRecord = sanitizeErrorRecord;
exports.sanitizeLogRecord = sanitizeLogRecord;
exports.sanitizeNormalized = sanitizeNormalized;
exports.sanitizeStack = sanitizeStack;
exports.sanitizeText = sanitizeText;
exports.sanitizeUrl = sanitizeUrl;
exports.sanitizeValue = sanitizeValue;
exports.setupTelemetry = setupTelemetry;
exports.severityForKind = severityForKind;
exports.syncTelemetry = syncTelemetry;
exports.timeoutErrorContextBuilder = timeoutErrorContextBuilder;
exports.topStackFrames = topStackFrames;
exports.typeErrorContextBuilder = typeErrorContextBuilder;
exports.unregisterErrorContextBuilder = unregisterErrorContextBuilder;
exports.withErrorCapture = withErrorCapture;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map