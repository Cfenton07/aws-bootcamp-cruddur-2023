import './ProfileHeading.css';
import EditProfileButton from '../components/EditProfileButton';
import ProfileAvatar from './ProfileAvatar';

export default function ProfileHeading(props) {
  const backgroundImage = 'url("https://assets.fentoncruddur.com/banners/banner.jpg")';
  const styles = {
    backgroundImage: backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <div className='profile_heading'>
      <div className='banner' style={styles}>
        <div className='avatar'>
          <ProfileAvatar id={props.profile.cognito_user_id} />
        </div>
      </div>
      <div className='info'>
        <div className='id'>
          <div className='display_name'>{props.profile.display_name}</div>
          <div className='handle'>@{props.profile.handle}</div>
        </div>
        <EditProfileButton setPopped={props.setPopped} />
      </div>
      <div className='cruds_count'>{props.profile.cruds_count} Cruds</div>
      <div className='bio'>{props.profile.bio}</div>
    </div>
  );
}