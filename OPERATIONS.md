# Masarat ERP — Operations Runbook

Operational reference for the on-call team and agency admins.
Use this before escalating to engineering.

---

## Daily Health Check (5 minutes)

1. Open **Settings → Monitoring**
2. Verify all providers show **Connected** (green dot)
3. Check **Pending tickets** count = 0
4. Check **Orphan tickets** count = 0
5. If any red — follow the relevant section below

---

## Scenario 1: PNR Sync Shows "Failed" Status

**Symptoms:** A PNR row in `/pnr` shows sync status = `failed`

**Steps:**
1. Open the PNR drawer → click **Sync** (top-left button)
2. If sync succeeds → done
3. If sync fails with "provider error":
   - Go to **Settings → Monitoring**
   - Find the affected provider → click **Test**
   - If test fails → go to **Scenario 3** (Provider Connection Failed)
4. If sync fails with "PNR not found":
   - The PNR may have been cancelled in the GDS
   - Open PNR drawer → click **Cancel** to mark it cancelled in ERP

---

## Scenario 2: Ticket Stuck in Pending (< 20 Attempts)

**Symptoms:** A ticket in `/tickets` shows status `pending` or `pending_void` etc., reconciliation attempts < 20

**What's happening:** The reconciliation cron runs every hour and will heal this automatically.

**Steps:**
1. Check **Settings → Monitoring** → "Stalled Tickets by Provider" table
2. Note the provider and max attempts
3. **Wait up to 1 hour** — the reconciliation cron will complete it
4. If still stuck after 1 hour → go to **Scenario 3** to test provider connection
5. If provider is healthy but ticket is still pending → contact engineering with the ticket ID

---

## Scenario 3: Provider Connection Failed

**Symptoms:** Provider shows red dot in Monitoring, or test returns error

**Steps:**
1. Go to **Settings → Monitoring** → click **Test** next to the failing provider
2. Note the exact error message
3. Common errors and fixes:

| Error | Fix |
|---|---|
| `401 Unauthorized` / `invalid_client` | Client ID or Secret is wrong — go to **Settings → GDS Providers → Edit** and re-enter credentials |
| `hostname not allowed` | Hostname was changed manually — must be `test.api.amadeus.com` or `api.amadeus.com` |
| `network timeout` | Temporary network issue — wait 5 minutes and test again |
| `403 Forbidden` | API quota exceeded or account suspended — check Amadeus self-service portal |

4. After updating credentials → click **Test** again to confirm green
5. If test passes but tickets are still failing → open a support ticket with the provider

---

## Scenario 4: Orphan Ticket (≥ 20 Reconciliation Attempts)

**Symptoms:** Red "Orphan" badge on ticket row or Orphan count > 0 in Monitoring

**What's happening:** The ticket was issued in the GDS but our local Phase 3 write failed repeatedly. The GDS has a live ticket number but our ERP shows it as pending.

**Steps:**
1. Note the ticket ID and the passenger name
2. Log into the GDS terminal directly (Amadeus Web Services / Selling Platform)
3. Search for the PNR code (shown in the ticket row)
4. Find the issued ticket number for that passenger
5. Contact engineering and provide:
   - Ticket ID (from the drawer footer)
   - PNR code
   - Ticket number from GDS
   - Passenger name
6. Engineering will run a manual reconciliation script to complete Phase 3

**Do NOT void the ticket in the GDS before engineering resolves it** — this could cause a double-void.

---

## Scenario 5: Issue Ticket Fails with "فشل استدعاء مزود GDS"

**Symptoms:** Clicking "Issue Ticket" in the PNR drawer returns a GDS error

**Steps:**
1. Check provider health in **Settings → Monitoring**
2. If provider is red → fix connection first (Scenario 3)
3. If provider is green → check the exact error:

| Error | Fix |
|---|---|
| `PNR not found` | PNR expired or cancelled in GDS — sync first |
| `passenger not in response` | Passenger name mismatch — re-enter exact name as in GDS |
| `ticketing deadline passed` | PNR expired — cannot issue, mark as expired |
| `seat not confirmed` | Waitlisted segment — confirm segment in GDS first |

4. After fixing → retry Issue Ticket

---

