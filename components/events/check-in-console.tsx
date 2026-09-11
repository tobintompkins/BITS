"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  checkInAttendeeAction,
  closeStationAction,
  getLiveSummaryAction,
  openStationAction,
  partyCheckInAction,
  resolveQrPassAction,
  searchCheckInAttendeesAction,
  walkInAction,
} from "@/app/(staff)/events/check-in-actions";

type Access = {
  canOperateCheckIn: boolean;
  canCreateWalkIn: boolean;
  canManageCheckIn: boolean;
};

type Station = {
  id: string;
  name: string;
  status: string;
};

type Summary = {
  expected: number;
  present: number;
  checkedOut: number;
  noShow: number;
  cancelled: number;
  walkIns: number;
  totalCheckedInPeople: number;
};

type SearchItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  registration: {
    id: string;
    confirmationCode: string;
    status: string;
    primaryContactName: string;
  };
  attendanceRecords: Array<{ status: string }>;
};

export function CheckInConsole({
  eventId,
  eventTitle,
  timezone,
  startLabel,
  settings,
  initialStations,
  initialSummary,
  access,
}: {
  eventId: string;
  eventTitle: string;
  timezone: string;
  startLabel: string;
  settings: {
    checkInEnabled: boolean;
    allowWalkIns: boolean;
    allowSelfCheckIn: boolean;
    stationNameRequired: boolean;
  };
  initialStations: Station[];
  initialSummary: Summary;
  access: Access;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [summary, setSummary] = useState(initialSummary);
  const [stations, setStations] = useState(initialStations);
  const [stationId, setStationId] = useState(
    initialStations.find((s) => s.status === "ACTIVE")?.id ?? "",
  );
  const [token, setToken] = useState("");
  const [party, setParty] = useState<{
    registrationId: string;
    confirmationCode: string;
    attendees: Array<{
      id: string;
      firstName: string;
      lastName: string;
      attendanceStatus: string;
    }>;
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const scannerSupported = useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined" &&
      "BarcodeDetector" in window &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<string>("");

  const activeStations = stations.filter((s) => s.status === "ACTIVE");

  useEffect(() => {
    const handle = setTimeout(() => {
      startTransition(async () => {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("query", query);
        const result = await searchCheckInAttendeesAction(formData);
        if (result.status === "success" && "items" in result) {
          setItems(result.items as SearchItem[]);
        }
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [eventId, query]);

  useEffect(() => {
    const id = setInterval(() => {
      getLiveSummaryAction(eventId)
        .then((next) => setSummary(next))
        .catch(() => null);
    }, 8000);
    return () => clearInterval(id);
  }, [eventId]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function refreshSummary() {
    const next = await getLiveSummaryAction(eventId);
    setSummary(next);
  }

  function focusSearch() {
    searchInputRef.current?.focus();
  }

  async function stopScanner() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScanner() {
    setScannerError(null);
    if (!scannerSupported) {
      setScannerError("Camera QR scanning is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      // @ts-expect-error BarcodeDetector is experimental
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes?.[0]?.rawValue as string | undefined;
          if (value && value !== lastScanRef.current) {
            lastScanRef.current = value;
            setToken(value);
            await handleResolve(value);
          }
        } catch {
          // keep scanning
        }
        if (streamRef.current) {
          requestAnimationFrame(() => {
            void tick();
          });
        }
      };
      void tick();
    } catch {
      setScannerError("Camera permission denied or unavailable.");
      await stopScanner();
    }
  }

  async function handleResolve(value?: string) {
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("tokenOrCode", value ?? token);
    const result = await resolveQrPassAction(formData);
    if (result.status !== "success") {
      setMessage(result.message);
      return;
    }
    setParty({
      registrationId: result.registrationId,
      confirmationCode: result.confirmationCode,
      attendees: result.attendees,
    });
    setSelected(
      result.attendees
        .filter((a) => a.attendanceStatus !== "PRESENT")
        .map((a) => a.id),
    );
    setMessage(`Resolved ${result.confirmationCode}. Select attendees to check in.`);
  }

  return (
    <div className={`space-y-6 ${isPending ? "opacity-80" : ""}`}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{eventTitle}</h1>
        <p className="text-sm text-zinc-500">
          {startLabel} · {timezone}
          {!settings.checkInEnabled ? " · Check-in disabled" : ""}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Present", summary.present],
            ["Expected", summary.expected],
            ["Checked out", summary.checkedOut],
            ["No-show", summary.noShow],
            ["Walk-ins", summary.walkIns],
            ["Checked-in people", summary.totalCheckedInPeople],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {message ? (
        <p
          role="status"
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          {message}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Station</h2>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            aria-label="Active station"
          >
            <option value="">No station</option>
            {activeStations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          {access.canOperateCheckIn ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                formData.set("eventId", eventId);
                startTransition(async () => {
                  const result = await openStationAction(formData);
                  setMessage(result.message);
                  if (result.status === "success" && result.station) {
                    setStations((prev) => [result.station as Station, ...prev]);
                    setStationId(result.station.id);
                  }
                  router.refresh();
                });
              }}
            >
              <input
                name="name"
                required
                placeholder="Station name"
                className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Open station
              </button>
            </form>
          ) : null}
          {stationId && access.canOperateCheckIn ? (
            <button
              type="button"
              className="text-sm text-red-700 dark:text-red-300"
              onClick={() =>
                startTransition(async () => {
                  const result = await closeStationAction(stationId, eventId);
                  setMessage(result.message);
                  setStations((prev) =>
                    prev.map((s) =>
                      s.id === stationId ? { ...s, status: "CLOSED" } : s,
                    ),
                  );
                  setStationId("");
                })
              }
            >
              Close selected station
            </button>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">QR / fallback</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste QR payload or fallback code"
              className="min-w-[12rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              aria-label="QR pass or fallback code"
            />
            <button
              type="button"
              disabled={!access.canOperateCheckIn}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              onClick={() => startTransition(() => handleResolve())}
            >
              Resolve
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              onClick={() =>
                startTransition(async () => {
                  if (scanning) await stopScanner();
                  else await startScanner();
                })
              }
            >
              {scanning ? "Stop scanner" : "Start scanner"}
            </button>
          </div>
          {scannerError ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">{scannerError}</p>
          ) : null}
          {scanning ? (
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full rounded-md bg-black object-cover"
              aria-label="QR scanner preview"
            />
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">Search attendees</h2>
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, email, phone, or confirmation code"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          aria-label="Search attendees"
        />
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.length === 0 ? (
            <li className="py-3 text-sm text-zinc-500">No matching attendees.</li>
          ) : (
            items.map((item) => {
              const attendanceStatus = item.attendanceRecords[0]?.status ?? "EXPECTED";
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.lastName}, {item.firstName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.registration.confirmationCode} · {attendanceStatus}
                      {item.email ? ` · ${item.email}` : ""}
                    </p>
                  </div>
                  {access.canOperateCheckIn ? (
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                      onClick={() =>
                        startTransition(async () => {
                          const formData = new FormData();
                          formData.set("eventId", eventId);
                          formData.set("attendeeId", item.id);
                          if (stationId) formData.set("stationId", stationId);
                          formData.set("source", "STAFF_SEARCH");
                          formData.set(
                            "operationKey",
                            `search:${item.id}:${Date.now()}`,
                          );
                          const result = await checkInAttendeeAction(formData);
                          setMessage(result.message);
                          await refreshSummary();
                          focusSearch();
                        })
                      }
                    >
                      Check in
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </section>

      {party ? (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">
            Party {party.confirmationCode}
          </h2>
          <ul className="space-y-2">
            {party.attendees.map((attendee) => (
              <li key={attendee.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(attendee.id)}
                    disabled={attendee.attendanceStatus === "PRESENT"}
                    onChange={(e) => {
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, attendee.id]
                          : prev.filter((id) => id !== attendee.id),
                      );
                    }}
                  />
                  {attendee.firstName} {attendee.lastName}{" "}
                  <span className="text-xs text-zinc-500">
                    ({attendee.attendanceStatus})
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!access.canOperateCheckIn || selected.length === 0}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            onClick={() =>
              startTransition(async () => {
                const formData = new FormData();
                formData.set("eventId", eventId);
                formData.set("registrationId", party.registrationId);
                formData.set("attendeeIdsJson", JSON.stringify(selected));
                if (stationId) formData.set("stationId", stationId);
                const result = await partyCheckInAction(formData);
                setMessage(result.message);
                await refreshSummary();
                setParty(null);
                focusSearch();
              })
            }
          >
            Check in selected
          </button>
        </section>
      ) : null}

      {access.canCreateWalkIn && settings.allowWalkIns ? (
        <section
          aria-labelledby="walk-in-heading"
          className="space-y-4 rounded-xl border border-[var(--bits-border)] bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <h2
              id="walk-in-heading"
              className="text-lg font-semibold text-[var(--bits-navy)] dark:text-zinc-100"
            >
              Register a Walk-In Guest
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Creates the event registration and checks the guest in together.
              {stationId
                ? ` The selected station will be recorded.`
                : " No station is selected."}
            </p>
          </div>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              formData.set("eventId", eventId);
              if (stationId) formData.set("stationId", stationId);
              startTransition(async () => {
                const result = await walkInAction(formData);
                setMessage(result.message);
                if (result.status === "success") {
                  form.reset();
                  await refreshSummary();
                }
              });
            }}
          >
            <label className="space-y-2">
              <span className="text-sm font-medium">First name</span>
              <input
                name="firstName"
                required
                maxLength={100}
                disabled={isPending}
                autoComplete="given-name"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Last name</span>
              <input
                name="lastName"
                required
                maxLength={100}
                disabled={isPending}
                autoComplete="family-name"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Email (optional)</span>
              <input
                name="email"
                type="email"
                disabled={isPending}
                autoComplete="email"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Phone (optional)</span>
              <input
                name="phone"
                type="tel"
                disabled={isPending}
                autoComplete="tel"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium">Staff notes (optional)</span>
              <textarea
                name="notes"
                rows={3}
                maxLength={1000}
                disabled={isPending}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              className="rounded-md bg-[var(--bits-navy)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? "Registering and checking in…" : "Register and Check In Guest"}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {!access.canCreateWalkIn
            ? "Your role does not have permission to register walk-in guests."
            : "Walk-in registration is disabled for this event."}
        </section>
      )}
    </div>
  );
}
