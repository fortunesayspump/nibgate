# Dr. Nib — Flow

How a research run actually happens, from the first sentence a person types to the cited
report sitting on their screen. This is the intended behaviour of the product, written down
so the implementation can be checked against it.

> **Status:** this is the design/behaviour spec, not a build report. For what
> is actually done vs. pending, see the audited table in `README.md`. The code
> implements the full pipeline; exports are md/json/bibtex only, Gate 1 wallet
> policy is pending, and escrow is code-complete but needs `ESCROW_KEEPER_KEY`
> wired on the service.

---

## The shape of it

The user opens Dr. Nib and sees one box: *what should I research?* They type a sentence.
It doesn't have to be good. "research on x402" is a legitimate opening move.

From there the run moves through the beats: **composer → acknowledgement → questions → configure →
review → deposit**, and then executes, streaming its reasoning as it goes, before handing back a
report with citations you can click. The project that will hold all of it is created the moment
Dr. Nib and the user agree on a scope, so the flow can be left and resumed at any point after
that.

The important thing about that sequence is what it *isn't*. There is no settings page
between the user and their question. There is no form asking them to pick a depth from a
dropdown before they know what depth means. Every decision that depends on understanding the
request happens **after** Dr. Nib has understood the request.

---

## Composer

The composer is a plain text box. One line of guidance under it, three or four sample
prompts that fill it in on click, and a send button. Enter submits.

**Send needs an account.** Typing is open to anyone, but until the wallet is connected the send
button *is* a **Connect wallet** button, so a project is never created with no owner and a
project lands in an account from its first moment.

First-run carries a link to a **how it works** page rather than a wall of explainer text. The
run's own feed is the argument; the page is there for anyone who wants the split spelled out.

Sending the first message does not create a project. It opens the **acknowledgement**, and the
acknowledgement is a conversation, not a receipt: the first **thinking screen**, centred on the
page, with the reasoning streaming in as Dr. Nib reads the request. Not a generic "got it," but a
sentence that proves it parsed. If someone wrote *"should I depend on x402 for metered billing"*,
the stream arrives at something like *"this is a dependency decision, not a survey, so I'll weight
who actually ships it over what the discourse says."*

That screen has a text box too, because the acknowledgement can go back and forth. If the parse
is wrong, the user corrects it in one line; if the request is too thin to research — *"hi"* —
Dr. Nib does not pretend otherwise, it asks what to research instead. **The project is created
only when Dr. Nib has a scope it can actually work with**, and only then does the **Next** button,
into the first question, become active. Until then the two just talk in that centred space, and
nothing is committed.

That conversation is bounded: the acknowledgement box takes a **limited number of user messages,
around ten**, after which Dr. Nib must either accept a scope or say plainly that it cannot find
one. The limit keeps the pre-project phase from becoming an interrogation or an endless loop;
ten messages is more than an honest scope ever needs, and the way out is always the same — say
something concrete to research.

Once Dr. Nib accepts a scope, **the project exists.** It names it, writes a one-line description,
and creates the record. Everything else — the answers, the plan, the budget, the report — is
filled into that record as it arrives, and nothing is required up front.

The project belongs to the **signed-in user**, and sign-in is the wallet — the existing Nibgate
stack, so the address *is* the account. Dr. Nib is an account product, not a local scratchpad:
each account sees only its own projects, and only the owner can run, pause, end, or delete them.
(A finished *report* is the one thing that can be made public, and only deliberately, by share
link.)

That means the whole flow is resumable from any point. A user who leaves after the first
question, or before setting a budget, still finds the project in their Projects list, opens
it, and continues from exactly where they stopped. Closing the tab is not losing the run.

The name and description are Dr. Nib's first guess, not a commitment. As answers arrive it
fills in the details it was missing — the time range, the audience, the decision the report
serves — and revises the name and description to match, because a one-line topic is usually
wrong about what the project is *actually* about. Metadata is a living field the agent keeps
improving, not a form the user had to fill in at the start.

---

## The questions

This is the heart of the product, and the part everything else is built to serve.

Dr. Nib reads the request, works out what is genuinely underspecified about *this* request,
and asks the one question that closes the biggest gap. It reads the answer, folds it in,
works out what is *still* missing, and asks the next one. That loop runs until the language
model and JEV are jointly confident the request is fully understood and Dr. Nib has everything
it will need to do the research.

There is **no limit on how many questions it may ask.** The loop does not end on a counter.
It ends when there is nothing left that would change the research.

One question at a time, never a batch. A single question gets the whole screen and the user's
whole attention, and it is processed before the next one is written — which is the only way
the next question can be sharper than the last.

### The user can leave at any time

Intake never traps anyone. A **Just plan it** button sits alongside every question: the user can
end the questioning whenever they want and send Dr. Nib straight to planning with whatever it
already has. "No limit" is safe precisely because the escape hatch exists — the agent is never
forced to stop early, and the user is never forced to keep answering. If someone already knows
what they want, they should not have to prove it through six questions.

