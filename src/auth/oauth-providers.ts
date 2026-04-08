export type OAuthProviderId = "gmail" | "outlook";
export type ConnectProviderId = OAuthProviderId | "imap" | "qq" | "icloud" | "yahoo" | "163" | "126" | "forward";

export interface OAuthProviderMetadata {
  id: OAuthProviderId;
  displayName: string;
  aliases: string[];
  accountProvider: "gmail" | "imap";
}

export interface ConnectProviderGuide {
  id: ConnectProviderId;
  displayName: string;
  aliases: string[];
  accountProvider: "gmail" | "imap" | "forward";
  setupKind: "browser_oauth" | "app_password" | "forward_ingest";
  credentialMode?: "oauth_redirect" | "manual_authorization_code" | "manual_password" | "raw_mime_forward";
  secretAutomation?: "supported" | "not_supported" | "not_applicable";
  secretAutomationReason?: string;
  portalUrl?: string;
  portalLabel?: string;
  helpUrl?: string;
  helpLabel?: string;
  authApi?: {
    startPath: string;
    callbackPath?: string;
    browserRedirectMethod?: "GET";
    programmaticMethod?: "POST";
    querySecretPolicy?: "forbidden" | "not_applicable";
  };
  recommendedCommand: string;
  commands: string[];
  inboundModes: string[];
  outboundModes: string[];
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  notes: string[];
}

export interface ConnectDiscovery {
  api: {
    providersPath: string;
    providerDetailPathTemplate: string;
    onboardingPath: string;
    oauthStartPathTemplate: string;
    oauthCallbackPathTemplate: string;
  };
  supportedOAuthProviders: OAuthProviderMetadata[];
  providerCount: number;
}

export interface ConnectOnboardingPlan {
  input: {
    emailAddress?: string;
    providerHint?: string;
    domain?: string;
    accountIdSuggestion: string;
    displayNameSuggestion?: string;
  };
  recommendation: {
    provider: ConnectProviderGuide;
    confidence: "high" | "medium";
    matchReason: "provider_hint" | "email_domain" | "default_generic";
  };
  alternatives: Array<Pick<ConnectProviderGuide, "id" | "displayName" | "setupKind" | "accountProvider">>;
  commands: {
    inspectProviders: string;
    inspectProvider: string;
    login: string;
    observeAccounts: string;
    observeWorkbench: string;
    observeInboxes: string;
  };
  console: {
    browserPath: string;
    workbenchApiPath: string;
  };
  migration: {
    openClawUsers: {
      startCommand: string;
      inspectRuntime: string;
      inspectWorkbench: string;
      notes: string[];
    };
  };
  checklist: string[];
  notes: string[];
}

const MAILCTL_CMD = "mailctl";

