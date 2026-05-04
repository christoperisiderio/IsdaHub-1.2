const API = "";

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDateHeader() {
  const d = new Date();
  document.getElementById("coord-date").textContent = `📅 ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  document.getElementById("coord-time").textContent = `🕙 ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

async function fetchJson(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function clusterClass(id) {
  if (id === "carmen") return "c1";
  if (id === "nasipit") return "c2";
  if (id === "buenavista") return "c3";
  return "c1";
}

function clusterLabel(id, metaClusters) {
  const c = metaClusters?.find((x) => x.id === id);
  return c ? c.name : id;
}

let metaClusters = [];

async function loadSummary() {
  const s = await fetchJson("/api/coordinator/summary");
  document.getElementById("metric-new-orders").textContent = String(s.newOrders);
  document.getElementById("metric-ongoing").textContent = String(s.ongoingDeliveries);
  document.getElementById("metric-alerts").textContent = String(s.alerts);
}

function orderLinesHtml(order) {
  return order.lines
    .map((l) => `${escapeHtml(l.species)} (${escapeHtml(String(l.kg))} kg) · ${escapeHtml(l.farmerName)}`)
    .join("<br />");
}

async function loadOrders() {
  const orders = await fetchJson("/api/orders");
  const body = document.getElementById("new-orders-body");
  body.innerHTML = "";
  const news = orders.filter((o) => o.status === "new");
  if (!news.length) {
    body.innerHTML = `<div class="trow new-orders-row empty-hint">No new orders. Buyers will appear here after checkout.</div>`;
    return;
  }
  for (const o of news) {
    const row = document.createElement("div");
    row.className = "trow new-orders-row";
    row.innerHTML = `
      <span>${o.id}</span>
      <span>${escapeHtml(o.buyerName)}</span>
      <span>${orderLinesHtml(o)}</span>
      <span><i class="cluster ${clusterClass(o.cluster)}">${escapeHtml(clusterLabel(o.cluster, metaClusters))}</i></span>
      <button type="button" class="btn btn-primary" data-process="${escapeHtml(o.id)}">Process Order</button>`;
    body.appendChild(row);
  }
  body.querySelectorAll("[data-process]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-process");
      try {
        await fetchJson(`/api/orders/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "processing" })
        });
        await refreshAll();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

function badgeClass(status) {
  if (status === "picked_up") return "yellow";
  if (status === "on_the_way") return "blue";
  if (status === "assigned") return "violet";
  return "blue";
}

function badgeLabel(status) {
  const map = { picked_up: "Picked Up", on_the_way: "On the Way", assigned: "Assigned", delivered: "Delivered" };
  return map[status] || status;
}

async function loadDeliveries() {
  const list = await fetchJson("/api/deliveries");
  const body = document.getElementById("deliveries-body");
  body.innerHTML = "";
  if (!list.length) {
    body.innerHTML = `<div class="trow delivery-row empty-hint">No delivery rows yet. Add in data/store.json or extend API.</div>`;
    return;
  }
  for (const d of list) {
    const row = document.createElement("div");
    row.className = "trow delivery-row";
    row.innerHTML = `
      <span>${escapeHtml(d.orderId)}</span>
      <span>${escapeHtml(d.farmerName)}</span>
      <span>${escapeHtml(d.riderName)}</span>
      <span><i class="cluster ${clusterClass(d.cluster)}">${escapeHtml(clusterLabel(d.cluster, metaClusters))}</i></span>
      <span class="badge ${badgeClass(d.status)}">${badgeLabel(d.status)}</span>
      <span>${fmtTime(d.updatedAt)}</span>
      <span class="dual-btn"><button type="button" class="btn btn-soft">Call</button><button type="button" class="btn btn-success">Mark Delivered</button></span>`;
    body.appendChild(row);
  }
}

async function loadAlerts() {
  const alerts = await fetchJson("/api/alerts");
  const body = document.getElementById("alerts-body");
  body.innerHTML = "";
  const open = alerts.filter((a) => !a.resolved);
  if (!open.length) {
    body.innerHTML = `<div class="alert-item"><b>✓</b><div><strong>All clear</strong><small>No open alerts</small></div><span></span><span></span></div>`;
    return;
  }
  for (const a of open) {
    const div = document.createElement("div");
    div.className = "alert-item";
    div.innerHTML = `<b>⚠️</b><div><strong>${escapeHtml(a.message)}</strong><small>${escapeHtml(a.detail)}</small></div><span>${fmtTime(a.createdAt)}</span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline";
    btn.textContent = "Resolve";
    btn.addEventListener("click", async () => {
      await fetchJson(`/api/alerts/${encodeURIComponent(a.id)}/resolve`, { method: "PATCH" });
      await refreshAll();
    });
    div.appendChild(btn);
    body.appendChild(div);
  }
}

async function loadPriceGuide() {
  const rows = await fetchJson("/api/price-guide");
  const ul = document.getElementById("price-guide-list");
  ul.innerHTML = "";
  const head = document.createElement("li");
  head.innerHTML = "<span>Fish Type</span><span>Suggested Range (per kg)</span>";
  ul.appendChild(head);
  for (const r of rows) {
    const li = document.createElement("li");
    li.dataset.species = r.species;
    li.innerHTML = `<span>${escapeHtml(r.species)}</span><span class="price-edit-wrap"><input class="price-in" type="number" value="${r.minPerKg}" aria-label="Min" /> – <input class="price-in" type="number" value="${r.maxPerKg}" aria-label="Max" /></span>`;
    ul.appendChild(li);
  }
}

document.getElementById("save-price-guide")?.addEventListener("click", async () => {
  const items = [...document.querySelectorAll("#price-guide-list li")].slice(1);
  const payload = items.map((li) => {
    const [minEl, maxEl] = li.querySelectorAll(".price-in");
    return {
      species: li.dataset.species,
      minPerKg: Number(minEl.value),
      maxPerKg: Number(maxEl.value)
    };
  });
  try {
    await fetchJson("/api/price-guide", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    document.getElementById("price-guide-updated").textContent = `Saved · ${new Date().toLocaleString()}`;
  } catch (e) {
    alert(e.message);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadMeta() {
  const meta = await fetchJson("/api/meta");
  metaClusters = meta.clusters || [];
}

async function loadPendingListings() {
  const rows = await fetchJson("/api/listings?status=pending");
  const body = document.getElementById("pending-listings-body");
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<div class="trow pending-row empty-hint">No listings awaiting verification.</div>`;
    return;
  }
  for (const l of rows) {
    const tr = document.createElement("div");
    tr.className = "trow pending-row";
    tr.innerHTML = `
      <span>${escapeHtml(l.farmerName)}</span>
      <span>${escapeHtml(l.species)}</span>
      <span>${escapeHtml(String(l.kg))}</span>
      <span><i class="cluster ${clusterClass(l.cluster)}">${escapeHtml(l.clusterLabel || l.cluster)}</i></span>
      <span>${escapeHtml(l.channel)}</span>
      <span><button type="button" class="btn btn-success" data-verify="${escapeHtml(l.id)}">Verify</button></span>`;
    body.appendChild(tr);
  }
  body.querySelectorAll("[data-verify]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-verify");
      try {
        await fetchJson(`/api/listings/${encodeURIComponent(id)}/verify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        await refreshAll();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

async function refreshAll() {
  fmtDateHeader();
  await loadMeta();
  await Promise.all([loadSummary(), loadOrders(), loadDeliveries(), loadAlerts(), loadPriceGuide(), loadPendingListings()]);
}

const navToggle = document.querySelector(".nav-toggle");
const sidebar = document.querySelector("#sidebar");
const navLinks = document.querySelectorAll(".sidebar-nav a");

if (navToggle && sidebar) {
  navToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

navLinks.forEach((link) => {
  if (link.getAttribute("href")?.startsWith("./")) return;
  link.addEventListener("click", () => {
    sidebar?.classList.remove("open");
  });
});

document.querySelector(".close-guide")?.addEventListener("click", () => {
  document.querySelector(".guide-panel")?.classList.toggle("collapsed");
});

["qa-add-fisher", "qa-find-rider", "qa-send-msg", "qa-broadcast"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", () => {
    alert("Demo: this action would open your operations workflow (SMS, rider roster, or broadcast).");
  });
});

document.getElementById("alerts-refresh")?.addEventListener("click", (e) => {
  e.preventDefault();
  refreshAll();
});

document.getElementById("reload-pending")?.addEventListener("click", () => loadPendingListings().catch((e) => alert(e.message)));

refreshAll().catch((err) => {
  console.error(err);
  document.getElementById("new-orders-body").innerHTML = `<div class="trow empty-hint">Could not reach API. Run <code>npm start</code> in this folder and open the site from http://localhost:3000</div>`;
});
