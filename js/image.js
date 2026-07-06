// ============================================================================
// Client-side image handling
// ----------------------------------------------------------------------------
// We store pictures as compressed base64 data URLs directly in Postgres (keeps
// setup to zero — no Storage bucket / policies needed). To keep rows small we
// downscale + re-encode as JPEG before saving.
// ============================================================================

import { el } from "./ui.js";

/**
 * Read a File from an <input type=file>, downscale so the longest edge is
 * <= maxEdge px, and return a compressed JPEG data URL.
 */
export function fileToDataURL(file, maxEdge = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be loaded."));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Open a square-crop editor for a chosen image file.
 * The user can drag to reposition and zoom with a slider (works with touch).
 * Resolves with a square JPEG data URL, or null if they cancel.
 */
export function cropImageFile(file, { size = 400, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be loaded."));
      img.onload = () => buildCropper(img, size, quality, resolve);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function buildCropper(img, outSize, quality, resolve) {
  const V = 280;                                   // viewport (CSS px)
  const nW = img.naturalWidth, nH = img.naturalHeight;
  const baseScale = V / Math.min(nW, nH);          // scale so image "covers" at s=1
  const minS = 1, maxS = 4;
  let s = 1;
  let tx = (V - nW * baseScale) / 2;               // center it
  let ty = (V - nH * baseScale) / 2;

  const picture = el("img", { src: img.src, alt: "crop", draggable: false });
  picture.style.cssText =
    `position:absolute;top:0;left:0;width:${nW * baseScale}px;height:${nH * baseScale}px;` +
    `transform-origin:0 0;will-change:transform;user-select:none;-webkit-user-drag:none`;

  const view = el("div.cropper-view");
  view.style.cssText = `position:relative;width:${V}px;height:${V}px;overflow:hidden;` +
    `border-radius:50%;touch-action:none;margin:0 auto;background:#000;cursor:grab`;
  view.append(picture, el("div.cropper-ring"));

  const zoom = el("input", { type: "range", min: "1", max: "4", step: "0.01", value: "1" });
  zoom.style.width = "100%";

  function clampAndApply() {
    const dispW = nW * baseScale * s, dispH = nH * baseScale * s;
    tx = Math.min(0, Math.max(V - dispW, tx));
    ty = Math.min(0, Math.max(V - dispH, ty));
    picture.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  }
  clampAndApply();

  // drag (pointer = mouse + touch)
  let dragging = false, sx0 = 0, sy0 = 0, tx0 = 0, ty0 = 0;
  view.addEventListener("pointerdown", (e) => {
    dragging = true; sx0 = e.clientX; sy0 = e.clientY; tx0 = tx; ty0 = ty;
    view.setPointerCapture(e.pointerId); view.style.cursor = "grabbing";
  });
  view.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    tx = tx0 + (e.clientX - sx0); ty = ty0 + (e.clientY - sy0);
    clampAndApply();
  });
  const endDrag = () => { dragging = false; view.style.cursor = "grab"; };
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", endDrag);

  // zoom (anchored to the viewport center)
  zoom.addEventListener("input", () => {
    const ns = Math.min(maxS, Math.max(minS, Number(zoom.value)));
    const cx = (V / 2 - tx) / (baseScale * s);     // natural coord under center
    const cy = (V / 2 - ty) / (baseScale * s);
    s = ns;
    tx = V / 2 - cx * baseScale * s;
    ty = V / 2 - cy * baseScale * s;
    clampAndApply();
  });

  const overlay = el("div.modal-overlay");
  const close = () => { overlay.remove(); document.body.style.overflow = ""; };

  const confirm = el("button.btn", {}, ["Use photo"]);
  confirm.addEventListener("click", () => {
    const srcScale = baseScale * s;
    const sxN = -tx / srcScale, syN = -ty / srcScale, sSize = V / srcScale;
    const canvas = document.createElement("canvas");
    canvas.width = outSize; canvas.height = outSize;
    canvas.getContext("2d").drawImage(img, sxN, syN, sSize, sSize, 0, 0, outSize, outSize);
    close();
    resolve(canvas.toDataURL("image/jpeg", quality));
  });
  const cancel = el("button.btn.ghost", { onclick: () => { close(); resolve(null); } }, ["Cancel"]);

  const sheet = el("div.sheet", {}, [
    el("div.sheet-grip"),
    el("div.sheet-head", {}, [ el("h2", {}, ["Position your photo"]) ]),
    view,
    el("div.field", { style: "margin-top:16px" }, [
      el("label", {}, ["Zoom"]), zoom,
    ]),
    el("p.small.muted.center", {}, ["Drag to reposition • slide to zoom"]),
    confirm,
    el("div.spacer"),
    cancel,
  ]);
  overlay.append(sheet);
  document.getElementById("modal-root").append(overlay);
  document.body.style.overflow = "hidden";
}
