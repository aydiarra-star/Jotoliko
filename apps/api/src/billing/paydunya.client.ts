import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";

type PayDunyaMode = "sandbox" | "live";
type PayDunyaInvoiceCreated = {
  token: string;
  checkoutUrl: string;
};
type PayDunyaInvoiceStatus = "pending" | "completed" | "cancelled" | "failed" | "unknown";

type PayDunyaConfig = {
  mode: PayDunyaMode;
  masterKey: string;
  privateKey: string;
  token: string;
};

const API_BASE: Record<PayDunyaMode, string> = {
  sandbox: "https://app.paydunya.com/sandbox-api/v1",
  live: "https://app.paydunya.com/api/v1",
};
const CHECKOUT_HOSTS = new Set(["app.paydunya.com"]);

function readConfig(env: NodeJS.ProcessEnv = process.env): PayDunyaConfig {
  const mode = env.PAYDUNYA_MODE?.trim() || "sandbox";
  if (mode !== "sandbox" && mode !== "live") {
    throw new ServiceUnavailableException("PAYDUNYA_MODE doit être sandbox ou live.");
  }
  // Production is an explicit opt-in; sandbox is the safe default.
  if (mode === "live" && env.PAYDUNYA_ALLOW_LIVE !== "true") {
    throw new ServiceUnavailableException("Le mode PayDunya live nécessite PAYDUNYA_ALLOW_LIVE=true.");
  }
  const masterKey = env.PAYDUNYA_MASTER_KEY?.trim();
  const privateKey = env.PAYDUNYA_PRIVATE_KEY?.trim();
  const token = env.PAYDUNYA_TOKEN?.trim();
  if (!masterKey || !privateKey || !token) {
    throw new ServiceUnavailableException("Configuration PayDunya incomplète : aucun paiement n'a été lancé.");
  }
  return { mode, masterKey, privateKey, token };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function checkoutUrl(value: unknown): string {
  if (typeof value !== "string") throw new ServiceUnavailableException("URL de paiement PayDunya invalide.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ServiceUnavailableException("URL de paiement PayDunya invalide.");
  }
  if (parsed.protocol !== "https:" || !CHECKOUT_HOSTS.has(parsed.hostname)) {
    throw new ServiceUnavailableException("L'URL de paiement ne correspond pas au domaine officiel PayDunya.");
  }
  return parsed.toString();
}

/**
 * Client HTTP minimal PayDunya Checkout. Il ne confirme jamais un paiement et
 * n'active aucun compte : cette responsabilité appartient au service métier,
 * après confirmation serveur et transaction atomique.
 */
@Injectable()
export class PayDunyaClient {
  async createInvoice(input: {
    amountXof: number;
    description: string;
    customerName: string;
    customerEmail: string;
    callbackUrl: string;
    returnUrl: string;
    cancelUrl: string;
    reference: string;
  }): Promise<PayDunyaInvoiceCreated> {
    if (!Number.isSafeInteger(input.amountXof) || input.amountXof <= 0) {
      throw new ServiceUnavailableException("Montant de facture invalide.");
    }
    const config = readConfig();
    const base = API_BASE[config.mode];
    const response = await fetch(`${base}/checkout-invoice/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": config.masterKey,
        "PAYDUNYA-PRIVATE-KEY": config.privateKey,
        "PAYDUNYA-TOKEN": config.token,
      },
      body: JSON.stringify({
        invoice: {
          total_amount: input.amountXof,
          description: input.description,
          customer: { name: input.customerName, email: input.customerEmail },
        },
        store: { name: "Jotoliko" },
        custom_data: { signup_reference: input.reference },
        actions: {
          callback_url: input.callbackUrl,
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // Never include provider response bodies or credentials in public errors.
      throw new ServiceUnavailableException("PayDunya ne peut pas créer la facture pour le moment.");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceUnavailableException("Réponse PayDunya illisible.");
    }
    const data = asObject(body);
    if (!data || data.response_code !== "00" || typeof data.token !== "string" || !data.token) {
      throw new ServiceUnavailableException("PayDunya n'a pas confirmé la création de la facture.");
    }
    return {
      token: data.token,
      checkoutUrl: checkoutUrl(data.response_text),
    };
  }

  async confirmInvoice(invoiceToken: string): Promise<{
    status: PayDunyaInvoiceStatus;
    amountXof: number | null;
    currency: string | null;
    reference: string | null;
  }> {
    if (!/^[a-zA-Z0-9_-]{4,200}$/.test(invoiceToken)) {
      throw new ServiceUnavailableException("Jeton de facture invalide.");
    }
    const config = readConfig();
    const response = await fetch(
      `${API_BASE[config.mode]}/checkout-invoice/confirm/${encodeURIComponent(invoiceToken)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "PAYDUNYA-MASTER-KEY": config.masterKey,
          "PAYDUNYA-PRIVATE-KEY": config.privateKey,
          "PAYDUNYA-TOKEN": config.token,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException("PayDunya ne peut pas vérifier la facture pour le moment.");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceUnavailableException("Réponse de confirmation PayDunya illisible.");
    }
    const data = asObject(body);
    const invoice = asObject(data?.invoice);
    if (!data || data.response_code !== "00" || !invoice) {
      throw new ServiceUnavailableException("PayDunya n'a pas confirmé l'état de la facture.");
    }

    // PayDunya documents the SHA-512 hash of the merchant MasterKey in the
    // confirmation response. Reject malformed or mismatched provider responses.
    const suppliedHash = typeof data.hash === "string" ? data.hash : "";
    const expectedHash = createHash("sha512").update(config.masterKey, "utf8").digest("hex");
    const suppliedBytes = Buffer.from(suppliedHash, "hex");
    const expectedBytes = Buffer.from(expectedHash, "hex");
    if (
      !/^[a-f0-9]{128}$/i.test(suppliedHash) ||
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new ServiceUnavailableException("La signature de confirmation PayDunya est invalide.");
    }

    // The documented API places status at the response root and total_amount
    // under invoice. Currency is not present in every documented response;
    // the stored invoice was created by this server in XOF.
    const rawStatus = typeof data.status === "string"
      ? data.status.toLowerCase()
      : typeof invoice.status === "string" ? invoice.status.toLowerCase() : "";
    const status: PayDunyaInvoiceStatus =
      rawStatus === "completed" || rawStatus === "pending" ||
      rawStatus === "cancelled" || rawStatus === "failed"
        ? rawStatus
        : "unknown";
    const amount = Number(invoice.total_amount);
    const customData = asObject(data.custom_data);
    return {
      status,
      amountXof: Number.isSafeInteger(amount) && amount >= 0 ? amount : null,
      currency: typeof invoice.currency === "string" ? invoice.currency : null,
      reference: typeof customData?.signup_reference === "string" ? customData.signup_reference : null,
    };
  }
}
