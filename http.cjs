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
var LONG_SECRET_PATTERN = /^[\w-]{32,}$/;
var HARD_TEXT_CAP = 2e4;
var MAX_DEPTH = 4;
var MAX_KEYS = 30;
var MAX_ARRAY_ITEMS = 20;
var MAX_STRING_LENGTH = 2e3;
var MAX_MESSAGE_LENGTH = 1e3;
var MAX_STACK_LENGTH = 8e3;
var MAX_LOG_ARGS = 5;
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
        const cut = raw.search(/[?#]/);
        return truncate(cut >= 0 ? raw.slice(0, cut) : raw, maxLength);
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
      const cut = raw.search(/[?#]/);
      return truncate(cut >= 0 ? raw.slice(0, cut) : raw, maxLength);
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

// src/adapters/auth.ts
function createRefreshGuard(provider) {
  let inFlight = null;
  return () => {
    if (inFlight !== null) return inFlight;
    const refresh = provider.refreshToken;
    if (typeof refresh !== "function") {
      return Promise.resolve(void 0);
    }
    inFlight = (async () => {
      try {
        const token = await refresh();
        return typeof token === "string" && token.length > 0 ? token : void 0;
      } catch (error) {
        reportInternalFailure("auth-refresh", error);
        return void 0;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
function createAuthHeaderProvider(provider, options = {}) {
  const headerName = typeof options.headerName === "string" && options.headerName.length > 0 ? options.headerName : "Authorization";
  const scheme = typeof options.scheme === "string" ? options.scheme : "Bearer ";
  const refresh = createRefreshGuard(provider);
  const readToken = async () => {
    try {
      const token = await provider.getToken();
      return typeof token === "string" && token.length > 0 ? token : void 0;
    } catch (error) {
      reportInternalFailure("auth-get-token", error);
      return void 0;
    }
  };
  const notifyUnauthorized = async () => {
    try {
      await provider.onUnauthorized?.();
    } catch (error) {
      reportInternalFailure("auth-unauthorized", error);
    }
  };
  const isExpired = (token) => {
    let check;
    try {
      check = provider.isTokenExpired;
    } catch (error) {
      reportInternalFailure("auth-is-expired", error);
      return false;
    }
    if (typeof check !== "function") return false;
    try {
      return check(token) === true;
    } catch (error) {
      reportInternalFailure("auth-is-expired", error);
      return false;
    }
  };
  const collectExtra = async () => {
    let extra;
    try {
      extra = options.getExtraHeaders;
    } catch (error) {
      reportInternalFailure("auth-extra-headers", error);
      return {};
    }
    if (typeof extra !== "function") return {};
    try {
      const headers = await extra();
      return headers !== null && typeof headers === "object" ? headers : {};
    } catch (error) {
      reportInternalFailure("auth-extra-headers", error);
      return {};
    }
  };
  const getHeaders = async () => {
    const extra = await collectExtra();
    let token = await readToken();
    if (token === void 0) {
      return extra;
    }
    if (isExpired(token)) {
      const refreshed = await refresh();
      if (refreshed === void 0) {
        await notifyUnauthorized();
        return extra;
      }
      token = refreshed;
    }
    return { ...extra, [headerName]: `${scheme}${token}` };
  };
  return { getHeaders, refresh };
}
function createAuthInterceptor(provider) {
  const headers = createAuthHeaderProvider(provider);
  return {
    name: "auth",
    onRequest: async (request) => {
      const resolved = await headers.getHeaders();
      return {
        ...request,
        headers: { ...resolved, ...request.headers }
      };
    },
    onError: async (error) => {
      if (error.statusCode !== 401) return;
      const token = await headers.refresh();
      if (token !== void 0) return;
      try {
        await provider.logout?.();
      } catch (failure) {
        reportInternalFailure("auth-logout", failure);
      }
      try {
        await provider.onUnauthorized?.();
      } catch (failure) {
        reportInternalFailure("auth-unauthorized", failure);
      }
    }
  };
}

// src/adapters/http.ts
function resolveRequestUrl(url, baseUrl) {
  const raw = typeof url === "string" ? url.trim() : "";
  if (raw.length === 0) return "";
  if (baseUrl === void 0 || baseUrl.length === 0) return raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const trimmedPath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${trimmedBase}${trimmedPath}`;
}
var DEFAULT_HTTP_TIMEOUT_MS = 3e4;
var DEFAULT_HTTP_RETRY_DELAY_MS = 300;
function isRetryableStatus(status) {
  if (status === 0) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500 && status <= 599;
}
function categoryForHttpStatus(status, timedOut) {
  if (timedOut) return "timeout";
  if (status === 0) return "network";
  if (status === 401 || status === 403 || status === 407) return "auth";
  if (status === 408 || status === 504) return "timeout";
  if (status === 499) return "abort";
  return "http";
}
function severityForHttpError(status, timedOut) {
  if (timedOut || status === 0) return "error";
  return status >= 500 ? "error" : "warning";
}
function buildHttpErrorContext(error) {
  const request = error?.request ?? {};
  const response = error?.response;
  const status = typeof error?.statusCode === "number" ? error.statusCode : 0;
  const timedOut = error?.isTimeout === true;
  const isAbort = error?.isAbort === true;
  const attempts = typeof error?.attempts === "number" ? error.attempts : 0;
  const tags = { kind: "http" };
  if (typeof request.method === "string") tags.method = request.method;
  if (status > 0) tags.status = String(status);
  if (attempts > 1) tags.attempts = String(attempts);
  const api = { kind: timedOut ? "timeout" : isAbort ? "abort" : status === 0 ? "network" : "http" };
  if (typeof request.method === "string") api.method = request.method;
  if (typeof request.url === "string") api.url = request.url;
  if (status > 0) api.status = status;
  if (response !== void 0 && typeof response.statusText === "string" && response.statusText.length > 0) {
    api.statusText = response.statusText;
  }
  if (typeof request.timeoutMs === "number") api.timeout = request.timeoutMs;
  return {
    source: "api",
    category: categoryForHttpStatus(status, timedOut),
    severity: severityForHttpError(status, timedOut),
    api,
    tags
  };
}

// src/adapters/httpFetch.ts
function resolveFetch(override) {
  if (override !== void 0) return override;
  try {
    const candidate = Reflect.get(globalThis, "fetch");
    return typeof candidate === "function" ? candidate : void 0;
  } catch {
    return void 0;
  }
}
function looksLikeJson(contentType) {
  return /^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType);
}
function readHeaders(headers) {
  const out = {};
  try {
    const forEach = Reflect.get(headers, "forEach");
    if (typeof forEach !== "function") return out;
    Reflect.apply(forEach, headers, [
      (value, key) => {
        if (typeof key === "string" && typeof value === "string") out[key.toLowerCase()] = value;
      }
    ]);
  } catch {
  }
  return out;
}
async function applyInterceptors(initial, interceptors) {
  let current = initial;
  for (const interceptor of interceptors) {
    const hook = interceptor.onRequest;
    if (typeof hook !== "function") continue;
    try {
      const next = await hook(current);
      if (next === null) return null;
      if (next !== void 0 && typeof next === "object") current = next;
    } catch (error) {
      reportInternalFailure("http-interceptor-request", error);
      throw error;
    }
  }
  return current;
}
async function readBody(response, readAs) {
  try {
    if (readAs === "none") return void 0;
    if (readAs === "json") return await response.json();
    if (readAs === "arrayBuffer") return await response.arrayBuffer();
    if (readAs === "blob") return await response.blob();
    if (readAs === "text") return await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    return looksLikeJson(contentType) ? await response.json() : await response.text();
  } catch (error) {
    reportInternalFailure("http-body", error);
    return void 0;
  }
}
function makeError(message, request, response, flags) {
  const statusCode = response === void 0 ? 0 : response.status;
  const error = new Error(message);
  error.name = "HttpError";
  error.request = request;
  if (response !== void 0) error.response = response;
  error.isNetworkError = !flags.timedOut && !flags.aborted && statusCode === 0;
  error.isTimeout = flags.timedOut;
  error.isAbort = flags.aborted;
  error.statusCode = statusCode;
  error.attempts = flags.attempts;
  if (flags.nonRetryable === true) error.isRetryable = false;
  return error;
}
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function createFetchHttpClient(options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_HTTP_TIMEOUT_MS;
  const retryCount = typeof options.retry === "number" && Number.isFinite(options.retry) && options.retry > 0 ? Math.floor(options.retry) : 0;
  const retryDelayMs = typeof options.retryDelayMs === "number" && Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0 ? options.retryDelayMs : DEFAULT_HTTP_RETRY_DELAY_MS;
  const credentials = options.credentials ?? "same-origin";
  const bodyMode = options.bodyMode ?? "json";
  const readAs = options.readAs ?? "auto";
  const rejectOnHttpError = options.rejectOnHttpError !== false;
  let interceptors = [];
  const resolveHeaders = async (request) => {
    let provided = {};
    if (typeof options.getHeaders === "function") {
      const fromProvider = await options.getHeaders();
      if (fromProvider !== null && typeof fromProvider === "object") provided = fromProvider;
    }
    return { ...options.headers, ...provided, ...request.headers };
  };
  const serialiseBody = (request, headers) => {
    const raw = request.body;
    if (raw === void 0 || raw === null) return { body: void 0, headers };
    if (bodyMode === "raw") {
      return { body: raw, headers };
    }
    if (bodyMode === "text") {
      const next2 = { ...headers };
      if (next2["Content-Type"] === void 0 && next2["content-type"] === void 0) {
        next2["Content-Type"] = "text/plain;charset=utf-8";
      }
      return { body: String(raw), headers: next2 };
    }
    const next = { ...headers };
    if (next["Content-Type"] === void 0 && next["content-type"] === void 0) {
      next["Content-Type"] = "application/json";
    }
    let serialised;
    try {
      serialised = JSON.stringify(raw) ?? "";
    } catch (error) {
      reportInternalFailure("http-body-serialise", error);
      serialised = "";
    }
    return { body: serialised, headers: next };
  };
  const attempt = async (request, attemptNumber) => {
    const fetchImpl = resolveFetch(options.fetchImpl);
    const url = resolveRequestUrl(request.url, options.baseUrl);
    if (fetchImpl === void 0) {
      throw makeError("fetch is not available in this environment", request, void 0, {
        timedOut: false,
        aborted: false,
        attempts: attemptNumber
      });
    }
    if (url.length === 0) {
      throw makeError("request url is empty", request, void 0, {
        timedOut: false,
        aborted: false,
        attempts: attemptNumber
      });
    }
    const attemptTimeout = typeof request.timeoutMs === "number" && Number.isFinite(request.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : timeoutMs;
    const externalSignal = request.signal;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : void 0;
    let timedOut = false;
    const timer = controller === void 0 ? void 0 : setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch {
      }
    }, attemptTimeout);
    const forwardAbort = () => {
      try {
        controller?.abort();
      } catch {
      }
    };
    if (externalSignal !== void 0 && controller !== void 0) {
      try {
        if (externalSignal.aborted) forwardAbort();
        else externalSignal.addEventListener("abort", forwardAbort, { once: true });
      } catch {
      }
    }
    let startedAt = 0;
    try {
      const headers = await resolveHeaders(request);
      const { body, headers: finalHeaders } = serialiseBody(request, headers);
      startedAt = Date.now();
      const response = await fetchImpl(url, {
        method: request.method,
        headers: finalHeaders,
        ...body !== void 0 ? { body } : {},
        credentials: request.credentials ?? credentials,
        redirect: "follow",
        ...controller !== void 0 ? { signal: controller.signal } : {}
      });
      const durationMs = Date.now() - startedAt;
      const responseHeaders = readHeaders(response.headers);
      const data = await readBody(response, readAs);
      return {
        status: response.status,
        statusText: typeof response.statusText === "string" ? response.statusText : "",
        headers: responseHeaders,
        data,
        ok: response.ok,
        durationMs
      };
    } catch (thrown) {
      if (thrown instanceof Error && thrown.name === "HttpError") throw thrown;
      const aborted = externalSignal?.aborted === true;
      const fromPreparation = startedAt === 0;
      throw makeError(
        timedOut ? `request timed out after ${String(attemptTimeout)}ms` : aborted ? "request aborted" : thrown instanceof Error && thrown.message.length > 0 ? thrown.message : "network request failed",
        request,
        void 0,
        { timedOut, aborted, attempts: attemptNumber, nonRetryable: fromPreparation }
      );
    } finally {
      if (timer !== void 0) clearTimeout(timer);
      if (externalSignal !== void 0) {
        try {
          externalSignal.removeEventListener("abort", forwardAbort);
        } catch {
        }
      }
    }
  };
  const execute = async (request) => {
    const base = {
      ...request,
      method: normaliseMethod(request.method),
      headers: request.headers ?? {}
    };
    let prepared = null;
    try {
      prepared = await applyInterceptors(base, interceptors);
    } catch (thrown) {
      const error = makeError(
        thrown instanceof Error ? thrown.message : "request interceptor failed",
        base,
        void 0,
        { timedOut: false, aborted: false, attempts: 0 }
      );
      await runOnError(error);
      throw error;
    }
    if (prepared === null) {
      const error = makeError("request cancelled by an interceptor", base, void 0, {
        timedOut: false,
        aborted: false,
        attempts: 0
      });
      await runOnError(error);
      throw error;
    }
    const maxAttempts = 1 + resolveRetry(prepared.retry, retryCount);
    let lastError = null;
    let response = null;
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
      try {
        response = await attempt(prepared, attemptNumber);
      } catch (thrown) {
        const failure2 = thrown;
        lastError = failure2;
        const deterministic = failure2.isRetryable === false;
        if (attemptNumber < maxAttempts && !deterministic) {
          await delay(backoffFor(attemptNumber, retryDelayMs));
          continue;
        }
        await runOnError(failure2);
        throw failure2;
      }
      if (response.ok || !rejectOnHttpError) break;
      const failure = makeError(
        `request failed with status ${String(response.status)}`,
        prepared,
        response,
        { timedOut: false, aborted: false, attempts: attemptNumber }
      );
      lastError = failure;
      if (attemptNumber < maxAttempts && isRetryableStatus(response.status)) {
        await delay(backoffFor(attemptNumber, retryDelayMs));
        continue;
      }
      await runOnError(failure);
      throw failure;
    }
    if (response === null) {
      const failure = lastError ?? makeError("request failed", prepared, void 0, {
        timedOut: false,
        aborted: false,
        attempts: maxAttempts
      });
      await runOnError(failure);
      throw failure;
    }
    let final = response;
    for (const interceptor of interceptors) {
      const hook = interceptor.onResponse;
      if (typeof hook !== "function") continue;
      try {
        const replaced = await hook(final, prepared);
        if (replaced !== null && typeof replaced === "object") final = replaced;
      } catch (error) {
        reportInternalFailure("http-interceptor-response", error);
      }
    }
    return final;
  };
  const runOnError = async (error) => {
    for (const interceptor of interceptors) {
      const hook = interceptor.onError;
      if (typeof hook !== "function") continue;
      try {
        await hook(error);
      } catch (failure) {
        reportInternalFailure("http-interceptor-error", failure);
      }
    }
    const onError = options.onError;
    if (typeof onError !== "function") return;
    try {
      onError(error, buildHttpErrorContext(error));
    } catch (failure) {
      reportInternalFailure("http-on-error", failure);
    }
  };
  return {
    request: execute,
    get: (url, requestOptions) => execute({ ...requestOptions, url, method: "GET" }),
    post: (url, body, requestOptions) => execute({ ...requestOptions, url, method: "POST", body }),
    put: (url, body, requestOptions) => execute({ ...requestOptions, url, method: "PUT", body }),
    patch: (url, body, requestOptions) => execute({ ...requestOptions, url, method: "PATCH", body }),
    delete: (url, requestOptions) => execute({ ...requestOptions, url, method: "DELETE" }),
    setInterceptors: (next) => {
      interceptors = Array.isArray(next) ? [...next] : [];
    },
    getInterceptors: () => interceptors
  };
}
function normaliseMethod(method) {
  const upper = typeof method === "string" ? method.toUpperCase() : "";
  switch (upper) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "HEAD":
    case "OPTIONS":
      return upper;
    default:
      return "GET";
  }
}
function resolveRetry(perRequest, fallback) {
  if (typeof perRequest === "number" && Number.isFinite(perRequest) && perRequest >= 0) {
    return Math.floor(perRequest);
  }
  return fallback;
}
function backoffFor(attemptNumber, base) {
  const exponent = Math.min(attemptNumber - 1, 6);
  return Math.min(base * 2 ** exponent, 3e4);
}

exports.DEFAULT_HTTP_RETRY_DELAY_MS = DEFAULT_HTTP_RETRY_DELAY_MS;
exports.DEFAULT_HTTP_TIMEOUT_MS = DEFAULT_HTTP_TIMEOUT_MS;
exports.buildHttpErrorContext = buildHttpErrorContext;
exports.categoryForHttpStatus = categoryForHttpStatus;
exports.createAuthHeaderProvider = createAuthHeaderProvider;
exports.createAuthInterceptor = createAuthInterceptor;
exports.createFetchHttpClient = createFetchHttpClient;
exports.isRetryableStatus = isRetryableStatus;
exports.resolveRequestUrl = resolveRequestUrl;
exports.severityForHttpError = severityForHttpError;
//# sourceMappingURL=http.cjs.map
//# sourceMappingURL=http.cjs.map