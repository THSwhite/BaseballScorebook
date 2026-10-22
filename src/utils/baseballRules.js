/**
 * baseballRules.js
 * 棒球基本規則與比賽狀態引擎（ES Module）
 */

// ---------- 規則常數 ----------
export const RULES = Object.freeze({
  INNINGS: 9,            // 正規局數
  OUTS_PER_HALF: 3,      // 每半局出局數
  STRIKES_OUT: 3,        // 三好球三振
  BALLS_WALK: 4,         // 四壞球保送
  PLAYERS_ON_FIELD: 9,   // 場上守備人數
});

export const POSITIONS = Object.freeze({
  1: '投手 (P)',
  2: '捕手 (C)',
  3: '一壘手 (1B)',
  4: '二壘手 (2B)',
  5: '三壘手 (3B)',
  6: '游擊手 (SS)',
  7: '左外野手 (LF)',
  8: '中外野手 (CF)',
  9: '右外野手 (RF)',
});

export const HIT_TYPES = Object.freeze({
  single: 1,   // 一壘安打
  double: 2,   // 二壘安打
  triple: 3,   // 三壘安打
  homeRun: 4,  // 全壘打
});

// ---------- 比賽引擎 ----------
export class BaseballGame {
  /**
   * @param {object} [options]
   * @param {number} [options.innings=9]       正規局數
   * @param {number|null} [options.maxInnings] 延長賽上限（null = 無限延長）
   */
  constructor({ innings = RULES.INNINGS, maxInnings = null } = {}) {
    this.innings = innings;
    this.maxInnings = maxInnings;
    this.inning = 1;
    this.half = 'top';                 // top = 客隊進攻, bottom = 主隊進攻
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.bases = [false, false, false]; // 一、二、三壘
    this.score = { away: 0, home: 0 };
    this.over = false;
    this.winner = null;                 // 'away' | 'home' | 'draw' | null
    this.log = [];
  }

  get battingTeam() {
    return this.half === 'top' ? 'away' : 'home';
  }

  // --- 投球 ---
  pitch(result) {
    this.#assertPlaying();
    switch (result) {
      case 'strike':
        this.strikes++;
        this.#note('好球');
        if (this.strikes >= RULES.STRIKES_OUT) this.#out('三振');
        break;
      case 'foul': // 界外球：兩好球後不再增加好球
        if (this.strikes < 2) this.strikes++;
        this.#note('界外球');
        break;
      case 'ball':
        this.balls++;
        this.#note('壞球');
        if (this.balls >= RULES.BALLS_WALK) this.walk();
        break;
      default:
        throw new Error(`未知的投球結果：${result}`);
    }
    return this.state();
  }

  // --- 保送（強迫進壘）---
  walk() {
    this.#assertPlaying();
    const b = this.bases;
    if (!b[0]) b[0] = true;
    else if (!b[1]) b[1] = true;
    else if (!b[2]) b[2] = true;
    else this.#addRuns(1);
    this.#resetCount();
    this.#note('保送');
    return this.state();
  }

  // --- 安打：type 為 single / double / triple / homeRun ---
  hit(type) {
    this.#assertPlaying();
    const n = HIT_TYPES[type];
    if (!n) throw new Error(`未知的安打類型：${type}`);

    const next = [false, false, false];
    let runs = 0;
    this.bases.forEach((occupied, i) => {
      if (!occupied) return;
      const dest = i + n;           // 目標壘包索引（3 以上 = 回本壘得分）
      if (dest >= 3) runs++;
      else next[dest] = true;
    });
    if (n === 4) runs++;            // 打者本人跑回本壘
    else next[n - 1] = true;

    this.bases = next;
    this.#resetCount();
    this.#note(`${type}，得 ${runs} 分`);
    if (runs) this.#addRuns(runs);
    return this.state();
  }

  // --- 打者出局（飛球接殺、滾地球刺殺等）---
  out(reason = '出局') {
    this.#assertPlaying();
    this.#out(reason);
    return this.state();
  }

  state() {
    const { inning, half, outs, balls, strikes, score, over, winner } = this;
    return {
      inning, half, outs, balls, strikes,
      bases: [...this.bases],
      score: { ...score },
      over, winner,
    };
  }

  // ---------- 內部方法 ----------
  #assertPlaying() {
    if (this.over) throw new Error('比賽已結束');
  }

  #note(msg) {
    this.log.push(`${this.inning}${this.half === 'top' ? '上' : '下'} ${msg}`);
  }

  #resetCount() {
    this.balls = 0;
    this.strikes = 0;
  }

  #out(reason) {
    this.outs++;
    this.#resetCount();
    this.#note(reason);
    if (this.outs >= RULES.OUTS_PER_HALF) this.#endHalf();
  }

  #addRuns(n) {
    this.score[this.battingTeam] += n;
    // 再見：延長或第 9 局以後，後攻在下半局超前即結束
    if (
      this.half === 'bottom' &&
      this.inning >= this.innings &&
      this.score.home > this.score.away
    ) {
      this.#finish('home');
    }
  }

  #endHalf() {
    this.outs = 0;
    this.bases = [false, false, false];
    this.#resetCount();

    const { away, home } = this.score;
    if (this.half === 'top') {
      // 第 9 局（含）以後，上半結束時後攻已領先 → 不必打下半
      if (this.inning >= this.innings && home > away) return this.#finish('home');
      this.half = 'bottom';
    } else {
      if (this.inning >= this.innings && home !== away) {
        return this.#finish(home > away ? 'home' : 'away');
      }
      if (this.maxInnings && this.inning >= this.maxInnings) {
        return this.#finish('draw'); // 延長賽上限，和局
      }
      this.inning++;
      this.half = 'top';
    }
  }

  #finish(winner) {
    this.over = true;
    this.winner = winner;
    this.#note(winner === 'draw' ? '比賽結束（和局）' : `比賽結束，${winner} 獲勝`);
  }
}

export default BaseballGame;

// ---------- 使用範例 ----------
// import { BaseballGame } from './baseballRules.js';
// const game = new BaseballGame();
// game.pitch('ball'); game.pitch('strike'); game.hit('double');
// console.log(game.state());