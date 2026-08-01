// Lightweight, dependency-free i18n for the client UI.
// Tile faces are glyph-based and stay language-neutral; this covers UI chrome.
import { HELP_STRINGS } from './help.js';

export type Lang = 'en' | 'zh-Hans' | 'zh-Hant';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'zh-Hans', label: '简' },
  { code: 'zh-Hant', label: '繁' },
];

type Vars = Record<string, string | number>;
type Dict = Record<string, string>;

const en: Dict = {
  'app.title': 'Sichuan Mahjong',
  'app.subtitle': 'Bloody Rules — 血战到底',
  'nav.back': '← Back',
  'nav.leave': 'Leave',
  'common.you': '(you)',
  'common.reconnecting': 'Reconnecting…',
  'common.waitingPlayers': 'Waiting for other players…',
  'common.connectionLost': 'Connection lost — could not reach the host.',
  'common.backToMenu': 'Back to menu',
  'common.close': 'Close',

  'landing.host': 'Host a Game',
  'landing.join': 'Join a Game',
  'landing.joinCode': 'Join {code}',
  'landing.practice': 'Practice (vs Bots)',
  'landing.starting': 'Starting…',
  'landing.practiceError': 'Could not start practice — is the server running?',
  'landing.watch': '👀 Watch a Game',
  'landing.hostHint':
    'Host runs the server on their machine. Friends connect over LAN or Tailscale.',
  'landing.about': 'About & Credits',
  'landing.rejoin': 'Rejoin {code}',
  'landing.rejoining': 'Rejoining…',
  'landing.practiceName': 'You',

  'join.title': 'Join a Game',
  'join.code': 'CODE',
  'join.name': 'Your name',
  'join.join': 'Join',
  'join.joining': 'Joining…',
  'join.errCode': 'Enter a 4-character code',
  'join.errName': 'Enter your name',
  'join.errNotFound': 'Lobby not found',
  'join.errConn': 'Connection failed',

  'host.title': 'Host a Game',
  'host.create': 'Create Lobby',
  'host.creating': 'Creating…',
  'host.errCreate': 'Could not create lobby — is the server running?',
  'host.shareCode': '← share code',
  'host.shareUrl': 'Share URL:',
  'host.copy': 'Copy',
  'host.kick': 'Kick',
  'host.addBot': '+ Bot',
  'host.empty': 'empty',
  'host.start': 'Start Game',
  'host.waitingPlayers': 'Waiting for players…',
  'host.botLevel': 'Bot level',
  'host.easy': 'Easy',
  'host.hard': 'Hard',

  'lobby.title': 'Lobby',
  'lobby.waiting': 'waiting…',
  'lobby.waitingHost': 'Waiting for host to start…',
  'lobby.disconnected': 'disconnected',

  'wind.0': 'East',
  'wind.1': 'South',
  'wind.2': 'West',
  'wind.3': 'North',

  'suit.man': 'Man',
  'suit.pin': 'Pin',
  'suit.sou': 'Sou',
  'tile.label': '{rank} of {suit}',
  'tile.man': 'Characters',
  'tile.pin': 'Dots',
  'tile.sou': 'Bamboo',

  'suit.man.full': '万 Man',
  'suit.pin.full': '饼 Pin',
  'suit.sou.full': '条 Sou',

  'huan.title': 'Huan San Zhang — Select 3 tiles to swap',
  'huan.hint': 'Tap 3 tiles of the same suit. They will be passed to the next player.',
  'huan.confirm': 'Confirm Swap',
  'huan.selectMore': 'Select {n} more',

  'void.title': 'Void Declaration — 定缺',
  'void.hint': 'Choose a suit to void. You must discard all tiles of that suit.',
  'void.tilesCount': '{n} tiles',
  'void.yourTiles': 'Your {suit} tiles:',
  'void.none': "(none — you'll use the indicator)",
  'void.confirm': 'Void {suit}',
  'void.choose': 'Choose a suit',

  'play.wall': 'Wall: {n}',
  'play.yourTurn': 'Your turn',
  'play.othersTurn': "{name}'s turn",
  'play.lastDiscard': 'Last discard',
  'play.void': 'Void: {suit}',
  'play.furiten': 'Furiten — can only Hu on self-draw until your next draw',
  'play.heavenly': 'Heavenly Hand!',
  'play.huSelfDraw': 'Hu! (self-draw)',
  'play.kong': 'Kong {label} ({subtype})',
  'play.tapDiscard': 'Tap again to discard',
  'play.flipFirstDiscard': 'Flip your first discard',
  'play.flipHint': 'The void-suit tile you set aside is your first discard — flip it to play it.',
  'play.youWon': 'You won this round!',
  'play.loading': 'Loading game…',
  'play.sort': 'Sort',
  'play.yourDiscards': 'Your discards',
  'play.toggleSound': 'Toggle sound',
  'play.howToPlay': 'How to play',
  'play.scores': 'Scores',
  'play.rotateTitle': 'Rotate to portrait',
  'play.rotateHint':
    'This screen needs more height than landscape gives it — turn your phone upright to keep your hand on screen.',

  'kong.concealed': 'concealed',
  'kong.promoted': 'promoted',
  'kong.postponed': 'postponed',

  'claim.hu': 'Hu!',
  'claim.kong': 'Kong',
  'claim.pung': 'Pung',
  'claim.pass': 'Pass',

  'event.pung': '{name} ponged',
  'event.kong': '{name} konged',
  'event.hu': '{name} declared Hu!',

  'end.title': 'Round End',
  'end.thisRound': 'This Round',
  'end.matchTotal': 'Match Total',
  'end.nextRound': 'Next Round',
  'end.endMatch': 'End Match',
  'end.waitingHost': 'Waiting for the host to start the next round…',
  'end.hu': 'Hu!',
  'end.notReady': 'not ready',
  'end.ready': 'ready',
  'end.details': 'Show scoring details',
  'end.handValue': 'Hand value {n}',

  'fan.Kong': 'Kong',
  'fan.Root': 'Root',
  'fan.AllPungs': 'All Pungs',
  'fan.GoldenWait': 'Golden Wait',
  'fan.FullFlush': 'Full Flush',
  'fan.SevenPairs': 'Seven Pairs',
  'fan.WinAfterKong': 'Win After Kong',
  'fan.ShootAfterKong': 'Shoot After Kong',
  'fan.RobbingTheKong': 'Robbing the Kong',
  'fan.UnderTheSea': 'Under the Sea',
  'fan.multiplier': '{name} ×{n}',

  'ledger.hu': 'Hu payment',
  'ledger.kong': 'Kong',
  'ledger.kongRefund': 'Kong refund',
  'ledger.buTing': 'Bu-ting',
  'ledger.flowerPig': 'Flower Pig',
  'ledger.falseHu': 'False Hu',
  'ledger.voidPenalty': 'Void-suit penalty',
  'ledger.voidMeldPenalty': 'Void-suit meld penalty',
  'ledger.total': 'Total',
  // Qualifiers the engine attaches to a ledger entry: kong subtypes and the
  // reason a kong payment was refunded.
  'ledgerDetail.concealed': 'concealed',
  'ledgerDetail.exposed': 'exposed',
  'ledgerDetail.promoted': 'promoted',
  'ledgerDetail.robbed': 'robbed',
  'ledgerDetail.shootAfterKong': 'shot after kong',
  'ledgerDetail.wallEnd': 'wall end',
  'ledgerDetail.falseHu': 'false Hu',

  'match.title': 'Match Over',
  'match.noScores': 'The match ended before any scores were recorded.',

  'spec.title': 'Watch a Game',
  'spec.watch': 'Watch',
  'spec.connecting': 'Connecting…',
  'spec.errNoGame': 'No game found for that code (it may not have started yet)',
  'spec.connectingGame': 'Connecting to game…',
  'spec.roundOver': 'Round over',
  'spec.spectating': 'Spectating · {code}',
  'spec.dealer': 'Dealer',

  // Server `error` frame codes (F1). Unknown codes fall back to the server's
  // own message, so this list only needs the ones a player can actually hit.
  'err.lobby_not_found': 'That lobby no longer exists',
  'err.lobby_full': 'That lobby is full',
  'err.game_started': 'That game has already started',
  'err.already_joined': 'You have already joined',
  'err.not_host': 'Only the host can do that',
  'err.not_ready': 'The lobby is not full yet',
  'err.no_game': 'No game found for that code',
  'err.bad_action': 'That move was not understood',
  'err.forbidden_action': 'That move is not allowed',
  'err.wrong_seat': 'That move is for another seat',
  'err.rejoin_failed': 'Could not rejoin — that game is over or the server restarted',
};

