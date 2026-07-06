// ============================================================================
// Client-side image handling
// ----------------------------------------------------------------------------
// We store pictures as compressed base64 data URLs directly in Postgres (keeps
// setup to zero — no Storage bucket / policies needed). To keep rows small we
// downscale + re-encode as JPEG before saving.
// ============================================================================

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