### Sources the user brings

Intake takes more than answers. At any point the user can attach **files and links** — a PDF, a
spreadsheet, a set of URLs — and they join the brief as sources. Anything provided is treated as
a first-class source: it is cited like anything else, and it is subject to the same trust
grading. Whether Dr. Nib may go *beyond* what was handed to it is the **source policy** settled
at configure, not something the act of attaching decides.

```
user types  →  Dr. Nib acknowledges (centred, back-and-forth, <=10 user messages)
            →  scope found?  no  → keep talking, or say so plainly
                             yes → project is created, Next unlocks
            →  Dr. Nib asks ONE question (options, or free text)
            →  user answers  →  selects Next
            →  Dr. Nib THINKS (reasoning streams)  ← visible, deliberate
            →  does it now have the whole request?
                 no  → ask the next question
                 yes → move to configure
       └─ or, at any point: user clicks "Just plan it"  →  move to configure
```

### One question, and the three ways to answer it

A question takes one of three shapes, chosen to fit what it actually needs:

**Pick one.** A short list of options, single-select: *is this a buy decision or a research
summary?* **Another answer** sits under the options as a first-class choice, not a fallback —
selecting it opens a text field, and the typed answer is recorded exactly as the picked ones
are.

**Pick any.** The same list, multi-select, with **another answer** available alongside the
checkboxes so the user can add their own option and have it counted with the rest.

**Just tell me.** No options at all — a plain text box, for the questions where a list would
only constrain the answer. These are usually the important ones: *what are you actually going
to do with this?*

The options are generated, like everything else, but they exist to make the answer easy, not
to steer it. Any question that offers options also offers the exit.

### Back and forward

The user can move **previous / next** through the questions at any time and revise an answer
they already gave. Changing an earlier answer is not a reset: Dr. Nib re-processes from that
point, because a revised answer can make a later question wrong, and it is cheaper to ask
again than to carry a contradicted assumption into the run.

### The thinking, and stopping it

When an answer is submitted and the user moves forward, Dr. Nib **thinks** — and the thinking
is shown. The reasoning streams below a thinking indicator, centred on the page, saying what
it took from the answer and what it is deciding next. This is the visible processing step: not
a spinner, but the actual sentences of the reasoning.

It is interruptible. **Stopping cancels the thinking** and returns the user to the question
they just answered, so they can change the answer or take it back. A question is never lost to
a decision the user changed their mind about mid-thought.

### Processing comes before the next question

When an answer arrives, Dr. Nib **reads it properly before it does anything else.** Not a
token acknowledgement, not an immediate next question fired off in the same breath. It
re-reads the whole conversation — not just the answer that just arrived, because an early
answer often reframes a later one — revises what it thinks the user actually wants, and
*shows its work*.

That processing is visible. Dr. Nib says what it took from the answer and what changed:

> "Got it — this is a buy decision, and 'last 90 days' rules out the airdrop era. One thing
> that shifts: you want payments only, so I'll leave auth and identity out entirely. I now
> need to know how you'll use it."

Two things fall out of making that visible. The user can catch a misread *before* it compounds
across the next several questions — which is the only cheap place to catch one. And a visible
reaction is evidence the answer was actually read, which is the thing people most distrust
about agents: the ones that take an answer and immediately produce another question
regardless. The pause is doing work.

### What makes a question worth asking

A question earns its place if its answer would **change what Dr. Nib does**. Not "tell me
more about x402" — useless, and it invites the user to dump a paragraph. But *"is this a buy
decision or a research summary?"* — the answer changes the report shape, the sources worth
prioritising, and whether the report argues or describes. *"What will you do with this?"* is
the same kind of question: it turns a vague topic into a decision the report has to serve.

So the test is: if the user answered the opposite, would the research materially differ? If
not, the question is noise. This is what keeps an unbounded loop from being an interrogation.

### Every judgement goes to JEV

This is the rule the whole agent is built on: **the LLM never decides anything. It generates,
and JEV decides.**

The LLM's only job in the loop is to produce the question and the options for a decision it
wants to make. "Should I stop asking?" becomes, concretely: here are the remaining gaps, here
is what asking about each one would resolve, here is what proceeding without it would cost —
pick one. Then JEV returns the decision, with calibrated probabilities across all the options
it was given, and Dr. Nib acts on the pick.

That framing matters more than it sounds. "Should I ask another question?" asked in prose is
a question with only one socially acceptable answer, and the model will find it. Asked as a
*choice between concrete alternatives*, each with its real cost stated, it's a judgement the
model can be right about. The options are the thing — JEV can only distribute probability
across what it was shown, so Dr. Nib has to show it real trade-offs, including the honest one
("proceed now and flag X as an assumption in the report").

So the loop is: LLM proposes a decision and its options → JEV decides → Dr. Nib acts on the
decision and reports it. Stopping is not a judgement the LLM makes about itself; it's a
decision JEV makes among options the LLM laid out. A precise, well-scoped request falls out
of that automatically — "start the run now" is one of the options, and when nothing is
missing it wins, with high probability, on evidence rather than on the model's willingness.

