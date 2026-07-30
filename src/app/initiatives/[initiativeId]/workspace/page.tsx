import { redirect } from "next/navigation";

export default async function WorkspaceIndex({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  redirect(`/initiatives/${initiativeId}/workspace/roadmap`);
}
