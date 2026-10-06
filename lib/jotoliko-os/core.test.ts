import { describe, expect, it } from "vitest";
import {
  assertDeliveryClosable,
  assertPaymentAllowed,
  assertTransition,
  gpsTruthFromAge,
  normalizeMoneyState,
  type Mission,
} from "./core";

const mission = (status: Mission["status"]): Mission => ({
  id: "m-1",
  orderId: "o-1",
  clientName: "Test",
  address: {},
  status,
  proofRequired: true,
  money: normalizeMoneyState(10000, 0, 0),
  gpsTruth: "INDISPONIBLE",
  syncStatus: "EN_ATTENTE",
});

describe("Jotoliko OS invariants", () => {
  it("keeps ARRIVE as the delivery pivot", () => {
    expect(() => assertTransition("EN_ROUTE", "ARRIVE")).not.toThrow();
    expect(() => assertTransition("EN_ROUTE", "LIVREE")).toThrow();
  });

  it("blocks payment before LIVREE", () => {
    expect(() => assertPaymentAllowed(mission("ARRIVE"))).toThrow();
    expect(() => assertPaymentAllowed(mission("LIVREE"))).not.toThrow();
  });

  it("requires proof when configured", () => {
    expect(() => assertDeliveryClosable(mission("ARRIVE"))).toThrow();
    const delivered = mission("LIVREE");
    delivered.proofId = "proof-1";
    expect(() => assertDeliveryClosable(delivered)).not.toThrow();
  });

  it("separates expected, collected, remitted and difference", () => {
    expect(normalizeMoneyState(10000, 8500, 8000)).toEqual({
      expected: 10000,
      collected: 8500,
      remitted: 8000,
      difference: 2000,
    });
  });

  it("does not invent a GPS state", () => {
    expect(gpsTruthFromAge(null)).toBe("INDISPONIBLE");
    expect(gpsTruthFromAge(30)).toBe("REEL");
    expect(gpsTruthFromAge(300)).toBe("DERNIERE_POSITION_CONNUE");
    expect(gpsTruthFromAge(1800)).toBe("INDISPONIBLE");
  });
});
