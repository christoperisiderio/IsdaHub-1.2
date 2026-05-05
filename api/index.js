/**
 * api/index.js — Single Vercel serverless function that handles ALL /api/* routes.
 *
 * Vercel Hobby plan is capped at 12 serverless functions per deployment.
 * All route logic is consolidated here; vercel.json rewrites every /api/* request
 * to this file, so the URL structure stays exactly the same for the frontend.
 *
 * Shared modules (_store.js, _helpers.js) are NOT functions and don't count.
 */

const { getStore } = require("./_store");
const { enrichListing, suggestPrice } = require("./_helpers");

// ─── ID Helpers ───────────────────────────────────────────────────────────────

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function orderNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ORD-${y}${m}${day}-${String(Math.floor(Math.random() * 900) + 100).padStart(3, "0")}`;
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

function handleHealth(req, res) {
  res.json({ ok: true, name: "IsdaHub PH API", time: new Date().toISOString() });
}

function handleMeta(req, res) {
  const store = getStore();
  res.json({
    clusters: store.clusters,
    priceGuide: store.priceGuide,
    tagline: "Fair Catch. Fair Price. Fast Delivery.",
    scope: "Agusan del Norte — BFAR-aligned cluster logistics (no map routing; cluster-based matching).",
  });
}

function handleAlerts(req, res) {
  res.json(getStore().alerts);
}

function handleAlertResolve(req, res, alertId) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  const store = getStore();
  const a = store.alerts.find((x) => x.id === alertId);
  if (!a) return res.status(404).json({ error: "not found" });
  a.resolved = true;
  return res.json(a);
}

function handleDeliveries(req, res) {
  res.json(getStore().deliveries);
}

function handleListings(req, res) {
  const store = getStore();

  if (req.method === "GET") {
    let list = [...store.listings];
    const { cluster, status, species, buyer } = req.query || {};
    if (cluster) list = list.filter((l) => l.cluster === cluster);
    if (status) list = list.filter((l) => l.status === status);
    if (species) list = list.filter((l) => l.species.toLowerCase().includes(String(species).toLowerCase()));
    if (buyer === "1") list = list.filter((l) => l.status === "verified" && l.kg > 0);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(list.map((l) => enrichListing(l, store)));
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const species = String(b.species || "").trim();
    const kg = Number(b.kg);
    if (!species || !Number.isFinite(kg) || kg <= 0) {
      return res.status(400).json({ error: "species and positive kg required" });
    }
    const cluster = String(b.cluster || "carmen");
    if (!store.clusters.some((c) => c.id === cluster)) {
      return res.status(400).json({ error: "invalid cluster" });
    }
    const listing = {
      id: genId("lst"),
      farmerName: String(b.farmerName || "Registered Fisher").trim() || "Registered Fisher",
      farmerPhone: String(b.farmerPhone || "").trim(),
      species,
      kg,
      freshness: String(b.freshness || "Day catch").trim(),
      cluster,
      pricePerKg: b.pricePerKg != null ? Number(b.pricePerKg) : suggestPrice(species, store)?.midpoint ?? 0,
      catchTime: b.catchTime ? new Date(b.catchTime).toISOString() : new Date().toISOString(),
      sourceLocation: String(b.sourceLocation || "").trim() || "Declared at listing",
      status: "pending",
      channel: b.channel === "sms" ? "sms" : "app",
      createdAt: new Date().toISOString(),
    };
    if (!Number.isFinite(listing.pricePerKg) || listing.pricePerKg <= 0) {
      return res.status(400).json({ error: "pricePerKg required when no guide match" });
    }
    store.listings.push(listing);
    return res.status(201).json(enrichListing(listing, store));
  }

  res.status(405).json({ error: "Method not allowed" });
}

function handleListingSmsSimulate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const store = getStore();
  const text = String((req.body && req.body.text) || "").trim();
  const farmerPhone = String((req.body && req.body.farmerPhone) || "+639000000000").trim();
  const farmerName = String((req.body && req.body.farmerName) || "SMS Fisher").trim();
  const cluster = String((req.body && req.body.cluster) || "carmen");

  let species = "Tilapia";
  let kg = 5;
  const lower = text.toLowerCase();
  if (/tuna/.test(lower)) species = "Tuna";
  else if (/bangus|milkfish/.test(lower)) species = "Bangus";
  else if (/galunggong|gg/.test(lower)) species = "Galunggong";
  const m = text.match(/(\d+(\.\d+)?)\s*kg/i) || text.match(/(\d+(\.\d+)?)/);
  if (m) kg = Number(m[1]);
  if (!Number.isFinite(kg) || kg <= 0) kg = 5;

  const listing = {
    id: genId("lst"),
    farmerName,
    farmerPhone,
    species,
    kg,
    freshness: "Parsed from SMS",
    cluster,
    pricePerKg: suggestPrice(species, store)?.midpoint ?? 100,
    catchTime: new Date().toISOString(),
    sourceLocation: "SMS intake",
    status: "pending",
    channel: "sms",
    createdAt: new Date().toISOString(),
    smsRaw: text,
  };
  store.listings.push(listing);
  return res.status(201).json({ parsed: { species, kg }, listing: enrichListing(listing, store) });
}

function handleListingById(req, res, listingId) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  const store = getStore();
  const listing = store.listings.find((l) => l.id === listingId);
  if (!listing) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  if (b.kg != null) listing.kg = Math.max(0, Number(b.kg));
  if (b.pricePerKg != null) listing.pricePerKg = Number(b.pricePerKg);
  if (b.status && ["pending", "verified", "sold", "archived"].includes(b.status)) listing.status = b.status;
  return res.json(enrichListing(listing, store));
}

function handleListingVerify(req, res, listingId) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  const store = getStore();
  const listing = store.listings.find((l) => l.id === listingId);
  if (!listing) return res.status(404).json({ error: "not found" });
  listing.status = "verified";
  if (req.body && req.body.pricePerKg != null) listing.pricePerKg = Number(req.body.pricePerKg);
  return res.json(enrichListing(listing, store));
}

function handleOrders(req, res) {
  const store = getStore();

  if (req.method === "GET") return res.json(store.orders);

  if (req.method === "POST") {
    const b = req.body || {};
    const buyerName = String(b.buyerName || "").trim();
    const cluster = String(b.cluster || "");
    const lines = Array.isArray(b.lines) ? b.lines : [];

    if (!buyerName || !cluster || !lines.length) {
      return res.status(400).json({ error: "buyerName, cluster, lines[] required" });
    }
    if (!store.clusters.some((c) => c.id === cluster)) {
      return res.status(400).json({ error: "invalid cluster" });
    }

    const expanded = [];
    for (const line of lines) {
      const listing = store.listings.find((l) => l.id === line.listingId);
      const kg = Number(line.kg);
      if (!listing || listing.status !== "verified") {
        return res.status(400).json({ error: `invalid or unverified listing ${line.listingId}` });
      }
      if (!Number.isFinite(kg) || kg <= 0 || kg > listing.kg) {
        return res.status(400).json({ error: `bad kg for ${line.listingId}` });
      }
      expanded.push({ listingId: listing.id, farmerName: listing.farmerName, species: listing.species, kg });
      listing.kg = Math.round((listing.kg - kg) * 1000) / 1000;
      if (listing.kg <= 0) listing.status = "sold";
    }

    const order = {
      id: orderNumber(),
      buyerName,
      cluster,
      deliveryMode: b.deliveryMode === "pickup" ? "pickup" : "delivery",
      status: "new",
      createdAt: new Date().toISOString(),
      lines: expanded,
    };
    store.orders.unshift(order);
    return res.status(201).json(order);
  }

  res.status(405).json({ error: "Method not allowed" });
}

function handleOrderStatus(req, res, orderId) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  const store = getStore();
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: "not found" });
  const st = String((req.body && req.body.status) || "");
  if (!["new", "processing", "fulfilled", "cancelled"].includes(st)) {
    return res.status(400).json({ error: "invalid status" });
  }
  order.status = st;
  return res.json(order);
}

function handlePriceGuide(req, res) {
  const store = getStore();
  if (req.method === "GET") return res.json(store.priceGuide);
  if (req.method === "PUT") {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({ error: "Expected JSON array of { species, minPerKg, maxPerKg }" });
    }
    store.priceGuide = body
      .map((r) => ({ species: String(r.species || "").trim(), minPerKg: Number(r.minPerKg), maxPerKg: Number(r.maxPerKg) }))
      .filter((r) => r.species && Number.isFinite(r.minPerKg) && Number.isFinite(r.maxPerKg));
    return res.json(store.priceGuide);
  }
  res.status(405).json({ error: "Method not allowed" });
}

function handleCoordinatorSummary(req, res) {
  const store = getStore();
  const newOrders = store.orders.filter((o) => o.status === "new").length;
  const ongoing = store.deliveries.filter((d) => d.status !== "delivered").length;
  const alerts = store.alerts.filter((a) => !a.resolved).length;
  res.json({ newOrders, ongoingDeliveries: ongoing, alerts, updatedAt: new Date().toISOString() });
}

// ─── Router ───────────────────────────────────────────────────────────────────

module.exports = (req, res) => {
  // Strip query string, then strip leading /api prefix
  const url = (req.url || "/").split("?")[0].replace(/^\/api/, "") || "/";
  const parts = url.split("/").filter(Boolean); // e.g. ["listings", "lst_abc", "verify"]

  // CORS headers (pass-through for same-origin Vercel deployments)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── /api/health
  if (parts.length === 1 && parts[0] === "health") return handleHealth(req, res);

  // ── /api/meta
  if (parts.length === 1 && parts[0] === "meta") return handleMeta(req, res);

  // ── /api/alerts
  if (parts[0] === "alerts") {
    if (parts.length === 1) return handleAlerts(req, res);                         // /api/alerts
    if (parts.length === 3 && parts[2] === "resolve") return handleAlertResolve(req, res, parts[1]); // /api/alerts/:id/resolve
  }

  // ── /api/deliveries
  if (parts.length === 1 && parts[0] === "deliveries") return handleDeliveries(req, res);

  // ── /api/listings
  if (parts[0] === "listings") {
    if (parts.length === 1) return handleListings(req, res);                       // /api/listings
    if (parts.length === 2 && parts[1] === "sms-simulate") return handleListingSmsSimulate(req, res); // /api/listings/sms-simulate
    if (parts.length === 2) return handleListingById(req, res, parts[1]);          // /api/listings/:id
    if (parts.length === 3 && parts[2] === "verify") return handleListingVerify(req, res, parts[1]); // /api/listings/:id/verify
  }

  // ── /api/orders
  if (parts[0] === "orders") {
    if (parts.length === 1) return handleOrders(req, res);                         // /api/orders
    if (parts.length === 3 && parts[2] === "status") return handleOrderStatus(req, res, parts[1]);   // /api/orders/:id/status
  }

  // ── /api/price-guide
  if (parts.length === 1 && parts[0] === "price-guide") return handlePriceGuide(req, res);

  // ── /api/coordinator/summary
  if (parts.length === 2 && parts[0] === "coordinator" && parts[1] === "summary") return handleCoordinatorSummary(req, res);

  // ── 404
  res.status(404).json({ error: "Not found", path: url });
};
