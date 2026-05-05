const fs = require("fs");
const path = require("path");
const express = require("express");

const ROOT = __dirname;
const STORE_PATH = path.join(ROOT, "data", "store.json");

function readStore() {
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function orderNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ORD-${y}${m}${day}-${String(Math.floor(Math.random() * 900) + 100).padStart(3, "0")}`;
}

const app = express();
app.use(express.json({ limit: "512kb" }));

app.use((req, res, next) => {
  res.setHeader("X-App", "IsdaHub PH");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "IsdaHub PH API", time: new Date().toISOString() });
});

app.get("/api/meta", (_req, res) => {
  const store = readStore();
  res.json({
    clusters: store.clusters,
    priceGuide: store.priceGuide,
    tagline: "Fair Catch. Fair Price. Fast Delivery.",
    scope: "Agusan del Norte — BFAR-aligned cluster logistics (no map routing; cluster-based matching)."
  });
});

app.get("/api/price-guide", (_req, res) => {
  res.json(readStore().priceGuide);
});

app.put("/api/price-guide", (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) {
    return res.status(400).json({ error: "Expected JSON array of { species, minPerKg, maxPerKg }" });
  }
  const store = readStore();
  store.priceGuide = body.map((r) => ({
    species: String(r.species || "").trim(),
    minPerKg: Number(r.minPerKg),
    maxPerKg: Number(r.maxPerKg)
  })).filter((r) => r.species && Number.isFinite(r.minPerKg) && Number.isFinite(r.maxPerKg));
  writeStore(store);
  res.json(store.priceGuide);
});

function suggestPrice(species, store) {
  const row = store.priceGuide.find(
    (p) => p.species.toLowerCase() === String(species).toLowerCase()
  );
  if (!row) return null;
  return { minPerKg: row.minPerKg, maxPerKg: row.maxPerKg, midpoint: Math.round((row.minPerKg + row.maxPerKg) / 2) };
}

app.get("/api/listings", (req, res) => {
  const store = readStore();
  let list = [...store.listings];
  const { cluster, status, species, buyer } = req.query;
  if (cluster) list = list.filter((l) => l.cluster === cluster);
  if (status) list = list.filter((l) => l.status === status);
  if (species) list = list.filter((l) => l.species.toLowerCase().includes(String(species).toLowerCase()));
  if (buyer === "1") list = list.filter((l) => l.status === "verified" && l.kg > 0);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list.map((l) => enrichListing(l, store)));
});

app.post("/api/listings", (req, res) => {
  const store = readStore();
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
    id: id("lst"),
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
    createdAt: new Date().toISOString()
  };
  if (!Number.isFinite(listing.pricePerKg) || listing.pricePerKg <= 0) {
    return res.status(400).json({ error: "pricePerKg required when no guide match" });
  }
  store.listings.push(listing);
  writeStore(store);
  res.status(201).json(enrichListing(listing, store));
});

app.post("/api/listings/sms-simulate", (req, res) => {
  const store = readStore();
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
    id: id("lst"),
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
    smsRaw: text
  };
  store.listings.push(listing);
  writeStore(store);
  res.status(201).json({ parsed: { species, kg }, listing: enrichListing(listing, store) });
});

app.patch("/api/listings/:listingId/verify", (req, res) => {
  const store = readStore();
  const listing = store.listings.find((l) => l.id === req.params.listingId);
  if (!listing) return res.status(404).json({ error: "not found" });
  listing.status = "verified";
  if (req.body && req.body.pricePerKg != null) listing.pricePerKg = Number(req.body.pricePerKg);
  writeStore(store);
  res.json(enrichListing(listing, store));
});

app.patch("/api/listings/:listingId", (req, res) => {
  const store = readStore();
  const listing = store.listings.find((l) => l.id === req.params.listingId);
  if (!listing) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  if (b.kg != null) listing.kg = Math.max(0, Number(b.kg));
  if (b.pricePerKg != null) listing.pricePerKg = Number(b.pricePerKg);
  if (b.status && ["pending", "verified", "sold", "archived"].includes(b.status)) listing.status = b.status;
  writeStore(store);
  res.json(enrichListing(listing, store));
});

function enrichListing(l, store) {
  const cluster = store.clusters.find((c) => c.id === l.cluster);
  const guide = suggestPrice(l.species, store);
  const etaHours = l.freshness === "Live to chilled" ? 6 : 4;
  const catchTime = new Date(l.catchTime);
  const eta = new Date(catchTime.getTime() + etaHours * 3600 * 1000);
  return {
    ...l,
    clusterLabel: cluster ? cluster.name : l.cluster,
    clusterTier: cluster?.tier,
    priceSuggestion: guide,
    tracking: {
      catchTime: l.catchTime,
      sourceLocation: l.sourceLocation,
      estimatedHandoff: eta.toISOString()
    }
  };
}

app.get("/api/orders", (_req, res) => {
  const store = readStore();
  res.json(store.orders);
});

app.post("/api/orders", (req, res) => {
  const store = readStore();
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
    expanded.push({
      listingId: listing.id,
      farmerName: listing.farmerName,
      species: listing.species,
      kg
    });
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
    lines: expanded
  };
  store.orders.unshift(order);
  writeStore(store);
  res.status(201).json(order);
});

app.patch("/api/orders/:orderId/status", (req, res) => {
  const store = readStore();
  const order = store.orders.find((o) => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "not found" });
  const st = String((req.body && req.body.status) || "");
  if (!["new", "processing", "fulfilled", "cancelled"].includes(st)) {
    return res.status(400).json({ error: "invalid status" });
  }
  order.status = st;
  writeStore(store);
  res.json(order);
});

app.get("/api/coordinator/summary", (_req, res) => {
  const store = readStore();
  const newOrders = store.orders.filter((o) => o.status === "new").length;
  const ongoing = store.deliveries.filter((d) => d.status !== "delivered").length;
  const alerts = store.alerts.filter((a) => !a.resolved).length;
  res.json({ newOrders, ongoingDeliveries: ongoing, alerts, updatedAt: new Date().toISOString() });
});

app.get("/api/deliveries", (_req, res) => {
  res.json(readStore().deliveries);
});

app.get("/api/alerts", (_req, res) => {
  res.json(readStore().alerts);
});

app.patch("/api/alerts/:alertId/resolve", (req, res) => {
  const store = readStore();
  const a = store.alerts.find((x) => x.id === req.params.alertId);
  if (!a) return res.status(404).json({ error: "not found" });
  a.resolved = true;
  writeStore(store);
  res.json(a);
});

app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use(express.static(path.join(ROOT, "public")));

const PORT = Number(process.env.PORT) || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`IsdaHub PH serving http://localhost:${PORT}`);
  });
}

module.exports = app;
