const { getStore } = require("../../_store");

module.exports = (req, res) => {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const store = getStore();
  const { alertId } = req.query;
  const a = store.alerts.find((x) => x.id === alertId);
  if (!a) return res.status(404).json({ error: "not found" });
  a.resolved = true;
  return res.json(a);
};
