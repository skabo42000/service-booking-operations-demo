# English reviewer walkthrough

The UI uses Serbian / Bosnian labels. This guide explains the product without changing its original demonstration language.

| Label / route | Meaning |
|---|---|
| `Zakazivanje`, `/zakazivanje` | Book an appointment |
| `Moji termini`, `/moji-termini` | My appointments / account |
| `Usluga` | Service |
| `Osoblje` / `Član tima` | Staff / team member |
| `Termin` | Appointment |
| `Klijenti` | Clients |
| `Izvještaji` | Reports |
| `Uplate` | Payment records |

## Suggested five-minute review

1. Run locally with a new random staff key and no external provider credentials.
2. Select a service, staff member and available slot in the booking screen. The server checks schedules and overlaps again when saving.
3. For the account flow, explicitly enable `DEMO_SHOW_LOGIN_CODE=on` and use a fictional email. The displayed code is a simulation, not email verification. Inspect cancellation / rescheduling of that account's own appointments.
4. Open `/admin`, use your local key, then inspect the calendar, client history and owner / staff views. Staff identities are selectable demonstration identities, not independently verified users.
5. Record a synthetic payment and reverse it. No card or bank transaction is performed. Inspect the preserved bookkeeping record.
6. Run `npm test` and inspect the overlap, permission and idempotency cases in `tests/`.

The optional AI guide is a separate integration. Review its code and confirmed facts before adding credentials. It is not required for this walkthrough. The online demonstration is maintained separately and can have different demo settings from this sanitized repository.
