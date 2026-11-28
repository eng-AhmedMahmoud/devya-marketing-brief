// Builds a day's video captions from its authored one-liner (`day.reel.en` /
// `day.reel.ar`) and its feed posts, so reels never need separate copywriting
// and always match the day's languages:
//   reels.linkedin   EN native video post: line + links + 3 of the LinkedIn hashtags
//   reels.facebook   Facebook Reel in Facebook's language: line + links + the
//                    Facebook hashtags; its devya.dev link is the Facebook post's
//                    page (or the day's source)
//   reels.instagram  Instagram Reel in Instagram's language: line + links (plain
//                    text) + up to 5 IG hashtags
//   stories.*        the same vertical video as a Story, no caption
// The links are the ones every caption carries (seo.withRequiredLinks): the
// project's own link on a project day, and a devya.dev page, tagged
// utm_source=<network>&utm_medium=social&utm_campaign=<post slug>&utm_content=reel.
// The video file is visuals/<date>/reel-<lang>.mp4 (render-reel.mjs).

import { captionLinks, hashtags, isDevyaHost, linkBase, withRequiredLinks } from './seo.mjs';

const tags = (caption, n) => hashtags(caption).slice(0, n).join(' ');
const caption = (line, tagLine) => `${line}${tagLine ? `\n\n${tagLine}` : ''}`;

export function composeReels(day) {
  const fb = day.posts.facebook.lang;
  const ig = day.posts.instagram.lang;
  const page = captionLinks(day.posts.facebook.caption).find((u) => isDevyaHost(new URL(u).hostname) && /^(www\.)?devya\.dev$/.test(new URL(u).hostname));
  return {
    reels: {
      linkedin: { lang: 'en', caption: withRequiredLinks(day, 'linkedin_video', caption(day.reel.en, tags(day.posts.linkedin.caption, 3)), 'en') },
      facebook: { lang: fb, caption: withRequiredLinks(day, 'facebook_reel', caption(day.reel[fb], tags(day.posts.facebook.caption, 3)), fb, { site: page ? linkBase(page) : undefined }) },
      instagram: { lang: ig, caption: withRequiredLinks(day, 'instagram_reel', caption(day.reel[ig], tags(day.posts.instagram.caption, 5)), ig) },
    },
    stories: { facebook: { lang: fb }, instagram: { lang: ig } },
  };
}
