const navToggle = document.querySelector(".nav-toggle");
const sidebar = document.querySelector("#sidebar");
const navLinks = document.querySelectorAll(".sidebar-nav a");

if (navToggle && sidebar) {
  navToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    sidebar?.classList.remove("open");
  });
});
