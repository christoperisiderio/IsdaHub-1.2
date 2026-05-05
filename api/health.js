module.exports = (req, res) => {
  res.json({ ok: true, name: "IsdaHub PH API", time: new Date().toISOString() });
};
