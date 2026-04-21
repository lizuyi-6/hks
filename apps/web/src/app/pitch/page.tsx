import Link from "next/link";

export const metadata = {
  title: "A1+ IP 法律服务平台 · 赛道路演",
  description:
    "面向「AI + 知识产权法律服务」赛道的七支柱能力平台 —— 需求画像 · 智能匹配 · 场景推送 · 精准获客 · 智能咨询 · 合规 SaaS · 服务数字化",
};

type Pillar = {
  no: string;
  key: string;
  title: string;
  tagline: string;
  capability: string;
  backend: string;
  frontend: string;
  link: string;
  subCapabilities?: Array<{ title: string; href: string }>;
};

const PILLARS: Pillar[] = [
  {
    no: "01",
    key: "profile",
    title: "需求画像",
    tagline: "让 AI 先懂你，再推荐",
    capability:
      "LLM + 关键词融合抽取 意图 / 紧急度 / 预算 / 地域；叠加个人资料 + 行为信号 → 可解释标签画像。诊断等自助工具产出会回写画像。",
    backend: "apps/api/app/services/profile_engine.py · UserProfileTag",
    frontend: "/my-profile（标签云 + 置信度 + 更新时间线）",
    link: "/my-profile",
    subCapabilities: [{ title: "IP 规划诊断", href: "/diagnosis" }],
  },
  {
    no: "02",
    key: "matching",
    title: "智能匹配",
    tagline: "标签 + 向量双路召回 → 重排",
    capability:
      "双路召回：标签硬过滤 + 向量语义召回，RRF 合并；端口化 rerank 给出匹配分与可解释理由。",
    backend: "apps/api/app/services/matching_engine.py · MatchingRequest/Candidate",
    frontend: "/match（候选律师卡片 + 画像上下文）",
    link: "/match",
  },
  {
    no: "03",
    key: "push",
    title: "场景化推送",
    tagline: "12+ 场景规则驱动增长",
    capability:
      "诊断完成、红灯商标、到期续展、侵权命中、政策冲击、诉讼预测、新线索温度…内建规则 + 事件总线；监控告警直接汇入时间轴。",
    backend: "apps/api/app/services/automation_engine.py · BUILTIN_RULES",
    frontend: "/push-center（规则库 + 时间线 + 模拟触发）",
    link: "/push-center",
    subCapabilities: [{ title: "侵权监控", href: "/monitoring" }],
  },
  {
    no: "04",
    key: "acquisition",
    title: "精准获客",
    tagline: "线索温度分级 + 5 阶段漏斗 + ROI 报表",
    capability:
      "匹配即扇出 ProviderLead：按匹配分自动分温 hot/warm/cool；律师查看写回 last_viewed_at，漏斗五段数字都是真的。",
    backend: "apps/api/app/services/provider_crm.py · ProviderLead",
    frontend: "/provider（线索池 + 客户画像快照 + ROI）",
    link: "/provider",
  },
  {
    no: "05",
    key: "consult",
    title: "智能咨询",
    tagline: "多工具 Agent 首诊，转人工不断层",
    capability:
      "12 个可调用工具（查重/诊断/找律师/报价/咨询/合规/诉讼预测…）+ 置信度回写 + 关键词/复杂度触发转人工；含诉讼与尽调深度推演。",
    backend: "apps/api/app/services/chat_service.py · ConsultationSession",
    frontend: "/consult（多轮流式对话 + 工具卡片 + 转人工）",
    link: "/consult",
    subCapabilities: [
      { title: "诉讼预测", href: "/litigation" },
      { title: "融资尽调", href: "/due-diligence" },
    ],
  },
  {
    no: "06",
    key: "compliance",
    title: "合规 SaaS",
    tagline: "体检评分 + 政策雷达 + 订阅分层",
    capability:
      "企业 IP 合规审计：多维评分、风险热力图、政策雷达推送；合同条款扫描；订阅档位（免费 / 标准 / 企业）+ 真实配额拦截。",
    backend: "apps/api/app/services/compliance_engine.py · ComplianceProfile/Finding",
    frontend: "/enterprise（体检报告 + 政策雷达 + 订阅）",
    link: "/enterprise",
    subCapabilities: [
      { title: "合同审查", href: "/contracts" },
      { title: "政策速递", href: "/policies" },
    ],
  },
  {
    no: "07",
    key: "digital",
    title: "服务数字化",
    tagline: "电子签 + 托管支付 + 里程碑交付",
    capability:
      "订单全生命周期：pending_quote → quoted → signed → paying → in_delivery → delivered → closed；可插拔托管支付/电子签端口；商标办理流水走同一条 Kanban。",
    backend: "apps/api/app/services/order_service.py · ServiceOrder",
    frontend: "/orders（里程碑 Kanban + 电子签状态 + 托管支付）",
    link: "/orders",
    subCapabilities: [
      { title: "商标办理", href: "/trademark/check" },
      { title: "资产台账", href: "/assets" },
    ],
  },
];

