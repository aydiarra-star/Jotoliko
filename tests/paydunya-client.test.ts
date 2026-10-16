import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { PayDunyaClient } from "../apps/api/src/billing/paydunya.client";

describe("PayDunyaClient", () => {
  const client = new PayDunyaClient();

  beforeEach(() => {
    vi.stubEnv("PAYDUNYA_MODE", "sandbox");
    vi.stubEnv("PAYDUNYA_ALLOW_LIVE", "false");
    vi.stubEnv("PAYDUNYA_MASTER_KEY", "sandbox-master-key");
    vi.stubEnv("PAYDUNYA_PRIVATE_KEY", "sandbox-private-key");
    vi.stubEnv("PAYDUNYA_TOKEN", "sandbox-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a hosted invoice using server-calculated XOF amount and sandbox endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response_code: "00",
      response_text: "https://app.paydunya.com/sandbox-checkout/invoice/test_123456",
      token: "test_123456",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.createInvoice({
      amountXof: 15000,
      description: "Abonnement Jotoliko",
      customerName: "Awa Diarra",
      customerEmail: "awa@example.com",
      callbackUrl: "https://api.example.com/billing/paydunya/callback",
      returnUrl: "https://example.com/inscription/retour",
      cancelUrl: "https://example.com/inscription/annulee",
      reference: "signup-123",
    });

    expect(result).toEqual({
      token: "test_123456",
      checkoutUrl: "https://app.paydunya.com/sandbox-checkout/invoice/test_123456",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create",
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body)).invoice.total_amount).toBe(15000);
    expect((request.headers as Record<string, string>)["PAYDUNYA-MASTER-KEY"]).toBe("sandbox-master-key");
  });

  it("refuses a non-positive or unsafe amount before contacting PayDunya", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.createInvoice({
      amountXof: 0,
      description: "Abonnement",
      customerName: "Awa",
      customerEmail: "awa@example.com",
      callbackUrl: "https://api.example.com/callback",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
      reference: "signup-123",
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a checkout URL outside the official HTTPS PayDunya host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response_code: "00",
      response_text: "https://evil.example/fake-checkout",
      token: "test_123456",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(client.createInvoice({
      amountXof: 15000,
      description: "Abonnement",
      customerName: "Awa",
      customerEmail: "awa@example.com",
      callbackUrl: "https://api.example.com/callback",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
      reference: "signup-123",
    })).rejects.toThrow(/domaine officiel PayDunya/);
  });

  it("confirms invoice status using the server API and returns verified amount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response_code: "00",
      invoice: { status: "completed", total_amount: "15000", currency: "XOF" },
      custom_data: { signup_reference: "signup-123" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.confirmInvoice("test_123456");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://app.paydunya.com/sandbox-api/v1/checkout-invoice/confirm/test_123456",
    );
    expect(result).toEqual({
      status: "completed",
      amountXof: 15000,
      currency: "XOF",
      reference: "signup-123",
    });
  });

  it("does not allow live mode without an explicit second opt-in", async () => {
    vi.stubEnv("PAYDUNYA_MODE", "live");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.confirmInvoice("live_12345")).rejects.toThrow(/PAYDUNYA_ALLOW_LIVE=true/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
