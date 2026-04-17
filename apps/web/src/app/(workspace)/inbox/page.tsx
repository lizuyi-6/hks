import { InboxPanel } from "@/components/inbox";

export const metadata = { title: "收件箱 · A1+ IP Coworker" };

export default function InboxPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">收件箱</h1>
        <p className="text-sm text-slate-500 mt-1">
          系统正在自动处理您的 IP 事务，以下是当前状态
        </p>
      </div>
      <InboxPanel />
    </div>
  );
}
