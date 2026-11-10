# Meeting connections and notes

Each user connects their own Google Calendar, Zoom, and optionally Notion account from **Integrations**. Google Meet and Google Calendar have separate cards but share one Google OAuth grant because Calendar creates the Meet conference. The connected account email is shown in Integrations and on the demo's **Google Calendar** page. An initiative editor can schedule a demo call from the Meet or Zoom page; the event is created on that editor's primary Google Calendar and invitations are sent from there. The meeting organizer can later sync provider activity. Other initiative editors can maintain meeting notes, transcripts, and summaries using their own Notion connection when needed. Each demo's calendar tab displays only the current user's calendar events.

## Deployment setup

Apply both `prisma/migrations/20261110150000_meeting_provider_capture/migration.sql` and `prisma/migrations/20261110160000_personal_meeting_connections/migration.sql` through the normal staging migration pipeline before deploying code. Configure these server-only variables in staging and production:

| Variable | Purpose |
| --- | --- |
| `MEETING_TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64url encoded, used to encrypt OAuth tokens at rest. Do not rotate without reconnecting providers. |
| `GOOGLE_MEETING_CLIENT_ID`, `GOOGLE_MEETING_CLIENT_SECRET`, `GOOGLE_MEETING_REDIRECT_URI` | Google OAuth web application; callback ends in `/api/meeting-providers/google_calendar/callback`. |
| `ZOOM_MEETING_CLIENT_ID`, `ZOOM_MEETING_CLIENT_SECRET`, `ZOOM_MEETING_REDIRECT_URI` | Zoom General OAuth app; callback ends in `/api/meeting-providers/zoom/callback`. |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI` | Notion public OAuth integration; callback ends in `/api/notion/callback`. |
| `OPENAI_API_KEY`, existing AI configuration | Server-side summary drafting. |

Generate the encryption key once with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Store it in the deployment's secret manager, never in the repository or a `NEXT_PUBLIC_` variable. Each redirect URI must use HTTPS outside localhost and exactly match the provider app configuration.

Enable Google Calendar API and Google Meet REST API for the Google OAuth app. The requested scopes are `openid`, `email`, `calendar.events`, and `meetings.space.readonly`. These identify the connected account, list its calendar events, create events and invites, and read available Meet activity. Google may require OAuth app verification before use beyond test accounts.

Configure the Zoom OAuth app with `meeting:write:meeting`, `meeting:read:past_meeting`, `meeting:read:list_past_participants`, `cloud_recording:read:meeting_transcript`, and `user:read:user`. The final scope identifies the connected host email. The transcript scope applies only where the account's meeting transcript feature is available. Zoom's past participant endpoint requires a paid Pro or higher account, and participant email can be blank for people outside the host account.

Configure the Notion OAuth integration with read content capability. The page must be shared with the connection in Notion. Import accepts a Notion page URL or ID and copies up to 100,000 characters of page block text into the Clarivia notes editor for review and saving. It does not maintain a live Notion sync.

## Data and behavior

- Invitation names and emails are saved as planned participants. Provider observations are recorded separately, with display names and join/leave times. Exact email matching can mark an invitee joined; display names alone remain unmatched.
- **Sync provider activity** retrieves actual meeting start/end and available participants on demand. A generated provider transcript is imported when available. Native transcription or recording must be enabled in the provider and may require account settings or plan entitlements. The app does not automatically record calls or add a recording bot.
- A human can enter notes, import `.txt`, `.md`, or `.vtt` files, or import a Notion page. Manual transcript edits are preserved when provider activity is synced again.
- **Draft summary with AI** uses the existing server-side OpenAI configuration and treats notes/transcript as source material. It returns a draft; the user reviews and saves it.
- No email is sent directly by Clarivia. Google Calendar sends guest updates with `sendUpdates=all` for both Meet and Zoom events.
- OAuth tokens are encrypted with an authenticated binding to workspace, user, and provider. Database row policies limit each connection to its owner. Disconnecting removes only that user's connection.

Both migrations were applied to the isolated staging database on November 10, 2026, with their checked-in checksums recorded in its Prisma migration ledger; production has not been migrated. This branch has not been connected to live provider credentials. As of November 10, 2026, the production Vercel project has no `MEETING_TOKEN_ENCRYPTION_KEY`, `GOOGLE_MEETING_*`, `ZOOM_MEETING_*`, `NOTION_*`, or `OPENAI_API_KEY` variables. Production activation also requires provider OAuth applications with the exact production callback URLs, Google app verification if required, both production database migrations, and a live end-to-end check of OAuth, calendar, invitations, attendance, transcript, and summary.
