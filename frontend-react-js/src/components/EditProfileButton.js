import './EditProfileButton.css';

export default function EditProfileButton(props) {
  const pop_profile_form = (event) => {
    event.preventDefault();
    props.setPopped(true);
  }

  return (
    <button onClick={pop_profile_form} className='profile_edit_btn' href="#">Edit Profile</button>
  );
}