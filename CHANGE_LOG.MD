# Change Log

Semua perubahan penting pada proyek CRM SaaS multi-tenant dicatat di sini.
Format mengikuti urutan task pada rencana implementasi.

## Task 1 - Inisialisasi proyek & fondasi

- Setup proyek Next.js 15 (App Router) + TypeScript, dibangun manual tanpa `create-next-app` untuk menghindari prompt interaktif.
- Konfigurasi: `package.json` (type: module, scripts dev/build/test/db:*), `tsconfig.json` (path alias `@/* -> ./src/*`), `next.config.mjs` (serverExternalPackages: argon2, postgres), `tailwind.config.ts`, `postcss.config.mjs`.
- Tooling: ESLint (next), Prettier (+ plugin tailwind), Vitest (jsdom) + `vitest.setup.ts`, `.gitignore`, `.env.example`.
- `src/lib/utils.ts`: helper `cn`, `formatCurrency` (basis sen), `formatDate`.
- `src/lib/env.ts`: validasi environment lazy via Zod (`getEnv()`).
- `src/app`: `globals.css` (CSS variables shadcn), `layout.tsx`, `page.tsx` (landing page), `page.test.tsx` (2 smoke test).
- `src/components/ui/button.tsx`: komponen Button (cva variants).
- Verifikasi: `npm test` PASS (2 test), `npm run typecheck` PASS.

## Task 2 - Database & lapisan tenant + RLS

- `src/server/db/schema.ts`: skema Drizzle lengkap (tenants, users, sessions, invitations, companies, contacts, pipelines, stages, deals, activities, subscriptions, audit_logs) + enum + relations. Nilai uang disimpan dalam sen (bigint). Semua tabel bisnis punya `tenant_id`.
- `src/server/db/client.ts`: `getAppDb()` (RLS-enforced), `getAdminDb()` (bypass RLS untuk migrasi/registrasi/webhook), `withTenant(tenantId, fn)` (transaksi + `set_config('app.current_tenant', ...)`), `closeDb()`.
- `src/server/db/rls.sql`: policy `tenant_isolation` (ENABLE + FORCE RLS, USING + WITH CHECK) untuk 11 tabel ter-scope tenant. Idempotent.
- `src/server/db/setup-role.sql`: membuat role `app_user` (NOSUPERUSER, NOBYPASSRLS) + grants.
- `src/server/db/migrate.ts`: menjalankan migrasi Drizzle lalu menerapkan `rls.sql`.
- `src/server/db/seed.ts`: membuat 2 tenant demo (acme, globex) dengan data sampel.
- `src/server/services/tenant.ts`: `createTenantWithOwner()` (tenant + owner + subscription free + default pipeline), `seedDefaultPipeline()` (6 stage: Lead/Qualified/Proposal/Negotiation/Won/Lost).
- `src/server/db/tenant-isolation.test.ts`: 3 integration test isolasi (skip bila `TEST_DATABASE_URL` tak diset).
- `src/server/db/README.md`: panduan setup DB + menjalankan test isolasi.
- `drizzle.config.ts` + migrasi `drizzle/0000_*.sql` tergenerate (12 tabel).
- Dependency: menambahkan `dotenv`.
- Verifikasi: `db:generate` OK, `typecheck` PASS, `npm test` PASS (2 pass, 3 skip). Test RLS live belum dijalankan karena Docker daemon tidak aktif di lingkungan ini (siap dijalankan di CI/lokal).

## Task 3 - Autentikasi self-hosted & manajemen sesi

