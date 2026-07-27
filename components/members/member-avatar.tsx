import Image from "next/image";

import { getMemberDisplayName } from "@/lib/utils/member-display";

export function MemberAvatar({
  member,
  photoUrl,
  size = "lg",
}: {
  member: {
    firstName: string;
    lastName: string;
    preferredName?: string | null;
  };
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-10 w-10 text-sm",
    md: "h-16 w-16 text-lg",
    lg: "h-20 w-20 text-2xl",
  }[size];

  const initials = `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={`${getMemberDisplayName(member)} profile photo`}
        width={size === "lg" ? 80 : size === "md" ? 64 : 40}
        height={size === "lg" ? 80 : size === "md" ? 64 : 40}
        unoptimized
        className={`${sizeClasses} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex ${sizeClasses} items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}
    >
      {initials}
    </div>
  );
}
