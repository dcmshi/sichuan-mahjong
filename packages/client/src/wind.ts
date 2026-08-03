import type { Seat } from '@sichuan-mahjong/engine';

/**
 * A seat's wind, which is its distance from East *against* the seat index.
 *
 * Winds run in play order, and play runs counterclockwise by decreasing seat, so
 * South is `dealer - 1`: the seat to East's right, which is where a table seats
 * them. (N22)
 *
 * Pure and exported because the client suite runs without a DOM — and because the
 * browser reaches the wrong-looking cases only by luck: the dealer is seat 0 a
 * quarter of the time, which is exactly how nine screens came to read the
 * absolute index as a wind and looked right in every hand anyone checked. (N26)
 */
export function windOfSeat(seat: Seat, dealer: Seat): number {
  return (dealer - seat + 4) % 4;
}

/** The catalog key naming that wind. */
export function windKey(seat: Seat, dealer: Seat) {
  return `wind.${windOfSeat(seat, dealer)}` as 'wind.0' | 'wind.1' | 'wind.2' | 'wind.3';
}

/**
 * The catalog key naming a *chair*, which is not a wind.
 *
 * **A wind is a per-round fact and a seat is a durable one**, and N26 settled
 * that the two are not interchangeable labels for one column. Three screens have
 * no round in view and were labelling seats with winds anyway: the lobby and the
 * host setup, where the dice have not been thrown and there is no East yet, and
 * the match totals, where the number spans rounds that each had a different one.
 * Those get a chair; everything with a dealer in hand gets `windKey`.
 */
export function seatKey(seat: Seat | number) {
  return `seat.${seat}` as 'seat.0' | 'seat.1' | 'seat.2' | 'seat.3';
}

/**
 * The wind when a round is in hand, the chair when it is not.
 *
 * The absent case is real rather than defensive: `RoundResult.dealer` is optional
 * because rows persisted before N26 don't carry it, and a rejoin at round end
 * replays a stored result. Naming the chair is the honest answer there — better
 * than printing a wind derived from a dealer that was guessed.
 */
export function seatLabelKey(seat: Seat | number, dealer: Seat | null | undefined) {
  return dealer == null ? seatKey(seat) : windKey(seat as Seat, dealer);
}