- `src/server/auth/password.ts`: hashing argon2id (`hashPassword`, `verifyPassword`).
- `src/server/auth/session.ts`: generate token acak, simpan hash SHA-256, `sessionExpiry`, `shouldRefresh`, konstanta cookie & TTL (30 hari).
- `src/server/auth/auth.ts`: `register` (buat workspace + owner + sesi), `login` (verifikasi + mitigasi timing attack), `createSession`, `validateSession`, `invalidateSession`, `invalidateAllUserSessions`, `AuthError`.
- `src/server/auth/current-user.ts`: `getCurrentUser()`, `requireUser()` (redirect ke /login).
- `src/server/auth/cookies.ts`: set/clear/read cookie sesi (httpOnly, secure di production, sameSite lax).
- `src/server/auth/validation.ts`: schema Zod register & login.
- `src/app/(auth)/actions.ts`: server actions `registerAction`, `loginAction`, `logoutAction`.
- `src/app/(auth)/register/page.tsx`, `src/app/(auth)/login/page.tsx`: form client dengan `useActionState` + status pending.
- `src/app/app/layout.tsx`: layout terproteksi (sidebar nav + header + logout), memanggil `requireUser()`.
- `src/app/app/page.tsx`: dashboard placeholder.
- `src/middleware.ts`: gate ringan untuk `/app/*` (cek cookie) + redirect pengguna login dari halaman auth.
- Komponen UI: `src/components/ui/input.tsx`, `src/components/ui/label.tsx`.
- Test: `password.test.ts` (4), `session.test.ts` (5).
- Verifikasi: argon2 native binding OK, `typecheck` PASS, `npm test` PASS (11 pass, 3 skip).

## Task 4 - Role, invitasi user & manajemen tim

- `src/server/auth/rbac.ts`: definisi RBAC. Permission (`members:*`, `billing:manage`, `crm:*`), peta role (owner/admin/sales/viewer), `hasPermission`, `canAssignRole` (cegah eskalasi hak), `requirePermission`, `ForbiddenError`.
- `src/server/email/email.ts`: abstraksi `EmailProvider`. `ResendProvider` (via HTTP API), fallback `ConsoleProvider` saat `RESEND_API_KEY` kosong, `setEmailProvider` (seam untuk test), `sendEmail`.
- `src/server/services/members.ts`: `listMembers`, `listPendingInvites`, `inviteMember` (cek permission + role + kirim email undangan), `getInviteByToken`, `acceptInvite` (buat user di tenant + tandai accepted), `revokeInvite`, `updateMemberRole` (guard owner & diri sendiri), `removeMember`. Token invitasi acak, TTL 7 hari.
- `src/app/app/settings/members/actions.ts`: server actions invite/revoke/update-role/remove dengan validasi Zod + mapping error.
- `src/app/app/settings/members/page.tsx` + `invite-form.tsx`: UI daftar anggota, ubah role, hapus, daftar undangan pending, form undang (hanya untuk yang punya izin).
- `src/app/invite/[token]/page.tsx` + `accept-form.tsx` + `actions.ts`: halaman publik terima undangan, buat akun, langsung buat sesi.
- `src/server/auth/constants.ts`: konstanta edge-safe (`SESSION_COOKIE`, `SESSION_TTL_MS`) agar middleware tidak mem-bundle `node:crypto`. `session.ts` kini re-export dari sini; `middleware.ts` impor dari sini.
- Test: `src/server/auth/rbac.test.ts` (9 unit test), `src/server/services/members.test.ts` (4 integration test invite→accept + guard role, skip tanpa DB).
- Perbaikan: memindahkan impor `SESSION_COOKIE` di middleware ke modul edge-safe (fix error build `node:crypto` di Edge runtime).
- Verifikasi: `typecheck` PASS, `npm test` PASS (20 pass, 7 skip), `npm run build` SUKSES (route: /, /app, /app/settings/members, /invite/[token], /login, /register + middleware), `npm run lint` bersih.

## Task 5 - Manajemen Kontak & Perusahaan

