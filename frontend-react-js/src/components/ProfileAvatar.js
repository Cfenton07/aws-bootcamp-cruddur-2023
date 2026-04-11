import './ProfileAvatar.css';

export default function ProfileAvatar({ id }) {
  return (
    <div className='profile-avatar'>
      <img
        src={`https://assets.fentoncruddur.com/avatars/processed/${id}.jpg?v=${Date.now()}`}
        className='avatar-img'
        alt='User avatar'
      />
    </div>
  );
}