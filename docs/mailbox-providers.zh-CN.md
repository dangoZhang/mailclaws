# 邮箱接入清单

这一页列出 MailClaws 当前支持的邮箱接入方式，以及用户需要完成的操作。

| 邮箱 / 路径 | Provider ID | 接入方式 | 入站 | 出站 | 用户需要准备 | 用户操作 | MailClaws 内操作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail | `gmail` | Browser OAuth | `gmail_watch`, `gmail_history_recovery` | `gmail_api_send` | Google OAuth client，必要时准备 client secret、Pub/Sub topic | 登录 Google 并授权 MailClaws 访问邮箱 | 选择 Gmail，发起 OAuth 登录 |
| Outlook / Microsoft 365 | `outlook` | Browser OAuth | `imap_watch` | `account_smtp` | Microsoft OAuth client，必要时准备 client secret、tenant | 登录 Microsoft 并授权 MailClaws 访问邮箱 | 选择 Outlook，发起 OAuth 登录 |
| QQ Mail | `qq` | IMAP / SMTP 授权码 | `imap_watch` | `account_smtp` | QQ 邮箱授权码 | 在 provider 安全设置里开启 IMAP / SMTP，生成授权码 | 选择 QQ Mail，粘贴授权码 |
| NetEase 163 Mail | `163` | IMAP / SMTP 授权码 | `imap_watch` | `account_smtp` | 163 邮箱授权码 | 在 provider 安全设置里开启 IMAP / SMTP，生成授权码 | 选择 NetEase 163 Mail，粘贴授权码 |
| NetEase 126 Mail | `126` | IMAP / SMTP 授权码 | `imap_watch` | `account_smtp` | 126 邮箱授权码 | 在 provider 安全设置里开启 IMAP / SMTP，生成授权码 | 选择 NetEase 126 Mail，粘贴授权码 |
| iCloud Mail | `icloud` | IMAP / SMTP app-specific password | `imap_watch` | `account_smtp` | Apple app-specific password | 在 Apple Account 安全设置里生成 app-specific password | 选择 iCloud Mail，粘贴专用密码 |
| Yahoo Mail | `yahoo` | IMAP / SMTP app password | `imap_watch` | `account_smtp` | Yahoo app password | 在 Yahoo 账户安全设置里生成 app password | 选择 Yahoo Mail，粘贴专用密码 |
| Generic IMAP / SMTP | `imap` | 手动 IMAP / SMTP | `imap_watch` | `account_smtp` | IMAP host、SMTP host、端口、TLS、用户名、密码或授权码 | 向 provider 或管理员确认全部连接参数 | 选择 Generic IMAP / SMTP，手填参数 |
| Forward / raw MIME fallback | `forward` | Raw MIME forward | `raw_mime_forward` | `account_smtp` | 能转发 RFC822 原始邮件的邮箱或网关 | 配置 provider 或网关转发原始邮件 | 创建 forward 账号，发送到 `POST /api/inbound/raw` |

| 用户入口 | 作用 |
| --- | --- |
| `mailclaws onboard you@example.com` | 根据邮箱地址给出建议 provider |
| `mailclaws login` | 进入通用登录向导 |
| `mailclaws providers` | 查看所有 provider 清单 |
| `mailctl connect providers` | 查看详细 provider 数据 |
| `mailctl connect provider <providerId>` | 查看某个 provider 的详细说明 |

| 网页端步骤 | 说明 |
| --- | --- |
| 输入邮箱地址 | 用于推荐 provider 和自动填充默认参数 |
| 点击 `Load Setup` | 加载推荐路径和 autoconfig |
| 选择 provider | 可切换为任意支持路径 |
| 完成 OAuth 或粘贴密钥 | 按页面提示完成浏览器授权，或粘贴授权码 / app password / 密码 |
| 保存账号 | 将收发配置写入 MailClaws |

| 说明 | 内容 |
| --- | --- |
| 自动拿密钥 | MailClaws 不会抓取或自动读取 provider 安全页里的授权码、app password 或普通密码 |
| 选择顺序 | 有 Browser OAuth 就优先用 OAuth；否则走预置或通用 IMAP / SMTP；最后用 forward / raw MIME |
| 适配范围 | 是否能接入，关键在 provider 是否提供可用的 OAuth、IMAP / SMTP 或 raw MIME forward 能力 |

## 参考

- [集成指南](./integrations.zh-CN.md)
- [快速开始](./getting-started.zh-CN.md)
- [运维控制台](./operator-console.zh-CN.md)
