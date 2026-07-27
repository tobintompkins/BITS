import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getAttendanceRecordById,
  getCareAccess,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  AttendanceForm,
  mapAttendanceToFormValues,
} from "@/components/care/attendance-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type EditAttendancePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAttendancePage({ params }: EditAttendancePageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewAttendance) {
    redirect("/dashboard");
  }

  const [record, members] = await Promise.all([
    getAttendanceRecordById(id),
    getMemberSelectOptions(),
  ]);

  if (!record) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/attendance"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Attendance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit Attendance
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {record.serviceName} · {record.attendanceDate.toISOString().slice(0, 10)}
        </p>
      </header>

      <AttendanceForm
        mode="edit"
        attendanceId={id}
        members={members}
        initialValues={mapAttendanceToFormValues(record)}
        canEdit={access.canManageAttendance}
      />
    </div>
  );
}
