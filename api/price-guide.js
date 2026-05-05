const { getStore } = require("./_store");

module.exports = (req, res) => {
  const store = getStore();

  if (req.method === "GET") {
    return res.json(store.priceGuide);
  }

  if (req.method === "PUT") {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({ error: "Expected JSON array of { species, minPerKg, maxPerKg }" });
    }
    store.priceGuide = body
      .map((r) => ({
        species: String(r.species || "").trim(),
        minPerKg: Number(r.minPerKg),
        maxPerKg: Number(r.maxPerKg)
      }))
      .filter((r) => r.species && Number.isFinite(r.minPerKg) && Number.isFinite(r.maxPerKg));
    return res.json(store.priceGuide);
  }

  res.status(405).json({ error: "Method not allowed" });
};
