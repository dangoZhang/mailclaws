# Mailbox Provider Matrix

This page lists the mailbox connection paths currently supported by MailClaws and what the user must do for each one.

| Mailbox / Path | Provider ID | Connection Mode | Inbound | Outbound | What The User Must Prepare | What The User Must Do | Action Inside MailClaws |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail | `gmail` | Browser OAuth | `gmail_watch`, `gmail_history_recovery` | `gmail_api_send` | Google OAuth client and, when needed, client secret and Pub/Sub topic | Sign in to Google and grant mailbox access | Select Gmail and start OAuth login |
| Outlook / Microsoft 365 | `outlook` | Browser OAuth | `imap_watch` | `account_smtp` | Microsoft OAuth client and, when needed, client secret and tenant | Sign in to Microsoft and grant mailbox access | Select Outlook and start OAuth login |
| QQ Mail | `qq` | IMAP / SMTP authorization code | `imap_watch` | `account_smtp` | QQ Mail authorization code | Enable IMAP / SMTP in the provider security settings and generate the authorization code | Select QQ Mail and paste the authorization code |
| NetEase 163 Mail | `163` | IMAP / SMTP authorization code | `imap_watch` | `account_smtp` | 163 Mail authorization code | Enable IMAP / SMTP in the provider security settings and generate the authorization code | Select NetEase 163 Mail and paste the authorization code |
| NetEase 126 Mail | `126` | IMAP / SMTP authorization code | `imap_watch` | `account_smtp` | 126 Mail authorization code | Enable IMAP / SMTP in the provider security settings and generate the authorization code | Select NetEase 126 Mail and paste the authorization code |
| iCloud Mail | `icloud` | IMAP / SMTP app-specific password | `imap_watch` | `account_smtp` | Apple app-specific password | Generate an app-specific password in Apple Account security settings | Select iCloud Mail and paste the app-specific password |
| Yahoo Mail | `yahoo` | IMAP / SMTP app password | `imap_watch` | `account_smtp` | Yahoo app password | Generate an app password in Yahoo account security settings | Select Yahoo Mail and paste the app password |
| Generic IMAP / SMTP | `imap` | Manual IMAP / SMTP | `imap_watch` | `account_smtp` | IMAP host, SMTP host, ports, TLS mode, username, and password or authorization code | Confirm the full connection parameters with the provider or admin | Select Generic IMAP / SMTP and enter the settings manually |
| Forward / raw MIME fallback | `forward` | Raw MIME forward | `raw_mime_forward` | `account_smtp` | A mailbox or gateway that can forward RFC822 raw mail | Configure the provider or gateway to forward raw mail | Create a forward account and send mail to `POST /api/inbound/raw` |

| User Entry Point | Purpose |
| --- | --- |
| `mailclaws onboard you@example.com` | Recommend a provider from the mailbox address |
| `mailclaws login` | Open the generic login wizard |
| `mailclaws providers` | List all supported providers |
| `mailctl connect providers` | Show detailed provider data |
| `mailctl connect provider <providerId>` | Show the guide for a single provider |

| Web Flow Step | Description |
| --- | --- |
| Enter the mailbox address | Used to recommend a provider and fill default settings |
| Click `Load Setup` | Load the recommended path and autoconfig |
| Select a provider | Switch to any supported path |
| Complete OAuth or paste the secret | Finish browser OAuth, or paste the authorization code, app password, or password |
| Save the account | Persist the mailbox configuration in MailClaws |

| Note | Details |
| --- | --- |
| Automatic secret retrieval | MailClaws does not scrape or auto-read authorization codes, app passwords, or mailbox passwords from provider security pages |
| Recommended order | Use Browser OAuth when available, then a preset or generic IMAP / SMTP path, and finally forward / raw MIME |
| Support boundary | Whether a mailbox can be connected depends on whether the provider exposes usable OAuth, IMAP / SMTP, or raw MIME forwarding |

## See Also

- [Integrations](./integrations.md)
- [Getting Started](./getting-started.md)
- [Operator Console](./operator-console.md)
