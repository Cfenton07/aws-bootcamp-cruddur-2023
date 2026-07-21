import './SuggestedUserItem.css';
import { Link } from "react-router-dom";

export default function SugestedUserItem(props) {
  return (
    <Link className="user" to={'/@' + props.handle}>
      <div className='avatar'></div>
      <div className='identity'>
        <span className="display_name">{props.display_name}</span>
        <span className="handle">@{props.handle}</span>
      </div>
    </Link>
  );
}