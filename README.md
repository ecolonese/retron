# Retron

A personalized study companion for Connor's Spring 2027 courses at Rutgers. It started as an organic chemistry game and keeps that material as an optional foundation review.

## Use it

Open `index.html` directly in Safari or Chrome. There is no build step, backend, account, or paid API. Progress saves in the browser (localStorage) on that computer. The Backup screen exports and imports a JSON file.

To host it, turn on GitHub Pages for this repo (Settings, Pages, deploy from the main branch).

## What it does

- Subjects: General Biochemistry (11:115:403), Food Microbiology (11:400:423), Introduction to Horticulture (11:776:211), Fruit Production (11:776:341), plus Organic Chemistry Review.
- Sessions: Quick Warm-Up (3 questions), Daily Review (5), Deep Practice (12). These are targets, not timers.
- Spaced repetition: missed questions return the next day. Correct ones return after 2, 4, 8, 16 and 32 days. A question counts as solid after three correct spaced reviews.
- Progress shows real numbers only: first-try accuracy and solid counts by course and concept. There are no streaks or points.

## Content

Biochemistry has the most questions. Food Microbiology, Horticulture and Fruit Production are small starter sets. None of it is matched to Rutgers syllabi yet, so check it against course materials. Flag any question that looks wrong from inside the app. Flags are listed on the Backup screen.

## Adding a subject

Everything is data driven inside the `retron-core` script in `index.html`. Add an entry to `SUBJECTS`, its topics to `CONCEPTS`, and questions with `mc(...)`. The home screen, sidebar, progress page and scheduler pick it up automatically.

## Tests

```
node test/core.test.js
```

Checks question integrity, scheduling, session selection, and storage and backup behavior.
