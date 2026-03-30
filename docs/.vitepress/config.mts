import { defineConfig } from "vitepress";

const docsBase = process.env.MAILCLAW_DOCS_BASE ?? "/";

export default defineConfig({
  title: "MailClaws",
  description: "MailClaws docs for durable rooms, visible multi-agent mail, pre-first memory, and governed delivery.",
  base: docsBase,
  cleanUrls: true,
  lastUpdated: true,
  lang: "en-US",
  srcExclude: [
    "**/*.zh-CN.md",
    "**/*.fr.md",
    "**/live-provider-smoke.md",
    "**/release-assets.md"
  ],
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${docsBase}mailclaw-mark.svg` }]
  ],
  themeConfig: {
    search: {
      provider: "local"
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/dangoZhang/mailclaw" }
    ],
    footer: {
      message: "Room truth, virtual mail collaboration, and governed delivery.",
      copyright: "MIT"
    }
  },
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: buildNav("/","en"),
        sidebar: buildSidebar("/","en"),
        outlineTitle: "On this page"
      }
    },
    "zh-CN": {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh-CN/",
      themeConfig: {
        nav: buildNav("/zh-CN/","zh-CN"),
        sidebar: buildSidebar("/zh-CN/","zh-CN"),
        outlineTitle: "本页目录"
      }
    },
    fr: {
      label: "Français",
      lang: "fr-FR",
      link: "/fr/",
      themeConfig: {
        nav: buildNav("/fr/","fr"),
        sidebar: buildSidebar("/fr/","fr"),
        outlineTitle: "Sur cette page"
      }
    }
  }
});

function buildNav(base: string, locale: "en" | "zh-CN" | "fr") {
  const labels = localeLabels(locale);
  return [
    { text: labels.home, link: base },
    { text: labels.quickStart, link: withBase(base, "getting-started#three-minute-first-mail") },
    { text: labels.concepts, link: withBase(base, "concepts") },
    { text: labels.multiAgent, link: withBase(base, "multi-agent-workflows") },
    { text: labels.console, link: withBase(base, "operator-console") },
    { text: labels.integrations, link: withBase(base, "integrations") },
    { text: "GitHub", link: "https://github.com/dangoZhang/mailclaw" }
  ];
}

function buildSidebar(base: string, locale: "en" | "zh-CN" | "fr") {
  const labels = localeLabels(locale);
  return [
    {
      text: labels.start,
      items: [
        { text: labels.docsHome, link: base },
        { text: labels.quickStart, link: withBase(base, "getting-started#three-minute-first-mail") },
        { text: labels.gettingStarted, link: withBase(base, "getting-started") }
      ]
    },
    {
      text: labels.product,
      items: [
        { text: labels.concepts, link: withBase(base, "concepts") },
        { text: labels.multiAgentGuide, link: withBase(base, "multi-agent-workflows") },
        { text: labels.operatorConsole, link: withBase(base, "operator-console") },
        { text: labels.integrations, link: withBase(base, "integrations") }
      ]
    },
    {
      text: labels.reference,
      items: [
        { text: labels.operatorsGuide, link: withBase(base, "operators-guide") },
        { text: labels.securityBoundaries, link: withBase(base, "security-boundaries") },
        { text: "ADR-001 Architecture", link: withBase(base, "adr/ADR-001-architecture") }
      ]
    }
  ];
}

function withBase(base: string, slug: string) {
  return `${base}${slug}`;
}

function localeLabels(locale: "en" | "zh-CN" | "fr") {
  switch (locale) {
    case "zh-CN":
      return {
        home: "首页",
        quickStart: "3 分钟起步",
        gettingStarted: "快速开始",
        concepts: "核心概念",
        multiAgent: "多智能体",
        console: "控制台",
        integrations: "集成",
        start: "起步",
        product: "核心能力",
        reference: "参考",
        docsHome: "文档首页",
        multiAgentGuide: "多智能体协作",
        operatorConsole: "运维控制台",
        operatorsGuide: "运维指南",
        securityBoundaries: "安全边界",
      };
    case "fr":
      return {
        home: "Accueil",
        quickStart: "Démarrage 3 min",
        gettingStarted: "Prise en main",
        concepts: "Concepts",
        multiAgent: "Multi-agent",
        console: "Console",
        integrations: "Intégrations",
        start: "Démarrage",
        product: "Produit",
        reference: "Référence",
        docsHome: "Accueil docs",
        multiAgentGuide: "Collaboration multi-agent",
        operatorConsole: "Console opérateur",
        operatorsGuide: "Guide opérateur",
        securityBoundaries: "Limites de sécurité",
      };
    default:
      return {
        home: "Home",
        quickStart: "3-Min Start",
        gettingStarted: "Getting Started",
        concepts: "Core Concepts",
        multiAgent: "Multi-Agent",
        console: "Console",
        integrations: "Integrations",
        start: "Start",
        product: "Product",
        reference: "Reference",
        docsHome: "Docs Home",
        multiAgentGuide: "Multi-Agent Collaboration",
        operatorConsole: "Operator Console",
        operatorsGuide: "Operators Guide",
        securityBoundaries: "Security Boundaries",
      };
  }
}