const zhHans: Dict = {
  'app.title': '四川麻将',
  'app.subtitle': '血战到底',
  'nav.back': '← 返回',
  'nav.leave': '离开',
  'common.you': '（你）',
  'common.reconnecting': '重新连接中…',
  'common.waitingPlayers': '等待其他玩家…',
  'common.connectionLost': '连接已断开 — 无法连上房主。',
  'common.backToMenu': '返回主菜单',
  'common.close': '关闭',

  'landing.host': '创建房间',
  'landing.join': '加入游戏',
  'landing.joinCode': '加入 {code}',
  'landing.practice': '练习（对战电脑）',
  'landing.starting': '开始中…',
  'landing.practiceError': '无法开始练习 — 服务器是否在运行？',
  'landing.watch': '👀 观战',
  'landing.hostHint': '房主在自己的电脑上运行服务器，好友通过局域网或 Tailscale 连接。',
  'landing.about': '关于与致谢',
  'landing.rejoin': '重新加入 {code}',
  'landing.rejoining': '重新加入中…',
  'landing.practiceName': '你',

  'join.title': '加入游戏',
  'join.code': '房间码',
  'join.name': '你的名字',
  'join.join': '加入',
  'join.joining': '加入中…',
  'join.errCode': '请输入4位房间码',
  'join.errName': '请输入名字',
  'join.errNotFound': '找不到房间',
  'join.errConn': '连接失败',

  'host.title': '创建房间',
  'host.create': '创建房间',
  'host.creating': '创建中…',
  'host.errCreate': '无法创建房间 — 服务器是否在运行？',
  'host.shareCode': '← 分享房间码',
  'host.shareUrl': '分享链接：',
  'host.copy': '复制',
  'host.kick': '踢出',
  'host.addBot': '+ 电脑',
  'host.empty': '空位',
  'host.start': '开始游戏',
  'host.waitingPlayers': '等待玩家…',
  'host.botLevel': '电脑难度',
  'host.easy': '简单',
  'host.hard': '高级',

  'lobby.title': '房间',
  'lobby.waiting': '等待中…',
  'lobby.waitingHost': '等待房主开始…',
  'lobby.disconnected': '已断线',

  'wind.0': '东',
  'wind.1': '南',
  'wind.2': '西',
  'wind.3': '北',

  'suit.man': '万',
  'suit.pin': '饼',
  'suit.sou': '条',
  'tile.label': '{rank}{suit}',
  'tile.man': '万',
  'tile.pin': '饼',
  'tile.sou': '条',

  'suit.man.full': '万',
  'suit.pin.full': '饼',
  'suit.sou.full': '条',

  'huan.title': '换三张 — 选择3张牌交换',
  'huan.hint': '点选3张同花色的牌，将传给下一位玩家。',
  'huan.confirm': '确认交换',
  'huan.selectMore': '还需选择 {n} 张',

  'void.title': '定缺',
  'void.hint': '选择一门花色作为缺门，必须打出该花色所有牌。',
  'void.tilesCount': '{n} 张',
  'void.yourTiles': '你的{suit}：',
  'void.none': '（没有 — 将使用指示牌）',
  'void.confirm': '定缺 {suit}',
  'void.choose': '选择花色',

  'play.wall': '牌墙：{n}',
  'play.yourTurn': '该你了',
  'play.othersTurn': '{name} 的回合',
  'play.lastDiscard': '最后打出',
  'play.void': '缺：{suit}',
  'play.furiten': '振听 — 在下次摸牌前只能自摸胡',
  'play.heavenly': '天胡！',
  'play.huSelfDraw': '胡！（自摸）',
  'play.kong': '杠 {label}（{subtype}）',
  'play.tapDiscard': '再次点击打出',
  'play.flipFirstDiscard': '翻开你的第一张打牌',
  'play.flipHint': '定缺时扣下的那张牌就是你的第一张打牌 —— 翻开它即可打出。',
  'play.youWon': '你赢了这局！',
  'play.loading': '加载中…',
  'play.sort': '理牌',
  'play.yourDiscards': '你打出的牌',
  'play.toggleSound': '开关音效',
  'play.howToPlay': '玩法说明',
  'play.scores': '分数',
  'play.rotateTitle': '请切换为竖屏',
  'play.rotateHint': '横屏画面高度不够，将手机竖起才能看到你的手牌。',

  'kong.concealed': '暗杠',
  'kong.promoted': '补杠',
  'kong.postponed': '迟杠',

  'claim.hu': '胡！',
  'claim.kong': '杠',
  'claim.pung': '碰',
  'claim.pass': '过',

  'event.pung': '{name} 碰了',
  'event.kong': '{name} 杠了',
  'event.hu': '{name} 胡了！',

  'end.title': '本局结束',
  'end.thisRound': '本局',
  'end.matchTotal': '总分',
  'end.nextRound': '下一局',
  'end.endMatch': '结束对局',
  'end.waitingHost': '等待房主开始下一局…',
  'end.hu': '胡！',
  'end.notReady': '未听牌',
  'end.ready': '已听牌',
  'end.details': '显示计分明细',
  'end.handValue': '番数 {n}',

  'fan.Kong': '杠',
  'fan.Root': '根',
  'fan.AllPungs': '碰碰胡',
  'fan.GoldenWait': '金钩钓',
  'fan.FullFlush': '清一色',
  'fan.SevenPairs': '七对',
  'fan.WinAfterKong': '杠上花',
  'fan.ShootAfterKong': '杠上炮',
  'fan.RobbingTheKong': '抢杠胡',
  'fan.UnderTheSea': '海底捞月',
  'fan.multiplier': '{name} ×{n}',

  'ledger.hu': '胡牌支付',
  'ledger.kong': '杠',
  'ledger.kongRefund': '退杠',
  'ledger.buTing': '查叫（不听）',
  'ledger.flowerPig': '花猪',
  'ledger.falseHu': '诈胡',
  'ledger.voidPenalty': '缺门罚分',
  'ledger.voidMeldPenalty': '缺门碰杠罚分',
  'ledger.total': '合计',
  'ledgerDetail.concealed': '暗',
  'ledgerDetail.exposed': '明',
  'ledgerDetail.promoted': '补',
  'ledgerDetail.robbed': '被抢杠',
  'ledgerDetail.shootAfterKong': '杠上炮',
  'ledgerDetail.wallEnd': '流局',
  'ledgerDetail.falseHu': '诈胡',

  'match.title': '对局结束',
  'match.noScores': '对局在计分前就结束了。',

  'spec.title': '观战',
  'spec.watch': '观战',
  'spec.connecting': '连接中…',
  'spec.errNoGame': '找不到该房间的对局（可能尚未开始）',
  'spec.connectingGame': '连接对局中…',
  'spec.roundOver': '本局结束',
  'spec.spectating': '观战中 · {code}',
  'spec.dealer': '庄',

  'err.lobby_not_found': '该房间已不存在',
  'err.lobby_full': '房间已满',
  'err.game_started': '该对局已经开始',
  'err.already_joined': '你已经加入了',
  'err.not_host': '只有房主可以这样做',
  'err.not_ready': '房间还没满员',
  'err.no_game': '找不到该房间的对局',
  'err.bad_action': '无法识别该操作',
  'err.forbidden_action': '不允许该操作',
  'err.wrong_seat': '该操作属于其他座位',
  'err.rejoin_failed': '无法重新加入 — 该对局已结束或服务器已重启',
};

