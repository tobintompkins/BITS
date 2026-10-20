export function LedgerSchemaAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      {message}
    </p>
  );
}
