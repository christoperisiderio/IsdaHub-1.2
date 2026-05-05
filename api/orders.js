const { getStore } = require("./_store");

function orderNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ORD-${y}${m}${day}-${String(Math.floor(Math.random() * 900) + 100).padStart(3, "0")}`;
}

module.exports = (req, res) => {
  const store = getStore();

  if (req.method === "GET") {
    return res.json(store.orders);
  }

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
    return res.status(201).json(order);
  }

  res.status(405).json({ error: "Method not allowed" });
};
