import './TrendingsSection.css';
import TrendItem from '../components/TrendItem';

// "Most liked this week" (backlog #20). Cruddur has no hashtags, so the
// section lists the posts with the most likes in the last 7 days.
export default function TrendingsSection(props) {
  let items;
  if (props.trendings.length > 0) {
    items = props.trendings.map(trending => {
      return <TrendItem key={trending.uuid} trending={trending} />
    });
  } else {
    items = <div className='trendings-empty'>No likes yet this week.</div>;
  }

  return (
    <div className="trendings">
      <div className='trendings-title'>
        Most liked this week
      </div>
      {items}
    </div>
  );
}
