// Builds a day's video captions from its authored one-liner (`day.reel.en` /
// `day.reel.ar`) and its feed posts, so reels never need separate copywriting
// and always match the day's languages:
//   reels.linkedin   EN native video post: line + 3 of the LinkedIn hashtags
//   reels.facebook   Facebook Reel in Facebook's language: line + tracked link
//   reels.instagram  Instagram Reel in Instagram's language: line + 5 IG hashtags
//   stories.*        the same vertical video as a Story, no caption
// The video file is visuals/<date>/reel-<lang>.mp4 (render-reel.mjs).

const tags = (caption, n) => (caption.match(/(^|\s)(#[\p{L}\p{N}_]+)/gu) || []).map((t) => t.trim()).slice(0, n).join(' ');

export function composeReels(day) {
  const fb = day.posts.facebook.lang;
  const ig = day.posts.instagram.lang;
  const path = day.source.replace(/^https:\/\/www\.devya\.dev/, '') || '/';
  const fbLink = `https://www.devya.dev${path}?utm_source=facebook&utm_medium=social&utm_content=reel`;
  return {
    reels: {
      linkedin: { lang: 'en', caption: `${day.reel.en}\n\n${tags(day.posts.linkedin.caption, 3)}` },
      facebook: { lang: fb, caption: `${day.reel[fb]}\n\n${fb === 'ar' ? 'التفاصيل' : 'More'}: ${fbLink}` },
      instagram: { lang: ig, caption: `${day.reel[ig]}\n\n${tags(day.posts.instagram.caption, 5)}` },
    },
    stories: { facebook: { lang: fb }, instagram: { lang: ig } },
  };
}
