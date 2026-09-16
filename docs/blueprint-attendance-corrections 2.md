# Attendance Corrections, Undo, and No-Show Workflow

The private event attendance dashboard now presents the existing secure
correction services as clear staff actions.

- **Undo** returns an attendance record to `EXPECTED` and requires a recorded
  reason.
- **Mark No-Show** opens a prefilled individual correction that staff can
  review before saving.
- **Correct** allows an authorized staff member to choose any supported
  attendance status and enter a required reason.
- The selected attendee's name is shown in the correction panel.
- **Finalize All No-Shows** requires confirmation before processing all
  eligible remaining attendees.
- Buttons are disabled while a request is running to reduce duplicate actions.
- Existing server-side permissions, tenant scoping, transactions, action
  history, and audit logging remain authoritative.

No attendance records are deleted. Corrections preserve a reasoned action
history so church leadership can understand what changed.
