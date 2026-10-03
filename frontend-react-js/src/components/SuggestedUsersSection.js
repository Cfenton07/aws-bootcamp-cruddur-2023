import './SuggestedUserSection.css';
import SuggestedUserItem from '../components/SuggestedUserItem';

export default function SuggestedUsersSection(props) {
  return (
    <div className="suggested_users">
      <div className='suggested_users_title'>
        Suggested Users
      </div>
      {props.users.map(user => {
        return <SuggestedUserItem key={user.uuid} display_name={user.display_name} handle={user.handle} cognito_user_id={user.cognito_user_id} />
      })}
    </div>
  );
}