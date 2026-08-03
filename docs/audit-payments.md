# Payments, checked against sources other than the PDF (N21)

A player at a real table reported a hand as settled wrongly, and on being asked
said it was the **payment** that was disputed rather than the fan. This is that
check: every payment rule the engine implements, against Novikov's text and at
least one source outside it, with a decision per item.

**Headline: the engine agrees with every source on every payment rule. The one
real divergence is not a payment at all — it is the fan cap, which Novikov states
as a variant with two common values, and we ship the lower one.** A table playing
the 4-fan variant would see every capped hand pay half what they expect, and they
would be right to dispute it. That is the likeliest explanation of the report.

Two comprehension bugs were also found and fixed on the way, one of which
mislabels the payment basis in Chinese.

## Sources

| # | Source | Kind |
|---|---|---|
| P | `SBR_ENG_part_1.pdf` — Novikov, *Sichuan Mahjong? It's that simple!*, Tables 5–7 and the False "Hu" section | canonical, in-repo |
| A | [World Mahjong Tour — Sichuan Mahjong Blood Battle rules](https://worldmahjongtour.live/tournament-rules-sichuan-mahjong/) | outside, tournament |
| B | [Mahjong Pros — SBR payout table](https://mahjongpros.com/blogs/mahjong-rules-and-scoring-tables/sichuan-bloody-rules-sbr-mahjong-payout-table) | outside, commercial |
| C | Chinese-language rule summaries of 血战到底 (刮风下雨 kong scoring), via 知乎 / 新浪 | outside, native-language |

## Findings

### 1. A seat that has won pays nothing more — **confirmed**

Novikov, verbatim: *"After the player declares 'Hu', he is temporarily out of the
deal and no longer participates in gaining or losing points until the deal is
finished."* A and C agree; A puts it as the three remaining players carrying on.

Every payment loop in `actions.ts` skips `status === 'hu'`. **Keep.**

This is the rule most likely to be *perceived* as wrong, because it means the same
hand is worth less the later it lands: a self-drawn 8-point hand collects 27 with
nobody out and 18 with one player out. `payments.test.ts` pins both.

### 2. Self-draw takes `handValue + 1` from each; a discard win takes `handValue` from the discarder alone — **confirmed**

Novikov Table 6, verbatim:

| Hu payment event | Points | Who pays | Who receives |
|---|---|---|---|
| Hu declared on a discard | Hand Value | The discarder | Each player declaring Hu on this discard |
| Hu declared on a self-drawn tile | Hand Value + 1 | Each non-Hu player | The player declaring Hu |

A and B both state the same, including the `+ 1`. **Keep.**

The asymmetry is large — an 8-point hand is 27 self-drawn and 8 off a discard —
and it is correct.

### 3. Kong payments — **confirmed, against one dissenting source**

Novikov, verbatim: *"the player declaring Concealed Kong receives 2 points from
each non-Hu player; the player declaring Melded Kong receives 2 points from the
discarder; the player declaring Promoted Kong receives 1 point from each non-Hu
player (but only in case of a freshly taken from the wall tile, otherwise … such a
kong is named Postponed Kong and does not bring points at all)."*

| Kong | Ours | P | A | B |
|---|---|---|---|---|
| Concealed (暗杠) | 2 from each non-Hu | 2 from each | 2 from each | **1 from each** |
| Melded from a discard (明杠) | 2 from the discarder | 2 from discarder | 2 from discarder | **1 from discarder** |
| Promoted (补杠) | 1 from each non-Hu | 1 from each | 1 from each | 1 from each |
| Postponed | nothing | nothing | — | — |

**B is the outlier and is outvoted 3–1.** C independently gives 暗杠 2×, 明杠 2×
from the discarder, 补杠 1×, and also states the postponed-kong rule (*只有立即补杠
才能计分*). **Keep.**

The three no-payment paths Novikov lists — robbed promoted kong, a Hu on the tile
discarded after the kong, and the declarer being non-ready at wall end — are the
three refund paths in `kongPaymentLog`. C describes the second as 呼叫转移, the
kong points transferring to the winner.

### 4. False Hu is a flat 8 to each opponent still in the deal — **confirmed**

Novikov, verbatim: *"must pay 8 points to each player who was still in the game at
the time of the declaration … If false 'Hu' was declared first in the deal, then
after it was declared there were three players left in the game, so the total
penalty is 24 points."* Kong payments by the offending player are also returned.

`payments.test.ts` asserts exactly `[-24, 8, 8, 8]`, and `[-16, 0, 8, 8]` with one
seat already out — the "still in the game" scoping. A states it as "the maximum
points possible", which at a 3-fan cap *is* 8, so A is consistent rather than
contradictory. **Keep**, and note that §5.9 already records the fix that stopped
this being scaled by `fanCap`.

### 5. Wall-end payouts use the theoretical maximum of a ready hand — **confirmed**

Novikov Table 6 and the following list: *"each non-Hu 'non-ready' player pays each
non-Hu 'ready' player the theoretical maximum value of the hand"*, plus the
48-point forbidden-suit penalty for which *"other players do not receive points"* —
which is why ours goes to the pot rather than to opponents. A agrees ("based on the
maximum fan value"); B states the same in its own words. **Keep.**

### 6. `fanCap: 3` — **a real divergence, and it is a choice we never surfaced**

Novikov, verbatim: *"the hand value is doubled from the starting value of 1 point
as many times as the total of the fans turned out, however, to a certain limit.
**Typical value of that limit is 3 (as in MIL's version of rules) or 4 (as played
in Russia and on the MahjongSoft site).** Hence, maximal hand value is 2\*2\*2=8
points for the limit of 3 fans, and 2\*2\*2\*2=16 points for the limit of 4 fans."*
His own Table 5 is drawn at the 4-fan limit.

So the cap is **explicitly a variant**, and both values are canonical. A calls 3
fan / 8 points "the general cap … for competitive rules", which is the ground for
our default.

**Decision: keep 3 as the default, and file exposing it — see [N27](../TODO.md).**
It is already a `GameConfig` field, so nothing in the engine has to change; it is
simply not reachable from the lobby, and there is no way for a table to say which
variant they play.

**This is the finding that best fits the original report.** At the cap, every
payment is exactly half of what a 4-fan table expects: an 8-point hand becomes 16,
and self-drawn it collects 51 rather than 27. A player who learned the game on the
Russian/MahjongSoft variant would read every large hand as short-paid, and neither
the round-end screen nor the help says which limit is in force.

## Comprehension bugs found by this audit, and fixed

Neither changes a payment. Both change what a player is told a payment *was*,
which is the same dispute from the other end.

1. **The Chinese round-end screen labelled points as fan.** `end.handValue` is
   passed `handValue` — the point value, 1/2/4/8 — and both Chinese catalogs
   rendered it as 番数 / 番數, "number of fan". So a 4-point hand read as "4 fan",
   which at a 3-fan cap is not even reachable, and which a reader would convert to
   16 points. Now 点数 / 點數.

2. **"You won this round!"** rendered the instant you Hu, and was wrong three ways:
   the round is not over (Bloody Rules runs until three players Hu or the wall
   ends), you have not necessarily won (three seats can Hu, and the round-end
   ranking is by score, so a cheap early Hu can finish last), and it said nothing
   about what the hand was worth. Now `Hand complete · {n} points`.

## What is still unchecked

The **fan values themselves** (Table 4) and the compatibility matrix (Table 9) are
out of scope here: the report was about a payment, and those are already
property-tested for self-consistency and symmetry, and asserted against the help
screen's table. If a fan is ever disputed, that is a second pass with the same
method — and `scoring-cases.test.ts` is where the answers would land.
