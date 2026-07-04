"use client";

import { FormEvent, useState } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "footer" })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Could not subscribe right now.");
      }

      setState("success");
      setMessage("You are on the list.");
      setEmail("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not subscribe right now.");
    }
  }

  return (
    <form className="sign-up-form__container" onSubmit={onSubmit}>
      <div>
        <input
          className="sign-up-form__input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email address"
          aria-label="Email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state !== "submitting") {
              setState("idle");
              setMessage("");
            }
          }}
          disabled={state === "submitting"}
          required
        />
      </div>
      <button className="button sign-up-form__button" type="submit" disabled={state === "submitting"}>
        <span className="button__text">{state === "submitting" ? "Signing up" : "Sign up"}</span>
        <svg className="arrow" aria-hidden="true"><use xlinkHref="#arrow"></use></svg>
      </button>
      {message ? (
        <p className={`sign-up-form__message sign-up-form__message--${state}`} role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
