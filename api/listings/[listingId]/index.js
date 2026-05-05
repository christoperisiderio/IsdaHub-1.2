const { getStore } = require("../../_store");
const { enrichListing } = require("../../_helpers");

module.exports = (req, res) => {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const store = getStore();
  const { listingId } = req.query;
  const listing = store.listings.find((l) => l.id === listingId);
  if (!listing) return res.status(404).json({ error: "not found" });

  const b = req.body || {};
  if (b.kg != null) listing.kg = Math.max(0, Number(b.kg));
  if (b.pricePerKg != null) listing.pricePerKg = Number(b.pricePerKg);
  if (b.status && ["pending", "verified", "sold", "archived"].includes(b.status)) listing.status = b.status;
  return res.json(enrichListing(listing, store));
};
