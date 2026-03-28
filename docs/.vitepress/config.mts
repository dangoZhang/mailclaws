import { defineConfig } from "vitepress";

export default defineConfig({
  title: "MailClaw",
  description: "Email-native runtime docs for durable rooms, virtual mail, approvals, and replay.",
  cleanUrls: true,
  lastUpdated: true,
  lang: "en-US",
  srcExclude: ["**/*.zh-CN.md", "**/*.fr.md"],
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/mailclaw-mark.svg" }]
  ],
  themeConfig: {
    search: {
      provider: "local"
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/openclaw/openclaw" }
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
    { text: labels.gettingStarted, link: withBase(base, "getting-started") },
    { text: labels.promptFootprint, link: withBase(base, "prompt-footprint") },
    { text: labels.security, link: withBase(base, "security-boundaries") },
    { text: labels.console, link: withBase(base, "operator-console") },
    { text: labels.integrations, link: withBase(base, "integrations") },
    { text: "GitHub", link: "https://github.com/openclaw/openclaw" }
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
        { text: labels.gettingStarted, link: withBase(base, "getting-started") },
        { text: labels.promptFootprint, link: withBase(base, "prompt-footprint") },
        { text: labels.securityBoundaries, link: withBase(base, "security-boundaries") },
        { text: labels.liveProviderSmoke, link: withBase(base, "live-provider-smoke") }
      ]
    },
    {
      text: labels.operate,
      items: [
        { text: labels.operatorConsole, link: withBase(base, "operator-console") },
        { text: labels.operatorsGuide, link: withBase(base, "operators-guide") },
        { text: labels.integrations, link: withBase(base, "integrations") }
      ]
    },
    {
      text: labels.architecture,
      items: [
        { text: labels.integrations, link: withBase(base, "integrations") },
        { text: "ADR-001 Architecture", link: withBase(base, "adr/ADR-001-architecture") }
      ]
    },
    {
      text: labels.release,
      items: [
        { text: labels.releaseAssets, link: withBase(base, "release-assets") }
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
        security: "安全边界",
        console: "控制台",
        integrations: "集成",
        promptFootprint: "Prompt 体积",
        start: "起步",
        operate: "运维",
        architecture: "架构",
        docsHome: "文档首页",
        operatorConsole: "运维控制台",
        operatorsGuide: "运维指南",
        runtime: "运行时",
        securityBoundaries: "安全边界",
        liveProviderSmoke: "真实 Provider Smoke",
        release: "发布",
        releaseAssets: "发布素材"
      };
    case "fr":
      return {
        home: "Accueil",
        quickStart: "Démarrage 3 min",
        gettingStarted: "Prise en main",
        security: "Sécurité",
        console: "Console",
        integrations: "Intégrations",
        promptFootprint: "Empreinte prompt",
        start: "Démarrage",
        operate: "Exploitation",
        architecture: "Architecture",
        docsHome: "Accueil docs",
        operatorConsole: "Console opérateur",
        operatorsGuide: "Guide opérateur",
        runtime: "Runtime",
        securityBoundaries: "Limites de sécurité",
        liveProviderSmoke: "Smoke providers réels",
        release: "Release",
        releaseAssets: "Assets de release"
      };
    default:
      return {
        home: "Home",
        quickStart: "3-Min Start",
        gettingStarted: "Getting Started",
        security: "Security",
        console: "Console",
        integrations: "Integrations",
        promptFootprint: "Prompt Footprint",
        start: "Start",
        operate: "Operate",
        architecture: "Architecture",
        docsHome: "Docs Home",
        operatorConsole: "Operator Console",
        operatorsGuide: "Operators Guide",
        runtime: "Runtime",
        securityBoundaries: "Security Boundaries",
        liveProviderSmoke: "Live Provider Smoke",
        release: "Release",
        releaseAssets: "Release Assets"
      };
  }
}