const DEMO_STEPS: Array<{ time: string; role: string; action: string; shows: string; url: string }> = [
  {
    time: "0:10",
    role: "小 B 创始人",
    action: "「跨境电商想抢注英文商标，预算 1.5 万以内，上海本地律师优先」",
    shows: "一句话描述 → AI 立即抽取意图(trademark)/紧急度(urgent)/预算/地域",
    url: "/consult",
  },
  {
    time: "0:25",
    role: "平台",
    action: "生成画像标签云，落库 10 个标签，并即时扇出匹配",
    shows: "可解释画像（支柱 1）",
    url: "/my-profile",
  },
  {
    time: "0:40",
    role: "平台",
    action: "召回 15 位候选律师，rerank 取 Top 3，给出匹配分与理由",
    shows: "两阶段匹配（支柱 2）",
    url: "/match",
  },
  {
    time: "1:00",
    role: "AI Agent",
    action: "回答注册可行性并调用 trademark_check 工具查重",
    shows: "智能咨询（支柱 5）",
    url: "/consult",
  },
  {
    time: "1:20",
    role: "平台",
    action: "商标查重红灯 → 自动触发「商标红旗」场景推送",
    shows: "场景化推送（支柱 3）",
    url: "/push-center",
  },
  {
    time: "1:40",
    role: "律师端",
    action: "3 位律师的工作台几乎同时收到高温线索（含画像快照）",
    shows: "精准获客（支柱 4）",
    url: "/provider",
  },
  {
    time: "2:00",
    role: "用户 + 律师",
    action: "一键委托 → 自动生成订单 → 电子签 → 托管支付 → 里程碑交付",
    shows: "服务数字化（支柱 7）",
    url: "/orders",
  },
  {
    time: "2:20",
    role: "企业",
    action: "委托闭环后同步触发合规体检，给出评分与政策雷达订阅建议",
    shows: "合规 SaaS（支柱 6）",
    url: "/enterprise",
  },
];

export default function PitchPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">
          AI + 知识产权法律服务 · 赛道路演
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          A1+ IP Coworker
          <br className="hidden sm:block" />
          <span className="text-indigo-600 dark:text-indigo-400">七支柱</span> 法律服务平台
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
          从一句话需求到律师交付的完整闭环：
          <span className="font-medium">画像 → 匹配 → 推送 → 获客 → 咨询 → 委托 → 合规</span>
          。 端口化架构 + 可解释 AI + 可切 mock/real 数据源。
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            进入工作台体验
          </Link>
          <Link
            href="/consult"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            立即与 AI 法务对话
          </Link>
          <a
            href="#demo-script"
            className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            查看 3 分钟 Demo 剧本 →
          </a>
        </div>

        {/* KPI 指标 */}
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "能力支柱", value: "7" },
            { label: "场景推送规则", value: "12+" },
            { label: "AI Agent 工具", value: "12" },
            { label: "订单里程碑", value: "7 阶段" },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="text-xs text-slate-500">{k.label}</div>
              <div className="mt-1 font-serif text-2xl font-semibold text-indigo-600 dark:text-indigo-400">
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7 支柱卡片 */}
      <section className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-2xl font-semibold">七大能力支柱</h2>
          <p className="mt-2 text-sm text-slate-500">每个支柱都配备后端引擎 + 前端可视化 + mock / real 双模式数据源。</p>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {PILLARS.map((p) => (
              <Link
                key={p.key}
                href={p.link}
                className="group rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
              >
                <div className="flex items-start gap-4">
                  <div className="font-serif text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                    {p.no}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-serif text-lg font-semibold">{p.title}</h3>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">{p.tagline}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.capability}</p>
                    <dl className="mt-3 space-y-1 text-xs text-slate-500">
                      <div>
                        <dt className="inline font-medium">后端：</dt>
                        <dd className="inline font-mono">{p.backend}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">前端：</dt>
                        <dd className="inline">{p.frontend}</dd>
                      </div>
                    </dl>
                    {p.subCapabilities && p.subCapabilities.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-500">子能力：</span>
                        {p.subCapabilities.map((sc) => (
                          <Link
                            key={sc.href}
                            href={sc.href}
                            className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                          >
                            {sc.title}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 inline-flex items-center text-sm font-medium text-indigo-600 group-hover:underline dark:text-indigo-400">
                      查看 →
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 闭环示意 */}
      <section className="border-t border-slate-200 bg-slate-50 py-16 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-2xl font-semibold">一条闭环，七支柱联动</h2>
          <p className="mt-2 text-sm text-slate-500">
            画像沉淀匹配，匹配扇出获客，获客回流咨询，咨询落单委托，委托触发合规，合规再推送画像 —— 形成正向飞轮。
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">
            <pre className="font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-300">
{`[用户一句话需求]
     │
     ▼
[画像]──►[智能匹配]──►[精准获客]──►[律师]
  │            │
  │(事件)      ▼
  │       [智能咨询 AI Agent]
  ▼            │
[场景化推送]◄──┘
     │
     ▼
[订单: 电子签 + 托管支付 + 里程碑交付]
     │
     ▼
[合规 SaaS 体检 + 政策雷达]──►[新一轮画像更新]`}
            </pre>
          </div>
        </div>
      </section>

      {/* Demo 剧本 */}
      <section id="demo-script" className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-2xl font-semibold">3 分钟 Demo 剧本</h2>
          <p className="mt-2 text-sm text-slate-500">
            按顺序点击每一步即可跟随演示。整条链路在 mock 模式下即可跑通。
          </p>
          <ol className="mt-8 space-y-4">
            {DEMO_STEPS.map((step, i) => (
              <li
                key={i}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3 sm:min-w-[140px]">
                  <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400">{step.time}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {step.role}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{step.action}</div>
                  <div className="mt-0.5 text-xs text-slate-500">展示：{step.shows}</div>
                </div>
                <Link
                  href={step.url}
                  className="inline-flex items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                >
                  前往 →
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
        A1+ IP Coworker · 所有 AI 生成内容仅供参考，以官方为准
      </footer>
    </main>
  );
}
