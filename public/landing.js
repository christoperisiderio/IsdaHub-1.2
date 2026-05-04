const toggle = document.querySelector(".landing-nav-toggle");
const nav = document.getElementById("landing-nav");

toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
});

document.querySelectorAll(".landing-nav a").forEach((a) => {
  if (a.getAttribute("href")?.startsWith("#")) {
    a.addEventListener("click", () => {
      nav?.classList.remove("open");
      toggle?.setAttribute("aria-expanded", "false");
    });
  }
});

async function boot() {
  const hint = document.getElementById("api-hint");
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("bad status");
    const j = await res.json();
    hint.textContent = `Live API: ${j.name} · ${new Date(j.time).toLocaleTimeString()}`;
    hint.classList.add("ok");
    const meta = await fetch("/api/meta").then((r) => r.json());
    const ul = document.getElementById("cluster-chips");
    ul.innerHTML = "";
    (meta.clusters || []).forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.tier)}</small>`;
      ul.appendChild(li);
    });
  } catch {
    hint.textContent =
      "API offline — open this site via http://localhost:3000 after running npm start in the project folder.";
    hint.classList.add("warn");
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

boot();
