// Builds a day's video captions from its authored one-liner (`day.reel.en` /
// `day.reel.ar`) and its feed posts, so reels never need separate copywriting
// and always match the day's languages:
//   reels.linkedin   EN native video post: line + 3 of the LinkedIn hashtags
//   reels.facebook   Facebook Reel in Facebook's language: line + the Facebook
//                    hashtags + the Facebook post's page (or the day's source),
//                    tagged utm_source=facebook&utm_medium=social&
//                    utm_campaign=<post slug>&utm_content=reel
//   reels.instagram  Instagram Reel in Instagram's language: line + up to 5 IG hashtags
//   stories.*        the same vertical video as a Story, no caption
// The video file is visuals/<date>/reel-<lang>.mp4 (render-reel.mjs).

import { campaignSlug, captionLinks, hashtags, linkBase, tagUrl } from './seo.mjs';

const tags = (caption, n) => hashtags(caption).slice(0, n).join(' ');

export function composeReels(day) {
  const fb = day.posts.facebook.lang;
  const ig = day.posts.instagram.lang;
  const page = captionLinks(day.posts.facebook.caption)[0];
  const fbLink = tagUrl(page ? linkBase(page) : day.source, { platform: 'facebook', campaign: campaignSlug(day), content: 'reel' });
  const fbTags = tags(day.posts.facebook.caption, 3);
  return {
    reels: {
      linkedin: { lang: 'en', caption: `${day.reel.en}\n\n${tags(day.posts.linkedin.caption, 3)}` },
      facebook: { lang: fb, caption: `${day.reel[fb]}\n\n${fb === 'ar' ? 'التفاصيل' : 'More'}: ${fbLink}${fbTags ? `\n\n${fbTags}` : ''}` },
      instagram: { lang: ig, caption: `${day.reel[ig]}\n\n${tags(day.posts.instagram.caption, 5)}` },
    },
    stories: { facebook: { lang: fb }, instagram: { lang: ig } },
  };
}
