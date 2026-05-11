import type { ZoneList, ZoneType } from './types.ts';

/**
 * デフォルトの標準区画。仕様書「区画」セクションをベースに、
 * オーバーホールで「居住区画 1x2 / 2x2、受付、談話室、食堂、物資配布スペース、更衣室、受給コーナー」を整備。
 */
const DEFAULT_ZONES: ZoneType[] = [
  {
    id: 'living-small',
    name: '居住スペース(小)',
    width: 1,
    height: 2,
    color: '#fbc02d',
    resizable: false,
  },
  {
    id: 'living-large',
    name: '居住スペース(大)',
    width: 2,
    height: 2,
    color: '#fdd835',
    resizable: false,
  },
  {
    id: 'reception',
    name: '受付',
    width: 2.5,
    height: 1.5,
    color: '#ffcc80',
    resizable: false,
  },
  {
    id: 'lounge',
    name: '談話室',
    width: 3,
    height: 3,
    color: '#ce93d8',
    resizable: false,
  },
  {
    id: 'dining',
    name: '食堂',
    width: 4,
    height: 3,
    color: '#ef9a9a',
    resizable: false,
  },
  {
    id: 'supply-distribution',
    name: '物資配布スペース',
    width: 2,
    height: 1.5,
    color: '#80cbc4',
    resizable: false,
  },
  {
    id: 'changing-room',
    name: '更衣室',
    width: 1,
    height: 1.2,
    color: '#a5d6a7',
    resizable: false,
  },
  {
    id: 'supply-corner',
    name: '受給コーナー',
    width: 1.8,
    height: 0.9,
    color: '#90caf9',
    resizable: false,
  },
];

export const DEFAULT_ZONE_LIST: ZoneList = {
  version: 1,
  name: '標準区画リスト',
  zones: DEFAULT_ZONES,
};

/**
 * 縮尺の初期値: 50 px = 1 m
 */
export const INITIAL_SCALE_RATIO = 50;
