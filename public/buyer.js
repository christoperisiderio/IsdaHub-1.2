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

let clusters = [];
const cart = new Map();

let buyerName = localStorage.getItem("isdahub_buyer_name") || "Ana Reyes";

function fillClusterFilters() {
  const f = document.getElementById("filter-cluster");
  const c = document.getElementById("checkout-cluster");
  f.innerHTML = `<option value="">All clusters</option>`;
  c.innerHTML = "";
  clusters.forEach((cl) => {
    const o1 = document.createElement("option");
    o1.value = cl.id;
    o1.textContent = cl.name;
    f.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = cl.id;
    o2.textContent = `${cl.name} (${cl.tier})`;
    c.appendChild(o2);
  });
}

function renderCart() {
  const body = document.getElementById("cart-body");
  body.innerHTML = "";
  let kg = 0;
  if (!cart.size) {
    body.innerHTML = `<p class="muted-block">Tap “Add” on a listing to group items per fisherman before checkout.</p>`;
  } else {
    cart.forEach((line, listingId) => {
      kg += line.kg;
      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `
        <div><strong>${escapeHtml(line.species)}</strong><small>${escapeHtml(line.farmerName)} · ${escapeHtml(line.clusterLabel)}</small></div>
        <div class="cart-qty">
          <label>kg<input type="number" step="0.1" min="0.1" max="${line.maxKg}" value="${line.kg}" data-id="${escapeHtml(listingId)}" /></label>
          <button type="button" class="btn btn-outline btn-sm" data-remove="${escapeHtml(listingId)}">Remove</button>
        </div>`;
      body.appendChild(row);
    });
    body.querySelectorAll("input[data-id]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.getAttribute("data-id");
        const line = cart.get(id);
        if (!line) return;
        let v = Number(inp.value);
        if (!Number.isFinite(v)) v = line.kg;
        v = Math.min(line.maxKg, Math.max(0.1, v));
        line.kg = v;
        inp.value = String(v);
        renderCart();
      });
    });
    body.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cart.delete(btn.getAttribute("data-remove"));
        renderCart();
      });
    });
  }
  document.getElementById("cart-pill").textContent = `Cart: ${Math.round(kg * 10) / 10} kg`;
}

function addToCart(listing) {
  const maxKg = listing.kg;
  const existing = cart.get(listing.id);
  const kg = existing ? Math.min(maxKg, existing.kg + 1) : Math.min(maxKg, 1);
  cart.set(listing.id, {
    listingId: listing.id,
    species: listing.species,
    farmerName: listing.farmerName,
    clusterLabel: listing.clusterLabel,
    kg,
    maxKg
  });
  renderCart();
}

