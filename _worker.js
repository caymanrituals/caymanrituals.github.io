// work/domain-launch-2026-10-21/backend/src/catalog.mjs
var PRODUCTS = Object.freeze([
  "ironshore-social-club",
  "open-invitation",
  "you-smell-expensive",
  "oxblood-panel",
  "good-company-bad-loser",
  "bite-me"
].map((sku) => Object.freeze({ sku, priceMinor: 7500, currency: "KYD" })));
var PRODUCT_BY_SKU = new Map(PRODUCTS.map((product) => [product.sku, product]));
function getProduct(sku) {
  return PRODUCT_BY_SKU.get(sku);
}
function catalogPayload() {
  return {
    ok: true,
    currency: "KYD",
    items: PRODUCTS.map(({ sku, priceMinor, currency }) => ({
      sku,
      priceMinor,
      currency,
      purchasable: true
    }))
  };
}

// work/domain-launch-2026-10-21/backend/src/http.mjs
var JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}
function errorResponse(status, code) {
  return jsonResponse({ ok: false, error: code }, status);
}
function originError(request) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  let expectedOrigin;
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    return "origin";
  }
  if (!origin || origin !== expectedOrigin) return "origin";
  if (fetchSite !== null && fetchSite !== "same-origin") return "fetch_site";
  return null;
}
async function readBoundedJson(request, maxBytes = 8192) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
    return { error: "too_large" };
  }
  if (!request.body) return { error: "invalid_json" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { error: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { error: "invalid_json" };
  }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { value: JSON.parse(text) };
  } catch {
    return { error: "invalid_json" };
  }
}

