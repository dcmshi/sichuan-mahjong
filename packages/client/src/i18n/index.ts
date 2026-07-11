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

  'wind.0': 'East',
  'wind.1': 'South',
  'wind.2': 'West',
  'wind.3': 'North',

  'suit.man': 'Man',
  'suit.pin': 'Pin',
  'suit.sou': 'Sou',
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
  'play.youWon': 'You won this round!',
  'play.loading': 'Loading game…',
  'play.sort': 'Sort',

  'kong.concealed': 'concealed',
  'kong.promoted': 'promoted',
  'kong.postponed': 'postponed',

  'claim.hu': 'Hu!',
  'claim.kong': 'Kong',
  'claim.pung': 'Pung',
  'claim.pass': 'Pass',

  'end.title': 'Round End',
  'end.thisRound': 'This Round',
  'end.matchTotal': 'Match Total',
  'end.nextRound': 'Next Round',
  'end.endMatch': 'End Match',
  'end.waitingHost': 'Waiting for the host to start the next round…',
  'end.hu': 'Hu!',

  'spec.title': 'Watch a Game',
  'spec.watch': 'Watch',
  'spec.connecting': 'Connecting…',
  'spec.errNoGame': 'No game found for that code (it may not have started yet)',
  'spec.connectingGame': 'Connecting to game…',
  'spec.roundOver': 'Round over',
  'spec.spectating': 'Spectating · {code}',
};

const zhHans: Dict = {
  'app.title': '四川麻将',
  'app.subtitle': '血战到底',
  'nav.back': '← 返回',
  'nav.leave': '离开',
  'common.you': '（你）',
  'common.reconnecting': '重新连接中…',
  'common.waitingPlayers': '等待其他玩家…',

  'landing.host': '创建房间',
  'landing.join': '加入游戏',
  'landing.joinCode': '加入 {code}',
  'landing.practice': '练习（对战电脑）',
  'landing.starting': '开始中…',
  'landing.practiceError': '无法开始练习 — 服务器是否在运行？',
  'landing.watch': '👀 观战',
  'landing.hostHint': '房主在自己的电脑上运行服务器，好友通过局域网或 Tailscale 连接。',
  'landing.about': '关于与致谢',

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

  'wind.0': '东',
  'wind.1': '南',
  'wind.2': '西',
  'wind.3': '北',

  'suit.man': '万',
  'suit.pin': '饼',
  'suit.sou': '条',
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
  'play.youWon': '你赢了这局！',
  'play.loading': '加载中…',
  'play.sort': '理牌',

  'kong.concealed': '暗杠',
  'kong.promoted': '补杠',
  'kong.postponed': '迟杠',

  'claim.hu': '胡！',
  'claim.kong': '杠',
  'claim.pung': '碰',
  'claim.pass': '过',

  'end.title': '本局结束',
  'end.thisRound': '本局',
  'end.matchTotal': '总分',
  'end.nextRound': '下一局',
  'end.endMatch': '结束对局',
  'end.waitingHost': '等待房主开始下一局…',
  'end.hu': '胡！',

  'spec.title': '观战',
  'spec.watch': '观战',
  'spec.connecting': '连接中…',
  'spec.errNoGame': '找不到该房间的对局（可能尚未开始）',
  'spec.connectingGame': '连接对局中…',
  'spec.roundOver': '本局结束',
  'spec.spectating': '观战中 · {code}',
};

const zhHant: Dict = {
  'app.title': '四川麻將',
  'app.subtitle': '血戰到底',
  'nav.back': '← 返回',
  'nav.leave': '離開',
  'common.you': '（你）',
  'common.reconnecting': '重新連線中…',
  'common.waitingPlayers': '等待其他玩家…',

  'landing.host': '建立房間',
  'landing.join': '加入遊戲',
  'landing.joinCode': '加入 {code}',
  'landing.practice': '練習（對戰電腦）',
  'landing.starting': '開始中…',
  'landing.practiceError': '無法開始練習 — 伺服器是否在執行？',
  'landing.watch': '👀 觀戰',
  'landing.hostHint': '房主在自己的電腦上執行伺服器，好友透過區域網路或 Tailscale 連線。',
  'landing.about': '關於與致謝',

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

  'wind.0': '東',
  'wind.1': '南',
  'wind.2': '西',
  'wind.3': '北',

  'suit.man': '萬',
  'suit.pin': '餅',
  'suit.sou': '條',
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
  'play.youWon': '你贏了這局！',
  'play.loading': '載入中…',
  'play.sort': '理牌',

  'kong.concealed': '暗槓',
  'kong.promoted': '補槓',
  'kong.postponed': '遲槓',

  'claim.hu': '胡！',
  'claim.kong': '槓',
  'claim.pung': '碰',
  'claim.pass': '過',

  'end.title': '本局結束',
  'end.thisRound': '本局',
  'end.matchTotal': '總分',
  'end.nextRound': '下一局',
  'end.endMatch': '結束對局',
  'end.waitingHost': '等待房主開始下一局…',
  'end.hu': '胡！',

  'spec.title': '觀戰',
  'spec.watch': '觀戰',
  'spec.connecting': '連線中…',
  'spec.errNoGame': '找不到該房間的對局（可能尚未開始）',
  'spec.connectingGame': '連線對局中…',
  'spec.roundOver': '本局結束',
  'spec.spectating': '觀戰中 · {code}',
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

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
