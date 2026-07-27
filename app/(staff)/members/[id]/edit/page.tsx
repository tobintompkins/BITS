import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MembersIdEditRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/member/${id}/edit`);
}
