// FormWithTurnstile.tsx
// Framer **code component**. In Framer: Assets ▸ Code ▸ New Code File, paste
// this in, then drag the component onto your page. Set the two properties in
// the right-hand panel:
//   • Site Key   — the Turnstile *site key* (public) from the Cloudflare dashboard
//   • Worker URL — your deployed Worker, e.g. https://nameless-wind-d395.<sub>.workers.dev
//
// It renders First name / Email / Phone, mounts the Turnstile widget, and on
// submit POSTs JSON { firstName, email, phone, "cf-turnstile-response" } to the
// Worker. The Worker verifies the token and forwards to Make. The Make.com URL
// is never present in this file or the browser.

import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef, useState } from "react"

declare global {
    interface Window {
        turnstile?: {
            render: (el: HTMLElement, opts: Record<string, unknown>) => string
            reset: (id?: string) => void
        }
        onloadTurnstileCallback?: () => void
    }
}

const TURNSTILE_SRC =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit"

type Status = "idle" | "submitting" | "success" | "error"

interface Props {
    siteKey: string
    workerUrl: string
    successMessage: string
}

export default function FormWithTurnstile(props: Props) {
    const { siteKey, workerUrl, successMessage } = props

    const [firstName, setFirstName] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [token, setToken] = useState("")
    const [status, setStatus] = useState<Status>("idle")
    const [errorMsg, setErrorMsg] = useState("")

    const widgetRef = useRef<HTMLDivElement>(null)
    const widgetId = useRef<string | null>(null)

    // Load the Turnstile script once and render the widget explicitly.
    useEffect(() => {
        if (!siteKey) return

        function renderWidget() {
            if (!window.turnstile || !widgetRef.current || widgetId.current) return
            widgetId.current = window.turnstile.render(widgetRef.current, {
                sitekey: siteKey,
                callback: (t: string) => setToken(t),
                "expired-callback": () => setToken(""),
                "error-callback": () => setToken(""),
            })
        }

        if (window.turnstile) {
            renderWidget()
            return
        }

        window.onloadTurnstileCallback = renderWidget

        if (!document.querySelector(`script[src^="${TURNSTILE_SRC.split("?")[0]}"]`)) {
            const s = document.createElement("script")
            s.src = TURNSTILE_SRC
            s.async = true
            s.defer = true
            document.head.appendChild(s)
        }
    }, [siteKey])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (status === "submitting") return

        if (!token) {
            setStatus("error")
            setErrorMsg("Please complete the verification.")
            return
        }

        setStatus("submitting")
        setErrorMsg("")

        try {
            const res = await fetch(workerUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName,
                    email,
                    phone,
                    "cf-turnstile-response": token,
                }),
            })

            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(data.error || `Request failed (${res.status})`)
            }

            setStatus("success")
            setFirstName("")
            setEmail("")
            setPhone("")
        } catch (err) {
            setStatus("error")
            setErrorMsg(err instanceof Error ? err.message : "Something went wrong.")
        } finally {
            // A Turnstile token is single-use — reset so a retry gets a fresh one.
            setToken("")
            if (window.turnstile && widgetId.current) {
                window.turnstile.reset(widgetId.current)
            }
        }
    }

    if (status === "success") {
        return <div style={styles.success}>{successMessage}</div>
    }

    return (
        <form onSubmit={handleSubmit} style={styles.form}>
            <input
                style={styles.input}
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
            />
            <input
                style={styles.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />
            <input
                style={styles.input}
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
            />

            <div ref={widgetRef} style={styles.widget} />

            {status === "error" && <div style={styles.error}>{errorMsg}</div>}

            <button type="submit" style={styles.button} disabled={status === "submitting"}>
                {status === "submitting" ? "Sending…" : "Submit"}
            </button>
        </form>
    )
}

FormWithTurnstile.defaultProps = {
    siteKey: "",
    workerUrl: "",
    successMessage: "Thanks! We'll be in touch.",
}

addPropertyControls(FormWithTurnstile, {
    siteKey: {
        type: ControlType.String,
        title: "Site Key",
        placeholder: "0x4AAAAA...",
    },
    workerUrl: {
        type: ControlType.String,
        title: "Worker URL",
        placeholder: "https://nameless-wind-d395.<sub>.workers.dev",
    },
    successMessage: {
        type: ControlType.String,
        title: "Success Msg",
    },
})

const styles: Record<string, React.CSSProperties> = {
    form: {
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        fontFamily: "Inter, sans-serif",
    },
    input: {
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid #d0d0d0",
        fontSize: 16,
        outline: "none",
    },
    widget: { minHeight: 65 },
    button: {
        padding: "12px 14px",
        borderRadius: 8,
        border: "none",
        background: "#111",
        color: "#fff",
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
    },
    error: { color: "#c0271c", fontSize: 14 },
    success: {
        padding: 16,
        borderRadius: 8,
        background: "#e9f7ec",
        color: "#1f7a37",
        fontFamily: "Inter, sans-serif",
        fontSize: 16,
    },
}
