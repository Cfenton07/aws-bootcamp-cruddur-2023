import './CrudButton.css';
import { useLocation, useNavigate } from 'react-router-dom';

// On the home page the button opens the compose form directly. No other page
// has a working compose form, so there the button goes home and asks
// HomeFeedPage to open it via router state (backlog #40).
export default function CrudButton(props) {
  const location = useLocation();
  const navigate = useNavigate();

  const pop_activities_form = (event) => {
    if (location.pathname === '/' && props.setPopped) {
      props.setPopped(true);
    } else {
      navigate('/', { state: { compose: true } });
    }
  }

  return (
    <button onClick={pop_activities_form} className='post'>Crud</button>
  );
}