The user's answers are the one input JEV never gets to shortcut. When Dr. Nib has processed an
answer and believes the brief is whole, that's still a proposal, and the decision to leave
intake belongs to JEV. If the user disagrees, they've lost trust in a system that was supposed
to be listening — so the threshold for "enough" should sit low and err toward asking one more
question.

What Dr. Nib never does is invent the stopping rule itself. No counter, no "usually about
three." It asks until JEV says the brief is whole, and if the user's answers keep opening new
scope, that just means it isn't whole yet.

### Getting this wrong is the expensive failure

Research on clarification timing is unusually blunt about this: for a long-running agent,
**the value of asking about the goal collapses almost entirely after the first tenth of the
work**. Ask "what will you use this for?" after the run is finished and it is worthless —
the report is already written for an audience nobody chose. Input-shaped clarifications stay
useful for about half the run; constraint-shaped ones decay faster still, and asking them
late is worse than never asking at all.

That is the empirical argument for this entire flow. Intake is not politeness or a
formality. It is the only moment where goal-level questions still have purchasing power.

The same work found that current frontier models are bad at this in predictable ways — one
over-asks on more than half of sessions, another asks selectively but too late, another
essentially never asks. Asking well is a skill that has to be engineered, not a behaviour you
assume you get for free.

---

## Two models, two jobs

Dr. Nib runs on an ordinary language model **and** JEV, and the division between them is
strict.

**The language model only generates.** It reads the request and the answers, writes questions
in natural language, plans the research, writes the report. It never decides whether to stop
asking, whether a source is trustworthy, whether a claim is supported, or which of two
approaches to take. It proposes; it does not conclude.

**JEV only decides.** JEV isn't a chat model — it's a decisions model, and it answers
structured questions with calibrated probabilities rather than prose. It never writes a
sentence the user reads. Every judgement the agent makes passes through it, and it returns
per-option probabilities plus a confidence so the caller can see how close the call was.

Three properties make this work, and they're the reason the split exists at all.

Generative models are **confidently wrong about their own uncertainty.** Ask one "are you
sure?" in prose and it agrees with whatever you just asserted. A decisions model returns a
number on a fixed scale, so thresholds mean something.

The LLM can't shortcut its own stopping condition, because the stopping condition isn't
something it evaluates. It's one of the options it hands to JEV.

And a number can be **logged and audited.** "Asked 4 questions, stopped because JEV returned
0.08 on `brief_complete` with `proceed_now` at 0.79" is a defensible record. "The model
decided it had enough" is not.

One JEV call carries a batch of independent judgments, so grading the candidate questions
under consideration plus the global state of the brief costs a single round trip. That's what
makes per-decision JEV affordable enough to use on *every* call rather than as a fallback.

The hub already runs this pattern — rules first, model only where rules are genuinely
undecided, caller owns the threshold (`backend/src/server/jev/`). Dr. Nib extends it from
last-resort classification to the agent's entire decision surface.

---

## Configure

Once the brief is settled, Dr. Nib first shows a **review of what it understood** — every answer
in one place, correctable — and then the settings it can't infer, the ones that are constraints
rather than questions. Catching a wrong assumption on that screen is cheaper than catching it in
the plan.

- **Budget cap** — the only one that costs money, so it comes first. Dr. Nib **suggests a cap**
  from the depth and the plan it has in mind, and there is a **minimum it will not go below**:
  under that, the research cannot be honest and the run would just waste the user's money.
- **Depth** — quick / standard / deep; the same setting that shapes the tree and moves the
  suggested cap.
- **Source policy** — search the live web, or use only the sources the user provided.
- **Language** — what the report is written in.
- **Length and perspective** — how long the report should be, and the angle it argues from.
  Length is three presets — brief (~1,200 words), standard (~4,000), comprehensive (~12,000) —
  **plus an exact word count** for when a preset is not what you mean; an out-of-range count
  clamps to 300–50,000 and says so. Length is not a single token cap: it sizes the report, so a
  comprehensive report is written **section by section**, each section generated from its own
  evidence and then assembled, rather than asked for in one call that would overrun. Perspective
  comes as a few presets — neutral, skeptical, bullish/bearish, executive, academic — with room to
  describe your own.

These are pre-filled from what intake learned where it makes sense, but they are the user's to
change, and they're shown as controls rather than as prose. There is **no time limit beside the
cap**: the dollar budget is the only limit the user sets, and time is something the run reports,
not something it is told.

Below them sits a collapsed **Advanced** drawer for the knobs that change the results without
changing what the run is — recency, region, domain allow/deny lists, a ceiling on how many
sources to open, and citation style. Hidden by default so configure stays five decisions, present
for anyone who wants to constrain the search.

