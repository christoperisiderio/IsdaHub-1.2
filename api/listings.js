const { getStore } = require("./_store");
const { enrichListing, suggestPrice } = require("./_helpers");

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = (req, res) => {
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
      createdAt: new Date().toISOString()
    };
    if (!Number.isFinite(listing.pricePerKg) || listing.pricePerKg <= 0) {
      return res.status(400).json({ error: "pricePerKg required when no guide match" });
    }
    store.listings.push(listing);
    return res.status(201).json(enrichListing(listing, store));
  }

  res.status(405).json({ error: "Method not allowed" });
};