- `src/server/services/companies.ts`: `listCompanies` (pagination + search by name + contactCount), `getCompany`, `createCompany`, `updateCompany`, `deleteCompany`, `companyOptions` (untuk select). Enforce permission `crm:*`, semua lewat `withTenant`.
- `src/server/services/contacts.ts`: `listContacts` (pagination + search nama/email + join company), `getContact`, `createContact`, `updateContact`, `deleteContact`, `importContactsCsv` (resolve/auto-create company by name, 1 transaksi).
- `src/server/services/csv.ts`: parser CSV tanpa dependency (quoted field, escaped quote, CRLF) + `mapContactCsv` (alias header, wajib kolom first name). Unit test di `csv.test.ts` (8 test).
- `src/server/services/crm-validation.ts`: schema Zod form company & contact (preprocess empty->undefined, tags comma-separated).
- Companies UI: `/app/companies` (list + search + pagination + delete), `/app/companies/new`, `/app/companies/[id]` (edit via `action.bind(null, id)`), `company-form.tsx`, `actions.ts`.
- Contacts UI: `/app/contacts` (list + search + pagination + delete + import), `/app/contacts/new`, `/app/contacts/[id]`, `contact-form.tsx` (select company), `import-form.tsx` (upload CSV, tampilkan hasil import), `actions.ts`.
- Komponen bersama: `src/components/crm/list-controls.tsx` (`SearchBar`, `Pagination` berbasis query param).
- Test: `csv.test.ts` (8 unit), `contacts.test.ts` (4 integration, skip tanpa DB).
- Verifikasi: `typecheck` PASS, `npm test` PASS (28 pass, 11 skip), `npm run build` SUKSES (route companies & contacts + [id] + new compiled), lint bersih.

## Task 6 - Sales Pipeline & Deals (Kanban)

- Dependency: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (drag-and-drop aksesibel + keyboard support).
- `src/server/services/deals.ts`: `getBoard` (stages terurut + deals + total per stage + weighted forecast = total × probability/100), `createDeal` (append ke stage pertama/terpilih), `updateDeal`, `deleteDeal`, `moveDeal` (pindah stage + reorder posisi 0..n-1, validasi stage se-pipeline), `getDeal`, `listStages`. Nilai disimpan cents.
- `src/server/services/contacts.ts`: tambah `contactOptions` (untuk select deal).
- `src/app/app/deals/actions.ts`: server actions create/update/delete + `moveDealAction` (dipanggil setelah drag, mengembalikan status tanpa redirect). Form value (major unit) dikonversi ke cents.
- `src/app/app/deals/kanban-board.tsx`: board kanban client (@dnd-kit) dengan optimistic update + rollback saat gagal, kolom per stage menampilkan jumlah + total.
- `src/app/app/deals/page.tsx`: board + ringkasan total & weighted forecast.
- `src/app/app/deals/deal-form.tsx` + `new/page.tsx` + `[id]/page.tsx` (edit + delete, `action.bind(null, id)`).
- Test: `deals.test.ts` (4 integration: total per stage, moveDeal antar stage, weighted forecast, guard viewer; skip tanpa DB).
- Verifikasi: `typecheck` PASS, `npm test` PASS (28 pass, 15 skip), `npm run build` SUKSES (route /app/deals + [id] + new), lint bersih.

## Task 7 - Aktivitas, Tugas & Timeline

- `src/server/services/activities.ts`: `listTimeline(contactId|dealId)` (join nama pembuat, newest first), `addNote`, `addTask` (dengan dueAt), `setTaskComplete` (toggle), `deleteActivity`, `listTasks(filter: open/overdue/completed/all)` (sort due asc nulls last), `countOpenTasks`. Enforce `crm:*`.
- `src/app/app/activities-actions.ts`: server actions `addNoteAction`, `addTaskAction`, `toggleTaskAction`, `deleteActivityAction`. Revalidate /app/tasks + halaman contact/deal terkait.
- `src/components/crm/timeline.tsx`: komponen timeline client (daftar aktivitas, badge tipe, due date + penanda overdue, inline form tambah note & task, tombol complete/reopen & delete).
- Embed Timeline di `src/app/app/contacts/[id]/page.tsx` dan `src/app/app/deals/[id]/page.tsx`.
- `src/app/app/tasks/page.tsx`: halaman daftar tugas dengan filter (open/overdue/completed/all), tandai selesai/buka, link ke contact/deal terkait.
- Test: `activities.test.ts` (4 integration: timeline note+task, filter open/completed, overdue, guard viewer; skip tanpa DB).
- Verifikasi: `typecheck` PASS, `npm test` PASS (28 pass, 19 skip), `npm run build` SUKSES (route /app/tasks + timeline di detail contact/deal), lint bersih.

