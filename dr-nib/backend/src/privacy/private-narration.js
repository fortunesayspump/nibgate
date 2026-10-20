// Public-facing work summaries belong in encrypted activity. Findings and
// material evidence limitations belong in the report. Never request or expose
// a hidden chain-of-thought transcript.
export function privateNarrationMessages(stage,messages){
 const instructions={
  agent:'In why, speak directly to the user in one or two concise first-person sentences: summarize what the last recorded result establishes or leaves uncertain, then say what you will check next and why it matters. Describe only observed results and approved proposed actions; never claim an unexecuted tool succeeded. This is an activity update, not a hidden reasoning transcript.',
  review:'These learnings and followUps are for the encrypted activity chat. Use at most three brief, source-grounded findings and three concrete remaining gaps. Explain what the collected evidence establishes and what you will use in the report. Put retrieval failures, unavailable full text, skipped tool work and resulting changes of approach here; do not pretend a search excerpt is a full source. Never expose hidden chain-of-thought or invent observations.',
  write:'Write a polished research deliverable, not an agent execution log. Do not narrate which searches failed, what could not be fetched, which tool was skipped, the time/budget limit or the lack of additional creator sites; those operational updates belong in activity chat. Cite only evidence actually available and used. Keep material limitations affecting interpretation, such as confounding, uncertainty, limited study design or reliance on one tutorial, stated briefly as scope/evidence limitations. Never conceal a missing basis for a conclusion, invent completeness, or remove substantive uncertainty merely to make the report look successful.'
 };
 if(!instructions[stage])return messages;
 const firstData=messages.findIndex(m=>m.role!=='system'),at=firstData<0?messages.length:firstData;
 return [...messages.slice(0,at),{role:'system',content:instructions[stage]},...messages.slice(at)];
}
