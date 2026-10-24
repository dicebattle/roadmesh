import {MersenneTwister19937} from 'random-js';
import {integer} from './shared.js';

// CPython integer seed initialization and _randbelow_with_getrandbits adapter.
// CPython 정수 시드 초기화와 getrandbits 거절 추출을 보존하는 좁은 어댑터입니다.
export class PythonRandom {
  private readonly engine: MersenneTwister19937;
  constructor(seed: number) {
    integer(seed, 'seed', 0, 0xffffffff);
    this.engine = MersenneTwister19937.seedWithArray([seed]);
  }
  randint(high: number): number {
    integer(high, 'jitter', 0, 3600000);
    const range = high + 1;
    const bits = Math.floor(Math.log2(range)) + 1;
    let value: number;
    do {
      value = (this.engine.next() >>> 0) >>> (32 - bits);
    } while (value >= range);
    return value;
  }
}
