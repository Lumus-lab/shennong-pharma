(function (global) {
  'use strict';

  function hashSeedString(input) {
    const str = String(input || '').trim() || 'TX-1001';
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function createMulberry32(seedInput) {
    let a = typeof seedInput === 'number' ? (seedInput >>> 0) : hashSeedString(seedInput);
    if (a === 0) a = 0x9e3779b9;

    function next() {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    }

    function pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(next() * arr.length)];
    }

    function shuffle(arr) {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    function weightedSample(items, count, weightFn) {
      const pool = items.map((item) => ({
        item,
        weight: Math.max(0.1, Number(weightFn ? weightFn(item) : 1))
      }));
      const selected = [];
      const target = Math.min(count, pool.length);

      for (let k = 0; k < target; k++) {
        let total = 0;
        for (let i = 0; i < pool.length; i++) total += pool[i].weight;
        let roll = next() * total;
        let idx = 0;
        for (let i = 0; i < pool.length; i++) {
          roll -= pool[i].weight;
          if (roll <= 0) {
            idx = i;
            break;
          }
        }
        selected.push(pool[idx].item);
        pool.splice(idx, 1);
      }
      return selected;
    }

    return { next, int, pick, shuffle, weightedSample };
  }

  function generateSeedCode() {
    const prefixes = ['TX', '太陰', '太陽', '靈樞', '百草'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  }

  global.TaixuRNG = {
    hashSeedString,
    createMulberry32,
    generateSeedCode
  };
})(window);
