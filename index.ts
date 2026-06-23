/**
 * ask-light — lightweight ask_user tool for pi
 *
 * Features:
 *   - Single-select with embedded "Write custom answer" ✏️
 *   - Multi-select with toggle + confirm
 *   - Freeform only (no options)
 *   - Optional comment field
 *   - Multi-tab mode: multiple question categories in sequence
 *
 * Uses ctx.ui built-in methods. No custom TUI rendering. Zero lag.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type OptionInput = string | { title: string; description?: string };

function toOption(opt: OptionInput): { title: string; description?: string } {
  return typeof opt === "string" ? { title: opt } : opt;
}

const CUSTOM_LABEL = "✏️  Write custom answer";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user questions with optional choices. " +
      "Use options[] for guided choices, questions[] for multi-tab mode.",
    promptSnippet: "Ask the user a question and wait for their response",
    promptGuidelines: [
      "Use ask_user when you need a decision, clarification, or input.",
      "For multi-category questions, use the questions[] parameter (each tab is one category).",
      "Set allowMultiple=true for multi-select, allowComment=true for comment field.",
    ],
    parameters: Type.Object({
      question: Type.Optional(
        Type.String({ description: "Single question (ignored if questions[] is set)" }),
      ),
      context: Type.Optional(
        Type.String({ description: "Brief context shown above the question" }),
      ),
      options: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String({ description: "Simple option" }),
            Type.Object({
              title: Type.String({ description: "Option title" }),
              description: Type.Optional(Type.String({ description: "Description" })),
            }),
          ]),
        ),
      ),
      questions: Type.Optional(
        Type.Array(
          Type.Object({
            header: Type.String({ description: "Tab label for this category" }),
            question: Type.String({ description: "Question text for this category" }),
            options: Type.Optional(
              Type.Array(
                Type.Union([
                  Type.String(),
                  Type.Object({
                    title: Type.String(),
                    description: Type.Optional(Type.String()),
                  }),
                ]),
              ),
            ),
            allowMultiple: Type.Optional(Type.Boolean()),
            allowCustom: Type.Optional(Type.Boolean()),
          }),
          { description: "Multi-tab questions (each tab is one category)" },
        ),
      ),
      allowMultiple: Type.Optional(
        Type.Boolean({ description: "Allow multiple selection (default: false)" }),
      ),
      allowComment: Type.Optional(
        Type.Boolean({ description: "Allow optional comment on single question (default: false)" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text" as const, text: "Not available in non-interactive mode" }],
          details: { answered: false, mode: "no-ui" },
        };
      }

      // ── Multi-tab mode ───────────────────────────────────────────────
      const rawQuestions = params.questions;
      if (rawQuestions && rawQuestions.length > 0) {
        const answers: string[] = [];

        for (let i = 0; i < rawQuestions.length; i++) {
          const tab = rawQuestions[i];
          const tabOptions = (tab.options || []).map(toOption);
          const tabMultiple = !!tab.allowMultiple;
          const tabCustom = tab.allowCustom !== false;

          // Show a header indicating progress
          const progress = `[${i + 1}/${rawQuestions.length}] ${tab.header}`;

          if (tabOptions.length === 0) {
            // Freeform for this tab
            const answer = await ctx.ui.input(`${progress}\n\n${tab.question}`);
            answers.push(answer || "");
            continue;
          }

          if (tabMultiple) {
            // Multi-select for this tab
            const selected = new Set<string>();
            const baseOpts = tabOptions.map((o, idx) => `${idx + 1}. ${o.title}`);
            const menuItems = [...baseOpts, "✅ Done — confirm", CUSTOM_LABEL];

            while (true) {
              const header = selected.size === 0
                ? `${progress}\n\n${tab.question}\n\nSelect options one at a time:`
                : `${progress}\n\nSelected: ${[...selected].join(", ")}\n\nAdd more:`;

              const pick = await ctx.ui.select(header, menuItems);
              if (!pick) {
                if (selected.size === 0) {
                  answers.push("");
                  break;
                }
                break;
              }

              if (pick === "✅ Done — confirm") break;
              if (pick === CUSTOM_LABEL) {
                const custom = await ctx.ui.input(tab.question);
                if (custom) selected.add(`✏️  ${custom}`);
                continue;
              }

              if (selected.has(pick)) selected.delete(pick);
              else selected.add(pick);
            }

            if (selected.size > 0) {
              answers.push([...selected].join(", "));
            } else if (!answers[answers.length - 1]) {
              answers[answers.length - 1] = "";
            }
            continue;
          }

          // Single select for this tab
          const optionTitles = tabOptions.map((o, idx) => `${idx + 1}. ${o.title}`);
          if (tabCustom) optionTitles.push(CUSTOM_LABEL);

          const pick = await ctx.ui.select(
            `${progress}\n\n${tab.question}`,
            optionTitles,
          );

          if (!pick) {
            answers.push("");
            continue;
          }

          if (pick === CUSTOM_LABEL) {
            const custom = await ctx.ui.input(tab.question);
            answers.push(custom || "");
          } else {
            answers.push(pick);
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: rawQuestions.map((tab, i) =>
              `${tab.header}: ${answers[i] || "(skipped)"}`
            ).join("\n"),
          }],
          details: { answered: true, answers },
        };
      }

      // ── Single question mode ─────────────────────────────────────────
      const question = params.question || "";
      const context = params.context || "";
      const options = (params.options || []).map(toOption);
      const allowMultiple = !!params.allowMultiple;
      const allowComment = !!params.allowComment;

      if (options.length === 0) {
        const answer = await ctx.ui.input(question);
        if (!answer) {
          return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
        }
        return { content: [{ type: "text" as const, text: answer }], details: { answered: true, text: answer } };
      }

      // Single-select with always-present custom option
      if (!allowMultiple) {
        const optionTitles = options.map((o, i) => `${i + 1}. ${o.title}`);
        optionTitles.push(CUSTOM_LABEL);

        const pick = await ctx.ui.select(
          context ? `${context}\n\n${question}` : question,
          optionTitles,
        );

        if (!pick) {
          return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
        }

        if (pick === CUSTOM_LABEL) {
          const custom = await ctx.ui.input(question);
          if (!custom) return { content: [{ type: "text" as const, text: "Cancelled" }], details: { answered: false, cancelled: true } };
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

        let comment = "";
        if (allowComment) {
          const c = await ctx.ui.input("Optional comment:");
          if (c) comment = c;
        }
        return {
          content: [{ type: "text" as const, text: pick + (comment ? `\nComment: ${comment}` : "") }],
          details: { answered: true, selected: pick, comment },
        };
      }

      // Multi-select
      const selected = new Set<string>();
      const baseOpts = options.map((o, i) => `${i + 1}. ${o.title}`);
      const menuItems = [...baseOpts, "✅ Done — confirm selection", CUSTOM_LABEL];

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
        if (pick === CUSTOM_LABEL) {
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
    },
  });
}
