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

  listing.status = "verified";
  if (req.body && req.body.pricePerKg != null) listing.pricePerKg = Number(req.body.pricePerKg);
  return res.json(enrichListing(listing, store));
};
