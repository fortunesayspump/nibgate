"use client";

import { useRef, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Markdown } from "tiptap-markdown";
import { createVirtualCursor } from "prosemirror-virtual-cursor";
import { Extension } from "@tiptap/core";
import {
  Bold, Italic, Strikethrough, Heading2, Quote, List, ListOrdered,
  Link2, Image, Code, Code2, Undo2, Redo2, Table2, CheckSquare,
  Maximize2, Minimize2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const iconClass = "w-4 h-4";
const btn = "inline-flex items-center justify-center w-7 h-7 text-xs border rounded cursor-pointer font-medium leading-none transition-all hover:brightness-90";

export default function MarkdownEditor({ value, onChange, label = "Body" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const lastMd = useRef(value);
  const isInternal = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: { depth: 100 }, link: { openOnClick: false }, heading: { levels: [1, 2, 3] } }),
      ImageExt,
      Placeholder.configure({ placeholder: "Write in markdown..." }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
      Extension.create({ addProseMirrorPlugins: () => [createVirtualCursor({ skipWarning: true })] }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      if (isInternal.current) return;
      const md = (editor.storage as any).markdown.getMarkdown();
      if (md === lastMd.current) return;
      lastMd.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor || isInternal.current) return;
    const md = (editor.storage as any).markdown.getMarkdown();
    if (md !== value) {
      isInternal.current = true;
      lastMd.current = value;
      editor.commands.setContent(value);
      setImmediate(() => { isInternal.current = false; });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (e: Event) => {
      const target = e.target as HTMLImageElement;
      if (target.tagName !== "IMG") return;
      target.style.display = "none";
      const placeholder = document.createElement("span");
      placeholder.textContent = "[Image failed to load]";
      Object.assign(placeholder.style, {
        display: "block", padding: "12px", textAlign: "center",
        color: "var(--muted)", fontSize: "13px",
        border: "1px dashed var(--border)", borderRadius: "6px", margin: "0.6em 0",
      });
      target.parentNode?.insertBefore(placeholder, target.nextSibling);
    };
    dom.addEventListener("error", handler, true);
    return () => dom.removeEventListener("error", handler, true);
  }, [editor]);

  if (!editor) return null;

  const as = (active: boolean) => ({
    borderColor: active ? "var(--accent)" : "var(--border)",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--fg)",
  });

  async function handleUpload(file: File) {
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
      if (isImg) {
        editor.chain().focus().setImage({ src: data.url }).run();
      } else {
        editor.chain().focus().setLink({ href: data.url }).insertContent(file.name).run();
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setTimeout(() => setUploadError(""), 5000);
    }
  }

  const groups = [
    [
      { label: "Bold", icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
      { label: "Italic", icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
      { label: "Strike", icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
      { label: "Code", icon: Code, action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive("code") },
    ],
    [
      { label: "Heading", icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
      { label: "Quote", icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
      { label: "Bullet List", icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
      { label: "Numbered List", icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
      { label: "Task List", icon: CheckSquare, action: () => editor.chain().focus().toggleTaskList().run(), active: editor.isActive("taskList") },
    ],
    [
      { label: "Table", icon: Table2, action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: false },
      { label: "Link", icon: Link2, action: () => { const url = prompt("URL:"); if (url) editor.chain().focus().setLink({ href: url }).run(); }, active: editor.isActive("link") },
      { label: "Image", icon: Image, action: () => fileRef.current?.click(), active: false },
    ],
    [
      { label: "Code Block", icon: Code2, action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive("codeBlock") },
    ],
    [
      { label: "Undo", icon: Undo2, action: () => editor.chain().focus().undo().run(), active: false },
      { label: "Redo", icon: Redo2, action: () => editor.chain().focus().redo().run(), active: false },
    ],
    [
      { label: fullscreen ? "Exit Fullscreen" : "Fullscreen", icon: fullscreen ? Minimize2 : Maximize2, action: () => setFullscreen((f) => !f), active: false },
    ],
  ];

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", gap: "1px", padding: "4px 6px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap" }}>
      {groups.map((group, gi) => (
        <span key={gi} style={{ display: "flex", gap: "1px" }}>
          {group.map((b) => (
            <button key={b.label} type="button" onClick={b.action} title={b.label} className={btn} style={as(b.active)}>
              <b.icon className={iconClass} />
            </button>
          ))}
          {gi < groups.length - 1 && <span style={{ width: "1px", margin: "0 3px", background: "var(--border)", alignSelf: "stretch" }} />}
        </span>
      ))}
    </div>
  );

  const bubble = (
    <BubbleMenu editor={editor} className="bubble-menu">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn} style={as(editor.isActive("bold"))}><Bold className={iconClass} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn} style={as(editor.isActive("italic"))}><Italic className={iconClass} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn} style={as(editor.isActive("strike"))}><Strikethrough className={iconClass} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn} style={as(editor.isActive("code"))}><Code className={iconClass} /></button>
      <button type="button" onClick={() => { const url = prompt("URL:"); if (url) editor.chain().focus().setLink({ href: url }).run(); }} className={btn} style={as(editor.isActive("link"))}><Link2 className={iconClass} /></button>
    </BubbleMenu>
  );

  if (fullscreen) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0, flexWrap: "wrap" }}>
          <span className="text-xs font-medium" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "1px", flexWrap: "wrap" }}>
            {groups.slice(0, -1).map((group, gi) => (
              <span key={gi} style={{ display: "flex", gap: "1px" }}>
                {group.map((b) => (
                  <button key={b.label} type="button" onClick={b.action} title={b.label} className={btn} style={as(b.active)}>
                    <b.icon className={iconClass} />
                  </button>
                ))}
                {gi < groups.length - 2 && <span style={{ width: "1px", margin: "0 3px", background: "var(--border)", alignSelf: "stretch" }} />}
              </span>
            ))}
          </div>
          <button type="button" onClick={() => setFullscreen(false)} title="Exit fullscreen" className={btn} style={{ ...as(false), width: "auto", padding: "0 8px" }}>
            <Minimize2 className={iconClass} />
            <span style={{ marginLeft: 4, fontSize: 12 }}>Exit</span>
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "60px 0", display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: "720px", width: "100%", padding: "0 24px" }}>
            {bubble}
            <EditorContent editor={editor} className="editor-content editor-content--fullscreen" />
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.mp4,.webm,.mp3,.pdf" style={{ display: "none" }} onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          if (e.target) e.target.value = "";
        }} />
        {uploadError && <div style={{ padding: "6px 12px", fontSize: "13px", color: "#dc2626", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>{uploadError}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      <div className="border rounded-md overflow-hidden" style={{ borderColor: "var(--border)" }}>
        {toolbar}
        {bubble}
        <EditorContent editor={editor} className="editor-content" />
        {uploadError && <div style={{ padding: "6px 12px", fontSize: "13px", color: "#dc2626", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>{uploadError}</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*,.mp4,.webm,.mp3,.pdf" style={{ display: "none" }} onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleUpload(f);
        if (e.target) e.target.value = "";
      }} />
    </div>
  );
}
