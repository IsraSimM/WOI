import { GAME_DATA_URL, WORLDS_URL } from '../data/paths.js';

export const CONFIG = {
  debug: true,
  calibrationKey: 'mazeAssetCalibration',
  defaults: {
    cellSize: 6,
    wallHeight: 2,
    worldWidth: 21,
    worldHeight: 21,
    seed: null,
    mode: 'modo_classic',
    difficulty: 'normal',
  },
  urls: {
    gameData: GAME_DATA_URL,
    worlds: WORLDS_URL,
  },
};

export default CONFIG;
