"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";

import {
  createOrganizationSettingsActionState,
  organizationSettingsSchema,
  type OrganizationSettingsActionState,
  type OrganizationSettingsFormValues,
} from "@/lib/validation/organization-settings";

import { saveOrganizationSettingsAction } from "./actions";

type OrganizationSettingsFormProps = {
  initialValues: OrganizationSettingsFormValues;
  canEdit: boolean;
  isReadOnly: boolean;
  roleLabel: string | null;
};

type FormInput = Omit<OrganizationSettingsFormValues, "logoUrl">;

const inputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400";

const sectionClassName =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

const sectionHeaderClassName =
  "border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800";

const sectionBodyClassName = "grid gap-4 px-4 py-6 sm:px-6 md:grid-cols-2";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}

function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
    >
      {message}
    </div>
  );
}

export function OrganizationSettingsForm({
  initialValues,
  canEdit,
  isReadOnly,
  roleLabel,
}: OrganizationSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savedLogoUrl, setSavedLogoUrl] = useState(initialValues.logoUrl);
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [actionState, setActionState] = useState<OrganizationSettingsActionState>(
    createOrganizationSettingsActionState(initialValues),
  );

  const displayLogo = removeLogo
    ? ""
    : localLogoPreview ?? savedLogoUrl;

  const form = useForm<FormInput>({
    resolver: zodResolver(
      organizationSettingsSchema,
    ) as unknown as Resolver<FormInput>,
    defaultValues: initialValues,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const formData = new FormData();

      Object.entries(values).forEach(([key, value]) => {
        formData.append(key, String(value ?? ""));
      });

      formData.append("logoUrl", displayLogo);
      formData.append("removeLogo", removeLogo ? "true" : "false");

      if (selectedLogoFile) {
        formData.append("logoFile", selectedLogoFile);
      }

      const result = await saveOrganizationSettingsAction(actionState, formData);
      setActionState(result);

      if (result.status === "success") {
        reset(result.values);
        setSavedLogoUrl(result.values.logoUrl);
        setLocalLogoPreview(null);
        setSelectedLogoFile(null);
        setRemoveLogo(false);
        setShowToast(true);
        return;
      }

      Object.entries(result.fieldErrors).forEach(([field, messages]) => {
        if (!messages?.[0]) {
          return;
        }

        setError(field as keyof FormInput, {
          type: "server",
          message: messages[0],
        });
      });
    });
  });

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setRemoveLogo(false);
    setSelectedLogoFile(file);
    setLocalLogoPreview(URL.createObjectURL(file));
  };

  const handleRemoveLogo = () => {
    setRemoveLogo(true);
    setLocalLogoPreview(null);
    setSelectedLogoFile(null);
  };

  const handleReset = () => {
    reset(initialValues);
    setSavedLogoUrl(initialValues.logoUrl);
    setLocalLogoPreview(null);
    setSelectedLogoFile(null);
    setRemoveLogo(false);
    setActionState(createOrganizationSettingsActionState(initialValues));
  };

  return (
    <>
      {showToast ? (
        <Toast
          message="Organization Settings Updated Successfully"
          onDismiss={() => setShowToast(false)}
        />
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        {isReadOnly ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            You have read-only access to organization settings
            {roleLabel ? ` (${roleLabel})` : ""}. Only organization
            administrators can make changes.
          </div>
        ) : null}

        {actionState.status === "error" && actionState.message ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {actionState.message}
          </div>
        ) : null}

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Church Information
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Church Name
              </span>
              <input
                {...register("churchName")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.churchName?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Display Name
              </span>
              <input
                {...register("displayName")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.displayName?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                EIN
              </span>
              <input
                {...register("ein")}
                disabled={!canEdit || isPending}
                placeholder="12-3456789"
                className={inputClassName}
              />
              <FieldError message={errors.ein?.message} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Contact Information
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Phone
              </span>
              <input
                {...register("phone")}
                disabled={!canEdit || isPending}
                placeholder="(615) 555-0100"
                className={inputClassName}
              />
              <FieldError message={errors.phone?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Email
              </span>
              <input
                type="email"
                {...register("email")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.email?.message} />
            </label>
            <div className="md:col-span-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Website
                </span>
                <input
                  type="url"
                  {...register("website")}
                  disabled={!canEdit || isPending}
                  placeholder="https://example.org"
                  className={inputClassName}
                />
                <FieldError message={errors.website?.message} />
              </label>
            </div>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Address
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <div className="md:col-span-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Address Line 1
                </span>
                <input
                  {...register("addressLine1")}
                  disabled={!canEdit || isPending}
                  className={inputClassName}
                />
                <FieldError message={errors.addressLine1?.message} />
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Address Line 2
                </span>
                <input
                  {...register("addressLine2")}
                  disabled={!canEdit || isPending}
                  className={inputClassName}
                />
                <FieldError message={errors.addressLine2?.message} />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                City
              </span>
              <input
                {...register("city")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.city?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                State
              </span>
              <input
                {...register("state")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.state?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                ZIP Code
              </span>
              <input
                {...register("zipCode")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.zipCode?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Country
              </span>
              <input
                {...register("country")}
                disabled={!canEdit || isPending}
                className={inputClassName}
              />
              <FieldError message={errors.country?.message} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Statement Settings
            </h2>
          </div>
          <div className="grid gap-4 px-4 py-6 sm:px-6">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Time Zone
              </span>
              <input
                {...register("timeZone")}
                disabled={!canEdit || isPending}
                placeholder="America/New_York"
                className={inputClassName}
              />
              <FieldError message={errors.timeZone?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Statement Footer
              </span>
              <textarea
                {...register("statementFooter")}
                disabled={!canEdit || isPending}
                rows={6}
                placeholder="No goods or services were provided in exchange for these contributions, other than intangible religious benefits, if applicable."
                className={inputClassName}
              />
              <FieldError message={errors.statementFooter?.message} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Branding
            </h2>
          </div>
          <div className="space-y-4 px-4 py-6 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                {displayLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayLogo}
                    alt="Church logo preview"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    No logo uploaded
                  </span>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Upload a church logo for statements and branding. PNG, JPG, or
                  SVG up to 5MB.
                </p>
                {canEdit ? (
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
                      Upload Logo
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        disabled={isPending}
                        onChange={handleLogoChange}
                      />
                    </label>
                    {displayLogo ? (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={isPending}
                        className="inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
                      >
                        Remove Logo
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {canEdit ? (
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Save the core organization profile used by future workflows,
              reports, and statement generation.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => router.back()}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Reset Form
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {isPending ? <Spinner /> : null}
                {isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </>
  );
}
