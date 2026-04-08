import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/env";
import { authCookieName } from "@/lib/auth";

const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";

const now = new Date().toISOString();

function createMockDiagnosisResult() {
  return {
    id: `mock-diagnosis-${Date.now()}`,
    userId: "mock-user",
    moduleType: "diagnosis",
    jobId: null,
    createdAt: now,
    resultData: {
      normalizedPayload: {
        summary: "Mock 诊断结果摘要 - 这是一个模拟的诊断结果，用于测试和开发",
        businessType: "Mock Business Type",
        riskLevel: "medium",
        priorityAssets: ["商标A", "商标B", "商标C"],
        nextActions: ["进行商标查重", "准备注册材料", "联系专业人士"],
        recommendedTrademarkCategories: ["35", "42", "45"],
        recommendedTrack: "trademark"
      },
      disclaimer: "仅供参考，以官方为准",
      mode: "mock",
      provider: "mock",
      status: "completed"
    }
  };
}

function createMockTrademarkCheckResult() {
  return {
    id: `mock-trademark-${Date.now()}`,
    userId: "mock-user",
    moduleType: "trademark-check",
    jobId: null,
    createdAt: now,
    resultData: {
      normalizedPayload: {
        summary: "Mock 商标查重结果摘要 - 这是一个模拟的商标查重结果，用于测试和开发",
        riskLevel: "yellow",
        risk_level: "yellow",
        findings: [
          {
            name: "示例商标A",
            category: "35",
            similarityScore: 75,
            similarity_score: 75,
            status: "已注册",
            note: "存在较高相似度，建议修改"
          },
          {
            name: "示例商标B",
            category: "42",
            similarityScore: 45,
            similarity_score: 45,
            status: "待审",
            note: "有一定相似度，需要注意"
          }
        ],
        recommendation: "建议修改商标名称或选择其他类别进行注册",
        alternatives: ["商标名称B", "商标名称C", "商标名称D"],
        suggestedCategories: ["35", "42"],
        suggested_categories: ["35", "42"]
      },
      disclaimer: "仅供参考，以官方为准",
      mode: "mock",
      provider: "mock",
      status: "completed"
    }
  };
}

function createMockApplicationGenerateResult() {
  const draftId = `mock-draft-${Date.now()}`;
  return {
    id: `mock-app-${Date.now()}`,
    userId: "mock-user",
    moduleType: "application_generate",
    jobId: null,
    createdAt: now,
    resultData: {
      draftId,
      trademarkName: "测试商标",
      applicantName: "测试公司",
      categories: ["35", "42"],
      riskLevel: "yellow",
      risk_level: "yellow",
      sourceMode: "mock",
      provider: "mock",
      documentLabels: ["申请书", "委托书"],
      downloadEndpoints: {
        docx: `/trademarks/documents/${draftId}.docx`,
        pdf: `/trademarks/documents/${draftId}.pdf`
      }
    }
  };
}

const mockAssets = [
  {
    id: "mock-asset-1",
    name: "测试商标A",
    type: "trademark",
    status: "pending",
    registration_number: "mock-12345",
    expires_at: "2027-01-01",
    sourceMode: "mock",
    nextMilestone: "提交申请"
  },
  {
    id: "mock-asset-2",
    name: "测试专利B",
    type: "patent",
    status: "granted",
    registration_number: "mock-67890",
    expires_at: "2030-01-01",
    sourceMode: "mock",
    nextMilestone: "年费缴纳"
  }
];

const mockReminders = [
  {
    id: "mock-reminder-1",
    assetId: "mock-asset-1",
    channel: "email",
    dueAt: "2026-06-01T00:00:00Z",
    status: "pending"
  },
  {
    id: "mock-reminder-2",
    assetId: "mock-asset-2",
    channel: "sms",
    dueAt: "2026-07-01T00:00:00Z",
    status: "pending"
  }
];

const mockSuggestions = [
  {
    id: "mock-suggestion-1",
    title: "建议进行商标查重",
    description: "根据您的业务描述，建议先进行商标查重以确认名称可用性。",
    priority: "high",
    action: { label: "前往查重", href: "/trademark/check" }
  },
  {
    id: "mock-suggestion-2",
    title: "完善专利布局",
    description: "您的技术方案具有创新性，建议申请发明专利保护。",
    priority: "medium",
    action: { label: "前往专利评估", href: "/patents" }
  }
];