## Scenario 6: Reconciliation Cron Not Running

**Symptoms:** Many tickets stuck in pending for > 2 hours

**Check:**
- Open Vercel dashboard → Functions → `api/jobs/reconcile-pending-tickets`
- Check the cron schedule (should be `0 * * * *` — every hour)
- Check last invocation time and response

**Fix:**
- If cron not triggered: Vercel Hobby has 2 cron limit — check `vercel.json` for conflicting crons
- If cron triggered but errored: check Function logs for database errors
- Emergency manual trigger: `GET /api/jobs/reconcile-pending-tickets` with admin auth token

---

## Scenario 7: "خطأ في الخادم" on All Pages

**Symptoms:** Every API call returns 500 error

**Most likely cause:** Database migration not applied after deployment

**Fix:**
1. Go to **Settings → Billing → Database Setup**
2. Click **إنشاء الجداول** (Create Tables)
3. Reload the page

If that doesn't fix it:
1. Check Vercel environment variables — `DATABASE_URL` must be set
2. Check Neon database is not paused (free tier pauses after inactivity)
3. Open `https://[your-domain]/api/health` — check response

---

## Escalation Path

| Severity | Condition | Action |
|---|---|---|
| P1 | All APIs returning 500 | Immediate engineering contact |
| P1 | Orphan tickets > 10 | Engineering within 2 hours |
| P2 | Provider down > 30 min | Engineering within 4 hours |
| P2 | Pending tickets > 20 | Engineering within 4 hours |
| P3 | Single ticket stuck | Wait 1 hour, then engineering |
| P3 | Sync failure on 1 PNR | Follow Scenario 1, then engineering |

---

## Neon Database — Limits & Backup

### Plan Limits (verify in Neon Console before each new agency)

| Metric | Neon Launch ($19/mo) | Neon Scale ($69/mo) | Action needed |
|--------|---------------------|---------------------|---------------|
| Storage | 10 GB | 50 GB | Upgrade if journals/tickets > 8 GB |
| Compute hours | 300 h/mo | 750 h/mo | Monitor in Neon Console → Billing |
| Branches | 10 | Unlimited | Keep `main` + 1 test branch minimum |
| Connections | 1,000 pooled | 1,000 pooled | Vercel Functions use pooler URL |

**Check before onboarding a new agency:**
1. Open [Neon Console → Billing](https://console.neon.tech) → verify current storage and compute usage
2. Verify `DATABASE_URL` uses the **pooler** connection string (port 5432, `-pooler` suffix) — not the direct connection
3. Confirm point-in-time restore is enabled (default on paid plans: 7-day history)

### Backup & Recovery

**Automatic backups:** Neon retains 7-day point-in-time restore on Launch/Scale plans. No action needed.

**How to restore to a specific timestamp:**
1. Open Neon Console → your project → **Branches**
2. Click **Restore** → select timestamp (e.g., 1 hour before incident)
3. A new branch is created from that snapshot
4. Update `DATABASE_URL` in Vercel to point to the restored branch
5. Verify data, then promote the branch to replace `main`

**Recovery time objective (RTO):** ~15 minutes for a point-in-time restore
**Recovery point objective (RPO):** Neon continuous WAL → effectively 0 data loss

**Monthly restore drill (recommended):**
```bash
# 1. Create a restore branch from 24 hours ago in Neon Console
# 2. Run a read-only query to confirm agency count matches expected value
# 3. Delete the test branch
```

**Environment variable to protect setup-db route:**
```
# Vercel → Settings → Environment Variables
SETUP_DB_ENABLED=true   # Set ONLY during initial DB setup, remove immediately after
CRON_SECRET=<openssl rand -hex 32>   # Required — cron endpoints return 401 without this
```

---

## Key URLs

| Resource | URL |
|---|---|
| Monitoring Dashboard | `/settings?tab=monitoring` |
| PNR Records | `/pnr` |
| Tickets | `/tickets` |
| GDS Providers Config | `/settings?tab=providers` |
| Health Check API | `/api/health` |
| Amadeus Self-Service | `https://developers.amadeus.com` |
| Neon Database | `https://console.neon.tech` |
| Vercel Dashboard | `https://vercel.com/dashboard` |