const zhHant: Dict = {
  'app.title': '四川麻將',
  'app.subtitle': '血戰到底',
  'nav.back': '← 返回',
  'nav.leave': '離開',
  'common.you': '（你）',
  'common.reconnecting': '重新連線中…',
  'common.waitingPlayers': '等待其他玩家…',
  'common.connectionLost': '連線已中斷 — 無法連上房主。',
  'common.backToMenu': '返回主選單',
  'common.close': '關閉',

  'landing.host': '建立房間',
  'landing.join': '加入遊戲',
  'landing.joinCode': '加入 {code}',
  'landing.practice': '練習（對戰電腦）',
  'landing.starting': '開始中…',
  'landing.practiceError': '無法開始練習 — 伺服器是否在執行？',
  'landing.watch': '👀 觀戰',
  'landing.hostHint': '房主在自己的電腦上執行伺服器，好友透過區域網路或 Tailscale 連線。',
  'landing.about': '關於與致謝',
  'landing.rejoin': '重新加入 {code}',
  'landing.rejoining': '重新加入中…',
  'landing.practiceName': '你',

  'join.title': '加入遊戲',
  'join.code': '房間碼',
  'join.name': '你的名字',
  'join.join': '加入',
  'join.joining': '加入中…',
  'join.errCode': '請輸入4位房間碼',
  'join.errName': '請輸入名字',
  'join.errNotFound': '找不到房間',
  'join.errConn': '連線失敗',

  'host.title': '建立房間',
  'host.create': '建立房間',
  'host.creating': '建立中…',
  'host.errCreate': '無法建立房間 — 伺服器是否在執行？',
  'host.shareCode': '← 分享房間碼',
  'host.shareUrl': '分享連結：',
  'host.copy': '複製',
  'host.kick': '踢出',
  'host.addBot': '+ 電腦',
  'host.empty': '空位',
  'host.start': '開始遊戲',
  'host.waitingPlayers': '等待玩家…',
  'host.botLevel': '電腦難度',
  'host.easy': '簡單',
  'host.hard': '高級',

  'lobby.title': '房間',
  'lobby.waiting': '等待中…',
  'lobby.waitingHost': '等待房主開始…',
  'lobby.disconnected': '已斷線',

  'wind.0': '東',
  'wind.1': '南',
  'wind.2': '西',
  'wind.3': '北',

  'suit.man': '萬',
  'suit.pin': '餅',
  'suit.sou': '條',
  'tile.label': '{rank}{suit}',
  'tile.man': '萬',
  'tile.pin': '餅',
  'tile.sou': '條',

  'suit.man.full': '萬',
  'suit.pin.full': '餅',
  'suit.sou.full': '條',

  'huan.title': '換三張 — 選擇3張牌交換',
  'huan.hint': '點選3張同花色的牌，將傳給下一位玩家。',
  'huan.confirm': '確認交換',
  'huan.selectMore': '還需選擇 {n} 張',

  'void.title': '定缺',
  'void.hint': '選擇一門花色作為缺門，必須打出該花色所有牌。',
  'void.tilesCount': '{n} 張',
  'void.yourTiles': '你的{suit}：',
  'void.none': '（沒有 — 將使用指示牌）',
  'void.confirm': '定缺 {suit}',
  'void.choose': '選擇花色',

  'play.wall': '牌牆：{n}',
  'play.yourTurn': '輪到你',
  'play.othersTurn': '{name} 的回合',
  'play.lastDiscard': '最後打出',
  'play.void': '缺：{suit}',
  'play.furiten': '振聽 — 在下次摸牌前只能自摸胡',
  'play.heavenly': '天胡！',
  'play.huSelfDraw': '胡！（自摸）',
  'play.kong': '槓 {label}（{subtype}）',
  'play.tapDiscard': '再次點擊打出',
  'play.flipFirstDiscard': '翻開你的第一張打牌',
  'play.flipHint': '定缺時扣下的那張牌就是你的第一張打牌 —— 翻開它即可打出。',
  'play.youWon': '你贏了這局！',
  'play.loading': '載入中…',
  'play.sort': '理牌',
  'play.yourDiscards': '你打出的牌',
  'play.toggleSound': '開關音效',
  'play.howToPlay': '玩法說明',
  'play.scores': '分數',
  'play.rotateTitle': '請切換為直向',
  'play.rotateHint': '橫向畫面高度不足，將手機直立才能看到你的手牌。',

  'kong.concealed': '暗槓',
  'kong.promoted': '補槓',
  'kong.postponed': '遲槓',

  'claim.hu': '胡！',
  'claim.kong': '槓',
  'claim.pung': '碰',
  'claim.pass': '過',

  'event.pung': '{name} 碰了',
  'event.kong': '{name} 槓了',
  'event.hu': '{name} 胡了！',

  'end.title': '本局結束',
  'end.thisRound': '本局',
  'end.matchTotal': '總分',
  'end.nextRound': '下一局',
  'end.endMatch': '結束對局',
  'end.waitingHost': '等待房主開始下一局…',
  'end.hu': '胡！',
  'end.notReady': '未聽牌',
  'end.ready': '已聽牌',
  'end.details': '顯示計分明細',
  'end.handValue': '番數 {n}',

  'fan.Kong': '槓',
  'fan.Root': '根',
  'fan.AllPungs': '碰碰胡',
  'fan.GoldenWait': '金鉤釣',
  'fan.FullFlush': '清一色',
  'fan.SevenPairs': '七對',
  'fan.WinAfterKong': '槓上花',
  'fan.ShootAfterKong': '槓上炮',
  'fan.RobbingTheKong': '搶槓胡',
  'fan.UnderTheSea': '海底撈月',
  'fan.multiplier': '{name} ×{n}',

  'ledger.hu': '胡牌支付',
  'ledger.kong': '槓',
  'ledger.kongRefund': '退槓',
  'ledger.buTing': '查叫（不聽）',
  'ledger.flowerPig': '花豬',
  'ledger.falseHu': '詐胡',
  'ledger.voidPenalty': '缺門罰分',
  'ledger.voidMeldPenalty': '缺門碰槓罰分',
  'ledger.total': '合計',
  'ledgerDetail.concealed': '暗',
  'ledgerDetail.exposed': '明',
  'ledgerDetail.promoted': '補',
  'ledgerDetail.robbed': '被搶槓',
  'ledgerDetail.shootAfterKong': '槓上炮',
  'ledgerDetail.wallEnd': '流局',
  'ledgerDetail.falseHu': '詐胡',

  'match.title': '對局結束',
  'match.noScores': '對局在計分前就結束了。',

  'spec.title': '觀戰',
  'spec.watch': '觀戰',
  'spec.connecting': '連線中…',
  'spec.errNoGame': '找不到該房間的對局（可能尚未開始）',
  'spec.connectingGame': '連線對局中…',
  'spec.roundOver': '本局結束',
  'spec.spectating': '觀戰中 · {code}',
  'spec.dealer': '莊',

  'err.lobby_not_found': '該房間已不存在',
  'err.lobby_full': '房間已滿',
  'err.game_started': '該對局已經開始',
  'err.already_joined': '你已經加入了',
  'err.not_host': '只有房主可以這樣做',
  'err.not_ready': '房間還沒滿員',
  'err.no_game': '找不到該房間的對局',
  'err.bad_action': '無法識別該操作',
  'err.forbidden_action': '不允許該操作',
  'err.wrong_seat': '該操作屬於其他座位',
  'err.rejoin_failed': '無法重新加入 — 該對局已結束或伺服器已重啟',
};

// Exported so a test can assert key parity across languages (missing keys silently
// fall back to English at runtime, so drift is otherwise invisible). (A18)
export const catalog: Record<Lang, Dict> = {
  en: { ...en, ...HELP_STRINGS.en },
  'zh-Hans': { ...zhHans, ...HELP_STRINGS['zh-Hans'] },
  'zh-Hant': { ...zhHant, ...HELP_STRINGS['zh-Hant'] },
};

export function translate(lang: Lang, key: string, vars?: Vars): string {
  let s = catalog[lang]?.[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

const STORAGE_KEY = 'sm-lang';

export function loadLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'zh-Hans' || v === 'zh-Hant') return v;
  } catch {
    /* ignore */
  }
  return 'en';
}

/**
 * Keep <html lang> in step with the UI language. It was pinned to "en" in the
 * markup and never changed, so screen readers pronounced Chinese as English
 * and hyphenation used the wrong rules. (F19)
 */
export function applyDocumentLang(lang: Lang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
