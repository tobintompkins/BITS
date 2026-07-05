"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createOrganizationSettingsActionState,
  type OrganizationSettingsFormValues,
} from "@/lib/validation/organization-settings";

import { saveOrganizationSettingsAction } from "./actions";

type OrganizationSettingsFormProps = {
  initialValues: OrganizationSettingsFormValues;
};

type FieldName = keyof OrganizationSettingsFormValues;

type TextFieldProps = {
  label: string;
  name: FieldName;
  defaultValue: string;
  required?: boolean;
  type?: "text" | "email" | "url";
  placeholder?: string;
  errors?: string[];
};

type TextAreaFieldProps = {
  label: string;
  name: FieldName;
  defaultValue: string;
  rows?: number;
  placeholder?: string;
  errors?: string[];
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-red-600">{errors[0]}</p>;
}

function TextField({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  placeholder,
  errors,
}: TextFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-zinc-900">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${name}-error` : undefined}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
      <div id={`${name}-error`}>
        <FieldError errors={errors} />
      </div>
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 5,
  placeholder,
  errors,
}: TextAreaFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-zinc-900">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${name}-error` : undefined}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
      <div id={`${name}-error`}>
        <FieldError errors={errors} />
      </div>
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save organization settings"}
    </button>
  );
}

export function OrganizationSettingsForm({
  initialValues,
}: OrganizationSettingsFormProps) {
  const [state, formAction] = useActionState(
    saveOrganizationSettingsAction,
    createOrganizationSettingsActionState(initialValues),
  );
  const formKey = JSON.stringify(state.values);

  return (
    <form key={formKey} action={formAction} className="space-y-6">
      {state.message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Church Information
          </h2>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <TextField
            label="Church Name"
            name="churchName"
            defaultValue={state.values.churchName}
            errors={state.fieldErrors.churchName}
            required
          />
          <TextField
            label="Display Name"
            name="displayName"
            defaultValue={state.values.displayName}
            errors={state.fieldErrors.displayName}
            required
          />
          <TextField
            label="EIN"
            name="ein"
            defaultValue={state.values.ein}
            errors={state.fieldErrors.ein}
            placeholder="12-3456789"
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Contact Information
          </h2>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <TextField
            label="Phone"
            name="phone"
            defaultValue={state.values.phone}
            errors={state.fieldErrors.phone}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={state.values.email}
            errors={state.fieldErrors.email}
          />
          <div className="md:col-span-2">
            <TextField
              label="Website"
              name="website"
              type="url"
              defaultValue={state.values.website}
              errors={state.fieldErrors.website}
              placeholder="https://example.org"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Address</h2>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <TextField
              label="Address Line 1"
              name="addressLine1"
              defaultValue={state.values.addressLine1}
              errors={state.fieldErrors.addressLine1}
              required
            />
          </div>
          <div className="md:col-span-2">
            <TextField
              label="Address Line 2"
              name="addressLine2"
              defaultValue={state.values.addressLine2}
              errors={state.fieldErrors.addressLine2}
            />
          </div>
          <TextField
            label="City"
            name="city"
            defaultValue={state.values.city}
            errors={state.fieldErrors.city}
            required
          />
          <TextField
            label="State"
            name="state"
            defaultValue={state.values.state}
            errors={state.fieldErrors.state}
            required
          />
          <TextField
            label="ZIP Code"
            name="zipCode"
            defaultValue={state.values.zipCode}
            errors={state.fieldErrors.zipCode}
            required
          />
          <TextField
            label="Country"
            name="country"
            defaultValue={state.values.country}
            errors={state.fieldErrors.country}
            required
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Statement Settings
          </h2>
        </div>
        <div className="grid gap-4 px-6 py-6">
          <TextField
            label="Time Zone"
            name="timeZone"
            defaultValue={state.values.timeZone}
            errors={state.fieldErrors.timeZone}
            placeholder="America/New_York"
            required
          />
          <TextAreaField
            label="Statement Footer"
            name="statementFooter"
            defaultValue={state.values.statementFooter}
            errors={state.fieldErrors.statementFooter}
            placeholder="No goods or services were provided in exchange for these contributions, other than intangible religious benefits, if applicable."
            rows={6}
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-6 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-zinc-600">
          Save the core organization profile used by future workflows, reports,
          and statement generation.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
