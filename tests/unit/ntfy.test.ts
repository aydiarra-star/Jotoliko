import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { sendNtfyNotification, validateNtfyUrl } from "../../ops/lib/ntfy.mjs";

let server: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    server = undefined;
  }
});

it("refuse HTTP public et URL sans sujet", () => {
  expect(() => validateNtfyUrl("http://example.org/topic-secret")).toThrow(/HTTPS/);
  expect(() => validateNtfyUrl("https://ntfy.sh/")).toThrow(/sujet précis/);
  expect(() => validateNtfyUrl("https://user:password@ntfy.sh/topic-secret")).toThrow(/identifiants/);
});

it("envoie un message texte sans afficher ni modifier l'URL cible", async () => {
  let received: { method?: string; body: string; title?: string; contentType?: string } | undefined;
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = {
        method: request.method,
        body: Buffer.concat(chunks).toString("utf8"),
        title: request.headers["x-title"] as string | undefined,
        contentType: request.headers["content-type"],
      };
      response.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Adresse de test indisponible");

  const result = await sendNtfyNotification(
    `http://127.0.0.1:${address.port}/topic-test-secret`,
    "Jotoliko — service dégradé",
    { title: "Alerte de test", timeoutMs: 1000 }
  );

  expect(result.delivered).toBe(true);
  expect(received).toMatchObject({
    method: "POST",
    body: "Jotoliko — service dégradé",
    title: "Alerte de test",
    contentType: "text/plain; charset=utf-8",
  });
});