## Task 8 - Email transaksional & log komunikasi

- `src/server/email/templates.ts`: `buildContactEmail` + `textToHtml` (escape HTML anti-injection, newline->br, blank line->paragraph).
- `src/server/services/activities.ts`: tambah `addEmailActivity` (type "email") untuk mencatat email di timeline.
- `src/server/services/contact-email.ts`: `sendContactEmail` (validasi kontak punya email, kirim via `sendEmail`, lalu catat aktivitas; log hanya ditulis setelah kirim sukses), `EmailError`.
- `src/app/app/contacts/[id]/email-actions.ts`: server action `sendContactEmailAction` (validasi Zod, revalidate halaman kontak).
- `src/app/app/contacts/[id]/send-email-form.tsx`: form kirim email (disabled bila kontak tanpa email), tampil status sukses/error.
- Embed `SendEmailForm` di halaman detail kontak (`/app/contacts/[id]`), hanya untuk yang punya izin `crm:create`.
- Test: `templates.test.ts` (4 unit: payload, escape HTML, paragraf, line break), `contact-email.test.ts` (2 integration dengan provider mock via `setEmailProvider`; skip tanpa DB).
- Verifikasi: `typecheck` PASS, `npm test` PASS (32 pass, 21 skip), `npm run build` SUKSES, lint bersih.

## Task 9 - Dashboard & Laporan

- `src/server/services/analytics.ts`: `getDashboardMetrics(user, range)` (pipeline total + weighted forecast, open deal count, won/lost count, conversion rate = won/(won+lost), open task count, breakdown per stage, aktivitas per hari dengan gap-filling max 92 hari), `parseRange` (?from=&to=), `defaultRange` (30 hari terakhir). Semua ter-scope tenant.
- `src/components/crm/charts.tsx`: komponen client recharts — `StageValueChart` (bar nilai per stage), `ActivityChart` (area aktivitas per hari).
- `src/app/app/range-filter.tsx`: filter preset client (7d/30d/90d) via query param.
- `src/app/app/page.tsx`: dashboard baru (ganti placeholder) — kartu metrik (pipeline value, open deals, conversion, open tasks) + 2 chart + filter rentang.
- Test: `analytics-range.test.ts` (5 unit parseRange), `analytics.test.ts` (3 integration: sum pipeline, conversion rate, deret aktivitas harian; skip tanpa DB).
- Verifikasi: `typecheck` PASS, `npm test` PASS (37 pass, 24 skip), `npm run build` SUKSES, lint bersih.

## Task 10 - Billing & paket berlangganan

- `src/server/billing/plans.ts`: definisi paket (free: 2 member / 50 kontak / 50 deal; pro: unlimited), `PLAN_CATALOG` (Pro $29/bln), `limitFor`, `withinLimit`.
- `src/server/billing/billing.ts`: interface `BillingProvider` (createCheckout, parseWebhook), `StripeProvider` (HTTP API tanpa SDK, aktif bila STRIPE_SECRET_KEY ada), `ManualProvider` (fallback dev/demo tanpa key), `getBillingProvider`/`setBillingProvider`.
- `src/server/billing/stripe-signature.ts`: verifikasi tanda tangan webhook Stripe (HMAC-SHA256, timing-safe compare, proteksi replay via toleransi timestamp).
- `src/server/services/subscription.ts`: `getSubscription`, `getUsage`, `assertWithinQuota`/`assertBatchWithinQuota` (QuotaError), `activatePlan` (admin), `cancelPlan`.
- Enforcement kuota disisipkan di `inviteMember` (members), `createContact` + `importContactsCsv` (contacts, batch), `createDeal` (deals). Action terkait menampilkan pesan QuotaError.
- Webhook: `src/app/api/billing/webhook/route.ts` (POST, verifikasi signature, update subscription via admin DB; 400 bila invalid, 500 agar provider retry).
- Billing UI: `src/app/app/settings/billing/{page.tsx,actions.ts,upgrade-button.tsx}` (plan + usage, upgrade via checkout atau konfirmasi demo bila provider manual, downgrade). `src/app/app/settings/page.tsx` (indeks settings). Enforce `billing:manage` (owner).
- Test: `plans.test.ts` (4 unit), `stripe-signature.test.ts` (5 unit), `subscription.test.ts` (4 integration kuota/aktivasi; skip tanpa DB).
- Catatan: Stripe dipilih sebagai default namun di-guard sehingga build & dev berjalan tanpa API key; provider lain (mis. Midtrans) bisa ditambah di balik interface `BillingProvider` yang sama.
- Verifikasi: `typecheck` PASS, `npm test` PASS (46 pass, 28 skip), `npm run build` SUKSES (route /api/billing/webhook, /app/settings, /app/settings/billing), lint bersih.

