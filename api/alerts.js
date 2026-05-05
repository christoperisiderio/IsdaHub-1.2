const { getStore } = require("./_store");

module.exports = (req, res) => {
  res.json(getStore().alerts);
};
