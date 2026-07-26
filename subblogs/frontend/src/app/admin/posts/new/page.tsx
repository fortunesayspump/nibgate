"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PostForm from "@/components/PostForm";

export default function NewPostPage() {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) router.push("/admin/login");
  }, [router]);

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <button onClick={() => router.push("/admin/posts")} className="btn-ghost inline-flex items-center gap-1">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold mb-6">New Post</h1>
        <PostForm />
      </div>
    </div>
  );
}
