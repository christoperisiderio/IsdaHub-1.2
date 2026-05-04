const API = "";

async function fetchJson(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let priceGuide = [];
let clusters = [];
let sessionFarmer = localStorage.getItem("isdahub_farmer_name") || "Maria Santos";

function fillClusterSelects() {
  const a = document.getElementById("farmer-cluster-select");
  const b = document.getElementById("sms-cluster-select");
  [a, b].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    clusters.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.name} — ${c.tier}`;
      sel.appendChild(o);
    });
  });
}

function fillSpeciesDatalist() {
  const dl = document.getElementById("species-list");
  dl.innerHTML = "";
  priceGuide.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.species;
    dl.appendChild(o);
  });
}

function suggestForSpecies(species) {
  const row = priceGuide.find((p) => p.species.toLowerCase() === String(species).toLowerCase());
  if (!row) return null;
  return Math.round((row.minPerKg + row.maxPerKg) / 2);
}

function wirePriceHint() {
  const speciesInput = document.querySelector('#form-listing [name="species"]');
  const priceInput = document.querySelector('#form-listing [name="pricePerKg"]');
  const hint = document.getElementById("price-hint");
  const sync = () => {
    const mid = suggestForSpecies(speciesInput.value);
    hint.textContent = mid ? `Suggested midpoint: ₱${mid}/kg (from today’s guide).` : "Enter species to see a suggested midpoint.";
  };
  speciesInput?.addEventListener("input", sync);
  sync();
  document.getElementById("btn-suggest-price")?.addEventListener("click", () => {
    const mid = suggestForSpecies(speciesInput.value);
    if (mid) priceInput.value = String(mid);
  });
}

async function loadMeta() {
  const meta = await fetchJson("/api/meta");
  clusters = meta.clusters || [];
  priceGuide = meta.priceGuide || [];
  fillClusterSelects();
  fillSpeciesDatalist();
  const ul = document.getElementById("farmer-price-list");
  ul.innerHTML = "";
  const head = document.createElement("li");
  head.innerHTML = "<span>Fish Type</span><span>Suggested Range (per kg)</span>";
  ul.appendChild(head);
  priceGuide.forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(r.species)}</span><strong>₱${r.minPerKg} - ₱${r.maxPerKg}</strong>`;
    ul.appendChild(li);
  });
}

async function loadListings() {
  const mine = await fetchJson("/api/listings");
  const filtered = mine.filter((l) => l.farmerName === sessionFarmer);
  const active = filtered.filter((l) => l.status !== "archived" && l.kg > 0);
  document.getElementById("m-active").textContent = String(active.length);
  document.getElementById("m-pending").textContent = String(filtered.filter((l) => l.status === "pending").length);
  document.getElementById("m-verified").textContent = String(filtered.filter((l) => l.status === "verified").length);

  const body = document.getElementById("farmer-listings-body");
  body.innerHTML = "";
  const rows = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!rows.length) {
    body.innerHTML = `<div class="trow farmer-list-row empty-hint">No listings yet for <strong>${escapeHtml(sessionFarmer)}</strong>. Submit a listing above or change the demo name in settings.</div>`;
    return;
  }
  for (const l of rows) {
    const tr = document.createElement("div");
    tr.className = "trow farmer-list-row";
    const st = l.status === "verified" ? "badge blue" : l.status === "pending" ? "badge yellow" : "badge violet";
    tr.innerHTML = `
      <span>${escapeHtml(l.species)}</span>
      <span>${escapeHtml(String(l.kg))}</span>
      <span>₱${escapeHtml(String(l.pricePerKg))}</span>
      <span>${escapeHtml(l.clusterLabel || l.cluster)}</span>
      <span>${escapeHtml(l.freshness)}</span>
      <span class="${st}">${escapeHtml(l.status)}</span>
      <span class="track-cell"><small>Catch</small> ${escapeHtml(fmtShort(l.catchTime))}<br /><small>ETA handoff</small> ${escapeHtml(fmtShort(l.tracking?.estimatedHandoff))}</span>`;
    body.appendChild(tr);
  }
}

function fmtShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

document.getElementById("form-listing")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get("farmerName") || "").trim() || sessionFarmer;
  sessionFarmer = name;
  localStorage.setItem("isdahub_farmer_name", sessionFarmer);
  applySessionUi();
  const payload = {
    farmerName: name,
    farmerPhone: fd.get("farmerPhone"),
    cluster: fd.get("cluster"),
    species: fd.get("species"),
    kg: Number(fd.get("kg")),
    freshness: fd.get("freshness"),
    catchTime: fd.get("catchTime") || undefined,
    sourceLocation: fd.get("sourceLocation"),
    pricePerKg: Number(fd.get("pricePerKg")),
    channel: "app"
  };
  try {
    await fetchJson("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    e.target.reset();
    wirePriceHint();
    await loadListings();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("form-sms")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const out = document.getElementById("sms-result");
  try {
    const r = await fetchJson("/api/listings/sms-simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: fd.get("text"),
        farmerName: fd.get("farmerName"),
        farmerPhone: fd.get("farmerPhone"),
        cluster: fd.get("cluster")
      })
    });
    out.hidden = false;
    out.textContent = JSON.stringify(r, null, 2);
    await loadListings();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("reload-listings")?.addEventListener("click", () => loadListings().catch(console.error));

const navToggle = document.querySelector(".nav-toggle");
const sidebar = document.querySelector("#sidebar");
navToggle?.addEventListener("click", () => sidebar?.classList.toggle("open"));
document.querySelectorAll(".sidebar-nav a").forEach((link) => {
  if (link.getAttribute("href")?.startsWith("./")) return;
  link.addEventListener("click", () => sidebar?.classList.remove("open"));
});

function applySessionUi() {
  document.getElementById("farmer-display-name").textContent = sessionFarmer;
  document.getElementById("farmer-greeting").textContent = `Magandang umaga, ${sessionFarmer.split(" ")[0]}!`;
  const first = sessionFarmer.slice(0, 2).toUpperCase();
  document.getElementById("farmer-avatar").textContent = first;
  const pill = document.getElementById("farmer-cluster-pill");
  const sel = document.getElementById("farmer-cluster-select");
  if (sel?.value) pill.textContent = `Cluster focus: ${clusters.find((c) => c.id === sel.value)?.name || sel.value}`;
}

document.getElementById("farmer-cluster-select")?.addEventListener("change", applySessionUi);

async function boot() {
  try {
    await loadMeta();
    document.querySelector('#form-listing [name="farmerName"]').value = sessionFarmer;
    document.querySelector('#form-listing [name="farmerName"]').addEventListener("change", (e) => {
      sessionFarmer = String(e.target.value || "").trim() || sessionFarmer;
      localStorage.setItem("isdahub_farmer_name", sessionFarmer);
      applySessionUi();
      loadListings();
    });
    wirePriceHint();
    applySessionUi();
    await loadListings();
  } catch (err) {
    console.error(err);
    document.getElementById("farmer-listings-body").innerHTML =
      `<div class="trow empty-hint">Cannot reach API. From the project folder run <code>npm start</code> and open http://localhost:3000/farmer.html</div>`;
  }
}

boot();