// work/domain-launch-2026-10-21/backend/src/order-service.mjs
var PAYMENT_MODE = "disabled";
var RATE_WINDOW_MS = 15 * 60 * 1e3;
var RATE_TTL_MS = 24 * 60 * 60 * 1e3;
var RATE_LIMIT = 10;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;
var CONTROL_TEST_RE = /[\u0000-\u001f\u007f-\u009f]/;
function cleanText(value) {
  return value.replace(CONTROL_RE, "").trim();
}
function cleanNote(value) {
  return value.replace(/[\r\n\t]/g, " ").replace(CONTROL_RE, "").trim();
}
function charCount(value) {
  return [...value].length;
}
function compareCanonicalText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key));
}
function validatePayload(payload) {
  if (!hasOnlyKeys(payload, /* @__PURE__ */ new Set(["idempotencyKey", "items", "customer", "notes", "consent", "website"]))) {
    throw new Error("invalid_payload");
  }
  if (typeof payload.website === "string" && cleanText(payload.website)) {
    throw new Error("honeypot");
  }
  if (payload.website !== void 0 && typeof payload.website !== "string") throw new Error("invalid_payload");
  if (typeof payload.idempotencyKey !== "string" || !UUID_RE.test(payload.idempotencyKey)) {
    throw new Error("invalid_payload");
  }
  if (payload.consent !== true) throw new Error("invalid_payload");
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 12) {
    throw new Error("invalid_payload");
  }
  const seen = /* @__PURE__ */ new Set();
  let totalQuantity = 0;
  const items = payload.items.map((line) => {
    if (!hasOnlyKeys(line, /* @__PURE__ */ new Set(["sku", "size", "quantity"]))) throw new Error("invalid_payload");
    if (typeof line.sku !== "string" || !getProduct(line.sku)) throw new Error("unknown_sku");
    if (typeof line.size !== "string") throw new Error("invalid_payload");
    const size = cleanText(line.size).toUpperCase();
    if (charCount(size) < 1 || charCount(size) > 24) throw new Error("invalid_payload");
    const itemKey = `${line.sku}\0${size}`;
    if (seen.has(itemKey)) throw new Error("duplicate_item");
    seen.add(itemKey);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) {
      throw new Error("quantity_out_of_range");
    }
    totalQuantity += line.quantity;
    const product = getProduct(line.sku);
    return {
      sku: line.sku,
      size,
      quantity: line.quantity,
      unitPriceMinor: product.priceMinor,
      lineSubtotalMinor: product.priceMinor * line.quantity
    };
  });
  if (totalQuantity > 30) throw new Error("quantity_out_of_range");
  items.sort((a, b) => compareCanonicalText(a.sku, b.sku) || compareCanonicalText(a.size, b.size));
  const customer = payload.customer;
  if (!hasOnlyKeys(customer, /* @__PURE__ */ new Set(["name", "email", "phone"]))) throw new Error("invalid_payload");
  if (typeof customer.name !== "string" || typeof customer.email !== "string") throw new Error("invalid_payload");
  const name = cleanText(customer.name);
  const email = cleanText(customer.email).toLowerCase();
  if (charCount(name) < 1 || charCount(name) > 120) throw new Error("invalid_payload");
  if (charCount(email) < 3 || charCount(email) > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid_payload");
  }
  let phone;
  if (customer.phone !== void 0 && customer.phone !== null && customer.phone !== "") {
    if (typeof customer.phone !== "string") throw new Error("invalid_payload");
    phone = cleanText(customer.phone);
    if (charCount(phone) < 7 || charCount(phone) > 32 || !/^[+()0-9 .-]+$/.test(phone)) {
      throw new Error("invalid_payload");
    }
  }
  let notes;
  if (payload.notes !== void 0 && payload.notes !== null && payload.notes !== "") {
    if (typeof payload.notes !== "string") throw new Error("invalid_payload");
    notes = cleanNote(payload.notes);
    if (charCount(notes) > 500) throw new Error("invalid_payload");
  }
  const subtotalMinor = items.reduce((sum, item) => sum + item.lineSubtotalMinor, 0);
  return {
    idempotencyKey: payload.idempotencyKey.toLowerCase(),
    items,
    customer: { name, email, ...phone ? { phone } : {} },
    ...notes ? { notes } : {},
    consent: true,
    subtotalMinor
  };
}
function responseFromRow(row, status = 200) {
  return jsonResponse({
    ok: true,
    reference: row.reference,
    currency: "KYD",
    subtotalMinor: row.subtotal_minor,
    paymentStatus: "unpaid",
    status: "awaiting_confirmation"
  }, status);
}
async function fingerprintOf(order) {
  const canonical = JSON.stringify({
    items: order.items,
    customer: order.customer,
    notes: order.notes ?? "",
    consent: order.consent
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function rateLimitSubjectHash(ip, now) {
  const date = new Date(now).toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${date}\0${ip}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function parseIPv4Octets(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}
function expandIPv6Groups(value) {
  let address = value.toLowerCase();
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    if (lastColon < 0) return null;
    const octets = parseIPv4Octets(address.slice(lastColon + 1));
    if (!octets) return null;
    const high = (octets[0] << 8 | octets[1]).toString(16);
    const low = (octets[2] << 8 | octets[3]).toString(16);
    address = `${address.slice(0, lastColon)}:${high}:${low}`;
  }
  if (!/^[0-9a-f:]+$/.test(address) || address.includes(":::")) return null;
  const compression = address.indexOf("::");
  let groups;
  if (compression >= 0) {
    if (compression !== address.lastIndexOf("::")) return null;
    const left = address.slice(0, compression);
    const right = address.slice(compression + 2);
    const leftGroups = left ? left.split(":") : [];
    const rightGroups = right ? right.split(":") : [];
    const zeroCount = 8 - leftGroups.length - rightGroups.length;
    if (zeroCount < 1) return null;
    groups = [...leftGroups, ...Array(zeroCount).fill("0"), ...rightGroups];
  } else {
    groups = address.split(":");
    if (groups.length !== 8) return null;
  }
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}
function normalizeRateLimitAddress(rawIp) {
  if (!rawIp || rawIp.length > 128 || CONTROL_TEST_RE.test(rawIp)) return null;
  if (rawIp.includes(":")) {
    const groups = expandIPv6Groups(rawIp);
    if (!groups) return null;
    const prefix = groups.slice(0, 4).map((group) => group.toString(16).padStart(4, "0")).join(":");
    return `ipv6:${prefix}`;
  }
  const octets = parseIPv4Octets(rawIp);
  return octets ? `ipv4:${octets.join(".")}` : null;
}
async function consumeRateLimit(db, request, now) {
  const clientAddress = normalizeRateLimitAddress(request.headers.get("CF-Connecting-IP"));
  if (!clientAddress) return false;
  const subjectHash = await rateLimitSubjectHash(clientAddress, now);
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const expiresAt = now + RATE_TTL_MS;
  const current = await db.prepare(`
    SELECT hits FROM rate_limits
    WHERE subject_hash = ?1 AND window_start_ms = ?2
  `).bind(subjectHash, windowStart).first();
  if (Number.isInteger(current?.hits) && current.hits >= RATE_LIMIT) return false;
  await db.prepare("DELETE FROM rate_limits WHERE expires_at_ms <= ?1").bind(now).run();
  const result = await db.prepare(`
    INSERT INTO rate_limits (subject_hash, window_start_ms, hits, expires_at_ms)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT(subject_hash, window_start_ms) DO UPDATE SET
      hits = hits + 1,
      expires_at_ms = excluded.expires_at_ms
    RETURNING hits
  `).bind(subjectHash, windowStart, expiresAt).first();
  return Number.isInteger(result?.hits) && result.hits <= RATE_LIMIT;
}
function validationStatus(code) {
  if (code === "honeypot" || code === "invalid_payload") return errorResponse(422, "invalid_order");
  if (code === "unknown_sku") return errorResponse(422, "unknown_item");
  if (code === "duplicate_item") return errorResponse(422, "duplicate_item");
  if (code === "quantity_out_of_range") return errorResponse(422, "quantity_out_of_range");
  return errorResponse(422, "invalid_order");
}
async function createOrder(request, env, now = Date.now()) {
  const originProblem = originError(request);
  if (originProblem === "origin") return errorResponse(400, "same_origin_required");
  if (originProblem === "fetch_site") return errorResponse(400, "same_origin_required");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("Content-Type") ?? "")) {
    return errorResponse(415, "json_required");
  }
  const parsed = await readBoundedJson(request, 8192);
  if (parsed.error === "too_large") return errorResponse(413, "request_too_large");
  if (parsed.error) return errorResponse(400, "invalid_json");
  let order;
  try {
    order = validatePayload(parsed.value);
  } catch (error) {
    return validationStatus(error?.message);
  }
  const db = env?.ORDERS_DB;
  if (!db || typeof db.prepare !== "function") return errorResponse(503, "orders_unavailable");
  try {
    const fingerprint = await fingerprintOf(order);
    const existing = await db.prepare(`
      SELECT reference, subtotal_minor, request_fingerprint
      FROM orders WHERE idempotency_key = ?1
    `).bind(order.idempotencyKey).first();
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) return errorResponse(409, "idempotency_conflict");
      return responseFromRow(existing, 200);
    }
    const allowed = await consumeRateLimit(db, request, now);
    if (!allowed) return errorResponse(429, "try_again_later");
    const reference = `CR-${new Date(now).toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 16).toUpperCase()}`;
    const timestamp = new Date(now).toISOString();
    const insert = await db.prepare(`
      INSERT INTO orders (
        reference, idempotency_key, request_fingerprint, created_at,
        currency, subtotal_minor, items_json, customer_name, customer_email,
        customer_phone, notes, consent, status, payment_status
      ) VALUES (?1, ?2, ?3, ?4, 'KYD', ?5, ?6, ?7, ?8, ?9, ?10, 1,
        'awaiting_confirmation', 'unpaid')
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      reference,
      order.idempotencyKey,
      fingerprint,
      timestamp,
      order.subtotalMinor,
      JSON.stringify(order.items),
      order.customer.name,
      order.customer.email,
      order.customer.phone ?? null,
      order.notes ?? null
    ).run();
    if (insert?.meta?.changes === 1) {
      return jsonResponse({
        ok: true,
        reference,
        currency: "KYD",
        subtotalMinor: order.subtotalMinor,
        paymentStatus: "unpaid",
        status: "awaiting_confirmation"
      }, 201);
    }
    const raced = await db.prepare(`
      SELECT reference, subtotal_minor, request_fingerprint
      FROM orders WHERE idempotency_key = ?1
    `).bind(order.idempotencyKey).first();
    if (!raced) return errorResponse(503, "orders_unavailable");
    if (raced.request_fingerprint !== fingerprint) return errorResponse(409, "idempotency_conflict");
    return responseFromRow(raced, 200);
  } catch {
    return errorResponse(503, "orders_unavailable");
  }
}
function paymentMode() {
  return PAYMENT_MODE;
}

// work/domain-launch-2026-10-21/backend/src/health.mjs
async function health(env) {
  let ready = false;
  try {
    const db = env?.ORDERS_DB;
    if (db && typeof db.prepare === "function") {
      const row = await db.prepare(`
        SELECT COUNT(*) AS table_count FROM sqlite_schema
        WHERE type = 'table' AND name IN ('orders', 'rate_limits')
      `).first();
      ready = row?.table_count === 2;
    }
  } catch {
    ready = false;
  }
  return jsonResponse({ ok: ready, ready, paymentMode: paymentMode() }, ready ? 200 : 503);
}

// work/domain-launch-2026-10-21/backend/worker-entry.mjs
function methodNotAllowed(allow) {
  return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, { Allow: allow });
}
var worker_entry_default = {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/catalog") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return jsonResponse(catalogPayload());
    }
    if (pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return health(env);
    }
    if (pathname === "/api/orders") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const response = await createOrder(request, env);
      await scheduleOrderAlert(response, env, ctx);
      return response;
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return errorResponse(404, "not_found");
    }
    return env.ASSETS.fetch(request);
  }
};
async function scheduleOrderAlert(response, env, ctx) {
  if (response.status !== 201 || !env?.ORDER_ALERT || typeof ctx?.waitUntil !== "function") return;
  try {
    const result = await response.clone().json();
    if (typeof result?.reference !== "string" || !/^CR-\d{8}-[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{2}$/.test(result.reference)) return;
    const request = new Request("https://order-alert.internal/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: result.reference })
    });
    const send = Promise.resolve().then(() => env.ORDER_ALERT.fetch(request)).then((alertResponse) => {
      if (!alertResponse?.ok) throw new Error("alert_failed");
    }).catch(() => {
    });
    ctx.waitUntil(send);
  } catch {
  }
}
export {
  worker_entry_default as default
};
