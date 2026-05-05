const { getStore } = require("../_store");
const { enrichListing, suggestPrice } = require("../_helpers");

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = (req, res) => {
  const store = getStore();

  if (req.method === "POST") {
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
      smsRaw: text
    };
    store.listings.push(listing);
    return res.status(201).json({ parsed: { species, kg }, listing: enrichListing(listing, store) });
  }

  res.status(405).json({ error: "Method not allowed" });
};