const CONNECT_PROVIDER_GUIDES: ConnectProviderGuide[] = [
  {
    id: "gmail",
    displayName: "Gmail",
    aliases: ["gmail", "google", "googlemail"],
    accountProvider: "gmail",
    setupKind: "browser_oauth",
    credentialMode: "oauth_redirect",
    secretAutomation: "supported",
    portalUrl: "https://mail.google.com/",
    portalLabel: "Open Gmail",
    authApi: {
      startPath: "/api/auth/gmail/start",
      callbackPath: "/api/auth/gmail/callback",
      browserRedirectMethod: "GET",
      programmaticMethod: "POST",
      querySecretPolicy: "forbidden"
    },
    recommendedCommand: "mailctl connect login gmail <accountId> [displayName]",
    commands: [
      "mailctl connect login gmail <accountId> [displayName]",
      "mailctl connect login oauth gmail <accountId> [displayName] --topic-name <projects/.../topics/...>"
    ],
    inboundModes: ["gmail_watch", "gmail_history_recovery"],
    outboundModes: ["gmail_api_send"],
    requiredEnvVars: ["MAILCLAW_GMAIL_OAUTH_CLIENT_ID"],
    optionalEnvVars: [
      "MAILCLAW_GMAIL_OAUTH_CLIENT_SECRET",
      "MAILCLAW_GMAIL_OAUTH_TOPIC_NAME",
      "MAILCLAW_GMAIL_OAUTH_USER_ID",
      "MAILCLAW_GMAIL_OAUTH_LABEL_IDS",
      "MAILCLAW_GMAIL_OAUTH_SCOPES"
    ],
    notes: [
      "Browser redirects can use GET /api/auth/gmail/start, but pass client secrets only through POST or env-backed CLI login.",
      "Add a Pub/Sub topic to make Gmail watch/history recovery ready immediately after login.",
      "Use Gmail browser OAuth for the best MailClaws fit; it preserves Gmail watch/history semantics instead of falling back to generic IMAP."
    ]
  },
  {
    id: "outlook",
    displayName: "Outlook",
    aliases: ["outlook", "microsoft", "office365", "hotmail", "live", "msn"],
    accountProvider: "imap",
    setupKind: "browser_oauth",
    credentialMode: "oauth_redirect",
    secretAutomation: "supported",
    portalUrl: "https://outlook.live.com/mail/",
    portalLabel: "Open Outlook",
    authApi: {
      startPath: "/api/auth/outlook/start",
      callbackPath: "/api/auth/outlook/callback",
      browserRedirectMethod: "GET",
      programmaticMethod: "POST",
      querySecretPolicy: "forbidden"
    },
    recommendedCommand: "mailctl connect login outlook <accountId> [displayName]",
    commands: [
      "mailctl connect login outlook <accountId> [displayName]",
      "mailctl connect login oauth outlook <accountId> [displayName] --tenant <tenant>"
    ],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: ["MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID"],
    optionalEnvVars: ["MAILCLAW_MICROSOFT_OAUTH_CLIENT_SECRET", "MAILCLAW_MICROSOFT_OAUTH_TENANT"],
    notes: [
      "Outlook and Microsoft 365 currently land in MailClaws as IMAP/SMTP accounts with OAuth-backed credentials.",
      "If tenant-specific consent is needed, pass --tenant or configure MAILCLAW_MICROSOFT_OAUTH_TENANT."
    ]
  },
  {
    id: "qq",
    displayName: "QQ Mail",
    aliases: ["qq"],
    accountProvider: "imap",
    setupKind: "app_password",
    credentialMode: "manual_authorization_code",
    secretAutomation: "not_supported",
    secretAutomationReason:
      "QQ Mail authorization codes stay in the provider security UI. MailClaws does not scrape or auto-read them; generate the code in QQ Mail and paste it here.",
    portalUrl: "https://mail.qq.com/",
    portalLabel: "Open QQ Mail",
    helpUrl: "https://hiflow.tencent.com/docs/applications/qq-mail/",
    helpLabel: "QQ Mail auth-code docs",
    recommendedCommand: "mailctl connect login qq [accountId] [displayName]",
    commands: ["mailctl connect login qq [accountId] [displayName]"],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: [
      "QQ Mail usually requires the mailbox authorization code instead of the web password.",
      "Browser OAuth is not wired for QQ Mail in this repo; use the IMAP/SMTP preset path."
    ]
  },
  {
    id: "icloud",
    displayName: "iCloud Mail",
    aliases: ["icloud", "me", "mac"],
    accountProvider: "imap",
    setupKind: "app_password",
    credentialMode: "manual_authorization_code",
    secretAutomation: "not_supported",
    secretAutomationReason:
      "App-specific passwords are issued inside the provider account security UI. MailClaws does not scrape or auto-read them; generate one in iCloud settings and paste it here.",
    portalUrl: "https://www.icloud.com/mail/",
    portalLabel: "Open iCloud Mail",
    helpUrl: "https://support.apple.com/en-us/102654",
    helpLabel: "Apple app-specific password docs",
    recommendedCommand: "mailctl connect login icloud [accountId] [displayName]",
    commands: ["mailctl connect login icloud [accountId] [displayName]"],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: [
      "iCloud usually needs an app-specific password generated from Apple ID settings.",
      "Use this preset when you want MailClaws to receive and send mail through iCloud over IMAP/SMTP."
    ]
  },
  {
    id: "yahoo",
    displayName: "Yahoo Mail",
    aliases: ["yahoo"],
    accountProvider: "imap",
    setupKind: "app_password",
    credentialMode: "manual_authorization_code",
    secretAutomation: "not_supported",
    secretAutomationReason:
      "Yahoo app passwords are issued inside the provider account security UI. MailClaws does not scrape or auto-read them; generate one in Yahoo settings and paste it here.",
    portalUrl: "https://mail.yahoo.com/",
    portalLabel: "Open Yahoo Mail",
    recommendedCommand: "mailctl connect login yahoo [accountId] [displayName]",
    commands: ["mailctl connect login yahoo [accountId] [displayName]"],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: ["Yahoo Mail commonly uses app passwords for IMAP/SMTP access."]
  },
  {
    id: "163",
    displayName: "NetEase 163 Mail",
    aliases: ["163"],
    accountProvider: "imap",
    setupKind: "app_password",
    credentialMode: "manual_authorization_code",
    secretAutomation: "not_supported",
    secretAutomationReason:
      "163 authorization codes stay in the provider security UI. MailClaws does not scrape or auto-read them; generate the code in 163 Mail and paste it here.",
    portalUrl: "https://mail.163.com/",
    portalLabel: "Open 163 Mail",
    recommendedCommand: "mailctl connect login 163 [accountId] [displayName]",
    commands: ["mailctl connect login 163 [accountId] [displayName]"],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: ["Use the provider authorization code if the normal mailbox password is rejected."]
  },
  {
    id: "126",
    displayName: "NetEase 126 Mail",
    aliases: ["126"],
    accountProvider: "imap",
    setupKind: "app_password",
    credentialMode: "manual_authorization_code",
    secretAutomation: "not_supported",
    secretAutomationReason:
      "126 authorization codes stay in the provider security UI. MailClaws does not scrape or auto-read them; generate the code in 126 Mail and paste it here.",
    portalUrl: "https://mail.126.com/",
    portalLabel: "Open 126 Mail",
    recommendedCommand: "mailctl connect login 126 [accountId] [displayName]",
    commands: ["mailctl connect login 126 [accountId] [displayName]"],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: ["Use the provider authorization code if the normal mailbox password is rejected."]
  },
  {
    id: "imap",
    displayName: "Generic IMAP/SMTP",
    aliases: ["imap", "password", "generic", "custom"],
    accountProvider: "imap",
    setupKind: "app_password",
    credentialMode: "manual_password",
    secretAutomation: "not_supported",
    secretAutomationReason:
      "Generic IMAP/SMTP credentials come from the mailbox provider or your own admin. MailClaws does not scrape or auto-read them.",
    recommendedCommand: "mailctl connect login [imap|password]",
    commands: ["mailctl connect login", "mailctl connect login imap", "mailctl connect login password"],
    inboundModes: ["imap_watch"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: [
      "Use this path for mailbox providers that expose IMAP/SMTP but are not hard-coded as a preset.",
      "The interactive wizard asks for your mailbox address first, then tries Thunderbird ISPDB and domain autoconfig before falling back to manual IMAP/SMTP entry.",
      "If discovery is incomplete, the wizard still lets you override IMAP host, SMTP host, ports, and credentials."
    ]
  },
  {
    id: "forward",
    displayName: "Forward / raw MIME fallback",
    aliases: ["forward", "raw", "mime", "rfc822"],
    accountProvider: "forward",
    setupKind: "forward_ingest",
    credentialMode: "raw_mime_forward",
    secretAutomation: "not_applicable",
    recommendedCommand: "POST /api/accounts { provider: \"forward\" } + POST /api/inbound/raw",
    commands: [
      "curl -X POST /api/accounts -d '{\"provider\":\"forward\",...}'",
      "curl -X POST /api/inbound/raw?processImmediately=true -d '{\"accountId\":\"...\",\"rawMime\":\"...\"}'"
    ],
    inboundModes: ["raw_mime_forward"],
    outboundModes: ["account_smtp"],
    requiredEnvVars: [],
    optionalEnvVars: [],
    notes: [
      "Create or update the account through POST /api/accounts, then send RFC822 content to POST /api/inbound/raw.",
      "Use this when the mailbox app can forward RFC822 mail to MailClaws but does not have a direct first-party provider adapter here.",
      "Forward mode keeps MailClaws provider-agnostic while still letting the room kernel, outbox, and virtual mail plane stay in control."
    ]
  }
];

const OAUTH_PROVIDERS: OAuthProviderMetadata[] = CONNECT_PROVIDER_GUIDES.filter(
  (entry): entry is ConnectProviderGuide & { id: OAuthProviderId; accountProvider: "gmail" | "imap" } =>
    entry.setupKind === "browser_oauth" && (entry.id === "gmail" || entry.id === "outlook")
).map((entry) => ({
  id: entry.id,
  displayName: entry.displayName,
  aliases: entry.aliases,
  accountProvider: entry.accountProvider
}));

const PASSWORD_PRESET_PROVIDERS = new Set(["imap", "password", "qq", "icloud", "yahoo", "163", "126"]);

export function listConnectProviderGuides() {
  return CONNECT_PROVIDER_GUIDES.map((guide) => ({
    ...guide,
    ...(guide.authApi
      ? {
          authApi: {
            ...guide.authApi
          }
        }
      : {}),
    aliases: [...guide.aliases],
    commands: [...guide.commands],
    inboundModes: [...guide.inboundModes],
    outboundModes: [...guide.outboundModes],
    requiredEnvVars: [...guide.requiredEnvVars],
    optionalEnvVars: [...guide.optionalEnvVars],
    notes: [...guide.notes]
  }));
}

export function resolveConnectProviderGuide(provider: string | undefined) {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const guide = CONNECT_PROVIDER_GUIDES.find(
    (entry) => entry.id === normalized || entry.aliases.includes(normalized)
  );
  return guide
      ? {
        ...guide,
        ...(guide.authApi
          ? {
              authApi: {
                ...guide.authApi
              }
            }
          : {}),
        aliases: [...guide.aliases],
        commands: [...guide.commands],
        inboundModes: [...guide.inboundModes],
        outboundModes: [...guide.outboundModes],
        requiredEnvVars: [...guide.requiredEnvVars],
        optionalEnvVars: [...guide.optionalEnvVars],
        notes: [...guide.notes]
      }
    : null;
}

export function resolveOAuthProvider(provider: string | undefined) {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return OAUTH_PROVIDERS.find((entry) => entry.aliases.includes(normalized)) ?? null;
}

export function isPasswordPresetProvider(provider: string | undefined) {
  const normalized = provider?.trim().toLowerCase();
  return normalized ? PASSWORD_PRESET_PROVIDERS.has(normalized) : false;
}

export function getPasswordPresetProvider(provider: string | undefined) {
  const normalized = provider?.trim().toLowerCase();
  return normalized && PASSWORD_PRESET_PROVIDERS.has(normalized) ? normalized : undefined;
}

export function getConnectDiscovery(): ConnectDiscovery {
  return {
    api: {
      providersPath: "/api/connect/providers",
      providerDetailPathTemplate: "/api/connect/providers/:provider",
      onboardingPath: "/api/connect/onboarding",
      oauthStartPathTemplate: "/api/auth/:provider/start",
      oauthCallbackPathTemplate: "/api/auth/:provider/callback"
    },
    supportedOAuthProviders: OAUTH_PROVIDERS.map((provider) => ({
      ...provider,
      aliases: [...provider.aliases]
    })),
    providerCount: CONNECT_PROVIDER_GUIDES.length
  };
}

export function getUnsupportedOAuthProviderMessage(provider: string | undefined) {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return "oauth login provider is required; see `mailctl connect providers` for supported setup paths";
  }
  if (normalized === "qq") {
    return "QQ Mail does not expose a supported browser OAuth flow here; use `mailctl connect login qq` and enter the QQ authorization code/app password.";
  }
  if (["icloud", "me", "mac", "yahoo", "163", "126"].includes(normalized)) {
    return `OAuth login is not wired for ${normalized} here; use \`mailctl connect login ${normalized}\` or \`mailctl connect providers ${normalized}\` for the IMAP/app-password path.`;
  }
  return `unsupported oauth login provider: ${provider}; see \`mailctl connect providers\``;
}

