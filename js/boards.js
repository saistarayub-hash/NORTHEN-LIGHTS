/* ============================================================
   NORTHERN LIGHTS RUN — boards.js
   Hoverboard catalog. 4 boards × 2 deck colors. The selected
   board's colors drive the in-game board model (player.js).
   ============================================================ */
import { getChar } from './store.js';

export const BOARDS = [
  { id: 'aurora',   name: 'Aurora Glider',  c1: '#35e0d0', c2: '#a06bff', glow: '#7dffa8' },
  { id: 'sodaze',   name: 'Sodaze Surfer',  c1: '#ff8a3d', c2: '#7b2ff7', glow: '#ffd25f' },
  { id: 'northern', name: 'Northern Light', c1: '#3dff88', c2: '#0f3a5e', glow: '#3dff88' },
  { id: 'lenz',     name: 'Lenz Rider',     c1: '#ff5fd0', c2: '#175560', glow: '#ff9f43' },
];

export function boardById(id) {
  return BOARDS.find(b => b.id === id) || BOARDS[0];
}

/* Runners / crew. DOC is locked to the brand design; the other
   three slots unlock via cockpit.html (nl_unlocked='1'). */
export const CHARS = [
  {
    id: 'doc', name: 'DOC', ig: '@stoner_pri', locked: false,
    skin: '#7a4a2b', hood: '#12a862', hoodDark: '#0a5c33', leaf: '#3dff88',
    hat: '#175560', hair: '#12121a', jogger: '#171a2e', shoe: '#eef7ff', shoeAccent: '#9ff5d8',
    chain: true, hatType: 'snapback',
  },
  {
    id: 'kaya', name: 'KAYA', ig: '', locked: true,
    skin: '#8a5a3b', hood: '#17b8c9', hoodDark: '#0a5c66', leaf: '#ffd25f',
    hat: '#ff5fd0', hair: '#12121a', jogger: '#1d2340', shoe: '#fff', shoeAccent: '#ff5fd0',
    chain: false, hatType: 'beanie',
  },
  {
    id: 'trev', name: 'TREV', ig: '', locked: true,
    skin: '#6f4425', hood: '#b44dff', hoodDark: '#5a1d8a', leaf: '#35e0d0',
    hat: '#14424a', hair: '#12121a', jogger: '#171a2e', shoe: '#e8f6ff', shoeAccent: '#a06bff',
    chain: true, hatType: 'cap',
  },
  {
    id: 'zumi', name: 'ZUMI', ig: '', locked: true,
    skin: '#7a4a2b', hood: '#ff8a3d', hoodDark: '#a34a12', leaf: '#3dff88',
    hat: '#101322', hair: '#2a1a0e', jogger: '#20264a', shoe: '#fff', shoeAccent: '#3dff88',
    chain: false, hatType: 'dreads',
  },
];

export function charById(id) {
  return CHARS.find(c => c.id === id) || CHARS[0];
}