**Output formats are deliberately not here.** The run always captures everything it finds in a
raw, durable form — markdown by default, because it carries text, tables, and structure without
forcing a decision — and the deliverable (pdf, word, excel, powerpoint) is chosen once the
research is finished and there is actually something to export. Choosing a format before any
research exists is guessing.

Every one of these stays editable in the project's **settings** — before the run starts, and
again once it has ended. Between those points they are what a live run is made of: language,
depth, and source policy lock, and the cap can only be raised. Configure is where the settings are
first shown, not the only place they can be touched, but a running project is not the place to
redefine what it is.

Everything not shown here was either answered during intake or has a sensible default that
Dr. Nib will state in the plan.

---

## Review

Dr. Nib writes the plan, and this is free — nothing is charged yet. The plan is short and
readable, and it exists to be disagreed with:

- what it understood the request to be, in a sentence
- the sub-questions it intends to answer
- roughly how many sources it expects to open, and how long it thinks that takes
- what it expects to cost, against the cap the user just set
- the two or three things it is least confident about

That last item is the one that earns the rest. A plan that admits where it's weak invites
correction, and a correction here costs a conversation. The same disclosure makes the run
below more trustworthy, because the user already knows which parts to hold loosely.

Approve, or edit it. The plan is not take-it-or-leave-it: the user can add, drop, or reorder the
sub-questions directly — drag for order — and write a line of instruction for anything that needs
rewording, which Dr. Nib applies. They can say which steps matter most. What they cannot edit here
is the cap — that lives in configure, and is money rather than a step.

Editing re-prices the plan **live**: the cost and source estimate move as steps are added or
dropped, so the number the user approves is the number for the plan they actually built, not the
one Dr. Nib first proposed.

---

## Deposit

Money moves **once, up front, and only if the user opts in**: at review the
run offers onchain escrow alongside the default ledger allowance. Either way
the cap is both the amount funded and the point at which the run stops
itself: the next stage would carry it past what's left, so it pauses and asks
whether to raise the cap or end. Whatever the run doesn't use comes back —
an ended or finished run returns the remainder, because a balance that is
owed back should not sit in limbo.

The money is **USDC on Arc**, and a funded run carries a **1% platform fee**
taken as the budget draws down rather than as a separate charge.

On-chain, this is **stock ERC-8183 (Agentic Commerce) escrow on Arc plus a
splitter-as-provider** — specified in `dr-nib/ESCROW.md`, deployed on Arc
testnet. A run's escrow holds the cap funded at approve; stages meter spend
in the offchain ledger; at settle the keeper completes with the
ledger-attested spend and the splitter divides atomically (spent minus 1% to
the operator, 1% to treasury, remainder to the payer). Arc's sub-second
deterministic finality means the close-out is a single settled transaction,
not a wait. Runs without escrow keep the ledger-only path: real outflows are
operator-funded and the 1% accrues uncollected.

---

## The run

Once funded, the run starts and shows its work. Not a spinner — an actual account of what
it's doing and why, in the order it's happening.

It plans its searches from the approved sub-questions. It opens the results, extracts the
passages that carry claims, and throws out what it can't use — duplicate pages, pure
marketing, anything that says the same thing as a page it already has. Then it scores what's
left, on two axes kept deliberately separate: **relevance** (is this on-topic?) and **trust**
(is this a credible source?). A page can be perfectly relevant and worthless as evidence, and
conflating those two is how research reports end up confidently citing a content farm.

Then it writes, and the writing is bound by what survived. Every claim in the report traces
to a passage that was scored, or it's marked as unsupported rather than quietly asserted. If
the evidence doesn't cover something, the report says the evidence doesn't cover it.

Each stage costs something and the running total is always visible — "$0.42 of $2.50" with a
bar. The run **pauses at the cap rather than overshooting**, and pausing says why and offers
to raise the limit or stop. Pause and resume are ordinary buttons throughout, not emergency
controls.

Every judgement appears in the feed in full — **the question JEV was asked, the options it was
given, the probabilities it returned, and the pick** — so the run can be read and audited, not
just watched. Nothing here is a black box: if the run did something surprising, the reason is
right there in the feed.

**Pause freezes the run exactly where it is, mid-stage if need be**, and Resume continues from
the same instant rather than restarting the stage.

---

## The shape of the research

The plan is the seed, not the script. Each approved sub-question opens a **tree**: the agent
searches it, reads what comes back, pulls the claims out, and turns the leads worth following
into their own branches. **Breadth** is how many branches stay alive at once; **depth** is how
many generations down each one goes. Quick stops early; deep keeps expanding.

What makes it more than a search loop is that **expansion is guided, not flat.** At every fork —
which branch to open next, whether a branch is exhausted, whether a lead is worth one more hop,
whether a gap is closed enough to stop — the options are laid out and **JEV chooses**. The model
proposes the branches and states their costs; JEV decides which is worth the spend. A
sub-question is not finished because the model ran out of ideas; it is finished when the branch
has nothing left that would change the answer.

A **round cap per sub-question** keeps any single branch from eating the run, on top of the
dollar cap that bounds the whole thing. If the tree is still producing real leads when a cap is
reached, that is a signal to raise it, not to ignore it.