export function buildConnectOnboardingPlan(input: {
  emailAddress?: string;
  providerHint?: string;
} = {}): ConnectOnboardingPlan {
  const normalizedEmailAddress = input.emailAddress?.trim().toLowerCase() || undefined;
  const domain = normalizedEmailAddress?.split("@")[1]?.trim().toLowerCase() || undefined;
  const providerHint = input.providerHint?.trim().toLowerCase() || undefined;

  const recommendation = resolveOnboardingRecommendation({
    providerHint,
    emailAddress: normalizedEmailAddress,
    domain
  });
  const accountIdSuggestion = normalizedEmailAddress
    ? createSuggestedAccountId(normalizedEmailAddress)
    : "<accountId>";
  const displayNameSuggestion = normalizedEmailAddress
    ? inferSuggestedDisplayName(normalizedEmailAddress)
    : undefined;

  return {
    input: {
      emailAddress: normalizedEmailAddress,
      providerHint,
      domain,
      accountIdSuggestion,
      displayNameSuggestion
    },
    recommendation: {
      provider: recommendation.provider,
      confidence: recommendation.confidence,
      matchReason: recommendation.matchReason
    },
    alternatives: recommendation.alternatives.map((guide) => ({
      id: guide.id,
      displayName: guide.displayName,
      setupKind: guide.setupKind,
      accountProvider: guide.accountProvider
    })),
    commands: {
      inspectProviders: `${MAILCTL_CMD} connect providers`,
      inspectProvider: `${MAILCTL_CMD} connect providers ${recommendation.provider.id}`,
      login: renderOnboardingLoginCommand(recommendation.provider, {
        accountIdSuggestion,
        displayNameSuggestion
      }),
      observeAccounts: `${MAILCTL_CMD} observe accounts`,
      observeWorkbench:
        accountIdSuggestion === "<accountId>"
          ? `${MAILCTL_CMD} observe workbench <accountId>`
          : `${MAILCTL_CMD} observe workbench ${accountIdSuggestion}`,
      observeInboxes:
        accountIdSuggestion === "<accountId>"
          ? `${MAILCTL_CMD} observe inboxes <accountId>`
          : `${MAILCTL_CMD} observe inboxes ${accountIdSuggestion}`
    },
    console: {
      browserPath: "/workbench/mail",
      workbenchApiPath: "/api/console/workbench"
    },
    migration: {
      openClawUsers: {
        startCommand:
          "MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev",
        inspectRuntime: `${MAILCTL_CMD} observe runtime`,
        inspectWorkbench:
          accountIdSuggestion === "<accountId>"
            ? `${MAILCTL_CMD} observe workbench <accountId>`
            : `${MAILCTL_CMD} observe workbench ${accountIdSuggestion}`,
        notes: [
          "Keep Gateway/bridge mode enabled first; MailClaws adds room truth, virtual mail, approvals, and replay on top of the OpenClaw substrate.",
          "Do not treat OpenClaw session transcript as MailClaws truth. Inspect rooms, mailbox feeds, and `/workbench/mail` instead."
        ]
      }
    },
    checklist: buildOnboardingChecklist(recommendation.provider, {
      accountIdSuggestion,
      emailAddress: normalizedEmailAddress
    }),
    notes: [...recommendation.provider.notes]
  };
}

