/* =============================================================
 *  world.js — процедурная генерация особняка и его наполнение
 *
 *  Дом строится в два яруса:
 *    • главный этаж (y = 0)  — комнаты, коридоры, двери
 *    • подвал    (y = -3.6)  — кладовая, камеры, лаборатория
 *  Между ними — лестница (наклонные клетки).
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;
  const THREE = global.HG.THREE;
  const MB = global.HG.MeshBuilder;

  const CELL = 2.4;
  const GRID_W = 46;
  const GRID_H = 48;
  const MAIN_CEIL = 3.2;
  const BASE_Y = -3.6;
  const BASE_CEIL = 0.0;
  const MAIN_ROWS = [1, 29];      // строки главного этажа
  const BAND_ROWS = [30, 34];    // тех. полоса + шахта лестницы
  const BASE_ROWS = [35, GRID_H - 2];

  const T = { VOID: 0, WALL: 1, FLOOR: 2, DOOR: 3, STAIR: 4, LOCKED: 5, WINDOW: 6 };

  /* ---------------------------- предметы ---------------------------- */
  const ITEMS = {
    toolkit: { name: 'Набор инструментов', desc: 'Гаечные ключи, отвёртка, кусачки. Чинят генератор.', icon: '🔧' },
    fuel: { name: 'Канистра топлива', desc: 'Ржавая канистра бензина. Генератор должен работать.', icon: '⛽' },
    battery: { name: 'Батарейка', desc: 'Фонарь работает недолго. Нужны запасные.', icon: '🔋' },
    medkit: { name: 'Аптечка', desc: 'Бинты и антисептик. Лечит раны.', icon: '🩹' },
    bottle: { name: 'Бутылка', desc: 'Разбей её вдалеке — шум отвлечёт тех, кто ходит.', icon: '🍾' },
    pipe: { name: 'Железная труба', desc: 'Тяжёлая труба. Можно оглушить того, кто слишком близко.', icon: '🔨' },
    page: { name: 'Страница дневника', desc: 'Почерк Слендера. Одна цифра кода выходной двери.', icon: '📄' },
    note: { name: 'Записка', desc: 'Кто-то оставил это здесь...', icon: '🗒️' }
  };

  const LORE_NOTES = [
    { title: 'Записка №1 — «Правила»', text: '1. Не беги, если можешь идти. Бег слышно.\n2. Не открывай шкаф, если он скрипит.\n3. Если свет мигает — считай до трёх и не двигайся.\n4. Код на двери — в четырёх страницах. Бабушка их не читает. Она не умеет.' },
    { title: 'Записка №2 — «Соседи»', text: 'В подвале живёт Мясник. Он не видит. Он слышит.\nОн не берёт цель, пока та не шумит. Поэтому он бьёт по бутылкам, а не по людям.\nЕго можно оглушить. Труба тоже годится.' },
    { title: 'Записка №3 — «Кукла»', text: 'Маленькая девочка в углу. Она движется, только пока на неё не смотрят.\nСвет на неё — и она сгорает. Как свечка.' },
    { title: 'Записка №4 — «Тот, кто крадётся»', text: 'Он не ходит по коридорам. Он приходит из ниоткуда.\nСмотри на него — и он замертёт. Не свети фонарём в глаза: это его бесит.\nОн забирает рассудок. Убирайся, пока ещё можешь думать.' },
    { title: 'Записка №5 — «Бабушка»', text: 'Она слышит шаги. Она помнит, где ты прятался.\nОна умеет ждать. У неё нет времени, но есть терпение.\nЗакрой дверь и держись тихо. И не открывай шкаф в тёмной комнате.' },
    { title: 'Записка №6 — «Генератор»', text: 'Пока нет тока — дверь выхода мертва. Генератор внизу.\nОн громкий. Он зовёт всех, кто слышит.\nНо без него ты не выйдешь. Никогда не выйдешь.' }
  ];

  /* ------------------------------ мебель ------------------------------ */
  const PROP = {
    bed: { fw: 2, fh: 3, build(mb, rng) {
      mb.box(1.85, 0.22, 2.5, 0, 0.46, 0, 0x4b3a30);
      mb.box(1.9, 0.26, 2.55, 0, 0.66, 0, 0x7d7166);
      mb.box(1.95, 1.0, 0.14, 0, 0.55, -1.32, 0x3c2f27);
      mb.box(0.62, 0.16, 0.42, -0.42, 0.86, -0.92, 0xd6cfbe);
      mb.box(0.62, 0.16, 0.42, 0.42, 0.86, -0.92, 0xcfc7b4);
      for (const [x, z] of [[-0.85, -1.2], [0.85, -1.2], [-0.85, 1.2], [0.85, 1.2]]) mb.box(0.14, 0.4, 0.14, x, 0.2, z, 0x2b211b);
    } },
    nightstand: { fw: 1, fh: 1, container: true, build(mb) {
      mb.box(0.85, 0.72, 0.6, 0, 0.36, 0, 0x59432f);
      mb.box(0.9, 0.06, 0.66, 0, 0.75, 0, 0x3f2f21);
      mb.box(0.3, 0.04, 0.05, 0, 0.5, 0.32, 0xb9a26a);
    } },
    wardrobe: { fw: 1, fh: 2, container: true, hide: 'inside', build(mb) {
      mb.box(1.5, 2.35, 0.72, 0, 1.18, 0, 0x4a382a);
      mb.box(1.62, 0.1, 0.8, 0, 2.4, 0, 0x33261c);
      mb.box(1.4, 0.06, 0.62, 0, 0.03, 0, 0x241b14);
    }, moving(mb) {
      mb.box(0.7, 2.2, 0.06, 0.35, 1.15, 0.37, 0x5d4835);
      mb.sphere(0.045, 0.62, 1.15, 0.41, 0xcbb583);
    }, pivot: { x: -0.72, y: 0, z: 0.37 }, axis: 'y', openAngle: -1.45 },
    dresser: { fw: 2, fh: 1, container: true, build(mb) {
      mb.box(1.6, 0.95, 0.62, 0, 0.48, 0, 0x513c2a);
      mb.box(1.68, 0.07, 0.68, 0, 0.98, 0, 0x3a2b1f);
    }, moving(mb) {
      mb.box(1.5, 0.34, 0.58, 0, 0.74, 0.02, 0x5f4834);
      mb.box(0.24, 0.05, 0.05, 0, 0.74, 0.32, 0xb9a26a);
    }, pivot: { x: 0, y: 0, z: 0.3 }, axis: 'z', openDist: 0.42 },
    bookshelf: { fw: 2, fh: 1, build(mb, rng) {
      mb.box(1.5, 2.2, 0.42, 0, 1.1, 0, 0x3f3125);
      for (let s = 0; s < 4; s++) {
        mb.box(1.42, 0.05, 0.4, 0, 0.45 + s * 0.5, 0, 0x2e241b);
        for (let b = 0; b < 6; b++) {
          const h = 0.22 + rng() * 0.14;
          const c = [0x6a2f2a, 0x2f4a6a, 0x4a6a2f, 0x6a5a2a, 0x503a60][b % 5];
          mb.box(0.13, h, 0.3, -0.6 + b * 0.22, 0.48 + s * 0.5 + h / 2, 0.02, c);
        }
      }
    } },
    table: { fw: 2, fh: 2, build(mb) {
      mb.box(1.7, 0.1, 1.5, 0, 0.76, 0, 0x5a4531);
      for (const [x, z] of [[-0.72, -0.6], [0.72, -0.6], [-0.72, 0.6], [0.72, 0.6]]) mb.box(0.12, 0.72, 0.12, x, 0.36, z, 0x3d2d20);
    } },
    chair: { fw: 1, fh: 1, build(mb) {
      mb.box(0.55, 0.09, 0.55, 0, 0.46, 0, 0x5a4531);
      mb.box(0.55, 0.7, 0.09, 0, 0.8, -0.25, 0x4a3826);
      for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) mb.box(0.07, 0.44, 0.07, x, 0.22, z, 0x3d2d20);
    } },
    sofa: { fw: 3, fh: 1, build(mb) {
      mb.box(2.3, 0.45, 0.95, 0, 0.4, 0, 0x4a3a3a);
      mb.box(2.3, 0.75, 0.22, 0, 0.85, -0.4, 0x3e3030);
      mb.box(0.22, 0.62, 0.95, -1.05, 0.72, 0, 0x3e3030);
      mb.box(0.22, 0.62, 0.95, 1.05, 0.72, 0, 0x3e3030);
    } },
    armchair: { fw: 1, fh: 1, build(mb) {
      mb.box(0.9, 0.4, 0.85, 0, 0.36, 0, 0x4a3a3a);
      mb.box(0.9, 0.8, 0.2, 0, 0.78, -0.33, 0x3e3030);
    } },
    tv: { fw: 1, fh: 1, build(mb) {
      mb.box(0.5, 0.5, 0.45, 0, 0.25, 0, 0x2a2523);
      mb.box(1.35, 0.85, 0.12, 0, 1.05, -0.05, 0x14100e);
      mb.box(1.2, 0.7, 0.03, 0, 1.05, 0.02, 0x1b2126);
    } },
    fridge: { fw: 1, fh: 1, build(mb) {
      mb.box(0.85, 1.95, 0.78, 0, 0.98, 0, 0xb9b6ad);
      mb.box(0.8, 0.04, 0.06, 0, 0.5, 0.4, 0x8a877f);
      mb.box(0.06, 0.5, 0.06, 0.28, 0.8, 0.4, 0x55524b);
    } },
    counter: { fw: 3, fh: 1, container: true, build(mb) {
      mb.box(2.6, 0.85, 0.68, 0, 0.43, 0, 0x5c5a52);
      mb.box(2.7, 0.08, 0.74, 0, 0.88, 0, 0x8d8a80);
      mb.box(0.7, 0.04, 0.05, 0, 0.7, 0.36, 0xb9a26a);
    }, moving(mb) {
      mb.box(0.68, 0.6, 0.05, -0.7, 0.45, 0.36, 0x6a675e);
    }, pivot: { x: -0.7, y: 0, z: 0.36 }, axis: 'y', openAngle: -1.3 },
    stove: { fw: 1, fh: 1, build(mb) {
      mb.box(0.9, 0.9, 0.75, 0, 0.45, 0, 0x9a978d);
      mb.box(0.94, 0.06, 0.78, 0, 0.92, 0, 0x33302b);
      for (const [x, z] of [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.2], [0.22, 0.2]]) mb.cyl(0.13, 0.03, x, 0.96, z, 0x1d1a17, 10);
    } },
    sink: { fw: 1, fh: 1, build(mb) {
      mb.box(0.75, 0.2, 0.55, 0, 0.85, 0, 0x9a978d);
      mb.box(0.6, 0.1, 0.42, 0, 0.9, 0, 0x55534d);
      mb.cyl(0.04, 0.3, 0, 1.0, -0.2, 0xb8bcc0, 8);
    } },
    bathtub: { fw: 2, fh: 1, build(mb) {
      mb.box(1.85, 0.55, 0.95, 0, 0.28, 0, 0xa9a69c);
      mb.box(1.6, 0.12, 0.7, 0, 0.55, 0, 0x7d7a72);
      mb.cyl(0.04, 0.35, 0.8, 0.75, 0, 0xb8bcc0, 8);
    } },
    toilet: { fw: 1, fh: 1, build(mb) {
      mb.box(0.45, 0.42, 0.62, 0, 0.21, 0, 0xa9a69c);
      mb.cyl(0.28, 0.1, 0, 0.46, 0.05, 0xbcb9b0, 12);
      mb.box(0.42, 0.7, 0.22, 0, 0.62, -0.32, 0xa9a69c);
    } },
    crib: { fw: 2, fh: 1, build(mb) {
      mb.box(1.25, 0.12, 1.9, 0, 0.5, 0, 0x7a6248);
      for (let i = 0; i < 6; i++) mb.box(0.06, 0.7, 0.06, -0.58, 0.85, -0.85 + i * 0.34, 0x8d7351);
      for (let i = 0; i < 6; i++) mb.box(0.06, 0.7, 0.06, 0.58, 0.85, -0.85 + i * 0.34, 0x8d7351);
      mb.box(0.06, 0.7, 1.85, -0.58, 0.85, 0, 0x8d7351);
    } },
    desk: { fw: 2, fh: 1, container: true, build(mb) {
      mb.box(1.5, 0.08, 0.75, 0, 0.78, 0, 0x4d3a28);
      mb.box(0.08, 0.78, 0.7, -0.68, 0.39, 0, 0x3a2b1f);
      mb.box(0.08, 0.78, 0.7, 0.68, 0.39, 0, 0x3a2b1f);
      mb.box(1.3, 0.35, 0.6, 0, 0.55, 0, 0x453425);
    }, moving(mb) {
      mb.box(1.2, 0.28, 0.55, 0, 0.55, 0.02, 0x59432f);
      mb.box(0.2, 0.05, 0.05, 0, 0.55, 0.3, 0xb9a26a);
    }, pivot: { x: 0, y: 0, z: 0.3 }, axis: 'z', openDist: 0.36 },
    crate: { fw: 1, fh: 1, container: true, build(mb) {
      mb.box(0.85, 0.75, 0.85, 0, 0.38, 0, 0x6b4f30);
      for (const x of [-0.36, 0.36]) mb.box(0.07, 0.78, 0.07, x, 0.39, 0.43, 0x4a3520);
    }, moving(mb) {
      mb.box(0.88, 0.08, 0.88, 0, 0.79, 0, 0x5b4128);
    }, pivot: { x: -0.4, y: 0.79, z: -0.4 }, axis: 'x', openAngle: -1.6 },
    barrel: { fw: 1, fh: 1, hide: 'inside', build(mb) {
      mb.cyl(0.44, 1.1, 0, 0.55, 0, 0x5a4a38, 14);
      mb.cyl(0.46, 0.08, 0, 0.85, 0, 0x3f3527, 14);
      mb.cyl(0.46, 0.08, 0, 0.3, 0, 0x3f3527, 14);
    } },
    locker: { fw: 1, fh: 1, container: true, hide: 'inside', build(mb) {
      mb.box(0.85, 1.95, 0.55, 0, 0.98, 0, 0x4d5a55);
      mb.box(0.9, 0.06, 0.6, 0, 1.98, 0, 0x3b4642);
      for (let i = 0; i < 4; i++) mb.box(0.06, 0.1, 0.02, -0.3 + i * 0.2, 1.75, 0.28, 0x232c29);
    }, moving(mb) {
      mb.box(0.8, 1.9, 0.05, 0.4, 0.95, 0.29, 0x566460);
      mb.box(0.05, 0.18, 0.05, 0.72, 1.0, 0.33, 0xb9a26a);
    }, pivot: { x: -0.4, y: 0, z: 0.29 }, axis: 'y', openAngle: -1.5 },
    shelfunit: { fw: 2, fh: 1, container: true, build(mb) {
      for (const x of [-0.62, 0.62]) for (const z of [-0.28, 0.28]) mb.box(0.07, 1.9, 0.07, x, 0.95, z, 0x55524b);
      for (let s = 0; s < 4; s++) mb.box(1.32, 0.05, 0.62, 0, 0.5 + s * 0.45, 0, 0x6b6860);
    } },
    toolbox: { fw: 1, fh: 1, container: true, build(mb) {
      mb.box(0.7, 0.3, 0.42, 0, 0.15, 0, 0xa03b2c);
      mb.box(0.72, 0.06, 0.44, 0, 0.33, 0, 0x8c3226);
      mb.box(0.24, 0.05, 0.05, 0, 0.36, 0, 0xd9d3c6);
    }, moving(mb) {
      mb.box(0.72, 0.24, 0.44, 0, 0.45, -0.2, 0x93362a);
    }, pivot: { x: 0, y: 0.3, z: -0.2 }, axis: 'x', openAngle: -1.5 },
    generator: { fw: 2, fh: 2, special: 'generator', build(mb) {
      mb.box(1.7, 1.1, 1.1, 0, 0.55, 0, 0x6b6a55);
      mb.box(1.8, 0.12, 1.2, 0, 1.14, 0, 0x4f4e40);
      mb.cyl(0.24, 0.9, -0.45, 1.65, 0, 0x40403a, 12);
      mb.cyl(0.16, 0.6, 0.5, 1.5, -0.3, 0x50503f, 10);
      mb.box(0.5, 0.34, 0.06, 0.45, 0.85, 0.56, 0x1a1d18);
      mb.sphere(0.05, 0.45, 0.85, 0.6, 0xd83b2a, 8);
    } },
    cage: { fw: 2, fh: 2, build(mb) {
      for (let i = 0; i < 7; i++) mb.box(0.07, 2.3, 0.07, -0.85 + i * 0.28, 1.15, 0, 0x3d3a34);
      mb.box(1.9, 0.09, 0.09, 0, 2.3, 0, 0x3d3a34);
      mb.box(1.9, 0.09, 0.09, 0, 0.05, 0, 0x3d3a34);
      mb.box(0.1, 2.4, 0.1, -0.95, 1.2, 0, 0x2e2c27);
    } },
    jars: { fw: 2, fh: 1, build(mb, rng) {
      mb.box(1.4, 0.07, 0.5, 0, 1.1, 0, 0x6b6860);
      for (let i = 0; i < 6; i++) {
        const h = 0.16 + rng() * 0.12;
        mb.cyl(0.07, h, -0.55 + i * 0.22, 1.14 + h / 2, 0, [0x3f5a3a, 0x5a3a3a, 0x3a4a5a][i % 3], 10);
      }
    } },
    paperstack: { fw: 1, fh: 1, build(mb) {
      mb.box(0.34, 0.06, 0.26, 0, 0.03, 0, 0xd6d0bd);
      mb.box(0.3, 0.05, 0.24, 0.04, 0.08, 0.02, 0xe0dac7);
    } },
    pipes: { fw: 3, fh: 1, build(mb) {
      for (let i = 0; i < 3; i++) mb.cyl(0.11, 6.5, -0.5 + i * 0.5, 2.9, 0, 0x55524b, 10);
      mb.box(0.2, 0.2, 0.2, 0, 2.9, 0, 0x3d3a34);
    } },
    rug: { fw: 3, fh: 3, noBlock: true, build(mb) {
      mb.box(2.4, 0.03, 3.0, 0, 0.02, 0, 0x5c2f2a);
      mb.box(2.0, 0.04, 2.6, 0, 0.03, 0, 0x6e3a33);
    } },
    lamp: { fw: 1, fh: 1, noBlock: true, build(mb) {
      mb.cyl(0.06, 1.5, 0, 0.75, 0, 0x4a4640, 8);
      mb.cyl(0.22, 0.3, 0, 1.6, 0, 0x6b6256, 12);
    } },
    plant: { fw: 1, fh: 1, build(mb, rng) {
      mb.cyl(0.22, 0.35, 0, 0.18, 0, 0x5a4030, 10);
      for (let i = 0; i < 5; i++) {
        const a = rng() * Math.PI * 2;
        mb.box(0.06, 0.7 + rng() * 0.3, 0.16, Math.cos(a) * 0.12, 0.75, Math.sin(a) * 0.12, 0x2f4a2c, a);
      }
    } },
    piano: { fw: 3, fh: 2, build(mb) {
      mb.box(1.7, 0.85, 0.7, 0, 0.55, 0, 0x1d1a18);
      mb.box(1.75, 0.08, 0.75, 0, 1.0, 0, 0x14120f);
      for (let i = 0; i < 12; i++) mb.box(0.11, 0.05, 0.3, -0.7 + i * 0.13, 0.78, 0.32, 0xd9d5c9);
    } }
  };

  /* --------------------------- планировки --------------------------- */
  const LAYOUT = {
    foyer: () => ([
      { k: 'rug', u: 0.5, v: 0.55 }, { k: 'sofa', u: 0.2, v: 0.25, r: 0 },
      { k: 'plant', u: 0.85, v: 0.3 }, { k: 'chair', u: 0.25, v: 0.8 },
      { k: 'table', u: 0.7, v: 0.75 }, { k: 'chair', u: 0.5, v: 0.8 }
    ]),
    living: () => ([
      { k: 'rug', u: 0.45, v: 0.5 }, { k: 'sofa', u: 0.5, v: 0.18 },
      { k: 'tv', u: 0.5, v: 0.85 }, { k: 'bookshelf', u: 0.15, v: 0.55, r: 1 },
      { k: 'armchair', u: 0.8, v: 0.5 }, { k: 'lamp', u: 0.85, v: 0.2 }, { k: 'plant', u: 0.1, v: 0.85 }
    ]),
    kitchen: () => ([
      { k: 'counter', u: 0.5, v: 0.18 }, { k: 'stove', u: 0.85, v: 0.2 },
      { k: 'fridge', u: 0.12, v: 0.2 }, { k: 'table', u: 0.45, v: 0.6 },
      { k: 'chair', u: 0.25, v: 0.6 }, { k: 'chair', u: 0.7, v: 0.6 }
    ]),
    dining: () => ([
      { k: 'table', u: 0.5, v: 0.5 }, { k: 'chair', u: 0.5, v: 0.15 },
      { k: 'chair', u: 0.5, v: 0.85 }, { k: 'chair', u: 0.2, v: 0.5 },
      { k: 'chair', u: 0.8, v: 0.5 }, { k: 'bookshelf', u: 0.15, v: 0.15, r: 1 },
      { k: 'lamp', u: 0.9, v: 0.85 }
    ]),
    bedroom: () => ([
      { k: 'bed', u: 0.35, v: 0.45 }, { k: 'nightstand', u: 0.8, v: 0.2 },
      { k: 'wardrobe', u: 0.82, v: 0.75 }, { k: 'dresser', u: 0.15, v: 0.85 },
      { k: 'rug', u: 0.35, v: 0.85 }, { k: 'lamp', u: 0.55, v: 0.2 }
    ]),
    bathroom: () => ([
      { k: 'bathtub', u: 0.4, v: 0.25 }, { k: 'sink', u: 0.85, v: 0.3 },
      { k: 'toilet', u: 0.88, v: 0.75 }, { k: 'plant', u: 0.2, v: 0.8 }
    ]),
    study: () => ([
      { k: 'desk', u: 0.4, v: 0.35 }, { k: 'chair', u: 0.4, v: 0.7 },
      { k: 'bookshelf', u: 0.15, v: 0.3, r: 1 }, { k: 'bookshelf', u: 0.8, v: 0.3, r: 1 },
      { k: 'lamp', u: 0.75, v: 0.7 }, { k: 'paperstack', u: 0.3, v: 0.35 }
    ]),
    nursery: () => ([
      { k: 'crib', u: 0.35, v: 0.4 }, { k: 'rug', u: 0.6, v: 0.75 },
      { k: 'wardrobe', u: 0.85, v: 0.3 }, { k: 'chair', u: 0.2, v: 0.8 },
      { k: 'plant', u: 0.15, v: 0.2 }, { k: 'paperstack', u: 0.75, v: 0.7 }
    ]),
    storage: () => ([
      { k: 'crate', u: 0.2, v: 0.2 }, { k: 'crate', u: 0.2, v: 0.55 }, { k: 'crate', u: 0.2, v: 0.85 },
      { k: 'shelfunit', u: 0.6, v: 0.2 }, { k: 'barrel', u: 0.85, v: 0.65 }, { k: 'toolbox', u: 0.55, v: 0.8 }
    ]),
    library: () => ([
      { k: 'bookshelf', u: 0.2, v: 0.2, r: 1 }, { k: 'bookshelf', u: 0.2, v: 0.7, r: 1 },
      { k: 'bookshelf', u: 0.75, v: 0.2, r: 1 }, { k: 'bookshelf', u: 0.75, v: 0.7, r: 1 },
      { k: 'armchair', u: 0.45, v: 0.5 }, { k: 'lamp', u: 0.45, v: 0.15 }
    ]),
    laundry: () => ([
      { k: 'counter', u: 0.4, v: 0.2 }, { k: 'sink', u: 0.85, v: 0.25 },
      { k: 'barrel', u: 0.2, v: 0.7 }, { k: 'crate', u: 0.6, v: 0.75 }
    ]),
    cellar: () => ([
      { k: 'shelfunit', u: 0.25, v: 0.2 }, { k: 'shelfunit', u: 0.7, v: 0.2 },
      { k: 'barrel', u: 0.2, v: 0.6 }, { k: 'barrel', u: 0.45, v: 0.75 },
      { k: 'crate', u: 0.8, v: 0.7 }, { k: 'pipes', u: 0.5, v: 0.5 }
    ]),
    cell: () => ([
      { k: 'cage', u: 0.5, v: 0.4 }, { k: 'crate', u: 0.15, v: 0.8 },
      { k: 'locker', u: 0.85, v: 0.75 }
    ]),
    lab: () => ([
      { k: 'jars', u: 0.3, v: 0.2 }, { k: 'table', u: 0.6, v: 0.55 },
      { k: 'shelfunit', u: 0.15, v: 0.7 }, { k: 'paperstack', u: 0.6, v: 0.55 },
      { k: 'cage', u: 0.85, v: 0.3 }
    ]),
    workshop: () => ([
      { k: 'generator', u: 0.42, v: 0.5 }, { k: 'toolbox', u: 0.15, v: 0.2 },
      { k: 'shelfunit', u: 0.8, v: 0.2 }, { k: 'barrel', u: 0.85, v: 0.8 },
      { k: 'crate', u: 0.25, v: 0.85 }, { k: 'pipes', u: 0.6, v: 0.9 }
    ])
  };

  const PALETTE = {
    wood: [0x6b5236, 0x5a4530, 0x74593a],
    tile: [0x6a6a63, 0x5c5c56, 0x76766e],
    concrete: [0x4a4a46, 0x43433f, 0x51514c]
  };

  /* ==================================================================== */
  class World {
    constructor(opts = {}) {
      this.seed = opts.seed || (Math.random() * 1e9) | 0;
      this.rng = U.mulberry32(this.seed);
      this.difficulty = opts.difficulty || 'nightmare';

      this.gridW = GRID_W; this.gridH = GRID_H;
      this.n = GRID_W * GRID_H;
      this.type = new Uint8Array(this.n);
      this.solid = new Uint8Array(this.n);
      this.blocked = new Uint8Array(this.n);
      this.floorY = new Float32Array(this.n);
      this.ceilY = new Float32Array(this.n);
      this.roomId = new Int16Array(this.n).fill(-1);

      this.rooms = [];
      this.doors = [];
      this.containers = [];
      this.hideSpots = [];
      this.items = [];
      this.notes = [];
      this.lights = [];
      this.props = [];
      this.interactables = [];

      this.stairs = { gx: 4, gy: 30, cols: [4, 5] };
      this.playerSpawn = { x: 0, y: 0, z: 0, yaw: 0 };
      this.exit = null;
      this.generator = null;
      this.code = [];
      this.powerOn = false;

      this.group = new THREE.Group();
      this.group.name = 'world';
    }

    /* ------------------------- утилиты сетки ------------------------- */
    idx(gx, gy) { return gy * GRID_W + gx; }
    toGridX(x) { return Math.floor(x / CELL); }
    toGridY(z) { return Math.floor(z / CELL); }
    gridToWorldX(gx) { return (gx + 0.5) * CELL; }
    gridToWorldZ(gy) { return (gy + 0.5) * CELL; }
    worldToGrid(x, z) { return { gx: this.toGridX(x), gy: this.toGridY(z) }; }
    doorAt(gx, gy) {
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return null;
      const t = this.type[this.idx(gx, gy)];
      if (t !== T.DOOR && t !== T.LOCKED) return null;
      return this._doorMap[this.idx(gx, gy)] || null;
    }
    solidAtWorld(x, z) {
      const gx = this.toGridX(x), gy = this.toGridY(z);
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return true;
      return this.solid[this.idx(gx, gy)] === 1;
    }
    floorAt(x, z) {
      const gx = this.toGridX(x), gy = this.toGridY(z);
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return 0;
      return this.floorY[this.idx(gx, gy)];
    }
    roomAt(x, z) {
      const gx = this.toGridX(x), gy = this.toGridY(z);
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return null;
      const id = this.roomId[this.idx(gx, gy)];
      return id >= 0 ? this.rooms[id] : null;
    }
    isMainLevel(x, z) { return this.floorAt(x, z) > -1.5; }

    /* =========================== ГЕНЕРАЦИЯ =========================== */
    generate() {
      const rng = this.rng;
      this.type.fill(T.VOID);
      this.solid.fill(1);
      this.floorY.fill(0);
      this.ceilY.fill(MAIN_CEIL);
      this.roomId.fill(-1);

      /* --- регион главного этажа --- */
      const mainRegion = { x: 1, y: MAIN_ROWS[0], w: GRID_W - 2, h: MAIN_ROWS[1] - MAIN_ROWS[0] + 1 };
      const mainTree = this._bsp(mainRegion, 0, 11);
      const mainLeaves = this._leaves(mainTree);
      const mainRooms = [];
      mainLeaves.forEach((leaf, i) => {
        const r = this._makeRoom(leaf, 'main', i);
        mainRooms.push(r);
      });

      /* --- коридоры между комнатами --- */
      this._connectTree(mainTree);

      /* --- выбор лестницы: под комнатой у нижнего края --- */
      let stairRoom = mainRooms[0], bestY = -1;
      for (const r of mainRooms) { if (r.iy + r.ih - 1 > bestY) { bestY = r.iy + r.ih - 1; stairRoom = r; } }
      const sx = Math.max(2, Math.min(GRID_W - 4, stairRoom.ix + Math.floor(stairRoom.iw / 2) - 1));
      this.stairs = { gx: sx, gy: MAIN_ROWS[1] + 1, cols: [sx, sx + 1] };

      /* --- подвал --- */
      const baseRegion = { x: 1, y: BASE_ROWS[0], w: GRID_W - 2, h: BASE_ROWS[1] - BASE_ROWS[0] + 1 };
      const baseTree = this._bsp(baseRegion, 0, 10);
      const baseLeaves = this._leaves(baseTree);
      const baseRooms = [];
      baseLeaves.forEach((leaf, i) => {
        const r = this._makeRoom(leaf, 'base', i);
        baseRooms.push(r);
      });
      this._connectTree(baseTree);

      /* --- лестница --- */
      this._buildStairs(sx);

      /* --- двери --- */
      this._detectDoors();

      /* --- связность --- */
      this._ensureConnectivity(mainRooms, baseRooms);

      /* --- назначение типов комнат --- */
      this._assignRoomTypes(mainRooms, baseRooms);

      /* --- уборка «дыр» между этажами --- */
      this._sealLevels();

      this._doorMap = this._doorMap || {};
      for (const d of this.doors) this._doorMap[this.idx(d.gx, d.gy)] = d;

      return this;
    }

    _bsp(rect, depth, maxSize) {
      const { x, y, w, h } = rect;
      const minSize = 6;
      const canV = w >= minSize * 2, canH = h >= minSize * 2;
      const tooBig = w > maxSize || h > maxSize;
      if (depth > 6 || (!tooBig && !canV && !canH) || (!canV && !canH)) {
        return { rect, room: true };
      }
      if (!tooBig && depth > 0 && this.rng() < 0.18) return { rect, room: true };
      let splitV;
      if (canV && canH) splitV = w > h ? true : (h > w ? false : this.rng() < 0.5);
      else splitV = canV;
      if (splitV) {
        const sw = Math.floor(w * (0.35 + this.rng() * 0.3));
        const s1 = Math.max(minSize, Math.min(w - minSize, sw));
        return {
          rect, room: false,
          left: this._bsp({ x, y, w: s1, h }, depth + 1, maxSize),
          right: this._bsp({ x: x + s1, y, w: w - s1, h }, depth + 1, maxSize)
        };
      } else {
        const sh = Math.floor(h * (0.35 + this.rng() * 0.3));
        const s1 = Math.max(minSize, Math.min(h - minSize, sh));
        return {
          rect, room: false,
          left: this._bsp({ x, y, w, h: s1 }, depth + 1, maxSize),
          right: this._bsp({ x, y: y + s1, w, h: h - s1 }, depth + 1, maxSize)
        };
      }
    }

    _leaves(node, out = []) {
      if (!node) return out;
      if (node.room) out.push(node.rect);
      else { this._leaves(node.left, out); this._leaves(node.right, out); }
      return out;
    }

    _makeRoom(leaf, level, index) {
      const isMain = level === 'main';
      const room = {
        id: this.rooms.length, level,
        x: leaf.x, y: leaf.y, w: leaf.w, h: leaf.h,
        ix: leaf.x + 1, iy: leaf.y + 1, iw: leaf.w - 2, ih: leaf.h - 2,
        type: 'storage', name: 'Комната', doors: []
      };
      if (room.iw < 3 || room.ih < 3) { room.ix = leaf.x; room.iy = leaf.y; room.iw = leaf.w; room.ih = leaf.h; }
      const floorY = isMain ? 0 : BASE_Y;
      const ceilY = isMain ? MAIN_CEIL : BASE_CEIL;
      for (let gy = room.iy; gy < room.iy + room.ih; gy++) {
        for (let gx = room.ix; gx < room.ix + room.iw; gx++) {
          const i = this.idx(gx, gy);
          this.type[i] = T.FLOOR;
          this.solid[i] = 0;
          this.floorY[i] = floorY;
          this.ceilY[i] = ceilY;
          this.roomId[i] = room.id;
        }
      }
      this.rooms.push(room);
      return room;
    }

    _connectTree(node) {
      if (!node || node.room) return;
      const a = this._closestRoom(node.left), b = this._closestRoom(node.right);
      if (a && b) this._carveCorridor(a, b);
      this._connectTree(node.left);
      this._connectTree(node.right);
    }

    _closestRoom(node) {
      if (!node) return null;
      if (node.room) return this.rooms.find(r => r.x === node.rect.x && r.y === node.rect.y) || null;
      const l = this._closestRoom(node.left), r = this._closestRoom(node.right);
      return l || r;
    }

    _carveCorridor(roomA, roomB) {
      const ax = Math.floor(roomA.ix + roomA.iw / 2), ay = Math.floor(roomA.iy + roomA.ih / 2);
      const bx = Math.floor(roomB.ix + roomB.iw / 2), by = Math.floor(roomB.iy + roomB.ih / 2);
      const mid = { x: bx, y: ay };
      this._carveL(ax, ay, mid.x, mid.y, true);
      this._carveL(mid.x, mid.y, bx, by, false);
    }

    /* Коридор шириной 2 клетки */
    _carveL(x1, y1, x2, y2, horizontalFirst) {
      const steps = [];
      if (horizontalFirst) {
        for (let x = x1; x !== x2; x += x2 > x1 ? 1 : -1) steps.push([x, y1]);
        for (let y = y1; y !== y2; y += y2 > y1 ? 1 : -1) steps.push([x2, y]);
      } else {
        for (let y = y1; y !== y2; y += y2 > y1 ? 1 : -1) steps.push([x1, y]);
        for (let x = x1; x !== x2; x += x2 > x1 ? 1 : -1) steps.push([x, y2]);
      }
      steps.push([x2, y2]);
      for (const [x, y] of steps) {
        this._carveTile(x, y);
        if (horizontalFirst && x === x1) { /* первая точка — комната */ }
      }
    }

    _carveTile(gx, gy) {
      if (gx < 1 || gy < 1 || gx >= GRID_W - 1 || gy >= GRID_H - 1) return;
      const i = this.idx(gx, gy);
      if (this.type[i] === T.STAIR) return;
      const isMain = gy <= MAIN_ROWS[1];
      const isBase = gy >= BASE_ROWS[0];
      if (!isMain && !isBase) return;         // тех. полоса — не трогаем
      this.type[i] = T.FLOOR;
      this.solid[i] = 0;
      this.floorY[i] = isMain ? 0 : BASE_Y;
      this.ceilY[i] = isMain ? MAIN_CEIL : BASE_CEIL;
      if (this.roomId[i] === -1) this.roomId[i] = -2; // коридор
    }

    _buildStairs(sx) {
      /* верхняя ступень — на уровне главного этажа, последняя — на уровне подвала */
      const levels = [0, -0.72, -1.44, -2.16, -2.88, -3.6];
      const topRow = MAIN_ROWS[1];
      for (let k = 0; k < levels.length; k++) {
        const gy = topRow + k;
        for (const gx of this.stairs.cols) {
          const i = this.idx(gx, gy);
          this.type[i] = T.STAIR;
          this.solid[i] = 0;
          this.floorY[i] = levels[k];
          this.ceilY[i] = MAIN_CEIL;
          this.roomId[i] = -3;
        }
      }
      /* нижняя площадка в подвале */
      const landY = BASE_ROWS[0];
      for (let gx = this.stairs.cols[0] - 1; gx <= this.stairs.cols[1] + 1; gx++) {
        for (let gy = landY; gy <= landY + 1; gy++) {
          const i = this.idx(gx, gy);
          if (this.type[i] === T.WALL || this.type[i] === T.VOID) {
            this.type[i] = T.FLOOR; this.solid[i] = 0;
            this.floorY[i] = BASE_Y; this.ceilY[i] = BASE_CEIL; this.roomId[i] = -4;
          }
        }
      }
    }

    /* Поиск мест, где коридор входит в комнату → двери */
    _detectDoors() {
      this.doors = [];
      this._doorMap = {};
      const cands = [];
      for (let gy = 1; gy < GRID_H - 1; gy++) {
        for (let gx = 1; gx < GRID_W - 1; gx++) {
          const i = this.idx(gx, gy);
          if (this.type[i] !== T.FLOOR) continue;
          if (this.roomId[i] >= 0) continue;       // это комната
          if (this.roomId[i] === -4) continue;      // площадка лестницы
          let touch = -1;
          const nb = [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]];
          for (const [nx, ny] of nb) {
            const j = this.idx(nx, ny);
            if (this.roomId[j] >= 0 && this.type[j] === T.FLOOR) { touch = this.roomId[j]; break; }
          }
          if (touch >= 0) cands.push({ gx, gy, touch });
        }
      }
      /* убираем соседние дубликаты, оставляя одну дверь */
      const used = new Set();
      for (const c of cands) {
        const key = this.idx(c.gx, c.gy);
        if (used.has(key)) { this.type[key] = T.WALL; this.solid[key] = 1; continue; }
        let dup = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (used.has(this.idx(c.gx + dx, c.gy + dy))) { dup = true; break; }
        }
        if (dup) { this.type[key] = T.WALL; this.solid[key] = 1; continue; }
        used.add(key);
        this.type[key] = T.DOOR;
        const door = {
          gx: c.gx, gy: c.gy, open: false, angle: 0, type: 'normal', locked: false,
          x: this.gridToWorldX(c.gx), y: this.floorY[key], z: this.gridToWorldZ(c.gy)
        };
        this._doorMap[key] = door;
        this.doors.push(door);
      }
    }

    _ensureConnectivity(mainRooms, baseRooms) {
      const start = mainRooms[0];
      const seen = new Set();
      const q = [[Math.floor(start.ix + start.iw / 2), Math.floor(start.iy + start.ih / 2)]];
      seen.add(this.idx(q[0][0], q[0][1]));
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
          const i = this.idx(nx, ny);
          if (seen.has(i)) continue;
          const t = this.type[i];
          if (t === T.VOID || t === T.WALL) continue;
          if (t === T.STAIR) { seen.add(i); q.push([nx, ny]); continue; }
          seen.add(i); q.push([nx, ny]);
        }
      }
      /* все комнаты должны быть достижимы */
      const all = mainRooms.concat(baseRooms);
      for (const room of all) {
        const cx = Math.floor(room.ix + room.iw / 2), cy = Math.floor(room.iy + room.ih / 2);
        if (seen.has(this.idx(cx, cy))) continue;
        /* ищем ближайшую достижимую клетку и прокапываем */
        let best = null, bestD = Infinity;
        for (const i of seen) {
          const x = i % GRID_W, y = (i / GRID_W) | 0;
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d < bestD) { bestD = d; best = [x, y]; }
        }
        if (best) this._carveL(cx, cy, best[0], best[1], true);
      }
      this._detectDoors();
    }

    _sealLevels() {
      /* фундамент между этажами: сплошная стена, кроме шахты лестницы */
      for (let gy = MAIN_ROWS[1] + 1; gy < BASE_ROWS[0]; gy++) {
        for (let gx = 1; gx < GRID_W - 1; gx++) {
          const i = this.idx(gx, gy);
          if (this.type[i] === T.STAIR) continue;
          this.type[i] = T.WALL;
          this.solid[i] = 1;
          this.roomId[i] = -1;
          this.floorY[i] = BASE_Y;
          this.ceilY[i] = MAIN_CEIL;
        }
      }
      /* стены по краю карты — чтобы дом не «тек» */
      for (let gx = 0; gx < GRID_W; gx++) {
        for (const gy of [0, GRID_H - 1]) {
          const i = this.idx(gx, gy);
          if (this.type[i] === T.STAIR) continue;
          this.type[i] = T.WALL; this.solid[i] = 1;
          this.floorY[i] = gy === 0 ? 0 : BASE_Y;
          this.ceilY[i] = gy === 0 ? MAIN_CEIL : BASE_CEIL;
        }
      }
      for (let gy = 0; gy < GRID_H; gy++) {
        for (const gx of [0, GRID_W - 1]) {
          const i = this.idx(gx, gy);
          if (this.type[i] === T.STAIR) continue;
          this.type[i] = T.WALL; this.solid[i] = 1;
          this.floorY[i] = gy <= MAIN_ROWS[1] ? 0 : BASE_Y;
          this.ceilY[i] = gy <= MAIN_ROWS[1] ? MAIN_CEIL : BASE_CEIL;
        }
      }
    }

    _assignRoomTypes(mainRooms, baseRooms) {
      const mainTypes = ['foyer', 'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'study', 'nursery', 'storage', 'library', 'laundry', 'bedroom'];
      const baseTypes = ['cellar', 'cell', 'lab', 'workshop', 'storage'];
      /* фойер — комната, ближайшая к центру верхней части */
      let foyer = mainRooms[0], bd = Infinity;
      for (const r of mainRooms) {
        const d = Math.abs(r.ix + r.iw / 2 - GRID_W / 2) + Math.abs(r.iy - 4) * 0.6;
        if (d < bd) { bd = d; foyer = r; }
      }
      const pool = U.shuffle(mainTypes.slice(), this.rng);
      pool.splice(pool.indexOf('foyer'), 1);
      mainRooms.forEach((r) => {
        if (r === foyer) { r.type = 'foyer'; r.name = 'Холл'; }
        else { r.type = pool.pop() || 'storage'; r.name = NAME_BY_TYPE[r.type] || 'Комната'; }
      });
      const bpool = U.shuffle(baseTypes.slice(), this.rng);
      baseRooms.forEach((r) => {
        r.type = bpool.pop() || 'storage';
        r.name = (r.type === 'cell') ? 'Камера' : (r.type === 'lab' ? 'Лаборатория' : 'Подвал');
      });
      this.foyer = foyer;
      /* генератор — в самой дальней комнате подвала */
      let genRoom = baseRooms[0];
      for (const r of baseRooms) {
        const d = Math.abs(r.ix - this.stairs.gx) + Math.abs(r.iy - BASE_ROWS[0]);
        if (d > Math.abs(genRoom.ix - this.stairs.gx) + Math.abs(genRoom.iy - BASE_ROWS[0])) genRoom = r;
      }
      genRoom.type = 'workshop';
      genRoom.name = 'Мастерская';
      this.genRoom = genRoom;
    }

    /* ========================== ПОСТРОЕНИЕ МЕШЕЙ ========================== */
    build(scene) {
      const mbStatic = new MB();
      const mbWalls = new MB();
      const mbFloor = new MB();

      const wallColMain = 0x6d6355, wallColBase = 0x4b4a45;
      const floorColsMain = PALETTE.wood, floorColsBase = PALETTE.concrete;

      for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
          const i = this.idx(gx, gy);
          const t = this.type[i];
          const fy = this.floorY[i], cy = this.ceilY[i];
          const wx = this.gridToWorldX(gx), wz = this.gridToWorldZ(gy);
          const isBase = fy < -1.5;
          const floorLike = (t === T.FLOOR || t === T.DOOR || t === T.STAIR || t === T.LOCKED);

          if (floorLike) {
            const pal = isBase ? floorColsBase : (this._tileRoom(gx, gy) === 'bathroom' ? PALETTE.tile : floorColsMain);
            const base = pal[(gx * 7 + gy * 13) % pal.length];
            const tint = 0.84 + ((gx * 53 + gy * 29) % 100) / 100 * 0.3;
            const c = new THREE.Color(base).multiplyScalar(tint);
            mbFloor.plane(CELL, CELL, wx, fy, wz, c, 0, -Math.PI / 2);
            if (cy > fy + 0.5) mbFloor.plane(CELL, CELL, wx, cy, wz, isBase ? 0x2a2a27 : 0x35302a, 0, Math.PI / 2);
            continue;
          }

          /* сплошные клетки: стены */
          let wallBottom = Infinity, wallTop = -Infinity, near = false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + dx, ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
            const j = this.idx(nx, ny);
            const tt = this.type[j];
            if (tt === T.FLOOR || tt === T.DOOR || tt === T.STAIR || tt === T.LOCKED) {
              near = true;
              wallBottom = Math.min(wallBottom, this.floorY[j]);
              wallTop = Math.max(wallTop, this.ceilY[j]);
            }
          }
          if (!near) continue;
          let bottom, top;
          if (t === T.WALL) { bottom = fy; top = cy; }
          else { bottom = wallBottom; top = wallTop; }
          const h = Math.max(0.1, top - bottom);
          const base = bottom < -1.5 ? wallColBase : wallColMain;
          /* лёгкий разброс оттенка, чтобы стены не выглядели плоскими */
          const tint = 0.82 + ((gx * 37 + gy * 91) % 100) / 100 * 0.34;
          const col = new THREE.Color(base).multiplyScalar(tint);
          mbWalls.box(CELL, h, CELL, wx, bottom + h / 2, wz, col);
          /* потолок над сплошной клеткой, чтобы дом был закрытым */
          if (gy >= BASE_ROWS[0]) mbFloor.plane(CELL, CELL, wx, 0, wz, 0x2a2a27, 0, Math.PI / 2);
          else if (gy <= MAIN_ROWS[1]) mbFloor.plane(CELL, CELL, wx, MAIN_CEIL, wz, 0x35302a, 0, Math.PI / 2);
        }
      }

      /* внешние окна главного этажа */
      const mbWin = new MB();
      for (let gy = 1; gy < MAIN_ROWS[1]; gy++) {
        for (let gx = 1; gx < GRID_W - 1; gx++) {
          const i = this.idx(gx, gy);
          const t = this.type[i];
          if (t === T.FLOOR || t === T.DOOR || t === T.STAIR || t === T.LOCKED) continue;
          let adjFloor = false, outside = false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + dx, ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) { outside = true; continue; }
            const j = this.idx(nx, ny);
            const tt = this.type[j];
            if (tt === T.FLOOR || tt === T.DOOR || tt === T.STAIR || tt === T.LOCKED) { adjFloor = true; continue; }
            if (nx === 0 || ny === 0 || nx === GRID_W - 1 || ny === GRID_H - 1) outside = true;
          }
          if (!adjFloor || !outside) continue;
          const wx = this.gridToWorldX(gx), wz = this.gridToWorldZ(gy);
          mbWin.box(1.5, 1.5, 0.12, wx, 1.7, wz, 0x1a1f26);
          mbWin.box(1.7, 0.12, 0.18, wx, 1.7, wz, 0x2b2620);
        }
      }

      /* предметы */
      this._placeProps(mbStatic, mbWalls);

      /* двери */
      this._buildDoors();

      /* материалы */
      const matStatic = new THREE.MeshLambertMaterial({ vertexColors: true });
      const matWalls = new THREE.MeshLambertMaterial({ vertexColors: true });
      const matFloor = new THREE.MeshLambertMaterial({ vertexColors: true });
      const matWin = new THREE.MeshLambertMaterial({ vertexColors: true });

      const meshes = [];
      const mStatic = mbStatic.build(matStatic); if (mStatic) { this.group.add(mStatic); meshes.push(mStatic); }
      const mWalls = mbWalls.build(matWalls); if (mWalls) { this.group.add(mWalls); meshes.push(mWalls); }
      const mFloor = mbFloor.build(matFloor, { shadows: false }); if (mFloor) { this.group.add(mFloor); meshes.push(mFloor); }
      const mWin = mbWin.build(matWin); if (mWin) { this.group.add(mWin); meshes.push(mWin); }

      scene.add(this.group);

      /* --- свет --- */
      this._buildLights(scene);

      /* --- предметы и записки --- */
      this._spawnLoot();

      /* --- выход --- */
      this._buildExit();

      /* --- точка старта --- */
      const f = this.foyer;
      const sx = this.gridToWorldX(f.ix + Math.floor(f.iw / 2));
      const sz = this.gridToWorldZ(f.iy + Math.floor(f.ih / 2));
      this.playerSpawn = { x: sx, y: 0, z: sz, yaw: 0 };
      /* лицом к выходу */
      this.playerSpawn.yaw = Math.atan2(-sx, -sz) + Math.PI;

      return this;
    }

    _tileRoom(gx, gy) {
      const id = this.roomId[this.idx(gx, gy)];
      return id >= 0 ? this.rooms[id].type : '';
    }

    _placeProps(mb, mbWalls) {
      for (const room of this.rooms) {
        const layout = LAYOUT[room.type];
        if (!layout) continue;
        const list = layout(room, this.rng);
        for (const item of list) {
          const def = PROP[item.k];
          if (!def) continue;
          const rot = (item.r || 0) * Math.PI / 2;
          const fw = (Math.abs(Math.sin(rot)) > 0.5) ? def.fh : def.fw;
          const fh = (Math.abs(Math.sin(rot)) > 0.5) ? def.fw : def.fh;
          const gx = room.ix + Math.round(item.u * Math.max(0, room.iw - fw));
          const gy = room.iy + Math.round(item.v * Math.max(0, room.ih - fh));
          if (!this._canPlace(gx, gy, fw, fh, room, def)) continue;
          /* занятость клеток */
          for (let y = gy; y < gy + fh; y++)
            for (let x = gx; x < gx + fw; x++)
              if (!def.noBlock) this.blocked[this.idx(x, y)] = 1;

          const wx = this.gridToWorldX(gx) + (fw - 1) * CELL / 2;
          const wz = this.gridToWorldZ(gy) + (fh - 1) * CELL / 2;
          const fy = this.floorY[this.idx(gx, gy)];

          if (def.special === 'generator') {
            this._makeGenerator(wx, fy, wz, rot, gx, gy);
            continue;
          }
          if (def.container || def.hide) {
            this._makeInteractive(def, item.k, wx, fy, wz, rot, gx, gy, room);
            continue;
          }
          /* статичный предмет */
          const builder = new MB();
          def.build(builder, this.rng);
          mb.push(wx, fy, wz, rot);
          this._appendBuilder(mb, builder);
          mb.pop();
        }
      }
    }

    /* переносит геометрию одного билдера в другой (с учётом текущего трансформа) */
    _appendBuilder(target, src) {
      const t = target.t;
      const base = target.pos.length / 3;
      for (let i = 0; i < src.pos.length; i += 3) {
        const x = src.pos[i], y = src.pos[i + 1], z = src.pos[i + 2];
        const c = Math.cos(t.ry), s = Math.sin(t.ry);
        target.pos.push(t.x + x * c + z * s, t.y + y, t.z - x * s + z * c);
      }
      for (let i = 0; i < src.norm.length; i += 3) {
        const x = src.norm[i], y = src.norm[i + 1], z = src.norm[i + 2];
        const c = Math.cos(t.ry), s = Math.sin(t.ry);
        target.norm.push(x * c + z * s, y, -x * s + z * c);
      }
      for (let i = 0; i < src.uv.length; i++) target.uv.push(src.uv[i]);
      for (let i = 0; i < src.col.length; i++) target.col.push(src.col[i]);
      for (let i = 0; i < src.idx.length; i++) target.idx.push(base + src.idx[i]);
    }

    _canPlace(gx, gy, fw, fh, room, def) {
      for (let y = gy; y < gy + fh; y++) {
        for (let x = gx; x < gx + fw; x++) {
          if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) return false;
          const i = this.idx(x, y);
          if (this.type[i] !== T.FLOOR) return false;
          if (this.blocked[i] === 1) return false;
          if (this.type[i] === T.STAIR) return false;
          /* не блокируем подход к двери */
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = this.idx(x + dx, y + dy);
            if (this.type[j] === T.DOOR || this.type[j] === T.LOCKED) return false;
          }
        }
      }
      return true;
    }

    _makeInteractive(def, kind, wx, fy, wz, rot, gx, gy, room) {
      const group = new THREE.Group();
      group.position.set(wx, fy, wz);
      group.rotation.y = rot;
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

      const bodyBuilder = new MB();
      def.build(bodyBuilder, this.rng);
      const body = bodyBuilder.build(mat);
      if (body) group.add(body);

      let pivot = null;
      if (def.moving) {
        const mbMove = new MB();
        def.moving(mbMove);
        const moveMesh = mbMove.build(mat);
        const p = def.pivot || { x: 0, y: 0, z: 0 };
        pivot = new THREE.Group();
        pivot.position.set(p.x, p.y, p.z);
        if (moveMesh) pivot.add(moveMesh);
        group.add(pivot);
      }
      this.group.add(group);

      const obj = {
        kind, group, pivot, def,
        x: wx, y: fy, z: wz, gx, gy,
        opened: false, openAmount: 0, rot,
        loot: [], hideType: def.hide || null
      };
      if (def.container) this.containers.push(obj);
      if (def.hide) {
        this.hideSpots.push({
          kind: def.hide, obj,
          x: wx, y: fy, z: wz,
          enter: { x: wx, y: fy + (def.hide === 'inside' ? 0.9 : 0.25), z: wz },
          look: { x: wx, y: fy + (def.hide === 'inside' ? 1.5 : 0.35), z: wz }
        });
      }
      if (def.container || def.hide) {
        this.interactables.push({
          x: wx, y: fy + (def.container ? 0.95 : 1.0), z: wz, radius: 2.0,
          obj, type: def.container ? 'container' : 'hide',
          canHide: !!def.hide,
          label: () => {
            if (def.container && !obj.opened) return 'Обыскать';
            if (def.container && obj.opened && obj.loot.length) return 'Осмотреть';
            if (def.hide) return 'Спрятаться';
            return 'Пусто';
          }
        });
      }
      this.props.push(obj);
      return obj;
    }

    _makeGenerator(wx, fy, wz, rot, gx, gy) {
      const group = new THREE.Group();
      group.position.set(wx, fy, wz);
      group.rotation.y = rot;
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mb = new MB();
      PROP.generator.build(mb, this.rng);
      const body = mb.build(mat);
      group.add(body);
      this.group.add(group);

      const gen = {
        x: wx, y: fy, z: wz, group,
        state: 'broken',   // broken -> needs fuel -> running
        hasFuel: false, hasTools: false,
        rotor: null
      };
      /* лампа-индикатор */
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x882222 })
      );
      lamp.position.set(0.45, 0.85, 0.62);
      group.add(lamp);
      gen.lamp = lamp;

      this.generator = gen;
      this.interactables.push({
        x: wx, y: fy + 1.0, z: wz, radius: 2.4, obj: gen, type: 'generator',
        label: () => gen.state === 'running' ? 'Генератор работает' :
          (gen.hasFuel && gen.hasTools ? 'Запустить генератор' : 'Генератор (нужно топливо и инструменты)')
      });
      for (let y = gy; y < gy + 2; y++) for (let x = gx; x < gx + 2; x++) this.blocked[this.idx(x, y)] = 1;
    }

    _buildDoors() {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const list = Object.values(this._doorMap || {});
      for (const d of list) {
        const fy = this.floorY[this.idx(d.gx, d.gy)];
        const wx = this.gridToWorldX(d.gx), wz = this.gridToWorldZ(d.gy);
        const horiz = this._isHorizontalDoor(d.gx, d.gy);
        const group = new THREE.Group();
        group.position.set(wx, fy, wz);
        group.rotation.y = horiz ? 0 : Math.PI / 2;
        const mb = new MB();
        mb.box(2.3, 2.15, 0.12, 0, 1.07, 0, 0x4a3524);
        mb.box(2.05, 1.0, 0.03, 0, 1.5, 0.08, 0x5b4230);
        mb.box(2.05, 0.7, 0.03, 0, 0.55, 0.08, 0x5b4230);
        mb.sphere(0.06, 0.85, 1.05, 0.1, 0xc0a86c, 8);
        const doorMesh = mb.build(mat);
        const pivot = new THREE.Group();
        pivot.position.set(-1.1, 0, 0);
        if (doorMesh) pivot.add(doorMesh);
        group.add(pivot);
        /* косяк */
        const fb = new MB();
        fb.box(0.12, 2.3, 0.3, -1.16, 1.15, 0, 0x33281d);
        fb.box(0.12, 2.3, 0.3, 1.16, 1.15, 0, 0x33281d);
        fb.box(2.45, 0.14, 0.3, 0, 2.28, 0, 0x33281d);
        const frame = fb.build(mat);
        if (frame) group.add(frame);
        this.group.add(group);
        d.mesh = group; d.pivot = pivot; d.horizontal = horiz;
        d.baseAngle = 0;
        d.x = wx; d.y = fy; d.z = wz;
        if (!this.doors.includes(d)) this.doors.push(d);
        /* дверь можно открыть/закрыть — это шумит */
        this.interactables.push({
          x: wx, y: fy + 1.05, z: wz, radius: 1.9, obj: d, type: 'door',
          label: () => d.open ? 'Закрыть дверь' : 'Открыть дверь'
        });
      }
    }

    _isHorizontalDoor(gx, gy) {
      /* дверь ориентирована вдоль прохода: если соседи по X — стены, то проход по Z */
      const l = this.type[this.idx(gx - 1, gy)] === T.WALL || this.type[this.idx(gx - 1, gy)] === T.VOID;
      const r = this.type[this.idx(gx + 1, gy)] === T.WALL || this.type[this.idx(gx + 1, gy)] === T.VOID;
      return !(l && r);
    }

    _buildLights(scene) {
      /* потолочные лампы в комнатах */
      for (const room of this.rooms) {
        const isBase = room.level === 'base';
        const cx = room.ix + room.iw / 2, cy = room.iy + room.ih / 2;
        const wx = this.gridToWorldX(Math.floor(cx)), wz = this.gridToWorldZ(Math.floor(cy));
        const fy = isBase ? BASE_Y : 0;
        const ceil = isBase ? BASE_CEIL : MAIN_CEIL;
        const count = (room.iw * room.ih) > 30 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const ox = count === 1 ? 0 : (k === 0 ? -room.iw / 4 : room.iw / 4);
          const oz = count === 1 ? 0 : (k === 0 ? -room.ih / 4 : room.ih / 4);
          const lx = this.gridToWorldX(Math.floor(cx + ox));
          const lz = this.gridToWorldZ(Math.floor(cy + oz));
          const l = {
            x: lx, y: ceil - 0.25, z: lz,
            color: isBase ? 0xffd9a0 : 0xffd9b0,
            intensity: isBase ? 0.85 : 1.0,
            distance: isBase ? 9 : 11,
            on: false, flicker: isBase ? 0.25 : 0.12,
            level: room.level, phase: this.rng() * 10
          };
          this.lights.push(l);
        }
      }
      /* фонари в коридорах */
      for (let gy = 1; gy < GRID_H - 1; gy++) {
        for (let gx = 1; gx < GRID_W - 1; gx++) {
          const i = this.idx(gx, gy);
          if (this.type[i] !== T.FLOOR || this.roomId[i] !== -2) continue;
          if (this.rng() < 0.72) continue;
          const l = {
            x: this.gridToWorldX(gx), y: (this.floorY[i] < -1.5 ? BASE_CEIL : MAIN_CEIL) - 0.25,
            z: this.gridToWorldZ(gy),
            color: 0xffe0b0, intensity: 0.7, distance: 8,
            on: false, flicker: 0.35, level: this.floorY[i] < -1.5 ? 'base' : 'main', phase: this.rng() * 10
          };
          this.lights.push(l);
        }
      }
      /* визуальные плафоны */
      const mbL = new MB();
      for (const l of this.lights) {
        mbL.cyl(0.24, 0.16, l.x, l.y + 0.1, l.z, 0x3a3630, 10);
      }
      const matL = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mL = mbL.build(matL, { shadows: false });
      if (mL) this.group.add(mL);
      /* светящиеся «линзы» */
      this.bulbMeshes = [];
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
      for (const l of this.lights) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), bulbMat.clone());
        b.position.set(l.x, l.y, l.z);
        this.group.add(b);
        this.bulbMeshes.push(b);
      }
    }

    _spawnLoot() {
      /* контейнеры для предметов */
      const containers = this.containers.filter(c => c.kind !== 'generator');
      const shuffled = U.shuffle(containers.slice(), this.rng);
      const take = (n) => shuffled.splice(0, n);

      const baseContainers = containers.filter(c => c.group.position.y < -1);
      const mainContainers = containers.filter(c => c.group.position.y >= -1);

      const required = [
        { id: 'toolkit', where: 'main' },
        { id: 'fuel', where: 'base' },
        { id: 'battery', where: 'main' },
        { id: 'battery', where: 'main' },
        { id: 'medkit', where: 'main' },
        { id: 'bottle', where: 'main' },
        { id: 'bottle', where: 'main' },
        { id: 'bottle', where: 'base' },
        { id: 'pipe', where: 'main' }
      ];
      for (const r of required) {
        const pool = r.where === 'base' ? baseContainers : mainContainers;
        if (!pool.length) continue;
        const c = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
        c.loot.push({ type: r.id, taken: false });
      }

      /* страницы дневника — на виду */
      this.code = [];
      for (let i = 0; i < 4; i++) this.code.push(Math.floor(this.rng() * 10));
      const pageSpots = this._looseSpots(6);
      for (let i = 0; i < 4; i++) {
        const spot = pageSpots[i];
        if (!spot) continue;
        const item = this._makeItem('page', spot.x, spot.y + 0.1, spot.z, { digit: this.code[i], index: i });
        this.items.push(item);
      }
      /* записки */
      const noteSpots = this._looseSpots(12);
      for (let i = 0; i < LORE_NOTES.length; i++) {
        const spot = noteSpots[i + 4];
        if (!spot) continue;
        const item = this._makeItem('note', spot.x, spot.y + 0.1, spot.z, { lore: LORE_NOTES[i] });
        this.items.push(item);
      }
      /* разбросанные батарейки */
      const extra = this._looseSpots(14);
      for (let i = 0; i < 3; i++) {
        const spot = extra[i];
        if (!spot) continue;
        this.items.push(this._makeItem('battery', spot.x, spot.y + 0.1, spot.z, {}));
      }
    }

    /* точки для «лежащих» предметов: верх мебели */
    _looseSpots(count) {
      const spots = [];
      const candidates = [];
      for (const p of this.props) {
        if (!p.def || !p.def.build) continue;
        if (p.def.container || p.def.hide) continue;
        candidates.push(p);
      }
      U.shuffle(candidates, this.rng);
      for (const p of candidates) {
        if (spots.length >= count) break;
        const h = p.def.fh > p.def.fw ? 0.85 : 0.85;
        spots.push({ x: p.x, y: p.y + h, z: p.z });
      }
      /* если мебели мало — берём пол в комнатах */
      let guard = 0;
      while (spots.length < count && guard++ < 200) {
        const room = this.rooms[Math.floor(this.rng() * this.rooms.length)];
        const gx = room.ix + Math.floor(this.rng() * room.iw);
        const gy = room.iy + Math.floor(this.rng() * room.ih);
        const i = this.idx(gx, gy);
        if (this.type[i] !== T.FLOOR || this.blocked[i]) continue;
        spots.push({ x: this.gridToWorldX(gx), y: this.floorY[i] + 0.05, z: this.gridToWorldZ(gy) });
      }
      return spots;
    }

    _makeItem(type, x, y, z, data) {
      const mb = new MB();
      const def = ITEMS[type];
      if (type === 'page' || type === 'note') {
        mb.box(0.3, 0.02, 0.4, 0, 0, 0, type === 'page' ? 0xd9d2bb : 0xe2ddc9);
        mb.box(0.26, 0.01, 0.34, 0.02, 0.02, 0.01, 0xc7bfa6);
      } else if (type === 'battery') {
        mb.cyl(0.07, 0.22, 0, 0.05, 0, 0x2f4d3a, 10);
        mb.cyl(0.075, 0.03, 0, 0.17, 0, 0xb9b2a0, 10);
      } else if (type === 'medkit') {
        mb.box(0.34, 0.16, 0.24, 0, 0.08, 0, 0xd9d5cb);
        mb.box(0.2, 0.05, 0.26, 0, 0.09, 0, 0xb03a34);
        mb.box(0.06, 0.05, 0.26, 0, 0.09, 0, 0xb03a34);
      } else if (type === 'bottle') {
        mb.cyl(0.07, 0.26, 0, 0.13, 0, 0x3f6b4a, 10);
        mb.cyl(0.04, 0.1, 0, 0.3, 0, 0x3f6b4a, 8);
      } else if (type === 'pipe') {
        mb.cyl(0.05, 1.1, 0, 0.05, 0, 0x6a6a68, 8);
        mb.cyl(0.07, 0.1, 0, 0.05, 0.55, 0x55554f, 8);
      } else if (type === 'toolkit') {
        mb.box(0.4, 0.18, 0.24, 0, 0.09, 0, 0x8a2f22);
        mb.box(0.2, 0.05, 0.05, 0, 0.2, 0, 0xc9c3b4);
      } else if (type === 'fuel') {
        mb.box(0.28, 0.42, 0.16, 0, 0.21, 0, 0x7a4a22);
        mb.cyl(0.05, 0.1, 0.1, 0.45, 0, 0x4a4a44, 8);
      }
      const mesh = mb.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.position.set(x, y, z);
      mesh.castShadow = false;
      this.group.add(mesh);
      const glow = new THREE.PointLight(0xffe0a0, 2.2, 3.0, 1.8);
      glow.position.set(x, y + 0.2, z);
      this.group.add(glow);
      const item = {
        type, x, y, z, mesh, glow, taken: false, data: data || {},
        name: def.name, desc: def.desc, icon: def.icon,
        bobPhase: this.rng() * 6.28
      };
      this.interactables.push({
        x, y: y + 0.06, z, radius: 1.7, obj: item, type: 'item',
        label: () => 'Взять: ' + item.name
      });
      return item;
    }

    _buildExit() {
      const f = this.foyer;
      const room = f;
      /* ищем стену в комнате, через которую выход */
      let wx = this.gridToWorldX(room.ix), wz = this.gridToWorldZ(room.iy);
      /* ставим выход в дальнем углу фойера */
      const gx = room.ix + room.iw - 1, gy = room.iy + room.ih - 1;
      wx = this.gridToWorldX(gx); wz = this.gridToWorldZ(gy);
      const fy = this.floorY[this.idx(gx, gy)];
      const group = new THREE.Group();
      group.position.set(wx, fy, wz);
      const mb = new MB();
      mb.box(2.3, 2.6, 0.2, 0, 1.3, 0, 0x2e231a);
      mb.box(1.9, 2.3, 0.1, 0, 1.2, 0.12, 0x3d2f22);
      mb.box(0.34, 0.5, 0.14, 0.95, 1.25, 0.18, 0x22262a);
      mb.box(0.26, 0.16, 0.03, 0.95, 1.35, 0.26, 0x4b5a4b);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = mb.build(mat);
      group.add(mesh);
      this.group.add(group);
      this.exit = {
        x: wx, y: fy, z: wz, group, unlocked: false,
        code: this.code.slice()
      };
      this.interactables.push({
        x: wx, y: fy + 1.2, z: wz, radius: 2.2, obj: this.exit, type: 'exit',
        label: () => this.exit.unlocked ? 'Выход открыт!' : 'Кодовый замок'
      });
    }

    /* ============================ ОБНОВЛЕНИЕ ============================ */
    update(dt, t) {
      /* двери */
      for (const d of this.doors) {
        const target = d.open ? (d.type === 'locked' ? -1.6 : -1.5) : 0;
        d.angle = U.damp(d.angle, target, 8, dt);
        if (d.pivot) d.pivot.rotation.y = d.angle;
        const i = this.idx(d.gx, d.gy);
        const wantSolid = !d.open;
        if (this.solid[i] !== (wantSolid ? 1 : 0)) {
          this.solid[i] = wantSolid ? 1 : 0;
        }
      }
      /* контейнеры: анимация открытия */
      for (const c of this.containers) {
        const target = c.opened ? 1 : 0;
        if (Math.abs(c.openAmount - target) > 0.001) {
          c.openAmount = U.damp(c.openAmount, target, 7, dt);
          this._animateInteractive(c);
        }
      }
      /* мерцание ламп */
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        const bulb = this.bulbMeshes && this.bulbMeshes[i];
        if (!l.on) { if (bulb) bulb.material.color.setHex(0x1a1a18); continue; }
        let f = 1;
        if (l.flicker > 0) {
          const n = Math.sin(t * 13 + l.phase) * Math.sin(t * 7.3 + l.phase * 2.1) * Math.sin(t * 31 + l.phase * 0.7);
          f = 1 + n * l.flicker;
          if (Math.sin(t * 3.1 + l.phase) > 0.985) f *= 0.15;
        }
        l.current = f * l.intensity;
        if (bulb) bulb.material.color.setRGB(0.95 * f, 0.86 * f, 0.62 * f);
      }
      /* предметы: парение */
      for (const it of this.items) {
        if (it.taken) continue;
        it.bobPhase += dt * 1.6;
        it.mesh.position.y = it.y + Math.sin(it.bobPhase) * 0.03;
        it.mesh.rotation.y += dt * 0.6;
        it.glow.intensity = 2.0 + Math.sin(it.bobPhase * 2) * 0.6;
      }
    }

    _animateInteractive(c) {
      if (!c.pivot) return;
      const def = c.def;
      const p = def.pivot || { x: 0, y: 0, z: 0 };
      if (def.axis === 'y') c.pivot.rotation.y = (def.openAngle || -1.4) * c.openAmount;
      else if (def.axis === 'x') c.pivot.rotation.x = (def.openAngle || -1.4) * c.openAmount;
      else if (def.axis === 'z') c.pivot.position.z = p.z + (def.openDist || 0.4) * c.openAmount;
    }

    /* Открыть контейнер: возвращает выпавшие предметы */
    openContainer(c) {
      c.opened = true;
      const out = [];
      for (const l of c.loot) {
        if (l.taken) continue;
        l.taken = true;
        out.push(l.type);
      }
      return out;
    }

    powerUp() {
      this.powerOn = true;
      for (const l of this.lights) l.on = true;
    }

    /* Ближайший интерактивный объект — по экранной проекции (наведи прицел) */
    findInteractable(camera) {
      let best = null, bestScore = -Infinity;
      const v = new THREE.Vector3();
      for (const it of this.interactables) {
        if (it.hidden) continue;
        v.set(it.x, it.y, it.z);
        const dist = v.distanceTo(camera.position);
        if (dist > it.radius) continue;
        v.project(camera);
        if (v.z > 1 || v.z < -1) continue;       // объект за камерой или слишком далеко по Z
        const dx = Math.abs(v.x), dy = Math.abs(v.y);
        if (dx > 0.34 || dy > 0.34) continue;    // не в прицеле
        const score = (1 - dx - dy) * 2 - dist * 0.15;
        if (score > bestScore) { bestScore = score; best = it; }
      }
      return best;
    }
  }

  const NAME_BY_TYPE = {
    foyer: 'Холл', living: 'Гостиная', kitchen: 'Кухня', dining: 'Столовая',
    bedroom: 'Спальня', bathroom: 'Ванная', study: 'Кабинет', nursery: 'Детская',
    storage: 'Кладовая', library: 'Библиотека', laundry: 'Прачечная',
    cellar: 'Погреб', cell: 'Камера', lab: 'Лаборатория', workshop: 'Мастерская'
  };

  global.HG = global.HG || {};
  global.HG.World = World;
  global.HG.ITEMS = ITEMS;
  global.HG.CELL = CELL;
  global.HG.TILE = T;
})(window);