---

## The tools it reaches for

The agent is given real instruments, not a search box and a summarizer:

- **Web search** to find candidates — 11 keyless indexes (news, encyclopedia, papers, filings, Q&A, prediction markets, preprints) plus keyed breadth when configured.
- **Page fetch and readable-text extraction** to turn a URL into text.
- **PDF and document parsing** for reports, filings, papers, Office docs — downloaded and read, never refused.
- **Primary-source APIs** (SEC/EDGAR, government data, GitHub, CoinGecko) when the answer lives in a filing
  or a repository rather than an article about it — including paid ones, via the run's own wallet.
- **Paid unlocks and API payments** from the run budget (per-call ceilings, price previewed free first).
- **Tips** to decisive creators, from the same budget.
- **Code execution** for statistics, tables, and charts over what was collected, including onchain reads.
- **Academic APIs** (arXiv, OpenAlex, Semantic Scholar, Crossref, PubMed) for structured scholarly search.
- **Domain reputation lookup** as one more signal for trust (user-history priors today).
- Not yet: **a headless browser** for pages that only exist after JavaScript runs; **the user's own files** as sources.

Every tool is **Nibgate-provided and costed into the run — and so is the model itself.** There is
no bring-your-own-key path anywhere: not for search, not for scraping, and not for the language
model. The user funds a budget, and what the agent spends inside it is the run's cost.

And the tools obey rules. **robots.txt is respected, paywalls are not bypassed, login-walled
pages are skipped rather than scraped around, and quotes stay within fair use** — the agent cites
what it read, it does not launder whole articles. A source it cannot lawfully read is a source it
does not use, and the report says so when that changes the answer.

---

## Where judgement is spent

JEV is not consulted once at the top. The run's shape is a chain of small decisions, each one
priced, and each one made the same way. The ones that matter:

- **Which branch to expand next** — the tree's central choice.
- **Whether a branch is exhausted** — stop expanding, or go one generation deeper?
- **Whether a lead is worth chasing** — follow a citation, or let it go?
- **Whether a source is trustworthy** — the model proposes the criteria for trust *for this
  question*, and JEV scores each source against them. A fixed rulebook cannot tell a marketing
  blog from a primary filing in a niche the rules have never seen; criteria that fit the question
  can.
- **Whether a passage supports a claim** — and whether two passages contradict each other.
- **Whether the search is done** — safe to stop, or is something still missing?
- **Whether the intake angle is wrong** — JEV can reject the frame itself, and the next question opens a different angle instead of narrowing a dead one.
- **The report's outline** — what each section argues.

The model writes the options and the prose. The decisions come back as probabilities, and the
thresholds live in one place, so a run can be tuned and audited rather than re-prompted.

Because JEV is the seat of every judgement, **it is not optional.** If it is unreachable or
errors, the run **pauses** — it does not quietly fall back to letting the model decide, because
that is the exact failure the whole design exists to prevent.

And the model itself is tiered to the job: a **cheap model does extraction and summarisation**,
where volume is high and the work is mechanical, and a **strong model does the reasoning and the
writing**, where the quality shows up in the report. That split is what lets a run spend its
budget where it matters.

---

## Pausing, ending, and continuing

A live run is holding money, so stopping it has to say what happens to the money.

**Pausing** halts the run and leaves the balance where it is. Nothing moves and nothing is lost;
Resume picks up at the same stage. Pause is for "not right now." The run also **pauses itself
when it hits the budget cap**, and that pause can leave anything from a full balance to nothing
at all. So "paused" says the run stopped, not that money is sitting in it — which is why the
pause screen always says *why*: you paused it, or it ran out.

A run that **fails or crashes on its own** is treated the same way: it stops where it is, the
balance is held, and the user decides whether to resume or end. It is never silently refunded out
from under work that still exists.

**Ending** halts the run and returns whatever it has not spent. The work already done is kept —
sources fetched, passages scored, the plan — but the unspent balance goes back, because holding
funds for a project that isn't running is a bug, not a feature. An ended project is not dead:
adding budget back and starting it again continues from the stage it stopped at. What it cannot
do is start over from nothing. To reset, make a new project — a run's history is a record, not a
draft.

So the verbs are distinct:

- **Pause** — stop, keep the money, **Resume** later.
- **End** — stop, return the money, **Add budget & Start** later to continue.
- **Stop at the cap** — the run pauses itself and asks you to raise the limit or end. The same
  pause-or-end choice, triggered by the budget instead of the user.
- **Delete** — only once it has **ended or finished**. A paused run is mid-work and resumable, so
  it has to be ended first — which settles it even when there is nothing left to return. Deleted
  projects go to the trash for seven days.

The difference between pause and end is exactly the difference between "keep it ready" and "close
it out". Both are resumable; only one settles the run and returns what's left. And only the
settled one can be removed.

---

## Talking to a run while it's running

