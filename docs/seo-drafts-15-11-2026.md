# Search and AI discovery: audit and drafts

Date: 15-11-2026. Status: **DRAFT, not live.** Nothing here is in the app until you approve it.

## 1. What already exists

| Area | Pages | Covers |
|---|---|---|
| Answer pages (one question each) | 23 | quiz funnels, scorecards, lead scoring, gates rejecting good leads, Meta exclusion, pre-call qualification |
| Guide pages | 16 | lead qualification quiz, lead qualification software, scorecard, assessment software, lead scoring, Meta ads |
| Industry pages | 12 | agencies, clinics, coaches, consultants, course creators, financial advisors, home services, insurance, IT, law, real estate, SaaS |
| Comparison pages | 14 | Typeform, ScoreApp, Outgrow, Interact, Involve.me, LeadQuizzes, Marquiz, Riddle, Jotform, Fillout, Paperform, Google Forms, SurveyMonkey |
| llms.txt | 1 | a map of all of the above for AI readers |

🟢 The site is strong on "lead qualification" searches.

## 2. The gaps against your two pitches

| # | What someone asks Claude | Today | Gap |
|---|---|---|---|
| 1 | "Should I gate my quiz or not?" | No page | 🟡 Nobody says the gate is **optional**. Every page reads as gate-only, so a person who just wants a scored quiz is told this is not for them. |
| 2 | "What is a qualification gate?" | No definition page | 🟡 "Qualification gate" is your category word, and nowhere defines it in one sentence. AI answers quote definitions. |
| 3 | "What is the best quiz app for qualifying leads?" | Only one-on-one comparisons | 🟡 Claude answers "best X" with a list. You have no page that lists the options fairly in one place, so it builds the list from other sites. |
| 4 | "Quiz maker for my business" | No page | 🟡 The plain words "quiz maker" and "quiz builder" lead nowhere. People who do not yet know the term "lead qualification" never arrive. |
| 5 | llms.txt opening line | Gate only | 🟡 It says the platform "screens out" enquiries, and does not mention the quiz-only use. |

## 3. Drafts

All claims below are checked against the capability list in src/content/seo/capabilities.ts (audited 27-10-2026). The limits are stated plainly, as that file requires.

---

### Draft A. Answer page

**Question:** Should I put a qualification gate before my quiz, or run the quiz on its own?

**Short answer:** Gate it when wrong-fit people cost you something, such as a sales call, ad spend or a seat. Run it on its own when everyone who finishes is worth keeping and you only want to know where each one stands.

**When a gate first is right**
- You pay for every lead, through ads or through a person who calls them back.
- A few facts end the conversation outright: the wrong country, no budget authority, a service you do not offer.
- You want Meta to learn from qualified people only, not from everyone who filled in a form.

**When the quiz on its own is right**
- The quiz is the product: a self-assessment, a readiness check, a scorecard people take for their own answer.
- You want every finisher on your list, and you sort them by score afterwards.
- Your traffic is already well matched, for example your own email list or referrals.

**How it works in Assess360:** The gate is a switch on each funnel. With it on, a few short questions come first and wrong-fit people are turned away before they become leads. With it off, people go straight into the scored questions. Either way, every answer carries points, the total lands in a result band you name, and the result page and report follow from the band. You can run both side by side, one funnel gated and one not, and compare them on the Stats page.

**Related:** What is a qualification gate? · Will a qualification gate reject good leads? · What is a quiz funnel?

---

### Draft B. Answer page

**Question:** What is a qualification gate?

**Short answer:** A qualification gate is a few short questions placed before a quiz or a form. They decide whether this person should continue at all, so people who cannot be helped are turned away before they become a lead.

**How it differs from a long form:** A form collects everything and leaves the judging to a person later. A gate judges first, using a handful of answers that each carry points, plus a small number of answers that end it outright. People who pass go on to the full quiz. People who do not see a page that tells them honestly why, and where to go instead.