function resolveOnboardingRecommendation(input: {
  providerHint?: string;
  emailAddress?: string;
  domain?: string;
}) {
  if (input.providerHint) {
    const provider = resolveConnectProviderGuide(input.providerHint);
    if (provider) {
      return {
        provider,
        confidence: "high" as const,
        matchReason: "provider_hint" as const,
        alternatives: listAlternativeProviders(provider.id)
      };
    }
  }

  if (input.domain) {
    const provider = resolveConnectProviderGuide(resolveConnectProviderByDomain(input.domain));
    if (provider) {
      return {
        provider,
        confidence: provider.id === "imap" ? ("medium" as const) : ("high" as const),
        matchReason: "email_domain" as const,
        alternatives: listAlternativeProviders(provider.id)
      };
    }
  }

  const provider = resolveConnectProviderGuide("imap");
  if (!provider) {
    throw new Error("generic imap provider guide is missing");
  }

  return {
    provider,
    confidence: "medium" as const,
    matchReason: "default_generic" as const,
    alternatives: listAlternativeProviders(provider.id)
  };
}

function resolveConnectProviderByDomain(domain: string) {
  switch (domain) {
    case "gmail.com":
    case "googlemail.com":
      return "gmail";
    case "outlook.com":
    case "hotmail.com":
    case "live.com":
    case "msn.com":
    case "office365.com":
      return "outlook";
    case "qq.com":
      return "qq";
    case "icloud.com":
    case "me.com":
    case "mac.com":
      return "icloud";
    case "yahoo.com":
      return "yahoo";
    case "163.com":
      return "163";
    case "126.com":
      return "126";
    default:
      return "imap";
  }
}

