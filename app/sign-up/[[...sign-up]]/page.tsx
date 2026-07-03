import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <SignUp />
    </main>
  );
}
