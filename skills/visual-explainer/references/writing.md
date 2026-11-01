# Writing in plain language

The reader is smart but new to the topic, busy, and scanning. Most people scan a
page and only a minority read every word, so every line has to work when read on
its own.

## The rules

1. **Lead with the point.** The page, each section and each paragraph start with
   their conclusion. Background comes after, if at all.
2. **Short sentences.** Most under 20 words; none over 28 (the build flags them).
   One idea per sentence.
3. **Active voice, and "you".** "Google checks your password", not "the password is
   verified by the identity provider".
4. **Everyday words.** "use", not "utilise"; "start", not "initiate"; "about", not
   "approximately". Prefer the concrete noun: "the app's server", not "the backend
   component".
5. **Explain every technical term before or where it's used.** Put it in "Words
   you'll meet" on page 2, or explain it in the same sentence: "an access token, a
   short-lived digital key, …". Hover definitions (`.term`) are a back-up, not the
   main explanation.
6. **Spell out every abbreviation the first time**, as "Full words (ABBR)", and keep
   abbreviations to a few per page. If an abbreviation appears only once or twice,
   don't introduce it at all. The build flags any capitalised abbreviation whose
   first appearance isn't spelled out.
7. **Numbers carry their meaning.** "~60 minutes, after which the app must ask
   again", not "TTL 3600s". Say whether a number is exact, rounded or an estimate.
8. **No hedging pile-ups and no hype.** One "usually" where it's true; never
   "simply", "just", "obviously", "seamless" or "powerful".
9. **Attribute what isn't settled.** "Google's documentation says…", "one study
   found…". Mark your own explanations as yours when the source didn't say them.

## Headlines and summaries

| | Weak | Strong |
|---|---|---|
| Headline (page 1) | OAuth explained | "Sign in with Google" tells an app who you are. It never sees your password. |
| Summary | This page covers how OAuth works. | Google checks your password, then gives the app a short-lived key that opens only what you agreed to share. |
| Takeaway | Tokens | **The app gets a key instead.** It opens only what you agreed to share, and stops working after about an hour. |
| What this means | OAuth is important. | Signing in with Google is safer than another password, as long as you read what the app asks to see. |

- **Headline**: the answer, as one or two statements. If a manager reads only this,
  are they right? A second line in grey (`.soft`) can add the twist.
- **Takeaways**: exactly three. Each is a short claim in the title (four to seven
  words) plus one or two sentences. Together they cover the page.
- **What this means for you**: name the reader's decision, action or risk.

## Section headings: questions

Headings on "How it works" are the questions the reader would ask next, in order.
A question opens a small gap in what they know, and curiosity pulls them into the
section. The first sentence under it answers it.

- Weak: "Token lifetime". Strong: "How long does the key keep working?"
- Weak: "Architecture". Strong: "Which parts talk to each other?"

## Diagram text

- **Labels**: up to about six words. Nouns and short verb phrases.
- **Figure titles** (`.fig-title`): what the picture shows, as a short phrase.
- **What to notice**: one sentence pointing at the single most important thing in
  the picture, ideally the orange one.

## Comparisons (`.analogy`)

A good comparison maps the structure, not the surface: a hotel key card works like
an access token because both open one thing, for a limited time, for whoever holds
it. Then say where it stops working ("unlike a key card, a token can be checked
remotely"). Use the same words for the same parts in the comparison and in the
real explanation, so the reader can carry the picture across.

## Quick checks

- Ask about the section's **point**, not a detail: "Which party checks your
  password?", not "How many characters is a token?"
- Prefer situations: "You find an old token in a log file. How worried should you
  be?" These test understanding, not memory.
- The answer gives the reason, in one or two sentences.
- Full mode: `x-predict` for surprising facts, `x-order` for sequences.

## Show me steps

- One action per step, starting with the verb: "Click **Create token**." A step
  can also be something to look at: "See the tests pass."
- Use the product's exact labels, in bold. Commands go in `<code>`.
- Add what the reader should see when it isn't obvious: "Google lists what the app
  wants to see."
- The steps must work on their own, for someone who never presses play.