The run view is not read-only, and it is not a spectator sport. A running project shows its
progress, its decisions, and the reasoning behind them, and it gives the user **live control**: a
text box for guidance, and the ability to change the plan and add or drop sources while it runs.
Nothing about the work is frozen at approval.

What *is* frozen is the small set of settings that define what the run fundamentally is:
**language, depth, and source policy lock once it starts**, because changing them partway through
means a report that mixes languages, a plan that no longer matches the breadth it was priced for,
or sources that were never citable. The **budget cap can be raised at any time but never lowered
below what has already been spent** — the money is gone, so lowering the cap can't un-spend it,
it can only lie about the balance.

Most input is non-blocking. The user types a fact they forgot, a source to ignore, a steer, and
Dr. Nib reads it at its next loop boundary and folds it into the work from there. But the user
can also **pause the run** to make a bigger change, and **Dr. Nib can ask** — at which point the
whole run **parks until the answer arrives**. Everything waits: no stage advances, no stage is
charged, the feed just sits with the question on screen.

When it asks, the question appears **in the feed as a card that takes over the input box** — the
same place the user types, now holding the question and its options — with the run visibly parked
behind it. Answering releases the run, and the feed picks up exactly where it left off.

Dr. Nib may ask about anything it needs, including whether the goal still holds. The timing
research says goal-level questions decay fast, so it will rarely be worth stopping to ask one —
but whether to ask is a judgement, and every judgement is JEV's. When it does stop the run, it is
because something weighed the pause as worth more than proceeding on an assumption.

---

## After the report

The report is the product, and it's read in the same surface the run happened in — sections
appearing as they're written, not all at the end.

Citations are clickable and land on the actual passage, not just the domain. Trust chips sit
next to sources so a reader can see the grading that produced the report.

**The format is chosen here, not at configure.** Throughout the run Dr. Nib keeps everything in a
raw form — the research as it stands, in markdown, whatever the facts are. Once it is done, the
user picks the deliverables they want — pdf, word, excel, powerpoint, the raw markdown, or
**several at once** — and each is generated from the same finished work. Changing the set
re-generates; it never means re-running the research.

Below it, a chat box. Follow-up questions — "which claim is weakest?", "why do you trust this
source over that one?" — are answered from **this run's sources only**. If they can't support an
answer, they say so instead of filling the gap from general knowledge. And if a follow-up
turns into a bigger question, it can be promoted into a full run, seeded with everything
already learned.

Follow-up chat burns tokens like any other model call, so it runs on a **small separate balance**
the user tops up for it — deliberately distinct from the research budget, which is settled when
the run ends. Talking to a finished report should never quietly reopen a closed run's books.

**The report is not editable.** It is the agent's account of what the evidence supports, so the
user can **annotate** it — notes and comments on top — but never rewrite the generated text.
What gets shared is still the thing the evidence produced; changing the substance means a new run
or a follow-up, not a quiet edit.

A finished report can also be **shared**: a read-only link, no account needed for the recipient,
exposing the report and its sources with citations intact and a **set expiry**. Sharing is a view,
not a collaboration — the recipient reads it, they do not continue the run — and the owner can
revoke the link early.

Reports on **finance, medicine, or law** carry a short notice that this is research and not advice.
Ordinary reports do not wear boilerplate they do not need.

There are no emails and no push notifications. If a run finishes or parks for an answer, the
state is waiting in the app the next time the user looks.

---

## Versions, and the audit trail

Plans and reports are **versioned**. Every revision of a plan is kept, and so is every report
that shipped, so editing a plan or re-generating a report never destroys the version that was
approved or the one that went out. Any of them can be restored.

And the whole run is inspectable. A **run audit tab** shows every JEV decision in order — the
question, the options, the probabilities, and the pick — alongside each stage, its tool calls,
and its spend. The feed shows each decision where it happened; the audit tab is the same record
end to end, for anyone who would rather check the reasoning than watch it.

---

## The clock, and the run's memory of itself

Dr. Nib is **time-conscious**, and that has to be a property of the running system, not a line
in a prompt. A research run is minutes to hours long, it spends real money in stages, and it
can stop to wait on a person. Every one of those facts means the run has to know where it is,
what it has done, and what it still has time and budget to do — even if the process that
started it is gone.

So the run keeps a clock and a ledger it can consult at every stage boundary: wall-clock spent
and remaining, dollar budget spent and remaining, what has actually been validated so far, and
how that compares to what the plan said should have happened by now. That state is what lets
Dr. Nib make a decision it would otherwise make blind — abandon a slow source, timebox one
more fetch, or stop and re-plan.

The control split here mirrors the intake split. The worker — the language model — **advises**:
*continue, timebox and continue, safe to stop, re-plan, or unknown*, each with a confidence and
a concrete commitment ("one more fetch, then move on"). A separate controller owns the actual
call, and that controller is JEV-backed like every other decision. The model proposes, the
controller disposes. A source that is slow cannot hold the run hostage; the run drops it,
records why, and moves on.

