"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addMemberToMinistryAction,
  assignSpiritualGiftAction,
  createMemberInterestAction,
  createMemberMilestoneAction,
  createMemberSkillAction,
  deleteMemberDocumentAction,
  deleteMemberInterestAction,
  deleteMemberMilestoneAction,
  deleteMemberSkillAction,
  removeMemberFromMinistryAction,
  removeMemberSpiritualGiftAction,
  setMemberAsMinistryLeaderAction,
  setPrimaryMemberSpiritualGiftAction,
  uploadMemberDocumentAction,
} from "@/app/(staff)/member-engagement/actions";
import type { MemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import {
  formatEngagementEnumLabel,
  giftProficiencyLevelOptions,
  memberDocumentTypeOptions,
  memberMinistryRoleOptions,
  memberMinistryStatusOptions,
  membershipMilestoneTypeOptions,
  skillProficiencyLevelOptions,
} from "@/lib/constants/member-engagement";
import { Toast } from "@/components/ui/toast";

type ConfirmState = {
  title: string;
  message: string;
  action: () => Promise<void>;
};

function ConfirmDialog({
  state,
  isPending,
  onCancel,
}: {
  state: ConfirmState;
  isPending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {state.title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{state.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void state.action()}
            disabled={isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
          >
            {isPending ? "Working..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type Milestone = {
  id: string;
  milestoneType: string;
  title: string;
  milestoneDate: Date;
  location: string | null;
  officiant: string | null;
  notes: string | null;
  documentKey: string | null;
};

type GiftAssignment = {
  id: string;
  proficiencyLevel: string;
  isPrimary: boolean;
  notes: string | null;
  spiritualGift: { id: string; name: string; category: string | null };
};

type MinistryAssignment = {
  id: string;
  role: string;
  status: string;
  isLeader: boolean;
  joinedDate: Date | null;
  notes: string | null;
  ministry: { id: string; name: string; ministryType: string; isActive: boolean };
};

type Skill = {
  id: string;
  skillName: string;
  skillCategory: string | null;
  proficiencyLevel: string;
  yearsExperience: number | null;
  isAvailableToServe: boolean;
  notes: string | null;
};

type Interest = {
  id: string;
  interestName: string;
  interestCategory: string | null;
  notes: string | null;
};

type DocumentRecord = {
  id: string;
  documentType: string;
  title: string;
  description: string | null;
  fileName: string;
  isConfidential: boolean;
  expirationDate: Date | null;
  restricted?: boolean;
};

type CatalogGift = { id: string; name: string; category: string | null };
type MinistryOption = { id: string; name: string; ministryType: string };

export function MemberMilestonesPanel({
  memberId,
  records,
  canManage,
}: {
  memberId: string;
  records: Milestone[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createMemberMilestoneAction(formData);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setToast(result.message);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <PanelShell
      title="Milestones"
      description="Salvation, baptism, membership, and other life milestones."
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Add milestone"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          state={confirm}
          isPending={isPending}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {showForm ? (
        <form action={submit} className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <input type="hidden" name="memberId" value={memberId} />
          <Field label="Type">
            <select name="milestoneType" required className={inputClass} defaultValue="BAPTISM">
              {membershipMilestoneTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" name="milestoneDate" required className={inputClass} />
          </Field>
          <Field label="Title">
            <input name="title" required className={inputClass} placeholder="Baptism Sunday" />
          </Field>
          <Field label="Location">
            <input name="location" className={inputClass} />
          </Field>
          <Field label="Officiant">
            <input name="officiant" className={inputClass} />
          </Field>
          <Field label="Certificate #">
            <input name="certificateNumber" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
            <input type="checkbox" name="syncMemberDates" value="true" />
            Sync member salvation / baptism / membership date when empty or confirmed
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? "Saving..." : "Save milestone"}
            </button>
          </div>
        </form>
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No milestones recorded yet." />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {records.map((record) => (
            <li key={record.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{record.title}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {formatEngagementEnumLabel(membershipMilestoneTypeOptions, record.milestoneType)}
                  {" · "}
                  {new Date(record.milestoneDate).toLocaleDateString()}
                  {record.location ? ` · ${record.location}` : ""}
                </p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() =>
                    setConfirm({
                      title: "Delete milestone?",
                      message: `Remove “${record.title}”?`,
                      action: async () => {
                        await deleteMemberMilestoneAction(record.id, memberId);
                        setConfirm(null);
                        setToast("Milestone deleted.");
                        router.refresh();
                      },
                    })
                  }
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function MemberSpiritualGiftsPanel({
  memberId,
  records,
  catalogGifts,
  canAssign,
}: {
  memberId: string;
  records: GiftAssignment[];
  catalogGifts: CatalogGift[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await assignSpiritualGiftAction(formData);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setToast(result.message);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <PanelShell
      title="Spiritual Gifts"
      description="Gifts identified for this member."
      action={
        canAssign ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Assign gift"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmDialog state={confirm} isPending={isPending} onCancel={() => setConfirm(null)} />
      ) : null}

      {showForm ? (
        <form action={submit} className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <input type="hidden" name="memberId" value={memberId} />
          <Field label="Gift">
            <select name="spiritualGiftId" required className={inputClass} defaultValue="">
              <option value="" disabled>Select a gift</option>
              {catalogGifts.map((gift) => (
                <option key={gift.id} value={gift.id}>
                  {gift.name}{gift.category ? ` (${gift.category})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Proficiency">
            <select name="proficiencyLevel" required className={inputClass} defaultValue="DISCOVERING">
              {giftProficiencyLevelOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Identified date">
            <input type="date" name="identifiedDate" className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" name="isPrimary" value="true" />
            Primary gift
          </label>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
          </div>
          <div>
            <button type="submit" disabled={isPending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
              {isPending ? "Saving..." : "Assign gift"}
            </button>
          </div>
        </form>
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No spiritual gifts assigned yet." />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {records.map((record) => (
            <li key={record.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {record.spiritualGift.name}
                  {record.isPrimary ? (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      Primary
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {formatEngagementEnumLabel(giftProficiencyLevelOptions, record.proficiencyLevel)}
                </p>
              </div>
              {canAssign ? (
                <div className="flex gap-3 text-sm">
                  {!record.isPrimary ? (
                    <button
                      type="button"
                      className="text-zinc-700 hover:underline dark:text-zinc-200"
                      onClick={() =>
                        startTransition(async () => {
                          await setPrimaryMemberSpiritualGiftAction(record.id, memberId);
                          setToast("Primary gift updated.");
                          router.refresh();
                        })
                      }
                    >
                      Set primary
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      setConfirm({
                        title: "Remove gift?",
                        message: `Remove ${record.spiritualGift.name}?`,
                        action: async () => {
                          await removeMemberSpiritualGiftAction(record.id, memberId);
                          setConfirm(null);
                          setToast("Gift removed.");
                          router.refresh();
                        },
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function MemberMinistriesPanel({
  memberId,
  records,
  ministries,
  canManageRoster,
}: {
  memberId: string;
  records: MinistryAssignment[];
  ministries: MinistryOption[];
  canManageRoster: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addMemberToMinistryAction(formData);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setToast(result.message);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <PanelShell
      title="Ministries"
      description="Teams and serving roles for this member."
      action={
        canManageRoster ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Add to ministry"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmDialog state={confirm} isPending={isPending} onCancel={() => setConfirm(null)} />
      ) : null}

      {showForm ? (
        <form action={submit} className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <input type="hidden" name="memberId" value={memberId} />
          <Field label="Ministry">
            <select name="ministryId" required className={inputClass} defaultValue="">
              <option value="" disabled>Select ministry</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select name="role" required className={inputClass} defaultValue="VOLUNTEER">
              {memberMinistryRoleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" required className={inputClass} defaultValue="ACTIVE">
              {memberMinistryStatusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Joined date">
            <input type="date" name="joinedDate" className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" name="isLeader" value="true" />
            Leader
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={isPending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
              {isPending ? "Saving..." : "Add to ministry"}
            </button>
          </div>
        </form>
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="Not serving in any ministries yet." />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {records.map((record) => (
            <li key={record.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link
                  href={`/ministries/${record.ministry.id}`}
                  className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                >
                  {record.ministry.name}
                </Link>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {formatEngagementEnumLabel(memberMinistryRoleOptions, record.role)}
                  {" · "}
                  {formatEngagementEnumLabel(memberMinistryStatusOptions, record.status)}
                  {record.isLeader ? " · Leader" : ""}
                </p>
              </div>
              {canManageRoster ? (
                <div className="flex gap-3 text-sm">
                  {!record.isLeader ? (
                    <button
                      type="button"
                      className="text-zinc-700 hover:underline dark:text-zinc-200"
                      onClick={() =>
                        startTransition(async () => {
                          await setMemberAsMinistryLeaderAction(
                            record.id,
                            memberId,
                            record.ministry.id,
                          );
                          setToast("Marked as leader.");
                          router.refresh();
                        })
                      }
                    >
                      Make leader
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      setConfirm({
                        title: "Remove from ministry?",
                        message: `Remove from ${record.ministry.name}?`,
                        action: async () => {
                          await removeMemberFromMinistryAction(
                            record.id,
                            memberId,
                            record.ministry.id,
                          );
                          setConfirm(null);
                          setToast("Removed from ministry.");
                          router.refresh();
                        },
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function MemberSkillsInterestsPanel({
  memberId,
  skills,
  interests,
  canManage,
}: {
  memberId: string;
  skills: Skill[];
  interests: Interest[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [showInterestForm, setShowInterestForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  return (
    <div className="space-y-8">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmDialog state={confirm} isPending={isPending} onCancel={() => setConfirm(null)} />
      ) : null}

      <PanelShell
        title="Skills"
        description="Practical skills and availability to serve."
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowSkillForm((v) => !v)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {showSkillForm ? "Cancel" : "Add skill"}
            </button>
          ) : null
        }
      >
        {showSkillForm ? (
          <form
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                const result = await createMemberSkillAction(formData);
                if (result.status === "error") {
                  setError(result.message);
                  return;
                }
                setToast(result.message);
                setShowSkillForm(false);
                router.refresh();
              });
            }}
            className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
          >
            <input type="hidden" name="memberId" value={memberId} />
            <Field label="Skill name">
              <input name="skillName" required className={inputClass} />
            </Field>
            <Field label="Category">
              <input name="skillCategory" className={inputClass} />
            </Field>
            <Field label="Proficiency">
              <select name="proficiencyLevel" required className={inputClass} defaultValue="BEGINNER">
                {skillProficiencyLevelOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Years experience">
              <input name="yearsExperience" type="number" min={0} max={80} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
              <input type="checkbox" name="isAvailableToServe" value="true" />
              Available to serve
            </label>
            <div>
              <button type="submit" disabled={isPending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
                Save skill
              </button>
            </div>
          </form>
        ) : null}

        {skills.length === 0 ? (
          <EmptyState message="No skills recorded." />
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {skills.map((skill) => (
              <li key={skill.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{skill.skillName}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {formatEngagementEnumLabel(skillProficiencyLevelOptions, skill.proficiencyLevel)}
                    {skill.isAvailableToServe ? " · Available to serve" : ""}
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() =>
                      setConfirm({
                        title: "Delete skill?",
                        message: `Remove ${skill.skillName}?`,
                        action: async () => {
                          await deleteMemberSkillAction(skill.id, memberId);
                          setConfirm(null);
                          setToast("Skill deleted.");
                          router.refresh();
                        },
                      })
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelShell>

      <PanelShell
        title="Interests"
        description="Areas of interest for future involvement."
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowInterestForm((v) => !v)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {showInterestForm ? "Cancel" : "Add interest"}
            </button>
          ) : null
        }
      >
        {showInterestForm ? (
          <form
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                const result = await createMemberInterestAction(formData);
                if (result.status === "error") {
                  setError(result.message);
                  return;
                }
                setToast(result.message);
                setShowInterestForm(false);
                router.refresh();
              });
            }}
            className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
          >
            <input type="hidden" name="memberId" value={memberId} />
            <Field label="Interest">
              <input name="interestName" required className={inputClass} />
            </Field>
            <Field label="Category">
              <input name="interestCategory" className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <textarea name="notes" rows={2} className={inputClass} />
              </Field>
            </div>
            <div>
              <button type="submit" disabled={isPending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
                Save interest
              </button>
            </div>
          </form>
        ) : null}

        {interests.length === 0 ? (
          <EmptyState message="No interests recorded." />
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {interests.map((interest) => (
              <li key={interest.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{interest.interestName}</p>
                  {interest.interestCategory ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{interest.interestCategory}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() =>
                      setConfirm({
                        title: "Delete interest?",
                        message: `Remove ${interest.interestName}?`,
                        action: async () => {
                          await deleteMemberInterestAction(interest.id, memberId);
                          setConfirm(null);
                          setToast("Interest deleted.");
                          router.refresh();
                        },
                      })
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    </div>
  );
}

export function MemberDocumentsPanel({
  memberId,
  records,
  access,
}: {
  memberId: string;
  records: DocumentRecord[];
  access: MemberEngagementAccess;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  return (
    <PanelShell
      title="Documents"
      description="Certificates, forms, and other member files. Confidential files download through a protected route."
      action={
        access.canManageDocuments ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Upload document"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmDialog state={confirm} isPending={isPending} onCancel={() => setConfirm(null)} />
      ) : null}

      {showForm ? (
        <form
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await uploadMemberDocumentAction(formData);
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              setToast(result.message);
              setShowForm(false);
              router.refresh();
            });
          }}
          className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
        >
          <input type="hidden" name="memberId" value={memberId} />
          <Field label="Type">
            <select name="documentType" required className={inputClass} defaultValue="OTHER">
              {memberDocumentTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input name="title" required className={inputClass} />
          </Field>
          <Field label="Expiration">
            <input type="date" name="expirationDate" className={inputClass} />
          </Field>
          <Field label="File">
            <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
          </div>
          {access.canManageConfidentialDocuments ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
              <input type="checkbox" name="isConfidential" value="true" />
              Confidential
            </label>
          ) : null}
          <div>
            <button type="submit" disabled={isPending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
              Upload
            </button>
          </div>
        </form>
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No documents on file." />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {records.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {doc.title}
                  {doc.isConfidential ? (
                    <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                      Confidential
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {formatEngagementEnumLabel(memberDocumentTypeOptions, doc.documentType)}
                  {doc.expirationDate
                    ? ` · Expires ${new Date(doc.expirationDate).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                {!doc.restricted ? (
                  <a
                    href={`/api/member-documents/${doc.id}/download`}
                    className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-zinc-500">Restricted</span>
                )}
                {access.canManageDocuments &&
                (!doc.isConfidential || access.canManageConfidentialDocuments) ? (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      setConfirm({
                        title: "Delete document?",
                        message: `Delete “${doc.title}”?`,
                        action: async () => {
                          await deleteMemberDocumentAction(doc.id, memberId);
                          setConfirm(null);
                          setToast("Document deleted.");
                          router.refresh();
                        },
                      })
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