function listAlternativeProviders(providerId: ConnectProviderId) {
  const alternatives = new Set<ConnectProviderId>();
  if (providerId !== "imap") {
    alternatives.add("imap");
  }
  if (providerId !== "forward") {
    alternatives.add("forward");
  }
  return [...alternatives]
    .map((id) => resolveConnectProviderGuide(id))
    .filter((guide): guide is ConnectProviderGuide => Boolean(guide));
}

function renderOnboardingLoginCommand(
  provider: ConnectProviderGuide,
  input: {
    accountIdSuggestion: string;
    displayNameSuggestion?: string;
  }
) {
  const displayNamePart = input.displayNameSuggestion ? ` "${input.displayNameSuggestion}"` : " [displayName]";
  if (provider.setupKind === "browser_oauth") {
    return `${MAILCTL_CMD} connect login ${provider.id} ${input.accountIdSuggestion}${displayNamePart}`;
  }
  if (provider.id === "imap") {
    return `${MAILCTL_CMD} connect login`;
  }
  if (provider.id === "forward") {
    return "curl -X POST http://127.0.0.1:3000/api/accounts -H 'content-type: application/json' -d '{\"provider\":\"forward\",\"accountId\":\"<accountId>\",\"emailAddress\":\"you@example.com\"}'";
  }
  return `${MAILCTL_CMD} connect login ${provider.id} ${input.accountIdSuggestion}${displayNamePart}`;
}

