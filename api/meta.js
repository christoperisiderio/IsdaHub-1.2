const { getStore } = require("./_store");

module.exports = (req, res) => {
  const store = getStore();
  res.json({
    clusters: store.clusters,
    priceGuide: store.priceGuide,
    tagline: "Fair Catch. Fair Price. Fast Delivery.",
    scope: "Agusan del Norte — BFAR-aligned cluster logistics (no map routing; cluster-based matching)."
  });
};