And a run **outlives the request that started it.** It is a recoverable state, not a single
process: its events are indexed so a client that disconnects at step five can reconnect and
replay from step six, and its progress lives in the database rather than in one open HTTP
connection or one worker's memory. That is what makes an hours-long pause — waiting on the
user to approve, or to raise a cap — ordinary rather than a crash. The whole run also emits a
structured event log: every stage, every tool call, and every JEV decision alongside the
options it was shown and the probabilities it returned. That log is the audit trail, and it is
the thing that lets the report say *why* it did what it did.

---

## Managing projects

Projects are meant to be lived in, so the list does more than show them: **search** by name or
topic, **sort** by recency, cost, or status, **archive** to hide something without deleting it,
**duplicate** a project to start a new run from the same brief, and **tag** related work together.
Deleted projects leave this list for the trash below; nothing else here is destructive.

---

## Deleting, and coming back

A project can be deleted, but not out from under itself. Anything that has not **ended or
finished** is refused: running, planning, awaiting-input, and paused alike. A paused run may
hold no money at all — it may have hit the cap and spent the lot — but it is still mid-work and
unsettled, so pausing is not a close-out. Ending it is what settles the run and makes deletion
allowed. The one exception is a project that never got as far as funding: an intake draft holds
no money and has no work to settle, so it can be discarded outright.

Deleting is not destructive. A deleted project moves to **Deleted projects**, a trash view that
keeps it for **seven days**. It can be restored at any point in that window and picks up exactly
where it was. After seven days it is gone for good, along with its sources, claims, and reports.
The window is long enough to undo a mistake and short enough that the trash cannot become a
second, unbounded project list.

Restoring is ordinary, not administrative: the project simply leaves the trash and reappears in
Projects with its status intact — same answers, same plan, same budget, same report.

---

## Verifying the report

Writing is bound by the evidence, but a promise in a prompt is not an enforcement. After the
report is written, a **verify pass** runs: the report's factual claims are extracted, each is
matched against the run's own collected passages, and **JEV scores whether the passage supports
the claim** — one batch call for the whole set, not a round trip per claim. A claim whose best
passage scores below the support threshold is recorded as **unknown** rather than quietly
standing, and the record is visible to follow-ups and to the audit. If the model is unconfigured
there is nothing honest to extract from, so the run says **unverified** instead of manufacturing
claims by splitting sentences; if JEV is unreachable the run records unverified too, never a guess.

## The run remembers what earned citations

Each finished run writes a small **query memory**: every domain it read gets a read, every domain
the report actually cited gets a cite, per user. Future trust judgements are shown that history —
"cited in N of M past runs" — as one more piece of evidence. It only ever *informs* the judgement;
JEV still decides, and a domain with no prior is absent rather than assumed bad. Read-but-uncited
is counted as a read, never a demerit: a source the run skipped was never given the chance to earn
a citation, and treating that as a miss would let one skip justify the next.

## Other agents can commission it

Dr. Nib is **agent-facing as well as people-facing**. An MCP server exposes the same run flows as
tools — open a project, answer its intake, configure and approve, pause/resume/end, raise the
budget, read the report — so another agent can commission research and follow it. The tools call
the same code paths as the HTTP routes, including the same ownership rule: every call names the
owner wallet, which must own the run, and a run created through MCP is namespaced to that wallet.
A service key gates the surface; with none set the server runs open for local development and says
so, never silently.

## The build gates

Research quality is checked by gates that **fail the build**, not by vibes. Each gate is computed
from a finished run's own records: **citation resolution** (every claim's cited passage maps to a
source the run actually collected), **supported rate** (share of claims backed above threshold),
**uncited rate**, **cost per supported claim**, and **stopping efficiency** (steps used against
the depth allowance). Thresholds live in one place, and a failing gate names the bar it broke —
so a regression is caught before it ships, and a red build says which metric moved.

## Where it runs

Real money lives on **mainnet**: every run spends real money — model calls, JEV decisions, and source
retrieval, paid by Nibgate's own provider keys — and the payer funds it in USDC. The economics
only hold where payment is real.

The **testnet mirror also runs the app**, backed by a testnet-funded backend (free USDC), so the
full flow can be tested end to end. Testnet exposure burns operator compute on free-USDC runs — an
accepted cost of staging, not a product offer. The backend's own network is what moves money: a
testnet-pointed backend can never move mainnet funds, and run budgets gate every run on either stack.

## What this borrows from

**GPT Researcher** does the part Dr. Nib's run view is built from: an agent that picks its
own role from the query, breaks it into sub-questions, researches each independently, and
streams progress while it works. Its deep mode explores a tree with configurable breadth and
depth rather than one flat pass — the natural thing for the depth setting here to control.

**Open Deep Research** separates models by job rather than using one for everything —
summarisation, research, compression, and the final report each get their own, with a cheap
model doing summarisation and a strong one doing the actual reasoning. Dr. Nib's depth and
budget settings should be able to move along that axis.

