# Roadmap

Planned features, not built yet. Shipped behaviour is described in [README.md](../README.md) and [PRD.md](../PRD.md).

## Guiding rule: deterministic first, LLM last

Everything the add bar understands is parsed **on the device with plain rules** (`src/when.ts`, `src/categorize.ts`): no network call, no per-item cost, instant, works offline, and the server never sees item text.

An LLM is only worth adding for inputs the rules can't read, and only if all of these hold:

- It's opt-in, triggered explicitly (for example a "Didn't understand? Ask AI" button), never on every add.
- It receives only the one ambiguous phrase, never the whole list, since item text is otherwise end-to-end encrypted.
- It returns the same structure the rules produce (`{ text, deadlineAt, remindAt, priority, recurrence }`), so the rest of the app doesn't change.
- Usage is capped per day, and the cheapest small model is used.

Before reaching for it, log (on the device) phrases the parser left unrecognised, and grow the rules from real examples.

## What the add bar understands today

For reference when extending it. Phrases are read at the **end** of the text, and the unambiguous ones also at the **start**, never in the middle (so "call mom about friday party" stays as typed).

| You type | Result |
| --- | --- |
| `Wash shoe tonight` · `tonight wash shoe` | deadline today 10pm |
| `wash shoe at 10pm` · `wash shoe @10pm` · `10pm shoe wash` | deadline 10pm (tomorrow if already past) |
| `Wash shoe tomorrow` | deadline tomorrow 10pm (a day without a time means 10pm) |
| `Wash shoe tomorrow urgent` | deadline tomorrow 10pm, high priority (sorted first) |
| `Wash shoe tomorrow, remind at 6pm` | deadline tomorrow 10pm, reminder tomorrow 6pm |
| `remind me to call mom tomorrow 9am` | "call mom", reminder tomorrow 9am, no deadline |
| `pay rent friday` · `on saturday` · `by fri` · `next monday` · `30 oct` · `on the 5th` · `2026-10-30` | deadline that day, 10pm |
| `on 10/30 11pm` · `30/10` · `10/30/2026` | numeric dates: a number over 12 is the day; otherwise month/day (`5/6` = 6 May) |
| `in 2 hours` · `in 30 min` · `in 3 days` | relative deadlines |
| `this weekend` · `next weekend` · `next week` | the coming Sunday 10pm · the Sunday after · next Monday 10pm |
| `urgent` · `asap` · `important` · `!!` · `p1` / `low priority` · `whenever` · `p3` | priority |

## 1. Routines

Recurring items that create themselves on schedule, for example:

> `Clean dishwasher every month on the 1st sunday at 10am`

creates a routine; on the first Sunday of each month at 10am a "Clean dishwasher" to-do appears (with that deadline), and the routine waits for the next month.

### Where it lives

- **Desktop:** a third column, **Routines**, to the right of To-dos (Groceries | To-dos | Routines). The board's grid gains a column; at narrower desktop widths, Routines can collapse under To-dos.
- **Phone:** a third tab in the bottom bar (Groceries | To-dos | Routines). The add bar's placeholder changes with the tab ("Add a routine: water plants every day 8am").

Each routine row shows its name, a plain-English schedule ("Every month, first Sunday, 10am") and when it next runs. Tapping opens the editor: name, schedule, category, priority, and pause/delete.

### Phrases to support

Read with the same end-of-text approach as deadlines, as a `recurrence` alongside the existing fields:

| Phrase | Rule |
| --- | --- |
| `every day` · `daily` · `every morning` | daily (default 9am, or the given time) |
| `every weekday` · `every weekend` | Mon–Fri · Sat–Sun |
| `every monday` · `every mon and thu` | weekly on those days |
| `every week` · `weekly` | weekly, same weekday as created |
| `every 2 weeks` · `fortnightly` | every n weeks |
| `every month on the 15th` · `monthly` | monthly by day of month (clamped to the month's last day) |
| `every month on the 1st sunday` · `every month on the last friday` | monthly by nth weekday |
| `every year on 3 mar` · `yearly` | yearly |
| `… at 10am` · `… 10am` | time of day for any of the above |
| `… until 31 dec` · `… for 6 weeks` | optional end |

A routine is recognised when the text contains `every …`, `daily`, `weekly`, `monthly` or `yearly`. Then it's added as a routine, not a one-off to-do. The live preview in the add bar shows "Routine: every month, first Sunday, 10am · next: Sun 1 Nov" before you press Enter.

### Data and sync

- New `routines` records: `{ id, name, type, section, priority, rule, time, startDate, endDate?, paused, lastGeneratedFor }`. The name and other details are encrypted like items; `rule` is stored in an [RFC 5545 RRULE](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10)-style string inside the encrypted blob.
- Sync the same way as items (last write wins per routine, tombstones on delete). One new table, `routines`, mirroring `items`.
- **Generation happens on the devices, not the server.** The server can't read the routine, by design. On open, focus and each sync, a device creates any due occurrences, using `lastGeneratedFor` plus a deterministic item id (`hash(routineId + occurrenceDate)`) so two devices generating at once produce the same item, not duplicates.
- So that an occurrence appears even if no device is open, the server can schedule a QStash job at the next occurrence time (it knows only the time, like reminders) that sends a push; the service worker then generates the item and shows "Clean dishwasher is due".
- Missed occurrences while every device was off: create only the most recent one, not a backlog.

## 2. Edit from the add bar (`/edit`)

Typing `/edit` turns the add bar into a picker for changing existing items without leaving the keyboard.

1. Type `/edit` (or press ⌘E on desktop): the field shows an "Editing" pill and the placeholder becomes "Find an item…".
2. Keep typing to filter open items (to-dos and groceries) by name. Matches appear as an autocomplete list (above the field on phones, below on desktop), best match first, ranked by prefix match, then word match, then fuzzy match.
3. ↑/↓ (or tap) to choose. The field then holds the item's text, written out the way the parser understands it, e.g. `Wash shoe tomorrow 10pm urgent, remind at 6pm`.
4. Edit the text and press Enter: it's re-parsed with the same rules and the item is updated (name, category, deadline, reminder, priority). The live preview shows what will change.
5. Esc (or `/` on its own) leaves edit mode.

Building blocks:

- A `formatItem(item)` function that writes an item back as add-bar text, the inverse of `parseInput`. A round-trip test should enforce `parseInput(formatItem(item))` → same item.
- Accessible combobox semantics (`role="combobox"`, `aria-activedescendant`), so it works with VoiceOver and the keyboard.
- Other slash commands could follow the same pattern later: `/done milk`, `/delete …`, `/routine …`.

## Also worth considering

- A native macOS app with a WidgetKit desktop widget, built in Xcode with a free Apple ID (paid membership is only needed to distribute it), instead of Übersicht.
- Per-device logging of phrases the parser didn't recognise (kept on the device), to guide new rules.
