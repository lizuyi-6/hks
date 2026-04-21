"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { proxyBaseUrl } from "@/lib/env";
import { trackError } from "@/lib/analytics";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

type FileUploadProps = {
  onTextExtracted: (text: string) => void;
  onError?: (message: string) => void;
  accept?: string;
  label?: string;
};

export function FileUpload({
  onTextExtracted,
  onError,
  accept = ".pdf,.docx,.txt",
  label = "上传文件自动提取文本",
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [charCount, setCharCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reportError = useCallback(
    (msg: string) => {
      setError(msg);
      onError?.(msg);
      trackError({ event: "error", error_type: "api_error", message: `file-upload: ${msg}` });
    },
    [onError],
  );

  const upload = useCallback(
    async (file: File) => {
      // Client-side validation before hitting the network.
      if (file.size > MAX_FILE_SIZE) {
        reportError("文件超过 20 MB，请压缩后重试");
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(file.type) && file.type !== "") {
        reportError("不支持该文件类型，请上传 PDF / DOCX / TXT");
        return;
      }

      // Cancel any in-flight upload when the user selects a new file.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setUploading(true);
      setError(null);
      setFileName(file.name);
      setCharCount(null);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`${proxyBaseUrl}/upload/extract-text`, {
          method: "POST",
          credentials: "include",
          body: form,
          signal: controller.signal,
        });

        if (!res.ok) {
          let msg = "上传失败，请重试";
          try {
            const data = await res.json();
            msg = data.detail ?? data.error ?? msg;
          } catch {
            msg = (await res.text()) || msg;
          }
          reportError(msg);
          return;
        }

        const data = await res.json();

        if (data.error) {
          reportError(data.error);
        } else {
          setCharCount(data.charCount ?? null);
          onTextExtracted(data.text ?? "");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        reportError("上传失败，请重试");
      } finally {
        setUploading(false);
      }
    },
    [onTextExtracted, reportError],
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
      className={`cursor-pointer rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
        dragging
          ? "border-primary-500 bg-primary-50"
          : "border-border bg-neutral-50 hover:border-primary-500/50 hover:bg-neutral-100"
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
        <div className="flex items-center justify-center gap-2 text-sm text-text-tertiary">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary-500" />
          正在解析 {fileName}...
        </div>
      ) : fileName && charCount !== null ? (
        <div className="text-sm">
          <span className="text-success-700">{fileName}</span>
          <span className="ml-2 text-text-tertiary">
            已提取 {charCount.toLocaleString()} 字符
          </span>
          <span className="ml-2 text-text-tertiary">（点击重新上传）</span>
        </div>
      ) : (
        <div className="text-sm text-text-tertiary">
          <span className="font-medium text-text-primary">{label}</span>
          <br />
          支持 PDF / DOCX / TXT，最大 20 MB，拖拽或点击上传
        </div>
      )}

      {error && <p className="mt-2 text-sm text-error-700">{error}</p>}
    </div>
  );
}
