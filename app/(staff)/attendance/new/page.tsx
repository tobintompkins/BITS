import Link from "next/link";
import { redirect } from "next/navigation";

import { getCareAccess } from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import { AttendanceForm } from "@/components/care/attendance-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function NewAttendancePage() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canManageAttendance) {
    redirect("/dashboard");
  }

  const members = await getMemberSelectOptions();

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
          Log Attendance
        </h1>
      </header>

      <AttendanceForm
        mode="create"
        members={members}
        initialValues={{
          memberId: "",
          attendanceDate: new Date().toISOString().slice(0, 10),
          serviceName: "",
          attendanceType: "PRESENT",
          checkInTime: "",
          checkOutTime: "",
          notes: "",
        }}
        canEdit
      />
    </div>
  );
}
