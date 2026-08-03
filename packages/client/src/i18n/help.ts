// Long-form help & about copy, kept out of index.ts to keep the main catalog lean.
// Merged into the main catalog by index.ts. Keys: htp.* (How to Play), about.*.
import type { Lang } from './index.js';

type Dict = Record<string, string>;

const en: Dict = {
  'htp.title': 'How to Play',
  'htp.overview.title': 'Overview',
  'htp.overview.body': `Sichuan Mahjong (Bloody Rules / 血战到底) is a 4-player tile game played with 108 tiles: 1–9 in three suits (Man 万, Pin 饼, Sou 条). No winds or dragons.

Each round continues until 3 players have won or the wall is exhausted — winning players sit out but the game goes on.`,
  'htp.setup.title': 'Setup',
  'htp.setup.body': `• Huan San Zhang: each player secretly passes 3 tiles of one suit to the next player.
• Void Declaration (定缺): each player declares one suit to permanently void. You must discard all tiles of that suit.
• The tile you set aside when declaring is placed face down — it is your first discard. On your first turn you draw as usual and flip it instead of discarding from hand. (If your hand held none of that suit, you use the indicator and simply discard normally.)`,
  'htp.turn.title': 'Your Turn',
  'htp.turn.body': `• Draw a tile from the wall.
• Optionally declare a Kong (4-of-a-kind) to draw a replacement tile.
• Declare Hu if your hand is complete, otherwise discard a tile.

Turn order: counter-clockwise (East → South → West → North).`,
  'htp.claims.title': 'Claims',
  'htp.claims.body': `When another player discards, you may claim:
• Pung (碰): 3-of-a-kind using the discard.
• Kong (杠): 4-of-a-kind using the discard.
• Hu (胡): complete your winning hand.

Priority: Hu > Kong > Pung. No chow claims in Sichuan.`,
  'htp.winning.title': 'Winning Hand',
  'htp.winning.body': `A winning hand is either:
• 4 sets (pung/kong/chow) + 1 pair — all in non-voided suits.
• 7 distinct pairs — all in non-voided suits.

Chows (3 consecutive) can only be built in your concealed hand, not claimed off discards.`,
  'htp.shape.standard': 'Four sets + a pair — here a chow, a pung, a chow, a pung, and the pair.',
  'htp.shape.sevenPairs': 'Seven pairs, and nothing claimed. A four-of-a-kind counts as two pairs.',
  'htp.shape.fullFlush':
    'Every tile in one suit. You void a suit before the first turn, so a flush is one suit away from where every hand starts.',
  'htp.shape.voided': 'Voided: {suit}',
  'htp.scoring.title': 'Scoring (Fan)',
  'htp.scoring.body': `Hand value = 2^fan, capped at 2^{cap} = {max} points.

Self-draw Hu: each other player pays hand value + 1.
Discard Hu: discarder pays hand value.`,
  'htp.fan.title': 'What you can win with',
  'htp.fan.value': '{n} fan',
  'htp.fan.stack': 'up to ×{n}',
  'htp.fan.cap':
    'Fan add up and then cap at {cap}, so {max} points is the most any hand pays at this table. Not every pair combines: seven pairs rules out kongs, all pungs and the golden wait.',
  'htp.fan.FullFlush':
    'Every tile in one suit — the void suit already gets you a third of the way.',
  'htp.fan.SevenPairs': 'Seven pairs with nothing claimed; a four-of-a-kind counts as two of them.',
  'htp.fan.AllPungs': 'Four pungs or kongs and a pair — no chow anywhere in the hand.',
  'htp.fan.GoldenWait': 'An all-pung hand won on the tile that completes the pair.',
  'htp.fan.Kong': 'Each kong you declare, concealed or exposed.',
  'htp.fan.Root': 'Each four-of-a-kind standing in a seven-pairs hand as two pairs.',
  'htp.fan.WinAfterKong': 'You self-draw the replacement tile after your own kong, and it wins.',
  'htp.fan.ShootAfterKong': 'You win on the tile discarded straight after a kong.',
  'htp.fan.RobbingTheKong': 'You win on the tile another player was adding to their pung.',
  'htp.fan.UnderTheSea': 'You win on the last tile the wall has to give.',
  'htp.kongs.title': 'Kongs',
  'htp.kongs.body': `Concealed Kong: 4-of-a-kind in hand. Each non-Hu player pays 2.
Exposed Kong (off discard): discarder pays 2.
Promoted Kong: add drawn tile to existing pung. Each pays 1.

After any kong, draw a replacement tile from the other end of the wall.`,
  'htp.furiten.title': 'Furiten',
  'htp.furiten.body':
    'If you skip a discard you could have won on, you enter Furiten — you cannot win off discards until your next self-draw. You can still win by self-draw or on a higher-value hand.',

  'about.title': 'About',
  'about.app.title': 'Sichuan Mahjong',
  'about.app.body':
    'A local-multiplayer implementation of Sichuan Mahjong (Bloody Rules / 血战到底). Host on your own machine; friends join over LAN or Tailscale. Code is MIT-licensed.',
  'about.tiles.title': 'Tile Graphics',
  'about.tiles.body':
    'Tile faces are SVG assets sourced from Wikimedia Commons under the CC-BY-SA 4.0 license. Per-file attribution is listed in public/tiles/credits.json. The tile back is an original work. The CC-BY-SA license applies only to the bundled SVGs; the surrounding code remains MIT.',
  'about.rules.title': 'Rules Reference',
  'about.rules.body': "Canonical ruleset: Vitaly Novikov, Sichuan Mahjong? It's that simple!",
  'about.license.title': 'License',
  'about.license.body': 'MIT',
};

