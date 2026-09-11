# Plan: Inkman — AI Colour Combination Assistant

## Problem

When painting or drawing, picking colours that work well together is hard
without formal training in colour theory — especially when the "right"
combination also depends on the medium (alcohol markers behave differently
than watercolour or acrylic) and the mood you're going for (soft/pastel vs
bold/vibrant). Inkman is an assistant that suggests colour combinations
based on a starting colour, a medium, and a desired look.

## MVP Scope

The MVP proves the core loop: **give a colour → get usable palette
suggestions, explained.**

- User inputs a base colour (hex code, or picks from a colour wheel/swatch
  picker).
- Assistant returns 3-4 palette suggestions based on standard colour theory
  schemes: complementary, analogous, triadic, split-complementary.
- Each suggestion shows the actual swatches (not just names) plus a one-line
  explanation of why the scheme works (e.g. "complementary colours sit
  opposite on the wheel and create strong contrast").
- Simple web interface — no login, no saved history required.

**Out of scope for MVP:** medium-specific advice, mood/style-based filtering,
image upload/colour extraction, saving palettes, user accounts.

## Final Goals (stretch)

- **Medium-aware suggestions**: factor in how a medium behaves — e.g. alcohol
  markers blend and layer differently than gouache or watercolour, so a
  palette that works on paper with one medium may not translate to another.
- **Mood/style filter**: let the user pick a vibe (moody, vibrant, pastel,
  earthy, high-contrast) and bias suggestions toward that.
- **Image-based input**: upload a reference photo and extract a base palette
  from it.
- **Save and organize palettes**: let the user build a personal library of
  favourite combinations, tagged by project or medium.
- **"What goes with this?" reverse lookup**: input two colours you already
  have and get suggestions for a third/fourth that completes the set.

## AI-Involvement Level

**Target: Level 3 — AI drafts most of the implementation; I review, steer
design decisions, and own the domain judgment calls.**

Why: The core logic (colour wheel math, scheme generation, UI scaffolding) is
well-defined and mostly mechanical, so I want AI to handle that implementation
quickly rather than spend my time on boilerplate. My own value-add is in the
parts that need judgment AI can't supply on its own: how palettes are
explained to a non-technical user, how medium-specific nuance actually gets
encoded (this needs my own knowledge of how alcohol markers and other media
behave, not just textbook colour theory), and how the mood/style filter
should feel to use. I review every diff before accepting it and test
suggestions against my own sense of what "looks good," not just accept output
that's technically correct by colour theory but impractical for actual
painting.
