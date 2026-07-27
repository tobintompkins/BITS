import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HouseholdsIdRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/household/${id}`);
}
