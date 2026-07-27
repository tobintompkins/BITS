import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MembersIdRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/member/${id}`);
}
