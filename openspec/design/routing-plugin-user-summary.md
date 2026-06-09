# Routing in Wanderer: A User Perspective

> **Non-normative summary**
> This document explains the planned routing plugin changes from the perspective of users, admins, and advanced users. The technical target architecture lives in `routing-plugin.md`; the binding requirements live in `openspec/specs/` and `openspec/changes/`.

## At a Glance

Wanderer turns routing into a plugin feature: simple everyday planning, more control when you want it, and the freedom to combine different routing sources.

1. **Routing is now pluggable**
Routing moves out of the fixed Valhalla integration into the plugin system, opening Wanderer to different engines. Valhalla stays as the first; BRouter joins as a strong second.

2. **The best of several engines**
Different engines excel at different things — profiles, routing logic, surfaces, alternatives, elevation — and Wanderer puts those strengths to use without making you deal with provider details.

3. **Simple by default**
The everyday flow stays simple: pick an activity, place anchors, get a route. No engine choice, no profile mechanics, no flood of variants.

4. **Power when you want it**
When you need more, there are variants, custom profiles, and native engine options — all kept out of the default path.

5. **Quality, not quantity**
Ask for variants and Wanderer weighs candidates by distance, duration, climb, warnings, and how different they are, then shows a curated pick.

6. **Mix routing and elevation**
Your route can come from one engine and its elevation from another — e.g. BRouter for the route, Valhalla for the climb.

7. **Admins set the power level**
An instance can stay deliberately simple or unlock advanced features — uploads, variants, multiple engines, advanced controls — with defaults that fit its community.

## How Planning Works

Planning feels the same as today: drop your anchor points and Wanderer connects them into one best route. It uses your default engine automatically — you don't pick one.

By default you get a single route, never an unrequested pile of options. Variants only run when you explicitly ask for them (see Variants below).

## Pick a Goal, Not an Engine

Tell Wanderer what you're planning — a hike, a relaxed bike tour, a gravel ride — and it picks the engine and profile that deliver it. You never touch Valhalla `costing` models or BRouter `.brf` files.

You choose from a small set of shared goals:

- **On foot:** `walk`, `hike`, `run`
- **By bike:** `bike_balanced` (touring), `bike_fast`, `gravel`, `mtb`
- **Motorized:** `car`

The same goal means the same thing across every engine, which buys you two things: your choice stays meaningful no matter which engine runs behind it, and comparisons stay fair — a gravel plan is matched against other gravel routes, never against a road-bike suggestion.

## Variants

Variants are off by default — you ask for them when you want choices, and you can set a default count. You tell Wanderer how many you'd like to see ("show me up to three"), not how hard to work each engine; it then requests candidates, evaluates them, and returns at most that many.

The goal is a few genuinely different, good routes — not a long list of near-identical lines. Wanderer judges candidates on distance, duration, climb, warnings, and how different they actually are, then shows a curated pick.

Where the routes come from stays in the background: some may quietly come from different engines, but you just see routes, not engine names. Provenance shows up only in details, advanced, or debug views.

Wanderer also adapts to context: on very short segments it may offer fewer variants — several options over a few hundred meters rarely help — while longer segments and whole tours benefit more.

## Connecting Your Anchor Points

By default, Wanderer routes each segment — the stretch between two neighboring points — on its own. That keeps things flexible: you can later re-route or compare a single segment, and Wanderer can even combine the best segment from different engines into one route.

If an engine supports it, you can instead let one engine plan the whole route through all your points in a single pass — called "via" routing. This can give a smoother overall result, but it's that one engine's route: it isn't stitched together from different engines, and it's only offered when an engine can do it.

Most of the time you won't think about any of this — the default just works.

## Elevation Data

Attaching elevation to a route is its own capability, separate from producing the route line — so your route can come from BRouter while its climb and descent come from Valhalla.

That decoupling is only about the height values added to the finished line. Routing itself can still need elevation: goals like avoiding steep climbs, honoring a hill preference, or capping difficulty depend on the engine having terrain data. Either way elevation matters — climb and descent shape how a route feels and how much effort it takes, and they help Wanderer rank variants — so by default Wanderer adds it whenever an elevation source is set up.

## Everyday Tuning

A few simple knobs let you nudge a route, and they work the same no matter which engine runs behind them. You only see the ones that fit your activity. Examples:

- Speed, as a relative slow-to-fast preference.
- Lean toward or away from hills.
- Avoid poor surfaces.
- Use roads more or less.
- Maximum hiking difficulty.
- Vehicle height, width, or top speed for motor routing.

The plugin interprets each knob for your chosen activity: "fast" means one thing on foot, another on a road bike or in a car.

## Advanced Tuning

When you want full control, each engine can expose its own native options in an advanced section, specific to the chosen engine and profile. Examples:

- Valhalla can expose concrete `costing_options`.
- BRouter can expose parameters from profiles or profile templates.
- GraphHopper could expose custom-model options, where the instance supports them.

These are deliberately engine-specific, and Wanderer doesn't try to sync them across engines. If an option should work everywhere and stay comparable, it belongs as a generic everyday knob instead.

## Custom Profiles

If a plugin supports it, you can bring your own provider profile — most notably a BRouter `.brf`, where the profile *is* the routing logic. Wanderer uses it just like a built-in one.

Your uploaded profiles stay with Wanderer: it stores them and hands them to the plugin only when needed for a route. Plugins never keep files of their own.

## Admin Defaults

Admins shape how an instance feels — simple out of the box, or as powerful as needed. They set instance-wide defaults that every new user inherits without any setup:

- primary routing engine and elevation engine
- default intent and default routing mode (`segment` or `via`)
- which optional features are available at all — variants, multi-engine candidates, via mode, profile uploads, advanced controls
- category-to-intent mappings, for the trail categories that actually exist in the instance

Defaults apply live: change one, and it takes effect for everyone who hasn't overridden it. Category mappings only cover categories that exist — typically `Hiking -> hike`, `Walking -> walk`, and `Biking -> bike_balanced`, while `Climbing`, `Skiing`, or `Canoeing` usually have no meaningful road/path routing and stay unmapped.

## Existing and Imported Trails

From now on, routes you plan in Wanderer remember how each segment was made — the activity, profile, engine, and key settings. So if you later change your settings mid-plan, Wanderer can spot which of these segments no longer match and offer to re-route them. It never does this silently: changing settings is always allowed, and refreshing older segments is your choice.

Routes made before this, and imported GPX files, carry no such history. Wanderer leaves them untouched — no mismatch warnings, no surprises — until you actively edit an anchor or segment.

## What Stays in the Background?

Wanderer keeps the plumbing out of sight. You never have to deal with:

- which provider API was called
- what Valhalla's or BRouter's profiles are named internally
- how many candidates each engine was asked for
- connector or credential details

All of that stays with the host, the plugins, and the admin's configuration.

## What You Get

An editor that stays as simple as today by default — and grows with you:

- Valhalla keeps working as before.
- BRouter can join as a second engine.
- Route and elevation can come from different engines — say BRouter for the route, Valhalla for the climb.
- Variants are there when you want them, from one engine or several, but never forced on every plan.
- Advanced users get custom profiles and native options, without cluttering the simple path.
