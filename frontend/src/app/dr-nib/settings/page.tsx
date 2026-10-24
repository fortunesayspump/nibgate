"use client";

import Link from "next/link";
import PrivateRecoverySettings from "@/components/dr-nib/PrivateRecoverySettings";
import { PageHeader } from "@/components/dr-nib/common";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-7 opacity-70">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

export default function HelpPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Dr. Nib"
        title="Help"
        desc="How research runs, what money does, and what to do when something looks stuck."
      />

      <Section title="How private research works">
        <P>
          Your browser encrypts research questions, source files and project content before they reach
          Nibgate&apos;s ordinary backend. A verified Phala confidential worker decrypts authorized content
          to run the research, then encrypts saved activity, checkpoints, reports and exports.
          Phala provides the protected computing environment; Dr. Nib is the research agent running inside it.
        </P>
        <P>
          Worker verification uses Phala&apos;s official verifier software. In Nibgate-operated
          deployments, you trust our verification service to report honestly. It receives hardware
          evidence, not your research content or project keys; this is not an independent audit.
        </P>
        <P>
          Primary research inference uses a separate verified Phala service. JEV decisions use TypeSafe
          through OpenRouter with zero data retention (ZDR). If you authorize the hosted research fallback,
          it also uses OpenRouter ZDR. Those hosted providers receive the context needed for their calls:
          ZDR governs retention and does not make prompts invisible to the provider.
        </P>
        <P>
          Approved searches and website requests reveal their public queries or URLs to those services.
          Account identity, timing, sizes and necessary payment metadata remain visible; blockchain
          transactions are public. A failed worker verification blocks key delivery.
        </P>
        <P>
          Read the <a href="https://docs.nibgate.xyz/dr-nib/confidential" className="underline">privacy overview</a>,{" "}
          <a href="https://docs.nibgate.xyz/dr-nib/confidential/architecture" className="underline">architecture and data boundaries</a>, or{" "}
          <a href="https://docs.nibgate.xyz/dr-nib/confidential/models-tools" className="underline">models, tools and payments</a>.
        </P>
      </Section>

      <Section title="Unlocking projects on another device">
        <P>
          Sign in to the same account and enter your recovery code in Dr. Nib when asked. Your wallet address
          identifies your account; it is not your encryption key. Keep the code private and save it somewhere
          secure. Nibgate cannot recover encrypted projects if you lose both the code and every enrolled browser.
        </P>
        <P>
          If you still have an enrolled browser, use Replace recovery code below and save the replacement
          before confirming. Other devices will need the new code. Read the{" "}
          <a href="https://docs.nibgate.xyz/dr-nib/confidential/recovery" className="underline">encryption and recovery guide</a>.
        </P>
      </Section>

      <PrivateRecoverySettings />

      <Section title="Learn about Phala and zero data retention">
        <ul className="list-disc space-y-2 pl-5">
          <li><a href="https://docs.phala.network/phala-cloud/getting-started" className="underline">What is Phala Cloud?</a> — the confidential computing platform.</li>
          <li><a href="https://docs.phala.network/phala-cloud/getting-started/start-from-cloud-ui#step2-verify-tee-proof" className="underline">Phala TEE proof guide</a> — how hardware evidence is obtained and verified.</li>
          <li><a href="https://docs.phala.network/phala-cloud/references/cloud-api-beta/cvm" className="underline">Phala CVM and attestation reference</a> — technical verification and lifecycle details.</li>
          <li><a href="https://openrouter.ai/docs/guides/features/zdr" className="underline">OpenRouter zero data retention</a> — the policy used for disclosed hosted model routes.</li>
        </ul>
        <P>These explain the underlying services. Dr. Nib&apos;s privacy guide describes how the agent uses them and what each service can see.</P>
      </Section>

      <Section title="The run, end to end">
        <P>
          Ask a question on the <Link href="/dr-nib/research" className="underline">Research</Link> page. Dr. Nib
          interviews you first (intake), you configure depth and budget, it plans, you fund the onchain escrow,
          you approve — then it searches, reads, scores, and writes. The report lands with cited sources, and
          whatever money is unspent returns to you automatically at settle.
        </P>
        <P>
          Paid research requires confirmed escrow and your approval. Intake, planning and plan edits do not
          draw from your deposit; their provider costs are sponsored by the operator.
        </P>
      </Section>

      <Section title="Intake questions">
        <P>
          Answer option buttons, or type another answer. Submit a whole batch at once; Dr. Nib shows its read,
          you press Next when you have read enough. <strong>Just plan it</strong> skips the rest — unanswered
          questions stay unanswered and the brief goes to planning as-is.
        </P>
        <P>
          Leave mid-intake and come back: <Link href="/dr-nib/research" className="underline">Research</Link> picks
          the flow back up where you left it. Anything past intake lives on the run page.
        </P>
      </Section>

      <Section title="Estimates, caps, and deposits">
        <P>
          The plan carries a cost <strong>estimate</strong> based on the planned search, reading,
          judging and writing work, scaled by depth and report length. It is not the final charge. It is the minimum worth funding: approve stays
          locked until the escrow holds at least the estimate.
        </P>
        <P>
          The <strong>cap</strong> is the most a run may ever spend. On escrowed runs the deposit <em>is</em> the
          working budget — approve aligns the cap down to what actually landed, so you can fund just the
          estimate instead of the whole cap.
        </P>
        <P>
          A 1% platform fee accrues as the budget draws down, taken from the operator share at settle — you pay for what actually ran, and the refund is everything else.
        </P>
      </Section>

      <Section title="Escrow funding">
        <P>
          Runs are funded by an onchain escrow deposit in USDC: open the job, set its budget, approve USDC, and fund it — four wallet
          confirmations. Approve stays locked until the job reads <strong>Funded</strong> onchain.
        </P>
        <P>
          Deposits are <strong>one-shot</strong>: the contract flips Open → Funded on funding and can never be
          topped up. Pick the amount deliberately — the run pauses when it is spent, and a bigger budget means
          ending the run and starting a new one. Unspent money returns to your wallet when the settlement transaction confirms. Pending refunds are labeled and retry automatically; the receipt also has a Retry settlement button. Refunds are
          enforced by the escrow contract.
        </P>
      </Section>

      <Section title="Sleeping and waking">
        <P>
          Your project list, saved chats, reports and receipts open without waking the private worker.
          Your browser decrypts saved content. Submitting a research question, sending a follow-up
          or resuming work connects to the worker; if it is asleep, the workspace shows
          <strong> Waking private worker</strong>, then <strong>Verifying secure connection</strong>.
        </P>
        <P>
          Saved content stays visible during startup. After work finishes, a five-minute idle period
          keeps short follow-ups warm before shutdown. Reopening a stalled project shows its history;
          use Resume to continue its saved work.
        </P>
      </Section>

      <Section title="While it runs">
        <P>
          The run page is a live feed: Dr. Nib&apos;s reads, JEV&apos;s judgements with their probabilities, every
          tool call with its result, and stage-by-stage spend. Mid-run, Dr. Nib may park with a question —
          answer it in the box and the run continues. The steer box applies your guidance at the next stage
          boundary.
        </P>
        <P>
          <strong>Paused at the budget cap</strong> means there is not enough available budget for the next action;
          some funds may still be reserved for unresolved operations. Completed work is kept. Pause any time
          yourself; resume continues from the saved checkpoint when the blocking condition is resolved.
          A settled or refunded deposit cannot fund more work.
        </P>
      </Section>

      <Section title="Reports and exports">
        <P>
          Every factual claim cites its source as [n] — the chips link straight to the cited page. The full
          source list sits below the report. After settlement, start a fresh run with a new deposit for
          further research; refunded money cannot be reused. Existing report versions remain selectable.
        </P>
        <P>
          Below the report, <strong>Ask about this report</strong> answers fixed questions (weakest claim,
          strongest support, what&apos;s unsupported, which source carried most) straight from the verify
          pass — no model, no budget. Under it, <strong>Discuss this report</strong> takes free-form
          follow-ups: each finished run gets a small free allowance (shown as &ldquo;N of 10 left&rdquo;),
          answered from the report and its sources only, with no ledger draw and no deposit needed. When
          the allowance runs out, start a fresh funded run for a deeper pass.
        </P>
        <P>
          Export to PDF, Word, Excel, PowerPoint, Markdown, JSON, or BibTeX from the run page. Exports render
          from the finished report and download directly.
        </P>
      </Section>

      <Section title="Your source files">
        <P>At Configure, add PDF with selectable text, DOCX, XLSX, CSV, TXT, Markdown, or PNG/JPEG/WebP images with readable English text, or a public HTTPS link. Images use local OCR and may misread figures; review the extracted text against the original before approving. Up to five sources, 2 MB each; images are limited to 20 megapixels and PDFs to 100 pages. Scanned PDFs still need OCR first. You can change sources until an escrow job is opened; changing a planned source set returns you to Configure.</P>
        <P>Source files and extracted content are encrypted outside the verified worker, with owner-authorized access. Model calls receive only the context required under the disclosed inference policy. Source-only mode disables external retrieval and creator tips. Files freeze once research starts; a fresh run needs its files added again.</P>
        <P>Spreadsheet totals are computed decimal column sums grouped by stated currency and, when present, category. CSV dates stay as entered. Repeated rows remain in the sums and are flagged with row references. These are not a reconciliation or financial audit.</P>
      </Section>

      <Section title="Projects, sources, trash">
        <P>
          <Link href="/dr-nib/projects" className="underline">Projects</Link> lists every run with its status
          and spend; deleted runs restorable for seven days. The{" "}
          <Link href="/dr-nib/sources" className="underline">sources library</Link> collects everything your
          runs have cited.
        </P>
      </Section>

      <Section title="Stuck? Read this first">
        <P>
          <strong>Page shows a load error:</strong> one network blip never wipes a loaded page — retry from the
          banner or the error card. If it persists, the backend may be redeploying; Projects in a minute.
        </P>
        <P>
          <strong>Approve won&apos;t go through:</strong> it names the reason — usually an unfunded escrow
          (fund at least the estimate) or a plan still being written.
        </P>
        <P>
          <strong>“Sign in” loops:</strong> connect the wallet, then use the Sign in button once — repeated
          signing means the session call is failing, not your wallet. &ldquo;Message expired&rdquo; means your
          device clock is off (enable automatic date &amp; time); &ldquo;nonce missing&rdquo; means cookies are
          blocked for the site. Wait a moment and retry.
        </P>
        <P>
          <strong>Answers show as skipped:</strong> only questions left unanswered (e.g. via Just plan it) show
          that way. Anything you picked or typed is recorded with its label in the transcript.
        </P>
      </Section>

      <Section title="Models and tools">
        <P>
          The model and every research tool — live web search, scraping, document parsing, code execution —
          are configured by Nibgate; you do not need to add provider API keys. Receipts show reconciled customer charges with one cumulative row per model or tool. Worker compute and storage are operator-funded, separate from your research charges.
        </P>
      </Section>
    </div>
  );
}
