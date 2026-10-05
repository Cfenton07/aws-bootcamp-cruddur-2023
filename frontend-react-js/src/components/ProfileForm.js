import './ProfileForm.css';
import React from "react";
import process from 'process';
import { getAccessToken } from '../components/lib/CheckAuth';

export default function ProfileForm(props) {
  const [bio, setBio] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  // Visible result of a photo upload (backlog #33); it used to go to the
  // console only, so a user could not tell whether anything happened.
  const [uploadStatus, setUploadStatus] = React.useState(null);

  React.useEffect(() => {
    if (props.profile) {
      setBio(props.profile.bio || '');
      setDisplayName(props.profile.display_name || '');
    }
  }, [props.profile]);

  const onsubmit = async (event) => {
    event.preventDefault();
    const accessToken = await getAccessToken();
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/profile/update`;
      const res = await fetch(backend_url, {
        method: "POST",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          bio: bio,
          display_name: displayName
        }),
      });
      let data = await res.json();
      if (res.status === 200) {
        await props.loadData();
        props.setPopped(false);
      } else {
        console.log(res);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const s3_upload_key = async (extension) => {
    const gateway_url = `${process.env.REACT_APP_API_GATEWAY_ENDPOINT_URL}/avatars/key_upload`;
    const accessToken = await getAccessToken();
    try {
      const res = await fetch(gateway_url, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ extension: extension })
      });
      let data = await res.json();
      return data.url;
    } catch (err) {
      console.log(err);
    }
  };

  const s3_upload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const filename = file.name;
    const extension = filename.split('.').pop();
    setUploadStatus('Uploading…');
    const presignedUrl = await s3_upload_key(extension);
    if (!presignedUrl) {
      setUploadStatus('Upload failed: could not get an upload link. Please try again.');
      return;
    }

    try {
      const res = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });
      if (res.status === 200) {
        console.log('Avatar uploaded successfully');
        setUploadStatus('Photo uploaded. It can take a minute to appear. Refresh the page to see it.');
      } else {
        console.log('Upload failed:', res);
        setUploadStatus(`Upload failed (${res.status}). Please try again.`);
      }
    } catch (err) {
      console.log(err);
      setUploadStatus('Upload failed. Please try again.');
    }
  };

  const bio_onchange = (event) => {
    setBio(event.target.value);
  };

  const display_name_onchange = (event) => {
    setDisplayName(event.target.value);
  };

  const close = (event) => {
    if (event) event.preventDefault();
    setUploadStatus(null);
    props.setPopped(false);
  };

  if (props.popped === true) {
    return (
      <div className="popup_form_wrap">
        <div className="popup_form">
          <div className="popup_heading">
            <div className="popup_title">Edit Profile</div>
            <div className='popup_close' onClick={close}>X</div>
          </div>
          <div className="popup_content">
            <div className="field">
              <label>Display Name</label>
              <input
                type="text"
                placeholder="Display Name"
                value={displayName}
                onChange={display_name_onchange}
              />
            </div>
            <div className="field">
              <label>Bio</label>
              <textarea
                placeholder="Bio"
                value={bio}
                onChange={bio_onchange}
              />
            </div>
            <div className="field">
              <label>Avatar</label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={s3_upload}
              />
              {uploadStatus && (
                <div
                  className='upload_status'
                  style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}
                >
                  {uploadStatus}
                </div>
              )}
            </div>
            <div className='submit'>
              <button onClick={onsubmit}>Save</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
