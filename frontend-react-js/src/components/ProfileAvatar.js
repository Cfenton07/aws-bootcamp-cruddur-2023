import './ProfileAvatar.css';
import { useState } from 'react';

// One cache key per page load. Date.now() inside render produced a new URL
// on every re-render, so the browser re-downloaded every avatar each time
// (the (canceled) jpg rows in DevTools). A new upload shows after a reload.
const AVATAR_VERSION = Date.now();

export default function ProfileAvatar({ id, name }) {
  // Fall back to an initial when there is no id to build a URL from, or
  // when the image fails to load because the user never uploaded one.
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  if (!id || failed) {
    return (
      <div className='profile-avatar'>
        <div className='avatar-fallback' aria-label='User avatar'>{initial}</div>
      </div>
    );
  }

  return (
    <div className='profile-avatar'>
      <img
        src={`https://assets.fentoncruddur.com/avatars/processed/${id}.jpg?v=${AVATAR_VERSION}`}
        className='avatar-img'
        alt='User avatar'
        onError={() => setFailed(true)}
      />
    </div>
  );
}
