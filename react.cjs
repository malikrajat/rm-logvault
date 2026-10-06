'use strict';

var react = require('react');

// src/adapters/react.tsx

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
function now() {
  return Date.now();
}
function getLocationHref() {
  const w = getWindow();
  if (w === void 0) return void 0;
  const loc = safeGet(w, "location");
  const href = safeGet(loc, "href");
  return typeof href === "string" ? href : void 0;
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

// src/errors/constants.ts
var REDACTED = "[REDACTED]";
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
var INTERNAL_PREFIXES = RESERVED_LOG_PREFIXES;
var CONSOLE_PREFIX = "[rm-logvault]";
var PRE_INIT_LOG_BUFFER_SIZE = 50;
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
function getLoggerController() {
  return instance;
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

// src/errors/captureError.ts
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

// src/adapters/react.tsx
var TelemetryErrorBoundary = class extends react.Component {
  constructor() {
    super(...arguments);
    this.state = { error: null };
    this.reset = () => {
      this.setState({ error: null });
    };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    try {
      captureError(error, {
        source: "react",
        componentStack: info.componentStack ?? void 0,
        ...this.props.context ?? {}
      });
    } catch {
    }
    try {
      this.props.onError?.(error, info);
    } catch {
    }
  }
  render() {
    const { error } = this.state;
    if (error === null) return this.props.children ?? null;
    const { fallback } = this.props;
    if (typeof fallback === "function") return fallback(error, this.reset);
    return fallback ?? null;
  }
};
function reactRootErrorHandlers(context) {
  return {
    onUncaughtError: (error, errorInfo) => {
      captureError(error, {
        source: "react",
        severity: "fatal",
        componentStack: errorInfo.componentStack ?? void 0,
        ...context ?? {}
      });
    },
    onCaughtError: (error, errorInfo) => {
      captureError(error, {
        source: "react",
        handled: true,
        componentStack: errorInfo.componentStack ?? void 0,
        ...context ?? {}
      });
    },
    onRecoverableError: (error, errorInfo) => {
      captureError(error, {
        source: "react",
        severity: "warning",
        handled: true,
        componentStack: errorInfo.componentStack ?? void 0,
        tags: { recoverable: "true" },
        ...context ?? {}
      });
    }
  };
}
function useErrorCapture(context) {
  return (error, extra) => {
    captureError(error, { ...context ?? {}, ...extra ?? {} });
  };
}

exports.TelemetryErrorBoundary = TelemetryErrorBoundary;
exports.reactRootErrorHandlers = reactRootErrorHandlers;
exports.useErrorCapture = useErrorCapture;
//# sourceMappingURL=react.cjs.map
//# sourceMappingURL=react.cjs.map