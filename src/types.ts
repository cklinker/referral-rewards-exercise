/** A conversion event delivered from the contracts service via SQS. */
export interface ConversionEvent {
  referralId: string;
  /** Total first-year value of the contract the referred org just signed. */
  contractValueCents: number;
  /** Set by the producer; identical on every redelivery of the same event. */
  eventId: string;
}

export interface ConversionResult {
  /** True only when this call is the one that actually granted the credit. */
  credited: boolean;
  amountCents: number;
}

export interface ReferrerSummary {
  referrerOrgId: string;
  totalReferrals: number;
  convertedReferrals: number;
  totalRewardCents: number;
}