const mockWorkflows = [
  {
    id: "mock-workflow-1",
    workflowType: "trademark_application",
    status: "running",
    currentStepIndex: 1,
    steps: [
      { stepType: "diagnosis" },
      { stepType: "trademark_check" },
      { stepType: "application_generate" }
    ]
  }
];

const mockProviders = [
  { port: "trademarkSearch", mode: "mock", provider: "cnipa-snapshot", available: true },
  { port: "enterpriseLookup", mode: "mock", provider: "tianyancha", available: true },
  { port: "publicWebSearch", mode: "mock", provider: "bing", available: true },
  { port: "knowledgeBase", mode: "mock", provider: "official-kb-snapshot", available: true },
  { port: "llm", mode: "mock", provider: "tencent", available: true },
  { port: "documentRender", mode: "mock", provider: "docx-reportlab", available: true },
  { port: "notification", mode: "mock", provider: "smtp", available: true },
  { port: "monitoring", mode: "mock", provider: "bing-search-monitoring", available: true },
  { port: "submissionGuide", mode: "mock", provider: "cnipa-guide", available: true },
  { port: "competitor", mode: "mock", provider: "tianyancha-competitor", available: true },
  { port: "contractReview", mode: "mock", provider: "llm-contract-review", available: true },
  { port: "patentAssist", mode: "mock", provider: "llm-patent-assist", available: true },
  { port: "policyDigest", mode: "mock", provider: "llm-policy-digest", available: true },
  { port: "dueDiligence", mode: "mock", provider: "llm-due-diligence", available: true }
];

function createModuleResultsResponse(moduleType: string | null) {
  if (moduleType === "trademark-check") {
    return [createMockTrademarkCheckResult()];
  }
  if (moduleType === "diagnosis") {
    return [createMockDiagnosisResult()];
  }
  if (moduleType === "application_generate") {
    return [createMockApplicationGenerateResult()];
  }
  return [];
}

function createCompetitorTrackResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    sourceRefs: [],
    disclaimer: "仅供参考，数据为模拟结果",
    normalizedPayload: {
      company: "测试公司",
      trademarks: [
        { name: "测试商标A", trademark_count: 5, patent_count: 3, reg_status: "已注册" },
        { name: "测试商标B", trademark_count: 2, patent_count: 1, reg_status: "待审" }
      ],
      patents_count: 10,
      ip_activity: "medium",
      recommendation: "建议关注该公司的商标布局，其知识产权活跃度中等"
    }
  };
}

function createMonitoringScanResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    retrievedAt: now,
    sourceRefs: [],
    disclaimer: "仅供参考，数据为模拟结果",
    normalizedPayload: {
      query: "测试商标",
      alerts: [
        {
          title: "发现近似商标",
          severity: "medium",
          description: "在第35类发现近似商标，建议进一步核实",
          source_url: "https://example.com/trademark/1",
          found_at: now
        }
      ],
      total: 1,
      high_count: 0
    }
  };
}

function createContractReviewResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    sourceRefs: [],
    disclaimer: "仅供参考，建议咨询专业律师",
    normalizedPayload: {
      summary: "合同整体风险可控，建议关注知识产权归属条款",
      risks: [
        { clause: "知识产权归属", severity: "medium", suggestion: "建议明确约定归属条款，避免后续纠纷" },
        { clause: "保密义务", severity: "low", suggestion: "保密条款较为完善" }
      ],
      ip_clauses_found: ["知识产权归属", "保密条款", "违约责任"],
      missing_clauses: ["竞业限制", "知识产权侵权赔偿"],
      overall_risk: "medium"
    }
  };
}

function createPatentAssessResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    sourceRefs: [],
    disclaimer: "仅供参考，建议咨询专利代理机构",
    normalizedPayload: {
      recommended_type: "invention",
      novelty_assessment: "技术方案具有一定新颖性，建议进行专利检索确认",
      feasibility: "high",
      key_points: ["创新点1：核心技术方案", "创新点2：实现方式优化"],
      materials_needed: ["技术交底书", "产品图纸", "实验数据"],
      estimated_timeline: "2-3年",
      cost_estimate: "1-2万元（不含代理费）",
      risks: ["技术公开风险", "竞争对手专利布局"]
    }
  };
}

function createPolicyDigestResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    sourceRefs: [],
    disclaimer: "仅供参考，请以官方发布为准",
    normalizedPayload: {
      industry: "跨境电商",
      policies: [
        {
          title: "跨境电商税收优惠政策",
          summary: "针对跨境电商企业的税收减免政策",
          impact: "medium",
          effective_date: "2026-01-01",
          source: "国家税务总局"
        },
        {
          title: "知识产权保护指导意见",
          summary: "加强跨境电商知识产权保护的相关规定",
          impact: "high",
          effective_date: "2026-03-01",
          source: "商务部"
        }
      ],
      key_changes: ["税率调整", "申报要求变化", "知识产权保护加强"],
      action_items: ["了解新政策详情", "调整申报流程", "完善知识产权布局"],
      compliance_notes: "建议定期关注政策更新，确保合规经营"
    }
  };
}

function createDueDiligenceResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    sourceRefs: [],
    disclaimer: "仅供参考，建议进行实地尽调",
    normalizedPayload: {
      company: "目标公司",
      ip_portfolio: {
        trademarks: 100,
        patents: 500,
        copyrights: 50,
        trade_secrets: "良好"
      },
      strengths: ["商标布局完善", "专利数量领先", "核心技术研发能力强"],
      risks: [
        { risk: "存在商标争议", severity: "medium", mitigation: "建议关注诉讼进展" },
        { risk: "部分专利即将到期", severity: "low", mitigation: "评估续展必要性" }
      ],
      valuation_factors: ["专利组合价值高", "商标知名度良好"],
      recommendations: ["建议深入核实专利有效性", "关注知识产权诉讼风险"],
      overall_assessment: "medium"
    }
  };
}

function createApplicationDraftResult() {
  const draftId = `mock-draft-${Date.now()}`;
  return {
    id: draftId,
    result: {
      draftId,
      trademarkName: "测试商标",
      applicantName: "测试公司",
      categories: ["35", "42"],
      riskLevel: "yellow",
      risk_level: "yellow",
      sourceMode: "mock",
      provider: "mock",
      documentLabels: ["申请书", "委托书"],
      downloadEndpoints: {
        docx: `/trademarks/documents/${draftId}.docx`,
        pdf: `/trademarks/documents/${draftId}.pdf`
      }
    }
  };
}

function createDraftGuideResult() {
  return {
    mode: "mock",
    provider: "mock",
    traceId: `mock-trace-${Date.now()}`,
    sourceRefs: [],
    disclaimer: "仅供参考，请以官方要求为准",
    normalizedPayload: {
      draft: {
        draftId: "mock-draft-1",
        trademarkName: "测试商标",
        applicantName: "测试公司",
        categories: ["35", "42"],
        riskLevel: "yellow",
        sourceMode: "mock",
        provider: "mock"
      },
      guide: {
        title: "商标注册提交流程",
        steps: [
          "准备申请材料：营业执照复印件、商标图样、申请书",
          "登录中国商标网（sbj.cnipa.gov.cn）",
          "选择【网上申请】进入申请系统",
          "填写申请信息并上传材料",
          "缴纳申请费用（官费300元/类）",
          "等待受理通知书（约1-2个月）"
        ],
        officialUrl: "https://sbj.cnipa.gov.cn",
        warning: "请确保申请信息真实准确，虚假信息可能导致申请被驳回。本系统仅提供辅助准备，不代替官方申报。"
      }
    }
  };
}

const mockResponses: Record<string, { GET?: object | (() => object); POST?: object | (() => object); DELETE?: object | (() => object) }> = {
  "assets": {
    GET: mockAssets,
    POST: () => ({
      id: `mock-asset-${Date.now()}`,
      name: "新资产",
      type: "trademark",
      status: "pending",
      sourceMode: "mock"
    })
  },
  "reminders": { GET: mockReminders },
  "suggestions": { GET: mockSuggestions },
  "workflows": { GET: mockWorkflows },
  "system/health": { GET: { status: "ok", version: "0.1.0", mode: "mock", providers: mockProviders } },
  "jobs": { GET: [] },
  "placeholders": { GET: [] }
};

