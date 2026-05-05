const { getStore } = require("./_store");

function suggestPrice(species, store) {
  const row = store.priceGuide.find(
    (p) => p.species.toLowerCase() === String(species).toLowerCase()
  );
  if (!row) return null;
  return { minPerKg: row.minPerKg, maxPerKg: row.maxPerKg, midpoint: Math.round((row.minPerKg + row.maxPerKg) / 2) };
}

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

module.exports = { suggestPrice, enrichListing };