**STORM** writes from a perspective rather than a neutral stance, which is what makes its
output read like research instead of a summary.

**The clarification literature** — CIGAsk, the value-of-information timing curves,
agentic abstention, SAGE-Agent's expected-value-of-perfect-information — is what the
question loop is actually built on. Three findings shaped it directly: that *when* to ask
and *what* to ask are separate skills that must both be engineered; that question value
decays sharply with timing, and goal-level questions are worthless late; and that the right
number of questions is the informative ones, not the maximum. The last point is the one worth
holding onto — asking everything you could possibly ask is not thoroughness, it's the failure
mode.

**The long-horizon and durable-execution work** is where the clock and crash-survival come
from. ScienceFlow separates route-selection from execution control: the worker proposes jobs
and advises whether to continue or stop, while an evidence-aware controller allocates time and
budget using resource availability, remaining budget, and validated progress. That is the
advisory-vs-control split above, and it is also the clearest statement of why a budget-aware
agent needs a controller rather than a token count. ResearStudio treats the research plan as a
live document the user can pause, edit, and resume against, with every action streaming to the
UI — validation that an interruptible run is both more trustworthy and not less capable. AutoR
takes the opposite default and makes human approval a gate the run cannot pass without, with
resumable and roll-backable stages and artifact-backed outputs; the run you approve is not the
same as the run you can trust, and gates are how that gap closes.

**On the plumbing itself**, two shapes show up repeatedly. Durable workflow engines (Mastra,
and Temporal underneath it) give a run an identity that survives worker restarts, suspend and
resume as first-class operations, snapshots of every step, and streams that can be replayed
after a disconnect. And credential-and-event discipline shows up wherever agents run for other
people: per-user encrypted keys rather than process-global ones, stage contracts with explicit
inputs and outputs so a stage that says nothing cannot be called done, and every turn and
decision emitted as a structured event. Both are things Dr. Nib's stack can take on without
adopting a framework for its own sake.

**Aeon is deliberately not this.** It is an unattended, GitHub-Actions-driven autonomous loop
with no approval gates and no human in the path — the exact opposite of an interactive research
agent whose whole point is that the user is consulted before money moves. Its useful idea is a
stable, always-read statement of intent and hard limits; its defining idea, running without
asking, is one Dr. Nib should never have.

---

## What it will not do

Some things are out of scope on purpose, so the agent spends its judgement where it belongs:

- **No financial, medical, or legal advice.** It researches and cites; it does not tell you what
  to buy, take, or sign.
- **No coding or software tasks.** It is a research agent, not a developer.
- **No paywall or login circumvention.** It never scrapes behind access controls.
- **No private or personal data collection.** It does not research individuals.
- **No real-time data or trading.** It does not promise live prices, and it executes nothing.

---

## Open, for discussion

**Adopt a durable-workflow framework, or build the shape ourselves?** Mastra over Temporal is
the credible "just implement it" answer for a TypeScript product: run identity, suspend/resume,
step snapshots, resumable streams, traces, and evals in one layer. The cost is that its agent
abstraction assumes the model's tool calls drive control flow, which cuts against putting JEV
in the decision seat — though we can keep that split inside deterministic workflow steps. The
alternative is to grow the same properties on the stack already here: BullMQ for execution that
outlives a request, Postgres for recoverable state, and the existing SSE feed made
replayable. Worth deciding before the run layer is written, because it is hard to swap later.

**Where does the language model actually come from?** With all bring-your-own-key paths removed,
the hub is the only road to a model, and it has no LLM upstream configured yet. That is not a
nicety; it is the one dependency the whole product stands on, and it has to be settled before the
run layer can do anything real.

**The research escrow contract.** Designed — see `dr-nib/ESCROW.md`. It is not an
invented escrow: ERC-8183 (Agentic Commerce) is a Draft ERC for exactly this shape
(scoped work, escrowed budget, an evaluator who alone decides release vs refund)
with a reference implementation and a live Arc testnet deployment, and our money
model already matches it down to the basis-point platform fee. What we add is the
one thing it lacks — metered per-stage drawdown instead of all-or-nothing on
`complete`. `TipHoldingWallet` already implements its terminal semantics and is
deployed on testnet and mainnet, so this is an extension of live code, not a new
system.

**Can a *project* be shared, or only its report?** Reports are shareable by link; projects are
private to their owner. Letting someone hand over a whole project — re-run it, top it up,
continue it — means deciding what the recipient may do and who pays for it. The report link is
the deliberate exception to privacy, and it is one-way: read, never continue.

**Accounts.** Sign-in is the wallet, but user-scoped projects do not exist yet: the trash, the
purge, and the per-user concurrency limit all hang off an account that nothing currently creates.
The run layer has to assume it rather than invent it.

**Concurrency and the trash.** Two things the backend has to own regardless of framework: the
seven-day purge is a scheduled job, not something a page load happens to trigger, and running
many projects at once needs a per-user limit before the metered budget becomes a
denial-of-wallet problem.