import { describe, expect, it } from "vitest";
import {
  buildTransactionFeeSnapshot,
  resolveStoredTransactionFee,
  type PaymentFeeRule,
} from "./settings";

describe("Operator payment fee snapshot & historical immutability", () => {
  const octoberRates: Record<string, PaymentFeeRule> = {
    "Orange Money": {
      depotRatePercent: 1,
      depotFixedFcfa: 0,
      retraitRatePercent: 1,
      retraitFixedFcfa: 0,
    },
  };

  const novemberRates: Record<string, PaymentFeeRule> = {
    "Orange Money": {
      depotRatePercent: 2,
      depotFixedFcfa: 50,
      retraitRatePercent: 2,
      retraitFixedFcfa: 0,
    },
  };

  it("snapshots depot and retrait fees accurately at creation time", () => {
    const depotSnap = buildTransactionFeeSnapshot(
      10000,
      "Dépôt",
      "Orange Money",
      octoberRates,
    );
    expect(depotSnap).toEqual({
      fee_rate_percent: 1,
      fee_fixed_fcfa: 0,
      fee_fcfa: 100,
      net_amount_fcfa: 10100,
    });

    const retraitSnap = buildTransactionFeeSnapshot(
      10000,
      "Retrait",
      "Orange Money",
      octoberRates,
    );
    expect(retraitSnap).toEqual({
      fee_rate_percent: 1,
      fee_fixed_fcfa: 0,
      fee_fcfa: 100,
      net_amount_fcfa: 9900,
    });
  });

  it("never alters a past transaction fee when operator rates change later", () => {
    const octoberSnap = buildTransactionFeeSnapshot(
      10000,
      "Dépôt",
      "Orange Money",
      octoberRates,
    );

    const pastTx = {
      amount_fcfa: 10000,
      type: "Dépôt",
      payment_operator: "Orange Money",
      ...octoberSnap,
    };

    // Even when current settings switch to 2% + 50 FCFA, the past transaction stays at 1% (100 FCFA)
    const resolvedPast = resolveStoredTransactionFee(pastTx, novemberRates);
    expect(resolvedPast.isFrozen).toBe(true);
    expect(resolvedPast.ratePercent).toBe(1);
    expect(resolvedPast.feeFcfa).toBe(100);
    expect(resolvedPast.netAmountFcfa).toBe(10100);

    // New transaction created after the rate change uses 2% + 50 FCFA
    const novemberSnap = buildTransactionFeeSnapshot(
      10000,
      "Dépôt",
      "Orange Money",
      novemberRates,
    );
    expect(novemberSnap.fee_rate_percent).toBe(2);
    expect(novemberSnap.fee_fcfa).toBe(250);
  });

  it("falls back to configured rates only for legacy rows without a stored snapshot", () => {
    const legacyTx = {
      amount_fcfa: 10000,
      type: "Retrait",
      payment_operator: "Orange Money",
      fee_fcfa: null,
    };
    const resolved = resolveStoredTransactionFee(legacyTx, novemberRates);
    expect(resolved.isFrozen).toBe(false);
    expect(resolved.ratePercent).toBe(2);
    expect(resolved.feeFcfa).toBe(200);
    expect(resolved.netAmountFcfa).toBe(9800);
  });
});
