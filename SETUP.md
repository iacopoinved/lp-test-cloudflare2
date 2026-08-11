# Form-proxy setup

This Worker sits between your Framer form and your Make.com webhook and applies
four protections: **origin lock → rate limit → Turnstile → shared secret**. The
Make.com URL never reaches the browser.

```
Framer form (+ Turnstile)  →  Worker (this repo)  →  Make.com webhook
```

The code is done (`src/index.ts`, `wrangler.jsonc`, `framer/FormWithTurnstile.tsx`).
The steps below need your Cloudflare account / secrets — do them in order.

---

## 1. Create the Turnstile widget (gives you 2 keys)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Name it (e.g. `framer-landing`). Add hostname **`scary-onion-338668.framer.app`**
   (and your custom domain later, if any).
3. Widget mode: **Managed** (recommended).
4. Save. You now have:
   - **Site key** (public) → goes into the Framer component (step 4).
   - **Secret key** (private) → becomes the `TURNSTILE_SECRET` Worker secret (step 2).

---

## 2. Set the three Worker secrets

Run these from this folder (each prompts you to paste the value):

```bash
npx wrangler secret put MAKE_WEBHOOK_URL   # your Make.com webhook URL
npx wrangler secret put TURNSTILE_SECRET   # the Turnstile *secret key* from step 1
npx wrangler secret put SHARED_SECRET      # your existing Make API-key value (sent as the x-make-apikey header)
```

> If wrangler isn't logged in yet: `npx wrangler login` (opens a browser).

`ALLOWED_ORIGIN` and the rate-limit binding are already in `wrangler.jsonc` — no
action needed. Secrets are stored encrypted by Cloudflare, never in this repo.

---

## 3. Deploy the Worker

```bash
npm run deploy
```

The output prints your Worker URL, e.g.
`https://nameless-wind-d395.<your-subdomain>.workers.dev`. Copy it for step 4.

---

## 4. Add the component in Framer

1. Framer → **Assets ▸ Code ▸ New Code File**, paste in
   `framer/FormWithTurnstile.tsx`, drag the component onto your page.
2. In the right panel set:
   - **Site Key** → the Turnstile *site key* from step 1.
   - **Worker URL** → the URL from step 3.
3. Publish. (Replace your existing Framer form with this component — the old form
   posts straight to Make and would bypass all of this.)

---

## 5. Add the filter as Make's FIRST module

In your Make scenario, immediately after the webhook trigger, add a **filter**
that only continues when the shared secret matches:

- Condition: `X-Form-Secret` (from the webhook request headers) **Equal to**
  your `SHARED_SECRET` value.

This is the cost cap: if your Make URL ever leaks, a direct hit is dropped after
the trigger (1 operation) instead of running the whole scenario.

> ⚠️ The Worker sends the secret in the **`X-Form-Secret`** header. If your
> existing Make API-key check reads a *different* header/field, either point the
> filter at `X-Form-Secret`, or tell me the name you use and I'll change the
> Worker to match.

---

## Test it

- **Real submit** from the published Framer page → should succeed and create the
  Make run.
- **Direct curl** (no Turnstile token) → should be rejected by the Worker:
  ```bash
  curl -i -X POST https://nameless-wind-d395.<sub>.workers.dev \
    -H "Origin: https://scary-onion-338668.framer.app" \
    -H "Content-Type: application/json" -d '{"email":"x@y.z"}'
  # → 400 {"error":"Missing captcha"}
  ```
- **Wrong origin** → `403 Forbidden`.
- **Spam the same IP** >10×/min → `429 Too many requests`.

---

## Alternative: WAF rate-limiting rule (instead of the in-Worker binding)

The rate limit currently runs in code via the `RATE_LIMITER` binding. If you'd
rather offload it to a dashboard rule (runs before the Worker executes):

1. Remove the `ratelimits` block from `wrangler.jsonc` and the
   `RATE_LIMITER` lines from `src/index.ts`, redeploy.
2. Cloudflare dashboard → **Security ▸ WAF ▸ Rate limiting rules** → add a rule
   targeting the Worker route, e.g. 10 requests / 1 min per IP → Block.

Availability of custom rate-limiting rules depends on your Cloudflare plan; the
in-Worker binding has no such dependency, which is why it's the default here.
