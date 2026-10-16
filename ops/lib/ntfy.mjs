// Notifications push sans dépendance à GitHub ni fournisseur payant.
// Le sujet ntfy doit être long, aléatoire et traité comme un secret : les sujets
// publics peuvent être lus par toute personne qui connaît l'URL.
export function validateNtfyUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL ntfy invalide");
  }
  const localHttp = url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Les notifications ntfy exigent HTTPS");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("L'URL ntfy ne doit pas contenir d'identifiants ni de fragment");
  }
  if (!url.pathname || url.pathname === "/") {
    throw new Error("L'URL ntfy doit cibler un sujet précis");
  }
  return url;
}

export async function sendNtfyNotification(rawUrl, message, {
  title = "Jotoliko — alerte",
  priority = 4,
  timeoutMs = 5000,
} = {}) {
  const url = validateNtfyUrl(rawUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Title": String(title).slice(0, 120),
      "X-Priority": String(Math.max(1, Math.min(5, Number(priority) || 4))),
      "X-Tags": "warning",
    },
    body: String(message).slice(0, 3500),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Le service de notification a répondu HTTP ${response.status}`);
  }
  return { delivered: true, status: response.status };
}
