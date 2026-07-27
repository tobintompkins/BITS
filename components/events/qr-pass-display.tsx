"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrPassDisplay({
  payload,
  fallbackCode,
  label = "Event check-in pass",
}: {
  payload: string | null;
  fallbackCode: string | null;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="space-y-3" aria-label={label} key={payload ?? "none"}>
      {payload && dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt=""
          width={220}
          height={220}
          className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700"
        />
      ) : (
        <p className="text-sm text-zinc-500">
          {payload
            ? "Generating QR…"
            : "QR image available only when a new pass is issued or rotated."}
        </p>
      )}
      <p className="text-sm">
        Fallback code:{" "}
        {fallbackCode ? (
          <span className="font-mono text-base tracking-wider">
            {fallbackCode}
          </span>
        ) : (
          <span className="text-zinc-500">
            unavailable for existing passes — rotate to reveal a new code
          </span>
        )}
      </p>
      <p className="text-xs text-zinc-500">
        Do not share this pass. It does not include your name or contact details.
      </p>
    </div>
  );
}