const zhHans: Dict = {
  'htp.title': '玩法说明',
  'htp.overview.title': '概述',
  'htp.overview.body': `四川麻将（血战到底）是4人牌类游戏，使用108张牌：三门花色 1–9（万、饼、条），没有风牌和箭牌。

每局持续到3名玩家胡牌或牌墙摸完为止——已胡牌的玩家退出，但牌局继续。`,
  'htp.setup.title': '准备',
  'htp.setup.body': `• 换三张：每位玩家暗中将同花色的3张牌传给下一位玩家。
• 定缺：每位玩家选定一门花色作为缺门，必须打出该花色的所有牌。
• 定缺时扣下的那张牌反扣在桌面中央 —— 它就是你的第一张打牌。轮到你第一手时照常摸牌，然后翻开它，而不是从手牌中打出。（若手中本无该花色，则用指示牌，第一手正常打牌。）`,
  'htp.turn.title': '你的回合',
  'htp.turn.body': `• 从牌墙摸一张牌。
• 可选择杠牌（四张相同），并补摸一张。
• 若已成胡牌则宣告胡，否则打出一张牌。

行牌顺序：逆时针（东 → 南 → 西 → 北）。`,
  'htp.claims.title': '吃碰杠胡',
  'htp.claims.body': `当其他玩家打出一张牌时，你可以：
• 碰：用手牌凑成三张相同。
• 杠：用手牌凑成四张相同。
• 胡：完成你的胡牌。

优先级：胡 > 杠 > 碰。四川麻将不能吃牌。`,
  'htp.winning.title': '胡牌牌型',
  'htp.winning.body': `胡牌牌型为以下之一：
• 4副面子（碰/杠/顺）+ 1对将——均为非缺门花色。
• 七对——均为非缺门花色。

顺子（三张连续）只能在自己的暗手中组成，不能吃别人打出的牌。`,
  'htp.shape.standard': '四副面子 + 一对将：这里是顺子、刻子、顺子、刻子，再加一对将。',
  'htp.shape.sevenPairs': '七组对子，且没有任何副露。四张相同算作两对。',
  'htp.shape.fullFlush': '全部牌为同一花色。开局就要定缺，所以清一色只差再舍掉一门。',
  'htp.shape.voided': '缺门：{suit}',
  'htp.scoring.title': '算番',
  'htp.scoring.body': `番数对应分值 = 2的番数次方，封顶 2^{cap} = {max} 分。

自摸胡：其他每名玩家支付 番值 + 1。
点炮胡：点炮者支付 番值。`,
  'htp.fan.title': '可以做出的番种',
  'htp.fan.value': '{n}番',
  'htp.fan.stack': '最多 ×{n}',
  'htp.fan.cap':
    '番数相加后封顶{cap}番，所以本桌一副牌最多{max}分。部分番种不能同时成立：七对不能与杠、碰碰胡、金钩钓同时计算。',
  'htp.fan.FullFlush': '全部牌为同一花色。反正开局要定缺，起手就已经少一门。',
  'htp.fan.SevenPairs': '七组对子，且没有任何副露；四张相同算作其中两对。',
  'htp.fan.AllPungs': '四副刻子或杠 + 一对将，全手没有顺子。',
  'htp.fan.GoldenWait': '碰碰胡，且胡的那张牌正好补上将牌。',
  'htp.fan.Kong': '每杠一次计一番，暗杠明杠皆可。',
  'htp.fan.Root': '七对中每有一组四张相同（算作两对）计一番。',
  'htp.fan.WinAfterKong': '杠后补摸的那张牌自摸胡。',
  'htp.fan.ShootAfterKong': '杠后打出的那张牌被你胡。',
  'htp.fan.RobbingTheKong': '别人补杠时，你胡他加上去的那张牌。',
  'htp.fan.UnderTheSea': '胡牌墙最后一张牌。',
  'htp.kongs.title': '杠',
  'htp.kongs.body': `暗杠：手中四张相同。每名未胡玩家支付 2。
明杠（碰别人打出的牌）：点杠者支付 2。
补杠（将摸到的牌加到已有的碰上）：每人支付 1。

任何杠之后，从牌墙另一端补摸一张牌。`,
  'htp.furiten.title': '振听',
  'htp.furiten.body':
    '如果你放弃了一张本可胡的牌，你将进入振听——在下次自摸之前不能点炮胡。你仍可通过自摸或更大牌型胡牌。',

  'about.title': '关于',
  'about.app.title': '四川麻将',
  'about.app.body':
    '四川麻将（血战到底）的本地多人实现。在自己的电脑上做房主，好友通过局域网或 Tailscale 加入。代码采用 MIT 许可。',
  'about.tiles.title': '牌面素材',
  'about.tiles.body':
    '牌面为来自 Wikimedia Commons 的 SVG 素材，采用 CC-BY-SA 4.0 许可。逐文件署名见 public/tiles/credits.json。牌背为原创作品。CC-BY-SA 许可仅适用于打包的 SVG；其余代码仍为 MIT。',
  'about.rules.title': '规则参考',
  'about.rules.body': '权威规则：Vitaly Novikov，《四川麻将？就这么简单！》',
  'about.license.title': '许可',
  'about.license.body': 'MIT',
};

