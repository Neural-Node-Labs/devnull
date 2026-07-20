# Lessons Learned

Track recurring patterns and mistakes here so we don't repeat them.

## 2026-07-20: RCA — System Stops Without Summary

- **Mechanical fallbacks are not summaries.** Concatenating tool call names is not a summary — it's a log. A real summary requires understanding what the tool calls accomplished, not just that they were made.
- **LLM calls for summarization should be the primary path, not a fallback.** The cost of one extra LLM call at the end of a task is negligible compared to the cost of the main ReAct loop. Don't gate it behind heuristics or try/catch.
- **Truncation before summarization loses context.** Truncating observations to 200 characters before passing them to the LLM for summarization defeats the purpose — the LLM needs the full context to produce a useful summary.
- **Phase planning compounds low-quality output.** When each phase produces a low-quality summary, the next phase builds on garbage, and the final result is a cascade of meaningless text. Fix the summary quality at the subagent level first.
- **Test assertions must validate quality, not just existence.** Checking that a result is non-empty or contains certain keywords is not sufficient to catch summary-quality regressions.
- **RCA postmortem must include: timeline, root cause, contributing factors (with priority), causal chain, and corrective actions (with P0/P1/P2 priority).** The postmortem document is the canonical output of any RCA. It must be structured with a timeline table, a clearly stated root cause, 3-5 contributing factors each with code evidence, a causal chain diagram, and a corrective actions table with P0/P1/P2 priority assignments. Each corrective action must include the specific file(s) to change and a verification step.
- **Corrective actions must be prioritized P0/P1/P2, not just listed.** P0 = blocks reliable operation (fix immediately), P1 = significant degradation (fix soon), P2 = improvement (nice to have). Without priority, the team doesn't know what to fix first.
- **Contributing factors must cite exact line numbers and code snippets.** A contributing factor without evidence is just speculation. Every factor in the postmortem must reference the specific file, line numbers, and (where relevant) the exact code that demonstrates the problem.
- **The causal chain should be a single linear diagram from trigger to root cause.** A good causal chain shows the propagation path clearly: `TRIGGER → event → event → ... → ROOT CAUSE`. Each arrow represents a verified causal link.
