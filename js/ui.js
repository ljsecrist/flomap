// ============================================================================
// Small DOM / UI helpers used across the app.
// ============================================================================

/** Create an element: el("div.card", { onclick }, ["text", childNode]) */
export function el(spec, attrs = {}, children = []) {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k in node && k !== "list") { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/** Avatar image node, or a colored initial fallback. */
export function avatar(user, size = "md") {
  const name = user?.username || "?";
  if (user?.avatar_url) {
    const img = el("img.avatar." + size, { src: user.avatar_url, alt: name });
    return img;
  }
  const px = { sm: 34, md: 46, lg: 96 }[size] || 46;
  const node = el("span.avatar-fallback." + size, {
    style: `width:${px}px;height:${px}px;font-size:${Math.round(px / 2.4)}px`,
  }, [name[0].toUpperCase()]);
  return node;
}

let toastTimer;
export function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast" + (isError ? " err" : ""); }, 2600);
}

/**
 * Open a bottom-sheet modal. `build(closeFn)` returns the sheet's inner nodes.
 * Returns a close function.
 */
export function openSheet(title, build) {
  const root = document.getElementById("modal-root");
  const overlay = el("div.modal-overlay");
  const sheet = el("div.sheet");
  const close = () => { overlay.remove(); document.body.style.overflow = ""; };

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  sheet.append(el("div.sheet-grip"));
  if (title != null) {
    sheet.append(el("div.sheet-head", {}, [
      el("h2", {}, [title]),
      el("button.sheet-close", { onclick: close, "aria-label": "Close" }, ["✕"]),
    ]));
  }
  const body = el("div.sheet-body");
  sheet.append(body);
  for (const n of [].concat(build(close))) if (n) body.append(n);

  overlay.append(sheet);
  root.append(overlay);
  document.body.style.overflow = "hidden";
  return close;
}

/** Relative time like "just now", "3m", "2h", "Apr 5". */
export function timeAgo(iso) {
  const then = new Date(iso), now = new Date();
  const s = Math.round((now - then) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m";
  if (s < 86400) return Math.round(s / 3600) + "h";
  if (s < 604800) return Math.round(s / 86400) + "d";
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
export const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function prettyDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
