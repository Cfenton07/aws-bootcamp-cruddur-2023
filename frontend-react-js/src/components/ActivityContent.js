import './ActivityContent.css';

import { Link } from "react-router-dom";
import { timeAgo, formatTimeExpires } from '../lib/DateTimeFormats';
import {ReactComponent as BombIcon} from './svg/bomb.svg';
import ProfileAvatar from './ProfileAvatar';
import { renderEmoji } from '../lib/emoji';

// Splits a message into plain text, links and #hashtags. split() with a
// capturing group keeps the matches at the odd indexes. Links come first in
// the alternation so a '#' inside a URL stays part of the link. Everything is
// built as React elements, never as an HTML string, so a message cannot
// inject markup (XSS). Hashtags: backlog #41. Links: backlog #46.
// Plain-text pieces also get their emoji enlarged 20% (backlog #51).
const TOKEN_SPLIT = /(https?:\/\/[^\s<>"]+|#[\p{L}\p{N}_]+)/iu;
const LINK_START = /^https?:\/\//i;
const TRAILING_PUNCT = /[.,!?;:'"]$/;
const LINK_DISPLAY_MAX = 40;

// "see https://example.com." -> the period is sentence punctuation, not part
// of the link. A closing ")" is trimmed only when it has no matching "(",
// so Wikipedia-style links such as /wiki/Foo_(bar) stay whole.
function splitTrailing(raw) {
  let url = raw;
  let trail = '';
  for (;;) {
    const last = url.slice(-1);
    const unbalanced = last === ')' &&
      url.split(')').length > url.split('(').length;
    if (TRAILING_PUNCT.test(url) || unbalanced) {
      trail = last + trail;
      url = url.slice(0, -1);
    } else {
      return [url, trail];
    }
  }
}

function renderLink(raw, key) {
  const [url, trail] = splitTrailing(raw);
  let href = null;
  try {
    const parsed = new URL(url);
    // Only web links become clickable; anything else stays plain text.
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      href = parsed.href;
    }
  } catch (e) {
    href = null;
  }
  if (!href) {
    return raw;
  }
  const bare = Array.from(url.replace(LINK_START, ''));
  const display = bare.length > LINK_DISPLAY_MAX
    ? bare.slice(0, LINK_DISPLAY_MAX).join('') + '\u2026'
    : bare.join('');
  return (
    <span key={key}>
      <a
        className='link'
        href={href}
        title={url}
        target='_blank'
        rel='noopener noreferrer nofollow'
        onClick={(e) => e.stopPropagation()}
      >{display}</a>{trail}
    </span>
  );
}

function renderMessage(message) {
  if (typeof message !== 'string' || message === '') {
    return message;
  }
  return message.split(TOKEN_SPLIT).map((part, i) => {
    if (i % 2 === 0) {
      return renderEmoji(part, `t${i}`);
    }
    if (LINK_START.test(part)) {
      return renderLink(part, i);
    }
    return <span className='hashtag' key={i}>{part}</span>;
  });
}

export default function ActivityContent(props) {

  // formatTimeExpires returns null once the post has expired; the countdown
  // is then hidden rather than shown as negative minutes (backlog #25).
  let expires_at;
  const expires_label = props.activity.expires_at
    ? formatTimeExpires(props.activity.expires_at)
    : null;
  if (expires_label) {
    expires_at =  <div className="expires_at" title={props.activity.expires_at}>
                    <BombIcon className='icon' />
                    <span className='ago'>{expires_label}</span>
                  </div>

  }

  // Profile feeds list replies on their own, so show which post each one
  // answers (backlog #29). The API sends reply_to only on the profile feed;
  // the preview is already cut to 80 characters server-side, and CSS keeps
  // the line to one row. Plain text, not renderMessage: no links in a preview.
  let replyTo;
  const parent = props.activity.reply_to;
  if (parent && parent.handle) {
    replyTo = <div className='reply_to' title={parent.preview}>
                {'\u21B3 Replying to '}
                <Link to={`/@`+parent.handle}>@{parent.handle}</Link>
                {parent.preview ? ': ' + parent.preview : ''}
              </div>
  }

  return (
    <div className='activity_content_wrap'>
      <div className='activity_avatar'>
  <ProfileAvatar id={props.activity.cognito_user_id} name={props.activity.display_name} />
</div>
      <div className='activity_content'>
        <div className='activity_meta'>
          <Link className='activity_identity' to={`/@`+props.activity.handle}>
            <div className='display_name'>{props.activity.display_name}</div>
            <div className="handle">@{props.activity.handle}</div>
          </Link>{/* activity_identity */}
          <div className='activity_times'>
            <div className="created_at" title={props.activity.created_at}>
              <span className='ago'>{timeAgo(props.activity.created_at)}</span> 
            </div>
            {expires_at}
          </div>{/* activity_times */}
        </div>{/* activity_meta */}
        {replyTo}
        <div className="message">{renderMessage(props.activity.message)}</div>
      </div>{/* activity_content */}
    </div>
  );
}
