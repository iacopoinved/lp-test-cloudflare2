/**
 * Form-proxy Worker.
 *
 * Sits between the Framer landing page form and the Make.com webhook so that:
 *   1. CORS / origin lock  — only requests from an allowed origin are served.
 *   2. Rate limit per IP    — caps abuse before anything expensive runs.
 *   3. Honeypot             — a hidden form field only bots fill → dropped silently.
 *   4. Turnstile            — the captcha token is verified server-side WHEN PRESENT.
 *   5. Shared secret        — Make never sees the browser; the Worker forwards
 *                             with X-Form-Secret so a leaked Make URL still gets
 *                             filtered to 1 operation at the first Make module.
 *
 * CAPTURE-FIRST POSTURE: this is a paid-traffic lead form, so a real submission
 * must never be lost. Turnstile is treated as a SIGNAL, not a hard gate — a
 * missing/failed token does not reject the lead; it forwards it flagged
 * `verified=false` so the Make scenario can branch on it. The only hard drop is
 * the honeypot (near-zero false positives). A too-fast submit is annotated
 * (`bot_fast_submit=true`) but still forwarded, because sessionStorage restores
 * and browser autofill can legitimately produce fast submissions.
 *
 * The Make.com webhook URL is a server-only secret — the browser only ever
 * talks to this Worker. See SETUP.md for the dashboard / CLI steps.
 *
 * Bindings & secrets (see SETUP.md):
 *   wrangler secret put MAKE_WEBHOOK_URL   // your Make.com webhook URL
 *   wrangler secret put TURNSTILE_SECRET   // Turnstile *secret key* (from the widget)
 *   wrangler secret put SHARED_SECRET      // value Make checks on X-Form-Secret
 *   vars.ALLOWED_ORIGIN  in wrangler.jsonc // comma-separated allowed origins
 *   RATE_LIMITER binding in wrangler.jsonc
 */

interface Env {
	MAKE_WEBHOOK_URL: string; // server-only; the browser never sees this
	TURNSTILE_SECRET: string;
	SHARED_SECRET: string;
	ALLOWED_ORIGIN: string; // one origin, or several comma-separated
	RATE_LIMITER: RateLimit;
}

interface TurnstileResult {
	success: boolean;
	"error-codes"?: string[];
}

// Hidden form field only bots fill. MUST match HONEYPOT_FIELD in the Framer form.
const HONEYPOT_FIELD = "company_website";
// Submissions faster than this are flagged (not dropped) as a soft bot signal.
const MIN_ELAPSED_MS = 2000;

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		// Resolve which origin (if any) this request is allowed under. We echo
		// back the matched origin — CORS can't return a list.
		const allowed = env.ALLOWED_ORIGIN.split(",").map((o) => o.trim());
		const origin = req.headers.get("Origin");
		const matchedOrigin = origin && allowed.includes(origin) ? origin : null;

		const cors: Record<string, string> = {
			"Access-Control-Allow-Origin": matchedOrigin ?? allowed[0],
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Access-Control-Max-Age": "86400",
			Vary: "Origin",
		};

		// CORS preflight
		if (req.method === "OPTIONS") return new Response(null, { headers: cors });
		if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

		// (3) Origin lock — cheap filter + required for the cross-origin POST from Framer
		if (!matchedOrigin) return json({ error: "Forbidden" }, 403, cors);

		// (2) Rate limit per IP
		const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
		const { success: underLimit } = await env.RATE_LIMITER.limit({ key: ip });
		if (!underLimit) return json({ error: "Too many requests" }, 429, cors);

		// Parse body
		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			return json({ error: "Invalid JSON" }, 400, cors);
		}

		// (3) Honeypot — the only HARD drop. A human never sees this field, so a
		// non-empty value is a bot with near-zero false positives. We return a
		// fake 200 so the bot learns nothing and never forwards to Make.
		const honeypot = body[HONEYPOT_FIELD];
		if (typeof honeypot === "string" && honeypot.trim() !== "") {
			return json({ ok: true }, 200, cors);
		}

		// (4) Turnstile — verify server-side ONLY when a token is present. A
		// missing token is expected on slow iOS/cellular (the client submits
		// without waiting), so it is NOT an error — the lead is still forwarded,
		// flagged verified=false. We only reach out to siteverify when there is
		// something to verify.
		let verified = false;
		const token = body["cf-turnstile-response"];
		if (typeof token === "string" && token !== "") {
			try {
				const verifyRes = await fetch(
					"https://challenges.cloudflare.com/turnstile/v0/siteverify",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							secret: env.TURNSTILE_SECRET,
							response: token,
							remoteip: ip,
						}),
					},
				);
				const result = (await verifyRes.json()) as TurnstileResult;
				verified = result.success === true;
			} catch {
				verified = false;
			}
		}

		// Soft timing signal — annotate but never drop (autofill / restored
		// forms can legitimately submit fast).
		const elapsed = Number(body["elapsed_ms"]);
		const fastSubmit = Number.isFinite(elapsed) && elapsed < MIN_ELAPSED_MS;

		// (5) Forward to Make with the shared secret. Internal-only fields are
		// stripped first. We re-encode the payload as x-www-form-urlencoded so
		// it arrives in exactly the same shape your Make scenario already parses
		// (the old browser POST used URLSearchParams) — no remapping needed.
		// Make's first module filters on the x-make-apikey header.
		delete body["cf-turnstile-response"];
		delete body[HONEYPOT_FIELD];
		delete body["elapsed_ms"];
		const form = new URLSearchParams();
		for (const [key, value] of Object.entries(body)) {
			form.set(key, typeof value === "string" ? value : JSON.stringify(value));
		}
		// Trust signals for the Make scenario to branch on.
		form.set("verified", verified ? "true" : "false");
		form.set("bot_fast_submit", fastSubmit ? "true" : "false");
		const forwarded = await fetch(env.MAKE_WEBHOOK_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"x-make-apikey": env.SHARED_SECRET,
			},
			body: form.toString(),
		});

		if (!forwarded.ok) {
			// Log the real upstream status/body to observability (wrangler tail),
			// but never leak it to the browser.
			const upstreamBody = await forwarded.text().catch(() => "");
			console.error("Make upstream error", forwarded.status, upstreamBody);
			return json({ error: "Upstream error" }, 502, cors);
		}
		return json({ ok: true }, 200, cors);
	},
} satisfies ExportedHandler<Env>;

function json(data: unknown, status: number, cors: Record<string, string>): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...cors },
	});
}