## Task 11 - Pengerasan keamanan, rate limiting & audit

- `src/server/security/rate-limit.ts`: `InMemoryRateLimiter` (fixed window, now-injectable), `UpstashRateLimiter` (Redis REST, aktif bila UPSTASH_* diset, fail-open saat error infra), `getRateLimiter`/`setRateLimiter` (registry bernama).
- `src/server/security/request-ip.ts`: `getClientIp` (x-forwarded-for / x-real-ip).
- Rate limit diterapkan di `loginAction` (5 / 5 menit per IP+email) dan `registerAction` (10 / jam per IP).
- `src/server/services/audit.ts`: `logAudit(user, {action, entity, entityId, metadata})` (best-effort, tak memblok operasi utama), `listAuditLogs` (butuh `members:view`).
- Audit dicatat pada: invite member, ubah role, hapus member (members.ts), upgrade & downgrade billing (billing actions).
- `src/app/app/settings/audit/page.tsx`: viewer audit log (owner/admin). Link ditambah di indeks settings.
- Security headers di `next.config.mjs`: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, HSTS. (Server Actions Next 15 sudah punya proteksi CSRF same-origin bawaan.)
- Catatan RLS: policy `tenant_isolation` (ENABLE+FORCE) sudah aktif di 11 tabel sejak Task 2; akses request-time via `withTenant` dengan role `app_user` NOBYPASSRLS.
- Test: `rate-limit.test.ts` (4 unit: allow-then-block, remaining, window reset, per-key), `audit.test.ts` (2 integration; skip tanpa DB).
- Verifikasi: `typecheck` PASS, `npm test` PASS (50 pass, 30 skip), `npm run build` SUKSES (route /app/settings/audit), lint bersih.

## Task 12 - CI/CD, dokumentasi & deployment

- `.github/workflows/ci.yml`: job `build` (npm ci → typecheck → lint → test → build, Node 22) + job `integration` (service Postgres 16, jalankan `db:migrate`, buat role `app_user`, lalu test dengan `TEST_DATABASE_URL` lewat role NOBYPASSRLS).
- `README.md`: ringkasan produk, stack, arsitektur isolasi, setup, tabel environment, daftar script, cara test (unit + integration dengan TEST_DATABASE_URL), E2E, dan panduan deployment (Vercel + managed Postgres, webhook Stripe, Resend, Upstash). Referensi ke CHANGE_LOG.MD.
- E2E Playwright: `@playwright/test` ditambah, `playwright.config.ts` (testDir `e2e/`, webServer build+start di port 3100), `e2e/smoke.spec.ts` (landing page + redirect /app→/login tanpa sesi). Script `e2e` + `e2e:install`. `playwright test --list` memverifikasi 2 test terdeteksi.
- `vitest.config.ts`: exclude `e2e/**` agar Playwright tidak dieksekusi Vitest.
- `vercel.json`: konfigurasi framework Next.js (buildCommand, installCommand).
- `.gitignore`: artefak Playwright di-ignore; folder `drizzle/` (migrasi) TIDAK di-ignore agar CI bisa `db:migrate`.
- `.eslintrc.json`: aturan `no-unused-vars` mengabaikan prefix `^_` (konvensi parameter yang memang tidak dipakai, mis. signature `useActionState`).
- Verifikasi: `typecheck` PASS, `npm test` PASS (50 pass, 30 skip), `npm run build` SUKSES, `npm run lint` BERSIH (tanpa warning), `playwright test --list` OK.

