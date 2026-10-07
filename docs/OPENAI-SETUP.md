# OpenAI setup for Guided Planning

Updated September 26, 2026. This change replaces the Claude SDK with OpenAI
Responses for the ten existing AI actions. The deterministic planning engine,
prompts, output schemas, tenant authorization, approval requirements, quotas,
reuse decisions and job workflow remain in place. No database migration is needed.

## Account and billing

1. Sign in at https://platform.openai.com/ and complete account onboarding.
2. Create a project named **Guided Planning**. Use separate projects/keys for
   production and staging when those environments are provisioned.
3. In organization Billing, add a payment method and fund API usage as directed
   by the dashboard. The account owner chooses the amount and any auto-recharge.
   A ChatGPT/Codex subscription does not fund the application's API requests.
4. Configure project spend alerts and a hard monthly spend limit appropriate
   for the business. A hard limit can stop AI requests when it is reached.
5. Create a project API key with the permissions needed to create Responses.
   Store it directly in the server's secret configuration. Never paste it in a
   chat, commit it, or give it a NEXT_PUBLIC_ prefix.

## Server configuration

| Variable | Purpose |
| --- | --- |
| OPENAI_API_KEY | Required server-side project key |
| OPENAI_MODEL | Defaults to gpt-6-sol |
| AI_ENABLED | Set false to disable AI; enable only after configuration/testing |
| OPENAI_INPUT_PRICE_PER_MILLION_USD | Optional input cost estimate override |
| OPENAI_OUTPUT_PRICE_PER_MILLION_USD | Optional output cost estimate override |
| OPENAI_CACHE_WRITE_PRICE_PER_MILLION_USD | Optional cache-write cost estimate override |
| OPENAI_CACHE_READ_PRICE_PER_MILLION_USD | Optional cache-read cost estimate override |

For local development, use an ignored root .env.local file. For Vercel, add the
key to the appropriate deployment environment's encrypted environment variables
and redeploy. Do not share a production key with untrusted preview deployments.
There is no fallback to Claude; ANTHROPIC_* variables are no longer used.
Keep the old deployment available until the new provider passes smoke tests.

The adapter requests Standard processing, low reasoning effort, one named
function call and store:false. Existing output limits now include reasoning
tokens. Existing Zod validators remain the acceptance gate. Optional tool fields
remain optional through strict:false; this avoids requiring invented facts.
Only explicitly marked stable developer instructions receive cache breakpoints.
Input documents remain user content. store:false does not itself establish
Zero Data Retention; review the provider's data controls separately.

Usage estimates use Standard short-context prices verified on September 26:
Sol $2 input / $10 output per million tokens; cache writes $2.50 and reads $0.20.
Supported Astra/Luna defaults and all four price overrides are in pricing.ts.
Unrecognized model names require all four prices before an API request is sent;
they also require separate compatibility testing for the adapter's GPT-6 options.
Cached input is excluded from uncached input before calculating cost, and output
includes reasoning tokens once. Historical usage rows keep their original cost.

These are internal estimates, not an invoice or a hard reservation of spend.
Long-context requests have different pricing; revalidate the rates and context
sizes before increasing input budgets. Concurrent requests and retries can
exceed an application budget check, so configure provider spend limits too.
Transport failures without reported usage cannot be fully costed locally.

## Activation acceptance checks

Configuration status updated October 7, 2026: the server-side OpenAI key is
configured locally and the selected continuous-use model is `gpt-6-luna`.
The Product Owner reports that the deployment key is also configured. The
checks below now validate real product behavior; they are not provider setup
steps and the AI features are not demo stubs.

1. Run an authenticated intake analysis in staging and verify the saved model
   and nonzero estimated cost, without modifying approved planning artifacts.
2. Analyze a small synthetic document; verify source citations and individual
   approval. Avoid customer documents for the first connection test.
3. Generate feature suggestions, confirm they are drafts, then repeat the same
   request to verify reuse without another paid generation.
4. Check refusal, output truncation and API errors produce a useful failure
   rather than partial plan changes. Review the small output limits against
   representative results before raising them or changing reasoning effort.
5. Confirm organization quotas, the kill switch and provider spend alerts work.
6. Run each remaining AI action with representative inputs before production
   promotion. Mocked tests prove application behavior, not model output quality.

The account, billing, key and live smoke tests were not configured by this code
change. Do not describe the production application as switched until verified.

## References

- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/production-best-practices
