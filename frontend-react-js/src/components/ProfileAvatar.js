import './ProfileAvatar.css';
import { useState } from 'react';

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
        src={`https://assets.fentoncruddur.com/avatars/processed/${id}.jpg?v=${Date.now()}`}
        className='avatar-img'
        alt='User avatar'
        onError={() => setFailed(true)}
      />
    </div>
  );
}
