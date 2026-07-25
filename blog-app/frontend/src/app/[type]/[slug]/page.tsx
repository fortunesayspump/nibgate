import { redirect } from "next/navigation";

export default async function TypeSlugPage({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { slug } = await params;
  redirect(`/posts/${slug}`);
}