async function loadListings() {
  const cluster = document.getElementById("filter-cluster").value;
  const species = document.getElementById("filter-species").value.trim();
  const minKg = document.getElementById("filter-kg").value;
  const fresh = document.getElementById("filter-fresh").value;
  const qs = new URLSearchParams({ buyer: "1" });
  if (cluster) qs.set("cluster", cluster);
  if (species) qs.set("species", species);
  const list = await fetchJson(`/api/listings?${qs.toString()}`);
  const grid = document.getElementById("listing-grid");
  grid.innerHTML = "";
  const filtered = list.filter((l) => {
    if (fresh && l.freshness !== fresh) return false;
    if (minKg && Number(minKg) > 0 && l.kg < Number(minKg)) return false;
    return true;
  });
  if (!filtered.length) {
    grid.innerHTML = `<div class="panel empty-hint">No verified listings match these filters.</div>`;
    return;
  }
  for (const l of filtered) {
    const card = document.createElement("article");
    card.className = "listing-card panel";
    card.innerHTML = `
      <header><h3>${escapeHtml(l.species)}</h3><span class="cluster-pill">${escapeHtml(l.clusterLabel)}</span></header>
      <p class="listing-meta"><strong>${escapeHtml(String(l.kg))} kg</strong> · ₱${escapeHtml(String(l.pricePerKg))}/kg · ${escapeHtml(l.freshness)}</p>
      <p class="listing-farmer">Fisher: <strong>${escapeHtml(l.farmerName)}</strong></p>
      <dl class="track-dl">
        <div><dt>Catch time</dt><dd>${escapeHtml(fmt(l.catchTime))}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(l.sourceLocation)}</dd></div>
        <div><dt>Est. handoff</dt><dd>${escapeHtml(fmt(l.tracking?.estimatedHandoff))}</dd></div>
      </dl>
      <button type="button" class="btn btn-primary btn-block" data-add="${escapeHtml(l.id)}">Add to cart</button>`;
    grid.appendChild(card);
    card.querySelector("[data-add]")?.addEventListener("click", () => addToCart(l));
  }
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

document.getElementById("btn-apply-filters")?.addEventListener("click", () => loadListings().catch((e) => alert(e.message)));

document.getElementById("cart-clear")?.addEventListener("click", () => {
  cart.clear();
  renderCart();
});

document.getElementById("checkout-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!cart.size) {
    alert("Cart is empty.");
    return;
  }
  const name = document.getElementById("checkout-name").value.trim() || buyerName;
  const cluster = document.getElementById("checkout-cluster").value;
  const deliveryMode = document.querySelector('input[name="deliveryMode"]:checked')?.value || "delivery";
  const lines = [...cart.values()].map((c) => ({ listingId: c.listingId, kg: c.kg }));
  try {
    await fetchJson("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyerName: name, cluster, deliveryMode, lines })
    });
    cart.clear();
    renderCart();
    await loadOrders();
    await loadListings();
    alert("Order placed. Coordinator will see it under New Orders.");
  } catch (err) {
    alert(err.message);
  }
});

async function loadOrders() {
  const orders = await fetchJson("/api/orders");
  const mine = orders.filter((o) => o.buyerName === buyerName);
  const body = document.getElementById("orders-body");
  body.innerHTML = "";
  if (!mine.length) {
    body.innerHTML = `<p class="muted-block">No orders for <strong>${escapeHtml(buyerName)}</strong> yet.</p>`;
    return;
  }
  mine.forEach((o) => {
    const div = document.createElement("div");
    div.className = "order-card";
    const lines = o.lines.map((l) => `<li>${escapeHtml(l.species)} ${escapeHtml(String(l.kg))} kg · ${escapeHtml(l.farmerName)}</li>`).join("");
    div.innerHTML = `
      <div class="order-head"><strong>${escapeHtml(o.id)}</strong><span class="badge ${o.status === "new" ? "yellow" : "blue"}">${escapeHtml(o.status)}</span></div>
      <ul class="order-lines">${lines}</ul>
      <small>${escapeHtml(o.deliveryMode)} · cluster ${escapeHtml(o.cluster)}</small>`;
    body.appendChild(div);
  });
}

document.getElementById("orders-refresh")?.addEventListener("click", () => loadOrders().catch(console.error));

const navToggle = document.querySelector(".nav-toggle");
const sidebar = document.querySelector("#sidebar");
navToggle?.addEventListener("click", () => sidebar?.classList.toggle("open"));
document.querySelectorAll(".sidebar-nav a").forEach((link) => {
  if (link.getAttribute("href")?.startsWith("./")) return;
  link.addEventListener("click", () => sidebar?.classList.remove("open"));
});

function syncBuyerUi() {
  document.getElementById("buyer-name-display").textContent = buyerName;
  document.getElementById("checkout-name").value = buyerName;
  document.getElementById("buyer-av").textContent = buyerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

document.getElementById("checkout-name")?.addEventListener("change", (e) => {
  buyerName = e.target.value.trim() || buyerName;
  localStorage.setItem("isdahub_buyer_name", buyerName);
  syncBuyerUi();
  loadOrders();
});

async function boot() {
  try {
    const meta = await fetchJson("/api/meta");
    clusters = meta.clusters || [];
    fillClusterFilters();
    syncBuyerUi();
    await loadListings();
    await loadOrders();
    renderCart();
  } catch (err) {
    console.error(err);
    document.getElementById("listing-grid").innerHTML =
      `<div class="panel empty-hint">Cannot reach API. Run <code>npm start</code> and open http://localhost:3000/buyer.html</div>`;
  }
}

boot();
