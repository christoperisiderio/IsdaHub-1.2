const { getStore } = require("../_store");

module.exports = (req, res) => {
  const store = getStore();
  const newOrders = store.orders.filter((o) => o.status === "new").length;
  const ongoing = store.deliveries.filter((d) => d.status !== "delivered").length;
  const alerts = store.alerts.filter((a) => !a.resolved).length;
  res.json({ newOrders, ongoingDeliveries: ongoing, alerts, updatedAt: new Date().toISOString() });
};
