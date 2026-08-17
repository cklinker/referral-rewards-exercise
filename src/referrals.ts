/**
 * Referral rewards — this is the file you will be editing.
 *
 * `recordConversion` is invoked from a Lambda that consumes an SQS queue fed by
 * the contracts service. `getReferrerSummary` backs the "your referrals" panel
 * in the customer dashboard.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from './db';
import type { ConversionEvent, ConversionResult, ReferrerSummary } from './types';

export class ReferralNotFoundError extends Error {
  constructor(referralId: string) {
    super(`referral not found: ${referralId}`);
    this.name = 'ReferralNotFoundError';
  }
}

interface ReferralRow {
  id: string;
  referrer_org_id: string;
  referred_org_id: string;
  status: string;
  converted_at: Date | null;
}

interface RewardCreditRow {
  id: string;
  org_id: string;
  referral_id: string;
  amount_cents: number;
}

/**
 * TASK 1
 *
 * Growth signed off on this reward rule:
 *   - the referrer earns 10% of the referred org's first-year contract value
 *   - amounts are whole cents, rounded down
 *   - a single referral never pays out more than $2,500
 *   - a contract worth nothing earns nothing
 */
export function rewardAmountCents(contractValueCents: number): number {
  // TODO(candidate): implement.
  throw new Error('not implemented');
}

/**
 * TASK 2
 *
 * Grants the referrer their credit and marks the referral converted.
 *
 * The queue this runs behind is at-least-once: the same conversion event will
 * sometimes be delivered twice, and occasionally two deliveries are in flight
 * at the same time. Right now that double-pays the referrer, which finance
 * noticed on last month's invoices.
 *
 * Make the credit happen exactly once per referral. You may change the schema
 * (add a sql/002_*.sql migration) as well as the code.
 */
export async function recordConversion(db: Db, event: ConversionEvent): Promise<ConversionResult> {
  const { rows } = await db.query<ReferralRow>('SELECT * FROM referrals WHERE id = $1', [
    event.referralId,
  ]);
  const referral = rows[0];
  if (!referral) {
    throw new ReferralNotFoundError(event.referralId);
  }

  if (referral.status === 'converted') {
    return { credited: false, amountCents: 0 };
  }

  const amountCents = rewardAmountCents(event.contractValueCents);

  await db.query(
    'INSERT INTO reward_credits (id, org_id, referral_id, amount_cents) VALUES ($1, $2, $3, $4)',
    [randomUUID(), referral.referrer_org_id, referral.id, amountCents],
  );

  await db.query("UPDATE referrals SET status = 'converted', converted_at = now() WHERE id = $1", [
    referral.id,
  ]);

  return { credited: true, amountCents };
}

/**
 * TASK 3
 *
 * Powers the "your referrals" panel. Our biggest partner has ~40k referrals
 * and this endpoint times out for them.
 */
export async function getReferrerSummary(db: Db, referrerOrgId: string): Promise<ReferrerSummary> {
  const { rows: referrals } = await db.query<ReferralRow>(
    'SELECT * FROM referrals WHERE referrer_org_id = $1',
    [referrerOrgId],
  );

  let convertedReferrals = 0;
  let totalRewardCents = 0;

  for (const referral of referrals) {
    if (referral.status === 'converted') {
      convertedReferrals += 1;
    }

    const { rows: credits } = await db.query<RewardCreditRow>(
      'SELECT * FROM reward_credits WHERE referral_id = $1',
      [referral.id],
    );
    for (const credit of credits) {
      totalRewardCents += credit.amount_cents;
    }
  }

  return {
    referrerOrgId,
    totalReferrals: referrals.length,
    convertedReferrals,
    totalRewardCents,
  };
}
