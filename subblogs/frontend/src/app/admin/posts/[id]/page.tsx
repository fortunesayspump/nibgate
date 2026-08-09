"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiAuthFetch, type BlogPost } from "@/lib/api";
import PostForm from "@/components/PostForm";

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const [initialData, setInitialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/admin/login"); return; }
    apiAuthFetch<{ success: boolean; post: BlogPost }>(`/blog/admin/posts/${params.id}`)
      .then((data) => {
        const p = data.post;
        setInitialData({
          title: p.title,
          slug: p.slug,
          bodyMarkdown: p.bodyMarkdown,
          excerpt: p.excerpt || "",
          tag: p.tag || "General",
          tags: Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || "",
          coverUrl: p.coverUrl || "",
          videoUrl: p.videoUrl || "",
          price: p.price || "",
          status: p.status,
          featured: p.featured,
          type: p.type || "article",
          media: p.media || "",
          videoStorageRef: p.videoStorageRef || "",
          videoEncryptedKey: p.videoEncryptedKey || "",
          videoContentType: p.videoContentType || "",
          videoName: p.videoName || "",
          videoSize: p.videoSize,
          audioUrl: p.audioUrl || "",
          audioStorageRef: p.audioStorageRef || "",
          audioEncryptedKey: p.audioEncryptedKey || "",
          audioContentType: p.audioContentType || "",
          documentUrl: p.documentUrl || "",
          documentStorageRef: p.documentStorageRef || "",
          documentEncryptedKey: p.documentEncryptedKey || "",
          documentContentType: p.documentContentType || "",
          documentName: p.documentName || "",
          documentSize: p.documentSize,
        });
      })
      .catch(() => router.push("/admin/posts"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <button onClick={() => router.push("/admin/posts")} className="btn-ghost inline-flex items-center gap-1">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold mb-6">Edit Post</h1>
        {initialData && <PostForm initialData={initialData} postId={params.id as string} />}
      </div>
    </div>
  );
}
