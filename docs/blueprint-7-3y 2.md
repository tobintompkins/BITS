# Blueprint 7.3Y — Staff Check-Out and Re-Entry UI

The event attendance dashboard now exposes the completed 7.3X APIs:

- Present registered attendees have a **Check out** action.
- Checked-out registered attendees have a **Re-enter** action.
- Requests use a fresh idempotency key and the existing authenticated APIs.
- Safe API errors and duplicate outcomes are shown to staff.
- Attendance data refreshes after every operation.
- Walk-ins remain outside this slice because the 7.3X API is attendee-ID based.
- Station selection for re-entry remains a future refinement; the API continues
  to support optional station attribution.

No attendance transaction, audit, or concurrency logic is duplicated in the UI.
