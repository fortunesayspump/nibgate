"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dr-nib/common";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
      <p className="font-medium">{title}</p>
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

      <Section title="The run, end to end">
        <P>
          Ask a question on the <Link href="/dr-nib/research" className="underline">Research</Link> page. Dr. Nib
          interviews you first (intake), you configure depth and budget, it plans, you fund the onchain escrow,
          you approve — then it searches, reads, scores, and writes. The report lands with cited sources, and
          whatever money is unspent returns to you automatically at settle.
        </P>
        <P>
          Nothing spends until you approve the plan. Planning itself is free; intake, configuring, and editing
          the plan cost nothing.
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
          The plan carries a cost <strong>estimate</strong> built from fixed per-stage prices (search, fetch,
          scoring, writing) scaled by depth and report length. It is the minimum worth funding: approve stays
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

      <Section title="While it runs">
        <P>
          The run page is a live feed: Dr. Nib&apos;s reads, JEV&apos;s judgements with their probabilities, every
          tool call with its result, and stage-by-stage spend. Mid-run, Dr. Nib may park with a question —
          answer it in the box and the run continues. The steer box applies your guidance at the next stage
          boundary.
        </P>
        <P>
          <strong>Paused at the budget cap</strong> means the deposit is spent: the work so far is kept. Raise
          the cap only where more money is actually escrowed; otherwise end the run and keep the report plus
          the refund. Pause any time yourself; resume continues from the last finished stage.
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
        <P>At Configure, add PDF with selectable text, DOCX, XLSX, CSV, TXT or Markdown, or a public HTTPS link. Up to five sources, 2 MB each. PDFs have a 100-page limit; scans need OCR. Review extracted text and warnings before approving.</P>
        <P>Originals stay in private R2 storage with owner-only downloads. Extracted text is analyzed by our AI providers during research. Source-only mode disables external retrieval and creator tips. Files freeze once research starts; a fresh run needs its files added again.</P>
        <P>Spreadsheet totals are computed decimal column sums grouped by stated currency, with row references and duplicate warnings. They do not constitute a reconciliation or financial audit.</P>
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
          are provided by Nibgate and covered by the run budget. There are no keys to add, here or anywhere.
        </P>
      </Section>
    </div>
  );
}
