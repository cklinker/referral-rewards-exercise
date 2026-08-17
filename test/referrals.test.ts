import { createTestDb, truncateAll, type TestDb } from '../src/db';
import {
  getReferrerSummary,
  recordConversion,
  ReferralNotFoundError,
  rewardAmountCents,
} from '../src/referrals';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await truncateAll(db);
  db.resetQueryCount();
});

async function seedOrgs(...ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [id, `Org ${id}`]);
  }
}

async function seedReferral(
  id: string,
  referrer: string,
  referred: string,
  status = 'pending',
): Promise<void> {
  await db.query(
    'INSERT INTO referrals (id, referrer_org_id, referred_org_id, status) VALUES ($1, $2, $3, $4)',
    [id, referrer, referred, status],
  );
}

async function creditsFor(referralId: string) {
  const { rows } = await db.query<{ amount_cents: number }>(
    'SELECT amount_cents FROM reward_credits WHERE referral_id = $1',
    [referralId],
  );
  return rows;
}

describe('task 1 — rewardAmountCents', () => {
  test('pays 10% of the first-year contract value', () => {
    expect(rewardAmountCents(100_000)).toBe(10_000);
  });

  test('rounds down to whole cents', () => {
    expect(rewardAmountCents(999)).toBe(99);
  });

  test('never pays more than $2,500 for one referral', () => {
    expect(rewardAmountCents(30_000_000)).toBe(250_000);
  });

  test('a contract worth nothing earns nothing', () => {
    expect(rewardAmountCents(0)).toBe(0);
  });
});

describe('task 2 — recordConversion', () => {
  beforeEach(async () => {
    await seedOrgs('acme', 'globex');
    await seedReferral('ref-1', 'acme', 'globex');
  });

  test('credits the referrer and marks the referral converted', async () => {
    const result = await recordConversion(db, {
      referralId: 'ref-1',
      contractValueCents: 480_000,
      eventId: 'evt-1',
    });

    expect(result).toEqual({ credited: true, amountCents: 48_000 });
    expect(await creditsFor('ref-1')).toEqual([{ amount_cents: 48_000 }]);

    const { rows } = await db.query<{ status: string; converted_at: Date | null }>(
      'SELECT status, converted_at FROM referrals WHERE id = $1',
      ['ref-1'],
    );
    expect(rows[0]?.status).toBe('converted');
    expect(rows[0]?.converted_at).toBeInstanceOf(Date);
  });

  test('an unknown referral is rejected', async () => {
    await expect(
      recordConversion(db, { referralId: 'nope', contractValueCents: 1_000, eventId: 'evt-x' }),
    ).rejects.toBeInstanceOf(ReferralNotFoundError);
  });

  test('a redelivered event does not credit the referrer twice', async () => {
    const event = { referralId: 'ref-1', contractValueCents: 480_000, eventId: 'evt-1' };

    const first = await recordConversion(db, event);
    const second = await recordConversion(db, event);

    expect(first.credited).toBe(true);
    expect(second.credited).toBe(false);
    expect(await creditsFor('ref-1')).toHaveLength(1);
  });

  test('a second credit row for the same referral is rejected by the database', async () => {
    await recordConversion(db, {
      referralId: 'ref-1',
      contractValueCents: 480_000,
      eventId: 'evt-1',
    });

    // Two Lambdas on two connections can interleave in ways no application
    // check will catch, so the guarantee has to live in the schema.
    await expect(
      db.query(
        'INSERT INTO reward_credits (id, org_id, referral_id, amount_cents) VALUES ($1, $2, $3, $4)',
        ['sneaky', 'acme', 'ref-1', 48_000],
      ),
    ).rejects.toThrow();
  });

  test('two overlapping deliveries do not credit the referrer twice', async () => {
    const event = { referralId: 'ref-1', contractValueCents: 480_000, eventId: 'evt-1' };

    const results = await Promise.all([
      recordConversion(db, event),
      recordConversion(db, event),
    ]);

    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(await creditsFor('ref-1')).toHaveLength(1);
  });
});

describe('task 3 — getReferrerSummary', () => {
  const REFERRAL_COUNT = 200;

  beforeEach(async () => {
    await seedOrgs('acme', 'other');
    for (let i = 0; i < REFERRAL_COUNT; i += 1) {
      const referred = `referred-${i}`;
      await seedOrgs(referred);
      const converted = i % 4 === 0;
      await seedReferral(`r-${i}`, 'acme', referred, converted ? 'converted' : 'pending');
      if (converted) {
        await db.query(
          'INSERT INTO reward_credits (id, org_id, referral_id, amount_cents) VALUES ($1, $2, $3, $4)',
          [`c-${i}`, 'acme', `r-${i}`, 1_000],
        );
      }
    }
    // Noise that must not leak into acme's totals.
    await seedOrgs('someone-else');
    await seedReferral('r-other', 'other', 'someone-else', 'converted');
    await db.query(
      'INSERT INTO reward_credits (id, org_id, referral_id, amount_cents) VALUES ($1, $2, $3, $4)',
      ['c-other', 'other', 'r-other', 999_999],
    );
    db.resetQueryCount();
  });

  test('reports the right totals', async () => {
    const summary = await getReferrerSummary(db, 'acme');

    expect(summary).toEqual({
      referrerOrgId: 'acme',
      totalReferrals: REFERRAL_COUNT,
      convertedReferrals: REFERRAL_COUNT / 4,
      totalRewardCents: (REFERRAL_COUNT / 4) * 1_000,
    });
  });

  test('returns zeroes for an org with no referrals', async () => {
    const summary = await getReferrerSummary(db, 'nobody');

    expect(summary).toEqual({
      referrerOrgId: 'nobody',
      totalReferrals: 0,
      convertedReferrals: 0,
      totalRewardCents: 0,
    });
  });

  test('does not issue one query per referral', async () => {
    await getReferrerSummary(db, 'acme');

    expect(db.queryCount()).toBeLessThanOrEqual(2);
  });
});
