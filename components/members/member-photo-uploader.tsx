"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  removeMemberPhotoAction,
  uploadMemberPhotoAction,
} from "@/app/(staff)/member/photo-actions";
import { Toast } from "@/components/ui/toast";
import { MemberAvatar } from "@/components/members/member-avatar";
import { getMemberDisplayName } from "@/lib/utils/member-display";

type MemberPhotoUploaderProps = {
  member?: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
  };
  photoUrl?: string | null;
  canEdit: boolean;
  onPhotoSelected?: (file: File | null) => void;
  pendingFile?: File | null;
};

export function MemberPhotoUploader({
  member,
  photoUrl,
  canEdit,
  onPhotoSelected,
  pendingFile,
}: MemberPhotoUploaderProps) {
  const router = useRouter();
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewUrl = selectedPreview ?? photoUrl ?? null;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);

    if (!file) {
      onPhotoSelected?.(null);
      setSelectedPreview(null);
      return;
    }

    onPhotoSelected?.(file);
    setSelectedPreview(URL.createObjectURL(file));

    if (member?.id) {
      startTransition(async () => {
        try {
          const formData = new FormData();
          formData.append("photoFile", file);
          const result = await uploadMemberPhotoAction(member.id, formData);
          setSelectedPreview(result.photoUrl);
          setToast("Profile photo uploaded.");
          router.refresh();
        } catch (uploadError) {
          setSelectedPreview(null);
          setError(
            uploadError instanceof Error
              ? uploadError.message
              : "Unable to upload photo.",
          );
        }
      });
    }
  }

  function handleRemove() {
    if (!member?.id) {
      onPhotoSelected?.(null);
      setSelectedPreview(null);
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        await removeMemberPhotoAction(member.id);
        setSelectedPreview(null);
        onPhotoSelected?.(null);
        setToast("Profile photo removed.");
        router.refresh();
      } catch (removeError) {
        setError(
          removeError instanceof Error
            ? removeError.message
            : "Unable to remove photo.",
        );
      }
    });
  }

  const displayMember = member ?? {
    id: "new",
    firstName: "N",
    lastName: "A",
    preferredName: null,
  };

  return (
    <div className="space-y-4">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <MemberAvatar
          member={displayMember}
          photoUrl={previewUrl}
          size="lg"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Profile Photo
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            JPG, PNG, or WEBP up to 5MB.
          </p>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
                {previewUrl ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isPending}
                  onChange={handleFileChange}
                />
              </label>
              {previewUrl ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleRemove}
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                >
                  Remove photo
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {member ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Photo for {getMemberDisplayName(member)}
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Photo will be saved after the member is created.
        </p>
      )}

      {pendingFile && !member?.id ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Photo selected and ready to upload after save.
        </p>
      ) : null}
    </div>
  );
}
