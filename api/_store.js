/**
 * In-memory store for Vercel serverless functions.
 * Vercel's filesystem is read-only at runtime — we seed from the bundled
 * store.json and keep all mutations in module-level memory.
 * State resets on cold starts, which is fine for this demo.
 */
const path = require("path");
const seed = require(path.join(__dirname, "../data/store.json"));

// Deep-clone seed so we never mutate the require() cache directly
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

const state = clone(seed);

function getStore() {
  return state;
}

module.exports = { getStore };
