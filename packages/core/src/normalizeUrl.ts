export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    const params = parsed.searchParams;
    const sorted = [...params.keys()].sort();
    parsed.search = "";
    for (const key of sorted) {
      const val = params.get(key);
      if (val !== null) parsed.searchParams.append(key, val);
    }
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return url.trim();
  }
}