function getMockResponse(pathname: string, method: string, searchParams?: URLSearchParams): NextResponse | null {
  if (pathname === "module-results") {
    const moduleType = searchParams?.get("module_type");
    return NextResponse.json(createModuleResultsResponse(moduleType));
  }

  if (pathname === "diagnosis" && method === "POST") {
    return NextResponse.json(createMockDiagnosisResult().resultData);
  }

  if (pathname === "trademarks/check" && method === "POST") {
    return NextResponse.json(createMockTrademarkCheckResult().resultData);
  }

  if (pathname === "trademarks/application/jobs" && method === "POST") {
    return NextResponse.json(createApplicationDraftResult());
  }

  if (pathname.match(/^trademarks\/drafts\/[^/]+$/) && method === "GET") {
    return NextResponse.json(createDraftGuideResult());
  }

  const docMatch = pathname.match(/^trademarks\/documents\/([^/]+)\.(docx|pdf)$/);
  if (docMatch && method === "GET") {
    const [, draftId, extension] = docMatch;
    const contentType = extension === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
    const mockContent = extension === "docx"
      ? "A1+ Trademark Application Draft\n\nTrademark Name: 测试商标\nApplicant: 测试公司\nCategories: 35, 42\n\nThis is a mock document for testing purposes."
      : "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\n>>\n>>\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 200\n>>\nstream\nBT\n/F1 24 Tf\n72 750 Td\n(A1+ Trademark Application Draft) Tj\n0 -30 Td\n/F1 12 Tf\n(Test Trademark) Tj\n0 -20 Td\n(Applicant: Test Company) Tj\n0 -20 Td\n(Categories: 35, 42) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000317 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n563\n%%EOF";
    return new NextResponse(mockContent, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${draftId}.${extension}"`,
        "Content-Length": String(mockContent.length)
      }
    });
  }

  if (pathname === "competitors/track" && method === "POST") {
    return NextResponse.json({
      job_id: `mock-job-${Date.now()}`,
      status: "completed",
      result: createCompetitorTrackResult()
    });
  }

  if (pathname === "monitoring/scan" && method === "POST") {
    return NextResponse.json({
      job_id: `mock-job-${Date.now()}`,
      status: "completed",
      result: createMonitoringScanResult()
    });
  }

  if (pathname === "contracts/review" && method === "POST") {
    return NextResponse.json({
      job_id: `mock-job-${Date.now()}`,
      status: "completed",
      result: createContractReviewResult()
    });
  }

  if (pathname === "patents/assess" && method === "POST") {
    return NextResponse.json({
      job_id: `mock-job-${Date.now()}`,
      status: "completed",
      result: createPatentAssessResult()
    });
  }

  if (pathname === "policies/digest" && method === "POST") {
    return NextResponse.json({
      job_id: `mock-job-${Date.now()}`,
      status: "completed",
      result: createPolicyDigestResult()
    });
  }

  if (pathname === "due-diligence/investigate" && method === "POST") {
    return NextResponse.json({
      job_id: `mock-job-${Date.now()}`,
      status: "completed",
      result: createDueDiligenceResult()
    });
  }

  if (pathname.match(/^jobs\/[^/]+\/rerun$/) && method === "POST") {
    return NextResponse.json({ status: "ok", message: "任务已重新执行" });
  }

  if (pathname.match(/^assets\/[^/]+$/) && method === "DELETE") {
    return new NextResponse(null, { status: 204 });
  }

  if (pathname.match(/^assets\/[^/]+$/) && method === "GET") {
    return NextResponse.json(mockAssets[0]);
  }

  const mock = mockResponses[pathname];
  if (!mock) {
    return null;
  }

  const dataOrFn = method === "POST" ? mock.POST : method === "DELETE" ? mock.DELETE : mock.GET;
  if (!dataOrFn) {
    return null;
  }

  const data = typeof dataOrFn === "function" ? dataOrFn() : dataOrFn;
  return NextResponse.json(data);
}

async function proxy(request: Request, params: { path: string[] }) {
  const pathname = params.path.join("/");
  const url = new URL(request.url);
  const token = (await cookies()).get(authCookieName)?.value;

  if (apiMode === "mock" || pathname in mockResponses || pathname === "module-results") {
    const mockResponse = getMockResponse(pathname, request.method, url.searchParams);
    if (mockResponse) {
      return mockResponse;
    }
  }

  if (apiMode === "mock") {
    return NextResponse.json([], { status: 200 });
  }

  const target = `${apiBaseUrl}/${pathname}${url.search}`;

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        ...(request.headers.get("content-type")
          ? { "Content-Type": request.headers.get("content-type") as string }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store"
    });

    if (pathname.includes("/documents/") || pathname.startsWith("documents/")) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
          "Content-Disposition": response.headers.get("content-disposition") ?? "attachment"
        }
      });
    }

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable", mode: apiMode }, { status: 503 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}
