// Development-only product illustrations. The real flow stores photographs taken by the potter's device (Phase 6);
// until devices exist, `seed-images.js` uses these generated SVGs so the storefront has something to render.
const SHAPES = {
  vase: 'M360 110H440V170C440 210 540 250 540 340C540 420 490 470 440 470H360C310 470 260 420 260 340C260 250 360 210 360 170Z',
  kolshi: 'M335 150H465C465 190 560 220 560 340C560 440 490 490 400 490C310 490 240 440 240 340C240 220 335 190 335 150Z',
  planter: 'M270 230H530L490 470H310Z',
  jar: 'M290 225H510C540 265 550 330 550 380C550 450 500 490 400 490C300 490 250 450 250 380C250 330 260 265 290 225Z',
  cookpot: 'M270 260H530C550 300 560 360 540 420C520 470 470 490 400 490C330 490 280 470 260 420C240 360 250 300 270 260Z',
  diya: 'M270 400C270 450 330 480 400 480C470 480 530 450 530 400Z',
  bowl: 'M230 330H570C570 430 500 485 400 485C300 485 230 430 230 330Z',
  cups: 'M210 330H350V400C350 450 320 480 280 480C240 480 210 450 210 400ZM440 330H580V400C580 450 550 480 510 480C470 480 440 450 440 400Z',
};

const PALETTES = [
  ['#c2623d', '#8a4026'], ['#b9714a', '#7a4a2e'], ['#a8502f', '#6d3520'], ['#cf8a5c', '#9a5a38'], ['#8f4a33', '#5c2f20'],
];

export function shapeFor(name = '') {
  const n = name.toLowerCase();
  if (/diya/.test(n)) return 'diya';
  if (/bowl/.test(n)) return 'bowl';
  if (/cup|tea/.test(n)) return 'cups';
  if (/planter|garden/.test(n)) return 'planter';
  if (/jar|storage/.test(n)) return 'jar';
  if (/cook/.test(n)) return 'cookpot';
  if (/kolshi|water/.test(n)) return 'kolshi';
  return 'vase';
}

/** A warm, flat illustration of the piece (deterministic for a given name). */
export function productSvg(name, seed = 0) {
  const shape = shapeFor(name);
  const [light, dark] = PALETTES[Math.abs(seed) % PALETTES.length];
  const extras =
    shape === 'planter'
      ? `<g fill="#5f7d4e"><ellipse cx="360" cy="190" rx="20" ry="52" transform="rotate(-25 360 190)"/><ellipse cx="400" cy="170" rx="20" ry="62"/><ellipse cx="440" cy="190" rx="20" ry="52" transform="rotate(25 440 190)"/></g><rect x="255" y="215" width="290" height="30" rx="6" fill="${dark}"/>`
      : shape === 'jar'
        ? `<rect x="305" y="190" width="190" height="40" rx="10" fill="${dark}"/><circle cx="400" cy="182" r="14" fill="${dark}"/>`
        : shape === 'diya'
          ? '<path d="M400 320C365 365 378 395 400 400C422 395 435 365 400 320Z" fill="#f2a93b"/><path d="M400 350C388 370 392 388 400 392C408 388 412 370 400 350Z" fill="#fde7a8"/>'
          : shape === 'vase' || shape === 'kolshi'
            ? `<ellipse cx="400" cy="${shape === 'vase' ? 110 : 150}" rx="${shape === 'vase' ? 42 : 68}" ry="9" fill="${dark}"/>`
            : shape === 'cookpot'
              ? `<circle cx="258" cy="300" r="16" fill="none" stroke="${dark}" stroke-width="12"/><circle cx="542" cy="300" r="16" fill="none" stroke="${dark}" stroke-width="12"/><rect x="265" y="248" width="270" height="22" rx="8" fill="${dark}"/>`
              : '';
  const band = shape === 'diya' || shape === 'planter' || shape === 'cups' ? '' : `<path d="M270 360C340 380 460 380 530 360" stroke="#f5e0d5" stroke-opacity=".55" stroke-width="6" fill="none"/><path d="M262 392C340 414 460 414 538 392" stroke="#f5e0d5" stroke-opacity=".35" stroke-width="4" fill="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${name.replace(/[<>&"]/g, '')}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf8f0"/><stop offset="1" stop-color="#efe4d3"/></linearGradient>
<linearGradient id="clay" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark}"/><stop offset=".35" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#bg)"/>
<ellipse cx="400" cy="505" rx="210" ry="22" fill="#4a3426" fill-opacity=".14"/>
<path d="${SHAPES[shape]}" fill="url(#clay)"/>${band}${extras}
</svg>`;
}