function buildOnboardingChecklist(
  provider: ConnectProviderGuide,
  input: {
    accountIdSuggestion: string;
    emailAddress?: string;
  }
) {
  const mailboxLabel = input.emailAddress ?? "your mailbox";
  const steps = [
    `Inspect the provider guide with \`${MAILCTL_CMD} connect providers ${provider.id}\`.`,
    `Connect ${mailboxLabel} with \`${renderOnboardingLoginCommand(provider, { accountIdSuggestion: input.accountIdSuggestion, displayNameSuggestion: input.emailAddress ? inferSuggestedDisplayName(input.emailAddress) : undefined })}\`.`,
    "Open `/workbench/mail` and confirm the account shows up under Accounts/Mailboxes.",
    `Send a test email from another mailbox to ${mailboxLabel} and confirm a new room appears.`,
    `Inspect the room and internal agent mail with \`${MAILCTL_CMD} observe workbench ${input.accountIdSuggestion}\` or the browser console.`,
    "Approve or reject any pending outbound draft through the outbox/approval flow instead of expecting direct send from workers."
  ];

  if (provider.id === "gmail") {
    steps.splice(
      2,
      0,
      "If you want Gmail watch/history recovery immediately, add the Pub/Sub topic during login or configure it right after OAuth completes."
    );
  }

  if (provider.id === "forward") {
    steps[1] =
      "Create the forward/raw-MIME account, then configure your mailbox app or provider to forward RFC822 mail into `POST /api/inbound/raw`.";
  }

  return steps;
}

function createSuggestedAccountId(emailAddress: string) {
  return `acct-${emailAddress
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)}`;
}

function inferSuggestedDisplayName(emailAddress: string) {
  return emailAddress.split("@")[0]?.trim() || emailAddress;
}
