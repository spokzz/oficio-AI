export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function statusPill(status, language = "es") {
  const map = {
    confirmed: [language === "es" ? "Confirmada" : "Confirmed", "success"],
    pending: [language === "es" ? "Pendiente" : "Pending", "warn"],
    Live: ["Live", "success"],
    Onboarding: ["Onboarding", "info"],
    "Needs review": ["Needs review", "danger"]
  };
  const [label, tone] = map[status] ?? [status, "info"];
  return `<span class="pill ${tone}">${label}</span>`;
}

export function toast(message) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2500);
}

export function bindNav(render) {
  $all("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      $all("[data-view]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      render(button.dataset.view);
    });
  });
}
