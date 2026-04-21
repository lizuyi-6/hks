type Faq = {
  tag: string;
  q: string;
  a: string;
};

const faqs: Faq[] = [
  {
    tag: "安全",
    q: "数据是否安全？草稿会被用于训练吗？",
    a: "业务数据按用户隔离存储，默认不用于模型训练；企业版支持私有化部署。上传的文档仅在触发工作流时被读取，调用链日志可审计。"
  },
  {
    tag: "能力",
    q: "Mock 与 Real provider 有何区别？",
    a: "Mock 在无外部 API key 时提供可演示的稳定数据；Real 对接真实商标局 / 专利局接口，每条结果都记录 provider 与数据来源。"
  },
  {
    tag: "范围",
    q: "商标查重覆盖哪些类目？",
    a: "默认覆盖尼斯分类 1–45 类全部子类，支持跨类检索，并按业务描述推荐优先申请类目，冲突结果以绿 / 黄 / 红三档呈现。"
  },
  {
    tag: "时效",
    q: "完整走完一次申请要多久？",
    a: "查重在数秒内完成，申请书生成与提交引导控制在分钟级。真实递交到官方受理周期以主管机关为准，提醒由自动化接管。"
  },
  {
    tag: "适用",
    q: "适合什么团队使用？",
    a: "初创法务 / 运营、中小企业 IP 负责人、代理机构作业员、投资机构尽调团队。可独立 SaaS 使用，也可嵌入内部系统。"
  },
  {
    tag: "计费",
    q: "如何计费？",
    a: "基础工作台免费；按申请书生成、真实 provider 调用、监控目标数等维度计量。企业私有化与合规定制请联系获取报价。"
  }
];

export function LandingFaq() {
  return (
    <section
      id="faq"
      data-landing-section
      className="flex h-screen snap-start items-center overflow-hidden pt-16"
    >
      <div className="mx-auto grid h-full w-full max-w-[1400px] grid-cols-1 gap-8 px-6 py-6 md:grid-cols-[0.85fr_1.7fr] md:items-stretch">
        <aside className="flex flex-col justify-between py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary-600">FAQ</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]">
              所有关键问题，
              <br />
              在这里一次说清。
            </h2>
            <p className="mt-5 text-base leading-relaxed text-text-secondary md:text-lg">
              涵盖数据安全、provider 差异、类目覆盖、时效、适用人群、计费六大方向。没找到想要的答案，写信给我们。
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface-elevated p-6">
            <p className="text-sm font-medium text-text-primary">联系我们</p>
            <p className="mt-1 text-sm text-text-secondary">
              产品、合作、私有化部署与合规定制。
            </p>
            <a
              href="mailto:hello@a1plus.ai"
              className="btn-tech mt-4 inline-flex h-11 items-center rounded-md px-5 text-sm font-medium text-white"
            >
              hello@a1plus.ai
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="ml-2 h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </a>
          </div>
        </aside>

        <div className="grid min-h-0 auto-rows-fr gap-3 md:grid-cols-2 md:grid-rows-3">
          {faqs.map((f, idx) => (
            <article
              key={f.q}
              style={{ animationDelay: `${idx * 60}ms` }}
              className="tech-card group relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface-elevated p-5"
            >
              <span aria-hidden className="tech-corner tech-corner-tl" />
              <span aria-hidden className="tech-corner tech-corner-br" />
              <div className="flex items-start gap-3">
                <span className="num-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-sunken text-sm text-text-primary">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[11px] text-text-tertiary">
                    {f.tag}
                  </span>
                  <h3 className="mt-1.5 text-lg font-semibold leading-snug text-text-primary md:text-xl">
                    {f.q}
                  </h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                {f.a}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