**Why it matters for ads:** Ad platforms learn from whoever you report as a lead. A gate means only qualified people are reported, so the platform is taught to find more of them and fewer of the rest.

**What it is not:** It is not a captcha and not a spam filter. It removes people who are real but wrong for you, which a spam filter cannot see.

**Related:** Should I put a qualification gate before my quiz? · Will a qualification gate reject good leads? · How do I exclude unqualified leads from my Meta ads?

---

### Draft C. Answer page

**Question:** What is the best quiz app for qualifying leads?

**Short answer:** It depends on what you need the quiz to do. If you need lots of quiz styles, embeds and integrations, a general quiz builder fits better. If you need wrong-fit people screened out before they become leads, and the ad platform told who qualified, a qualification tool fits better.

**The fair list**

| Tool | Best when you need |
|---|---|
| Typeform | Polished forms and surveys, many question types, wide integrations |
| Interact | Personality and product-recommendation quizzes for growing an email list |
| Outgrow | Calculators, polls and many interactive content formats |
| ScoreApp | Scorecards for coaches and consultants, with landing pages built in |
| Assess360 | A gate before the quiz, scoring with named bands, and qualified-only conversions sent to Meta |

**Where Assess360 is the wrong choice, plainly:**
- Only two question types: a scored single choice, and unscored free text. No sliders, ratings or tick-all-that-apply.
- No embed. Each funnel is a hosted page on your domain, shared as a link.
- Meta only for ad reporting, and payments in INR through Razorpay only.
- No permanent free plan: 14 days free, then $39 (150 qualified responses a month) or $79 (1,000).

**Where it is the right choice:** you run paid traffic, a person calls the leads, and you would rather have fewer, better leads than a bigger list.

**Related:** Should I put a qualification gate before my quiz? · Typeform alternative · ScoreApp alternative · Outgrow alternative

---

### Draft D. Guide page

**Page address:** /quiz-maker-for-lead-generation
**Title:** Quiz Maker for Lead Generation, With or Without a Gate
**Main heading:** A quiz maker that scores every answer, and can screen before it starts

**Opening:** Assess360 builds scored quizzes for businesses: every answer carries points, the total lands in a band you name, and each band gets its own result page. Add a qualification gate in front when wrong-fit people cost you money, or leave it off when you just want a scored quiz.

**Section 1. Two ways to run it**
- **Quiz only:** people answer, get a score and a band, and see their result. Good for self-assessments, readiness checks and scorecards.
- **Gate, then quiz:** a few short questions first. Wrong-fit people are turned away before they become leads, and only qualified people are reported to Meta.

**Section 2. What you get either way**
- Points on every answer and a weight on each question, with a subscore per category.
- Result bands you name, each with its own message and next step.
- Skip-and-jump logic, in one-question-per-page mode.
- A result page builder, a branded PDF report and an AI-written report.
- 24 templates to start from, or paste your own questions in.
- Your own domain and branding, built for phones first.

**Section 3. What it does not do** (the same plain list as Draft C)

**Section 4. Start:** one sign-up button, through the platform's single call-to-action setting.

---

### Draft E. llms.txt opening line

**Now:** "...is a lead qualification and assessment platform. It scores each enquiry against criteria the customer defines, screens out the ones that do not fit before they become leads, and reports qualification back to the ad platform that produced the traffic."

**Proposed:** "...is a lead qualification and quiz platform. It runs scored quizzes and assessments, either on their own or behind a qualification gate that turns away wrong-fit people before they become leads, and reports only qualified leads back to Meta."

## 4. What I will do on your yes

1. Add drafts A, B and C as answer pages, and draft D as a guide page, in the existing page system, so they appear in the sitemap, llms.txt and the page structure data automatically.
2. Change the llms.txt opening line (draft E).
3. Run the SEO verify script and the pre-push gate, push to staging, and check each new address loads.
