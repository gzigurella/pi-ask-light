/**
 * ask-light — lightweight ask_user tool for pi
 *
 * Uses pi's built-in ctx.ui methods (select, confirm, input) instead of
 * custom overlay rendering. Zero extra dependencies, ~200 lines, no lag.
 *
 * Features:
 *   - Single-select with optional freeform custom answer
 *   - Multi-select with toggle + confirm
 *   - Freeform input only (no options)
 *   - Optional comment field
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ── Helpers ──────────────────────────────────────────────────────────────────

type OptionInput = string | { title: string; description?: string };

function toOption(opt: OptionInput): { title: string; description?: string } {
  return typeof opt === "string" ? { title: opt } : opt;
}

// ── Tool registration ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a question with optional multiple choice options. " +
      "Use options[] for guided choices, allowFreeform for custom input.",
    promptSnippet: "Ask the user a question and wait for their response",
    promptGuidelines: [
      "Use ask_user when you need a decision, clarification, or input from the user before proceeding.",
      "Set allowMultiple=true when the user can pick several options.",
      "Set allowFreeform=true to let the user type a custom answer.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "Question to show the user" }),
      context: Type.Optional(
        Type.String({ description: "Brief summary context shown above the question" }),
      ),
      options: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String({ description: "Simple option (title only)" }),
            Type.Object({
              title: Type.String({ description: "Option title" }),
              description: Type.Optional(Type.String({ description: "Option description" })),
            }),
          ]),
          { description: "List of options to choose from" },
        ),
      ),
      allowMultiple: Type.Optional(
        Type.Boolean({ description: "Allow multiple selection (default: false)" }),
      ),
      allowFreeform: Type.Optional(
        Type.Boolean({ description: "Show a freeform input field (default: true)" }),
      ),
      allowComment: Type.Optional(
        Type.Boolean({ description: "Allow optional comment (default: false)" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const question = params.question;
      const context = params.context || "";
      const options = (params.options || []).map(toOption);
      const allowMultiple = !!params.allowMultiple;
      const allowFreeform = params.allowFreeform !== false;
      const allowComment = !!params.allowComment;

      const FREEFORM_LABEL = "✏️  Write custom answer";

      if (!ctx.hasUI) {
        return {
          content: [{ type: "text" as const, text: `Question: ${question}\n(Not available in non-interactive mode)` }],
          details: { answered: false, mode: "no-ui" },
        };
      }

      // ── Case 1: Freeform only (no options) ─────────────────────────────
      if (options.length === 0) {
        const answer = await ctx.ui.input(question);
        if (answer === null || answer === undefined) {
          return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
        }
        return { content: [{ type: "text" as const, text: answer }], details: { answered: true, text: answer } };
      }

      // ── Case 2: Multi-select ───────────────────────────────────────────
      if (allowMultiple) {
        const selected = new Set<string>();
        const baseOpts = options.map(o => o.title);
        const menuItems = [...baseOpts, "✅ Done — confirm selection", FREEFORM_LABEL];

        while (true) {
          const header = selected.size === 0
            ? `${context ? context + "\n\n" : ""}${question}\n\nSelect options one at a time:`
            : `Selected: ${[...selected].join(", ")}\n\nAdd more:`;

          const pick = await ctx.ui.select(header, menuItems);
          if (!pick) {
            if (selected.size === 0) {
              return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
            }
            break;
          }

          if (pick === "✅ Done — confirm selection") break;
          if (pick === FREEFORM_LABEL) {
            const custom = await ctx.ui.input(question);
            if (custom) selected.add(`✏️  ${custom}`);
            continue;
          }

          if (selected.has(pick)) selected.delete(pick);
          else selected.add(pick);
        }

        const results = [...selected];
        let comment = "";
        if (allowComment) {
          const c = await ctx.ui.input("Optional comment:");
          if (c) comment = c;
        }

        return {
          content: [{ type: "text" as const, text: results.join(", ") + (comment ? `\nComment: ${comment}` : "") }],
          details: { answered: true, selected: results, comment },
        };
      }

      // ── Case 3: Single-select + optional freeform ──────────────────────
      const optionTitles = options.map(o => o.title);
      if (allowFreeform) {
        optionTitles.push(FREEFORM_LABEL);
      }

      const pick = await ctx.ui.select(
        context ? `${context}\n\n${question}` : question,
        optionTitles,
      );

      if (!pick) {
        return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
      }

      // User chose freeform → show input immediately (same tool call)
      if (allowFreeform && pick === FREEFORM_LABEL) {
        const custom = await ctx.ui.input(question);
        if (!custom) {
          return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
        }
        let comment = "";
        if (allowComment) {
          const c = await ctx.ui.input("Optional comment:");
          if (c) comment = c;
        }
        return {
          content: [{ type: "text" as const, text: custom + (comment ? `\nComment: ${comment}` : "") }],
          details: { answered: true, text: custom, freeform: true, comment },
        };
      }

      // Regular option selected
      let comment = "";
      if (allowComment) {
        const c = await ctx.ui.input("Optional comment:");
        if (c) comment = c;
      }

      return {
        content: [{ type: "text" as const, text: pick + (comment ? `\nComment: ${comment}` : "") }],
        details: { answered: true, selected: pick, comment },
      };
    },
  });
}
