"use client";

type ConfirmSubmitButtonProps = {
  message: string;
  children: React.ReactNode;
  name?: string;
  value?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
};

export function ConfirmSubmitButton({
  message,
  children,
  name,
  value,
  className,
  formAction,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      formAction={formAction}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
