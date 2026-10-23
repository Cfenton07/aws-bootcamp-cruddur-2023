import './emoji.css';

// Shows emoji 20% larger than the text around them (backlog #51).
// The text is split into graphemes (what a reader sees as one character), so
// a family, a skin tone, a flag or a keycap stays one unit and is never cut in
// half. Runs of emoji share one span. Plain text is returned as plain strings,
// so React still escapes everything (no HTML string, no XSS).
// Browsers without Intl.Segmenter get the text back unchanged.
const SEGMENTER = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

// Emoji_Presentation: characters drawn as emoji by default (smileys, balloons).
// U+FE0F: the "show as emoji" selector (a red heart, a victory hand).
// Regional indicators: flags. U+20E3: keycaps (the boxed 1).
// Plain digits, #, (c), (r) and (tm) stay normal text. Escapes keep this
// file pure ASCII so no invisible character can be lost when it is copied.
const IS_EMOJI = /\p{Emoji_Presentation}|\uFE0F|\p{Regional_Indicator}|\u20E3/u;

export function renderEmoji(text, keyPrefix) {
  if (typeof text !== 'string' || text === '' || !SEGMENTER) {
    return text;
  }
  const out = [];
  let plain = '';
  let emoji = '';
  const flushEmoji = () => {
    if (emoji) {
      out.push(<span className='cruddur_emoji' key={`${keyPrefix}-${out.length}`}>{emoji}</span>);
      emoji = '';
    }
  };
  for (const { segment } of SEGMENTER.segment(text)) {
    if (IS_EMOJI.test(segment)) {
      if (plain) {
        out.push(plain);
        plain = '';
      }
      emoji += segment;
    } else {
      flushEmoji();
      plain += segment;
    }
  }
  flushEmoji();
  if (plain) {
    out.push(plain);
  }
  return out;
}
