export function resolveStaticResponseHeaders(
  requestPath: string,
  contentType: string,
): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": contentType };
  const isHtml = contentType.startsWith("text/html");
  const isFont = contentType.startsWith("font/");
  const isHashedViteAsset = /^\/assets\/(?:.*\/)?[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9.]+$/.test(requestPath);

  if (isHtml) {
    headers["Cache-Control"] = "no-cache";
  } else if (isFont || isHashedViteAsset) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  return headers;
}
