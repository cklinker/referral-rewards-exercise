# Pebl Growth Engineering — pairing exercise

Thanks for making the time. This is a 30-minute pairing session on a small
TypeScript + Postgres codebase. It is not a puzzle or an algorithm test: it is
a slice of the kind of work the Growth team actually does.

## Before the call (5 minutes, please do this ahead of time)

```bash
node -v          # 20 or newer
npm install
npm test         # several tests fail — that is expected, it's the starting point
```

If `npm test` runs and reports failures, you are set up correctly. There is no
database to install: the tests boot a real Postgres in-process.

## The context

Pebl runs a referral program. An existing customer refers another company; when
that company signs its first contract, the referrer earns account credit that
shows up on their next invoice.

A Lambda consumes conversion events from SQS and calls `recordConversion`. The
customer dashboard calls `getReferrerSummary`.

## The code

| Path | What it is |
| --- | --- |
| `src/referrals.ts` | **The only file you need to change.** |
| `sql/001_init.sql` | Schema. Every `sql/*.sql` file is applied in filename order, so you can add `sql/002_something.sql` if you want to change it. |
| `src/types.ts` | Shared types. |
| `src/db.ts` | Test harness. You shouldn't need to touch it. |
| `test/referrals.test.ts` | The tests. Read them — they are the spec. |

## The tasks

Work top to bottom. Getting through all three is not required; how you think
about them matters more than how much you finish.

1. **`rewardAmountCents`** — implement the payout rule. Warm-up.
2. **`recordConversion`** — the queue is at-least-once, and finance found
   referrers who were paid twice last month. Make the credit happen exactly
   once per referral, and make that guarantee hold even when two Lambdas are
   processing the same event on two different database connections.
3. **`getReferrerSummary`** — our largest partner has ~40,000 referrals and
   this endpoint times out for them. Fix it.

## Ground rules

- Please think out loud. We are more interested in your reasoning than in
  silent typing.
- Docs, Google, and your usual editor are all fine. Please don't use an AI
  coding assistant during the session.
- Ask questions whenever something is ambiguous. Some of it is ambiguous on
  purpose.
