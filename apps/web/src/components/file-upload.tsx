"use client";

import { useCallback, useRef, useState } from "react";
import { proxyBaseUrl } from "@/lib/env";

type FileUploadProps = {
  onTextExtracted: (text: string) => void;
  accept?: string;
  label?: string;
};

export function FileUpload({
  onTextExtracted,
  accept = ".pdf,.docx,.txt",
  label = "上传文件自动提取文本",
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [charCount, setCharCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setFileName(file.name);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`${proxyBaseUrl}/upload/extract-text`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const data = await res.json();

        if (data.error) {
          setError(data.error);
        } else {
          setCharCount(data.charCount);
          onTextExtracted(data.text);
        }
      } catch {
        setError("上传失败，请重试");
      } finally {
        setUploading(false);
      }
    },
    [onTextExtracted],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
        dragging
          ? "border-rust bg-rust/5"
          : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />

      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          正在解析 {fileName}...
        </div>
      ) : fileName && charCount !== null ? (
        <div className="text-sm">
          <span className="text-emerald-600">{fileName}</span>
          <span className="ml-2 text-slate-400">
            已提取 {charCount.toLocaleString()} 字符
          </span>
          <span className="ml-2 text-slate-400">（点击重新上传）</span>
        </div>
      ) : (
        <div className="text-sm text-slate-500">
          <span className="font-medium text-slate-700">{label}</span>
          <br />
          支持 PDF / DOCX / TXT，拖拽或点击上传
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-rose-600">{error}</p>
      )}
    </div>
  );
}
