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

**Decision: keep 3 as the default, and expose it. Shipped as N27 the same day.**
Nothing in the engine had to change — `fanCap` was already a `GameConfig` field —
so it was a lobby control, a `3 | 4` field on `startGame.rules`, and narrowing in
`ws.ts`. The help screen reads the value now instead of restating it, and the
round-end screen names the limit the round was settled at.

**This is the finding that best fits the original report.** At the cap, every
payment is exactly half of what a 4-fan table expects: an 8-point hand becomes 16,
and self-drawn it collects 51 rather than 27. A player who learned the game on the
Russian/MahjongSoft variant would read every large hand as short-paid, and when this
was written neither the round-end screen nor the help said which limit was in force.
Both do now.

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

---

# The second pass: the fan values and the compatibility matrix (A67)

The section above closed by saying Table 4 and Table 9 were out of scope and
would be "a second pass with the same method". This is that pass, run
2026-08-13 with the same instruction as the first — **do not take the PDF as
gospel** — and the same standard: at least one source outside it per claim.

## Sources added

| # | Source | Kind |
|---|---|---|
| D | [萌娘百科 — 麻将/番种/岭上开花](https://zh.moegirl.org.cn/zh-hans/麻将/番种/岭上开花) | outside, native-language, per-fan |
| E | [搜狐 — 四川麻将算番计分规则详细介绍](https://www.sohu.com/a/459159080_121073676) | outside, native-language, full table |
| F | [知乎 — 四川麻将游戏规则及胡牌有哪些牌型](https://zhuanlan.zhihu.com/p/620676583) | outside, native-language |

## 7. The fan values corroborate — but only after the *convention* is pinned

**Outside sources cannot be compared to the PDF at face value, because they do
not agree with each other on what "番" counts.** Three conventions are in use:

- Novikov's, which the engine follows: fan is an **exponent**, and the hand is
  worth `2^fan`. 0 fan is 1 point (Table 5, verbatim: `0 1 2 3 4+ → 1 2 4 8 16`).
- The common Chinese app convention: 番 is **1-indexed**, 平胡 is 1番 and the
  multiplier is `2^(番−1)`. E states this outright.
- A third family where 番 **is** the multiplier, so 清七对 is "48番". Present in
  search results and internally inconsistent with the other two.

So the check has to be on the **doublings**, which is convention-free. Converted,
every value agrees:

| Combination | Ours (fan) | Doublings | E | Agrees |
|---|---|---|---|---|
| 碰碰胡 All Pungs | 1 | ×2 | 2番 = ×2 | ✅ |
| 清一色 Full Flush | 2 | ×4 | 3番 = ×4 | ✅ |
| 七对 Seven Pairs | 2 | ×4 | 3番 = ×4 | ✅ |
| 根 Root (each) | 1 | ×2 | 1番 | ✅ |
| 杠 Kong (each) | 1 | ×2 | — | ✅ (= a root) |
| 杠上花 / 杠上炮 / 抢杠 / 海底 | 1 each | ×2 | 1番 each | ✅ |
| 金钩钓 Golden Wait | 1 | ×2 | +1番 | ✅ |

And the **compositions** fall out of the addition rather than needing their own
rows, which is the real test of the scheme: 清对 = 清一色 + 碰碰胡 = 3 fan = ×8,
and 清七对 = 清一色 + 七对 = 4 fan = ×16. E lists both at exactly those
multipliers without deriving them. **Keep.**

### 龙七对 is a genuine variant, and we take the additive reading

Seven pairs containing a four-of-a-kind. Ours is 七对 (2) + 根 (1) = 3 fan = ×8,
which is what addition gives and what the PDF's scheme implies. E gives ×16, and
another summary describes it as replacing 七对 outright and *deducting* a root —
a different accounting that lands on a different number.

This is the same shape as the `fanCap` finding above: **both readings are in
circulation and neither is a mistake.** We take the additive one, because it is
the one the PDF's scheme produces and because it needs no special case. Recorded
rather than changed. Unlike `fanCap` it is not exposed as an option — nobody has
asked, and a second lobby control for one hand shape is not worth the surface.

## 8. Table 9 disagreed with us in exactly two cells, and both were symmetric

Extracted cell by cell. The text layout mangles the columns, so the reading was
checked a second way — counting the `+` marks per row against our own
incompatibility counts — and the two disagreements showed up as **symmetric
pairs**, which is what a real matrix produces and a misread one does not.

| Pair | PDF | Ours (before) | Reachable? |
|---|---|---|---|
| Win after Kong × Under the Sea | compatible | **incompatible** | **yes** |
| Shoot after Kong × Robbing the Kong | incompatible | **compatible** | no |

Every other cell matched, including all nine that can actually fire.

**The second is unreachable and was corrected anyway.** A hand is won either on a
discard *after* a kong or on the tile being added *to* one, never both. The table
is a statement about the rules, and Table 9 makes this one.

**The first is real, and D settles it against the PDF rather than on its
authority:** *"在日本麻将中，杠开不能与海底摸月复合，但在国标麻将、中庸麻雀以及四川麻将
是允许复合的"* — Japanese mahjong forbids the combination; Chinese Official,
Zhongyong and **Sichuan allow it**. So the PDF and the outside source agree, and
we were the outlier.

## 9. …and underneath it, the wall was not noticing it had run out

Chasing whether the pair was reachable found the larger half. A kong replacement
comes off the tail, so **a kong declared with one tile left takes that tile** —
and `wallEndReached` was set only by `applyDraw`. Three kong paths each drew the
replacement inline and all three missed it.

Two consequences, and the second is the one that costs points:

1. The round ran one action past its end, finishing on the next seat's draw.
2. The discard that followed was not "the discard after the last tile", which is
   half of what Table 4 defines Under the Sea to be — so a seat winning on it got
   no fan for it at all. That case is **much more common** than the kong-and-win
   one, and nothing had ever tested it.

`takeKongReplacement` is now the single definition all three paths call.

## Outcome

Measured on the reproduction: a win on a kong replacement that was the last tile
scored Kong + Win after Kong = 2 fan = **4 points**, and now scores
Kong + Win after Kong + Under the Sea = 3 fan = **8 points**, which at the default
cap is a maximum hand. `scoring-cases.test.ts` carries all three assertions.
