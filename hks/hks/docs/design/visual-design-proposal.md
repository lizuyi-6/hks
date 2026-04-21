# A1+ IP Coworker 视觉设计方案

## 设计理念

### 设计愿景
打造**专业、现代、可信**的知识产权服务平台视觉体验，让用户感受到法律服务的严谨与科技产品的便捷。

### 设计语言关键词
- **专业严谨**：体现法律服务的权威性
- **现代简洁**：降低认知负担，提升效率
- **温暖可信**：消除法律服务的冰冷感
- **层次分明**：信息架构清晰，引导明确

### 设计参考
- **Linear**：极致简洁，专业高效
- **Notion**：模块化设计，层次分明
- **Vercel**：现代科技感，深色模式
- **Apple**：中文排版优化，细节考究

---

## 色彩系统

### 主色品牌色

```css
/* Primary - 赤陶红，代表专业与温暖 */
--color-primary-50: #fdf6f3;
--color-primary-100: #f9e8e0;
--color-primary-200: #f2d0c1;
--color-primary-300: #e8b099;
--color-primary-400: #db8a6d;
--color-primary-500: #a04a2a;  /* 主色 rust */
--color-primary-600: #8a3f24;
--color-primary-700: #72341e;
--color-primary-800: #5c2a18;
--color-primary-900: #3d1c10;
```

### 中性色

```css
/* Neutral - 墨水灰，沉稳专业 */
--color-neutral-50: #f8f9fa;
--color-neutral-100: #f1f3f5;
--color-neutral-200: #e9ecef;
--color-neutral-300: #dee2e6;
--color-neutral-400: #ced4da;
--color-neutral-500: #adb5bd;
--color-neutral-600: #6c757d;
--color-neutral-700: #495057;
--color-neutral-800: #343a40;
--color-neutral-900: #172033;  /* 主文字色 ink */
```

### 语义色

```css
/* Success - 翡翠绿 */
--color-success-50: #ecfdf5;
--color-success-500: #10b981;
--color-success-700: #047857;

/* Warning - 琥珀橙 */
--color-warning-50: #fffbeb;
--color-warning-500: #f59e0b;
--color-warning-700: #b45309;

/* Error - 玫瑰红 */
--color-error-50: #fef2f2;
--color-error-500: #ef4444;
--color-error-700: #b91c1c;

/* Info - 天蓝 */
--color-info-50: #eff6ff;
--color-info-500: #3b82f6;
--color-info-700: #1d4ed8;
```

### 深色模式适配

```css
/* 深色模式变量 */
[data-theme="dark"] {
  /* 背景 */
  --color-surface: 23 28 40;           /* #172028 */
  --color-surface-elevated: 30 37 52;  /* #1e2534 */
  --color-surface-sunken: 15 19 27;    /* #0f131b */

  /* 文字 */
  --color-text-primary: 248 249 250;   /* #f8f9fa */
  --color-text-secondary: 173 181 189; /* #adb5bd */
  --color-text-tertiary: 108 117 125;  /* #6c757d */

  /* 边框 */
  --color-border: 52 58 64;            /* #343a40 */
  --color-border-subtle: 73 80 87;     /* #495057 */
}
```

---

## 字体系统

### 字体栈

```css
/* 中文正文 */
--font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;

/* 中文标题 */
--font-display: "PingFang SC", "Source Han Serif SC", "STSong", "SimSun", serif;

/* 英文/数字 */
--font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
```

### 字体层级

| 层级 | 大小 | 行高 | 字重 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| Display | 2.5rem (40px) | 1.2 | 700 | -0.02em | 页面大标题 |
| H1 | 2rem (32px) | 1.3 | 600 | -0.01em | 页面标题 |
| H2 | 1.5rem (24px) | 1.4 | 600 | 0 | 区块标题 |
| H3 | 1.25rem (20px) | 1.5 | 500 | 0 | 卡片标题 |
| H4 | 1.125rem (18px) | 1.5 | 500 | 0 | 小标题 |
| Body Large | 1.125rem (18px) | 1.75 | 400 | 0.01em | 重要正文 |
| Body | 1rem (16px) | 1.75 | 400 | 0.01em | 默认正文 |
| Body Small | 0.875rem (14px) | 1.6 | 400 | 0.01em | 辅助文字 |
| Caption | 0.75rem (12px) | 1.5 | 400 | 0.02em | 标注/标签 |

