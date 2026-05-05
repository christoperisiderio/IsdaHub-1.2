const { getStore } = require("../../_store");

module.exports = (req, res) => {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const store = getStore();
  const { orderId } = req.query;
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: "not found" });

  const st = String((req.body && req.body.status) || "");
  if (!["new", "processing", "fulfilled", "cancelled"].includes(st)) {
    return res.status(400).json({ error: "invalid status" });
  }
  order.status = st;
  return res.json(order);
};
