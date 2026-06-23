/**
 * ask-light — lightweight ask_user for pi
 *
 * Single question: select + freeform ✏️ built-in
 * Multi-tab: questions[] → sequenziale, una per volta
 *
 * ctx.ui built-in methods. Zero dipendenze extra. ~220 righe.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type OptionInput = string | { title: string; description?: string };

function toOpt(opt: OptionInput): { title: string } {
  return typeof opt === "string" ? { title: opt } : { title: opt.title };
}

const CUSTOM = "✏️  Write custom answer";
const NEXT = "→  Next";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user with optional choices. Use questions[] for multi-tab.",
    promptSnippet: "Ask the user a question and wait for their response",
    promptGuidelines: [
      "Use ask_user for decisions, clarifications, or input.",
      "For multi-category questions use questions[] — shown one tab at a time.",
    ],
    parameters: Type.Object({
      question: Type.Optional(Type.String()),
      context: Type.Optional(Type.String()),
      options: Type.Optional(Type.Array(Type.Union([
        Type.String(),
        Type.Object({ title: Type.String(), description: Type.Optional(Type.String()) }),
      ]))),
      questions: Type.Optional(Type.Array(Type.Object({
        header: Type.String(),
        question: Type.String(),
        options: Type.Optional(Type.Array(Type.Union([
          Type.String(),
          Type.Object({ title: Type.String(), description: Type.Optional(Type.String()) }),
        ]))),
        allowMultiple: Type.Optional(Type.Boolean()),
      }))),
      allowMultiple: Type.Optional(Type.Boolean()),
      allowComment: Type.Optional(Type.Boolean()),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return { content: [{ type: "text" as const, text: "Unavailable in non-interactive mode" }], details: {} };
      }

      // ── Multi-tab ──────────────────────────────────────────────────────
      const rawQ = params.questions;
      if (rawQ && rawQ.length > 0) {
        const answers: string[] = [];

        for (let i = 0; i < rawQ.length; i++) {
          const tab = rawQ[i];
          const opts = (tab.options || []).map(toOpt);
          const header = `[${i + 1}/${rawQ.length}] ${tab.header}`;

          if (opts.length === 0) {
            const a = await ctx.ui.input(`${header}\n\n${tab.question}`);
            answers.push(a || "");
            continue;
          }

          const items = opts.map((o: { title: string }, idx: number) => `${idx + 1}. ${o.title}`);
          items.push(CUSTOM);

          // Se non è l'ultimo tab, aggiungi "Next →" per navigare
          if (i < rawQ.length - 1) items.push(NEXT);

          const pick = await ctx.ui.select(`${header}\n\n${tab.question}`, items);
          if (!pick || pick === NEXT) { answers.push(""); continue; }

          if (pick === CUSTOM) {
            const c = await ctx.ui.input(tab.question);
            answers.push(c || "");
          } else {
            answers.push(pick);
          }
        }

        return {
          content: [{ type: "text" as const, text: rawQ.map((t, i) => `${t.header}: ${answers[i] || "—"}`).join("\n") }],
          details: { answered: true, answers },
        };
      }

      // ── Single question ────────────────────────────────────────────────
      const question = params.question || "";
      const context = params.context || "";
      const options = (params.options || []).map(toOpt);
      const allowComment = !!params.allowComment;

      if (options.length === 0) {
        const a = await ctx.ui.input(context ? `${context}\n\n${question}` : question);
        return { content: [{ type: "text" as const, text: a || "Cancelled" }], details: { answered: !!a } };
      }

      const items = options.map((o: { title: string }, i: number) => `${i + 1}. ${o.title}`);
      items.push(CUSTOM);

      const pick = await ctx.ui.select(context ? `${context}\n\n${question}` : question, items);
      if (!pick) {
        return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false } };
      }

      if (pick === CUSTOM) {
        const c = await ctx.ui.input(question);
        let comment = "";
        if (allowComment) { const cm = await ctx.ui.input("Comment:"); if (cm) comment = cm; }
        return {
          content: [{ type: "text" as const, text: (c || "") + (comment ? `\nComment: ${comment}` : "") }],
          details: { answered: true, text: c, freeform: true, comment },
        };
      }

      let comment = "";
      if (allowComment) { const cm = await ctx.ui.input("Comment:"); if (cm) comment = cm; }
      return {
        content: [{ type: "text" as const, text: pick + (comment ? `\nComment: ${comment}` : "") }],
        details: { answered: true, selected: pick, comment },
      };
    },
  });
}