---

## 间距系统

### 基础间距（8pt Grid）

```css
--space-0: 0;
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

### 页面布局间距

```css
/* 页面内边距 */
--page-padding-x: 1.5rem;      /* 移动端 */
--page-padding-x-md: 2rem;     /* 平板 */
--page-padding-x-lg: 2.5rem;   /* 桌面 */

/* 内容最大宽度 */
--content-max-width: 1200px;
--content-narrow: 640px;
```

---

## 圆角系统

```css
--radius-none: 0;
--radius-sm: 0.25rem;   /* 4px - 小标签、徽章 */
--radius-md: 0.5rem;    /* 8px - 输入框、小按钮 */
--radius-lg: 0.75rem;   /* 12px - 卡片、按钮 */
--radius-xl: 1rem;      /* 16px - 大卡片、模态框 */
--radius-2xl: 1.25rem;  /* 20px - 特殊卡片 */
--radius-full: 9999px;  /* 全圆 - 胶囊按钮、标签 */
```

---

## 阴影系统

### 浅色模式

```css
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
--shadow-soft: 0 2px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.02);
```

### 深色模式

```css
[data-theme="dark"] {
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.4);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5);
}
```

---

## 组件设计规范

### Button

| 变体 | 背景 | 文字 | 边框 | Hover | Active |
|------|------|------|------|-------|--------|
| Primary | primary-500 | white | none | primary-600 | primary-700 |
| Secondary | white | neutral-900 | neutral-200 | neutral-50 | neutral-100 |
| Ghost | transparent | neutral-700 | none | neutral-100 | neutral-200 |
| Danger | error-500 | white | none | error-600 | error-700 |

```
Size:
- sm: h-8 px-3 text-sm
- md: h-10 px-4 text-base
- lg: h-12 px-6 text-base
```

### Card

```
默认样式:
- bg-white
- rounded-xl
- shadow-soft
- border border-neutral-100
- p-6

深色模式:
- bg-surface-elevated
- border-border
```

### Input

```
默认样式:
- h-10 px-3
- rounded-lg
- border border-neutral-200
- bg-white
- focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
- placeholder:text-neutral-400

深色模式:
- bg-surface-elevated
- border-border
- text-text-primary
```

---

## 动效规范

### 时间函数

```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 时长规范

| 场景 | 时长 | 说明 |
|------|------|------|
| Micro | 100ms | 按钮hover、颜色变化 |
| Fast | 150ms | 状态切换、小型展开 |
| Normal | 200ms | 常规过渡、菜单展开 |
| Slow | 300ms | 页面切换、模态框 |
| Entrance | 400ms | 元素入场动画 |

### 动画模式

```css
/* 入场动画 */
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 脉冲动画 */
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 旋转动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

---

## 响应式断点

```css
/* Tailwind默认断点 */
sm: 640px   /* 小平板 */
md: 768px   /* 平板 */
lg: 1024px  /* 小桌面 */
xl: 1280px  /* 桌面 */
2xl: 1536px /* 大桌面 */
```

### 布局适配

- **Mobile First**: 默认移动端样式
- **Sidebar**: lg以上显示侧边栏
- **Grid**: sm 1列 → md 2列 → lg 3列 → xl 4列
- **Typography**: 移动端标题减小20%

---

## 文件输出清单

- [x] 本文档: `docs/design/visual-design-proposal.md`
- [ ] 设计系统规范: `docs/design/design-system-spec.md`
- [ ] Tailwind配置: `apps/web/tailwind.config.ts`
- [ ] CSS变量: `apps/web/src/styles/tokens.css`
- [ ] 组件文档: `packages/ui/README.md`

---

## 实施优先级

1. **P0 - 基础架构** (Week 1)
   - Design Token系统
   - Tailwind配置
   - CSS变量

2. **P1 - 基础组件** (Week 1-2)
   - Button, Input, Select
   - Modal, Toast
   - Loading, Empty

3. **P2 - 业务组件** (Week 2-3)
   - Dashboard, Diagnosis
   - Trademark系列

4. **P3 - 页面重构** (Week 3-4)
   - 认证页面
   - 业务页面

5. **P4 - 动画优化** (Week 4)
   - 替换GSAP
   - 微交互动效
