const IS_MOBILE =
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  Math.min(screen.width, screen.height) < 900;

const MOBILE = IS_MOBILE
  ? {
      density: 1,

      segments: 60,

      capScale: 0.5,
    }
  : { density: null, segments: 160, capScale: 1 };