const zhHant: Dict = {
  'htp.title': '玩法說明',
  'htp.overview.title': '概述',
  'htp.overview.body': `四川麻將（血戰到底）是4人牌類遊戲，使用108張牌：三門花色 1–9（萬、餅、條），沒有風牌和箭牌。

每局持續到3名玩家胡牌或牌牆摸完為止——已胡牌的玩家退出，但牌局繼續。`,
  'htp.setup.title': '準備',
  'htp.setup.body': `• 換三張：每位玩家暗中將同花色的3張牌傳給下一位玩家。
• 定缺：每位玩家選定一門花色作為缺門，必須打出該花色的所有牌。
• 定缺時扣下的那張牌反扣在桌面中央 —— 它就是你的第一張打牌。輪到你第一手時照常摸牌，然後翻開它，而不是從手牌中打出。（若手中本無該花色，則用指示牌，第一手正常打牌。）`,
  'htp.turn.title': '你的回合',
  'htp.turn.body': `• 從牌牆摸一張牌。
• 可選擇槓牌（四張相同），並補摸一張。
• 若已成胡牌則宣告胡，否則打出一張牌。

行牌順序：逆時針（東 → 南 → 西 → 北）。`,
  'htp.claims.title': '吃碰槓胡',
  'htp.claims.body': `當其他玩家打出一張牌時，你可以：
• 碰：用手牌湊成三張相同。
• 槓：用手牌湊成四張相同。
• 胡：完成你的胡牌。

優先級：胡 > 槓 > 碰。四川麻將不能吃牌。`,
  'htp.winning.title': '胡牌牌型',
  'htp.winning.body': `胡牌牌型為以下之一：
• 4副面子（碰/槓/順）+ 1對將——均為非缺門花色。
• 七對——均為非缺門花色。

順子（三張連續）只能在自己的暗手中組成，不能吃別人打出的牌。`,
  'htp.shape.standard': '四副面子 + 一對將：這裡是順子、刻子、順子、刻子，再加一對將。',
  'htp.shape.sevenPairs': '七組對子，且沒有任何副露。四張相同算作兩對。',
  'htp.shape.fullFlush': '全部牌為同一花色。開局就要定缺，所以清一色只差再捨掉一門。',
  'htp.shape.voided': '缺門：{suit}',
  'htp.scoring.title': '算番',
  'htp.scoring.body': `番數對應分值 = 2的番數次方，封頂 2^{cap} = {max} 分。

自摸胡：其他每名玩家支付 番值 + 1。
點炮胡：點炮者支付 番值。`,
  'htp.fan.title': '可以做出的番種',
  'htp.fan.value': '{n}番',
  'htp.fan.stack': '最多 ×{n}',
  'htp.fan.cap':
    '番數相加後封頂{cap}番，所以本桌一副牌最多{max}分。部分番種不能同時成立：七對不能與槓、碰碰胡、金鉤釣同時計算。',
  'htp.fan.FullFlush': '全部牌為同一花色。反正開局要定缺，起手就已經少一門。',
  'htp.fan.SevenPairs': '七組對子，且沒有任何副露；四張相同算作其中兩對。',
  'htp.fan.AllPungs': '四副刻子或槓 + 一對將，全手沒有順子。',
  'htp.fan.GoldenWait': '碰碰胡，且胡的那張牌正好補上將牌。',
  'htp.fan.Kong': '每槓一次計一番，暗槓明槓皆可。',
  'htp.fan.Root': '七對中每有一組四張相同（算作兩對）計一番。',
  'htp.fan.WinAfterKong': '槓後補摸的那張牌自摸胡。',
  'htp.fan.ShootAfterKong': '槓後打出的那張牌被你胡。',
  'htp.fan.RobbingTheKong': '別人補槓時，你胡他加上去的那張牌。',
  'htp.fan.UnderTheSea': '胡牌牆最後一張牌。',
  'htp.kongs.title': '槓',
  'htp.kongs.body': `暗槓：手中四張相同。每名未胡玩家支付 2。
明槓（碰別人打出的牌）：點槓者支付 2。
補槓（將摸到的牌加到已有的碰上）：每人支付 1。

任何槓之後，從牌牆另一端補摸一張牌。`,
  'htp.furiten.title': '振聽',
  'htp.furiten.body':
    '如果你放棄了一張本可胡的牌，你將進入振聽——在下次自摸之前不能點炮胡。你仍可透過自摸或更大牌型胡牌。',

  'about.title': '關於',
  'about.app.title': '四川麻將',
  'about.app.body':
    '四川麻將（血戰到底）的本地多人實現。在自己的電腦上做房主，好友透過區域網路或 Tailscale 加入。程式碼採用 MIT 授權。',
  'about.tiles.title': '牌面素材',
  'about.tiles.body':
    '牌面為來自 Wikimedia Commons 的 SVG 素材，採用 CC-BY-SA 4.0 授權。逐檔案署名見 public/tiles/credits.json。牌背為原創作品。CC-BY-SA 授權僅適用於打包的 SVG；其餘程式碼仍為 MIT。',
  'about.rules.title': '規則參考',
  'about.rules.body': '權威規則：Vitaly Novikov，《四川麻將？就這麼簡單！》',
  'about.license.title': '授權',
  'about.license.body': 'MIT',
};

export const HELP_STRINGS: Record<Lang, Dict> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant };
