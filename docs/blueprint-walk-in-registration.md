# Walk-In Registration and Check-In

The existing transaction-safe walk-in service is now presented as a complete
staff workflow in the event check-in console.

- Only users with `canCreateWalkIn` can use the form.
- The event must have walk-ins enabled and registration must not be required.
- First and last name are required; email, phone, and staff notes are optional.
- The currently selected active station is attributed when present.
- Registration, attendee, attendance, action history, capacity enforcement, and
  audit behavior remain inside the existing service transaction.
- Success refreshes the live summary and resets the form.
- Disabled settings and missing permissions are explained instead of silently
  hiding the feature.

No public self-registration or bulk walk-in workflow is included.