---

## Status akhir

Seluruh 12 task selesai & terverifikasi. Ringkasan akhir: 50 unit test lulus, 30 integration test siap jalan dengan database (lewat CI job Postgres), build produksi sukses, lint bersih. Aplikasi CRM SaaS multi-tenant lengkap: isolasi RLS, auth self-hosted, RBAC + invitasi, kontak & perusahaan (+ import CSV), pipeline kanban, aktivitas/tugas/timeline, email transaksional, dashboard, billing + kuota, rate limiting + audit, serta CI/CD + dokumentasi + E2E.

---

## Perbaikan Bug (pasca audit, diverifikasi dengan Postgres live)

Semua temuan di laporan bug (lihat artifact "CRM Bug Report (pre-fix)") diperbaiki dan diuji terhadap Postgres sungguhan (role `app_user` NOBYPASSRLS). Suite penuh: 92/92 lulus (sebelumnya 80, +12 regression test). typecheck PASS, lint bersih, build SUKSES.

**BUG-1 + BUG-2 (CRITICAL) — bypass kuota member.**
- `subscription.ts`: `countResourceTx(tx, resource)` baru; untuk `members` menghitung `users` + **invitasi pending**. `assertWithinQuotaTx(tx, resource, count)` dan wrapper `withQuota(user, resource, fn, count)` menjalankan pengecekan kuota + insert dalam **satu transaksi**.
- `members.ts`: `inviteMember` memeriksa kuota di dalam transaksi, setelah menghapus invite pending yang sama (re-invite idempoten, tidak memakan slot). `acceptInvite` kini memeriksa jumlah member aktif terhadap limit paket sebelum menyisipkan user (koneksi admin, difilter per tenant).
- Regresi: `member-quota.test.ts` (pending dihitung; re-invite idempoten; accept tak bisa melampaui; pro melepas limit).

**BUG-3 + BUG-8 (HIGH/MED) — Stripe period end & plan.**
- `billing.ts`: `WebhookEvent` membawa `plan`. `StripeProvider.fetchSubscription()` mengambil subscription via API untuk membaca `current_period_end` (dari level subscription ATAU `items.data[0]` sesuai API Stripe 2025-03) dan price id. `parseWebhook` menurunkan plan dari price (bukan hardcode `pro`); price non-pro diperlakukan sebagai cancel.
- `api/billing/webhook/route.ts`: memakai `event.plan`.
- Regresi: `billing/webhook.test.ts` (period end + pro via fetch ter-mock; price non-pro → canceled; signature invalid ditolak).

**BUG-4 + BUG-5 (HIGH/MED) — race TOCTOU kuota.**
- `contacts.ts` (`createContact`, `importContactsCsv`) & `deals.ts` (`createDeal`) memakai `withQuota` sehingga hitung + insert berbagi satu transaksi (import mengirim `rows.length`).

**BUG-6 + BUG-7 (MED) — analitik.**
- `analytics.ts`: bucket hari SQL memakai `AT TIME ZONE 'UTC'` agar cocok dengan kunci UTC di JS (fix hari-0 saat TZ DB bukan UTC). `MAX_RANGE_DAYS=366`; `parseRange` meng-clamp rentang panjang ke jendela terbaru (tidak lagi memotong diam-diam).
- Regresi: unit clamp + integration bucket UTC.

**BUG-9 + BUG-10 (LOW) — sesi.**
- `auth.ts`: `validateSessionDetailed()` menggeser (sliding) expiry di DB saat lewat setengah TTL dan memakai `session.tenantId` (bukan `user.tenantId`). `current-user.ts` menerbitkan ulang cookie saat refresh (try/catch untuk konteks render).
- Regresi: `auth/session-refresh.test.ts`.

**BUG-11 (LOW) — cache env.**
- `lib/env.ts`: `resetEnvCache()` untuk memaksa baca ulang env (tes/tooling).

Catatan verifikasi: dijalankan terhadap kontainer Postgres 16 (`app_user`, RLS dipaksa). Isolasi tenant tetap lulus runtime. Build 19 route tetap sukses.
