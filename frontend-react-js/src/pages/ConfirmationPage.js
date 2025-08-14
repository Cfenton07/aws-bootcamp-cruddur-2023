import './ConfirmationPage.css';
import React from "react";
import { useParams } from 'react-router-dom';
import {ReactComponent as Logo} from '../components/svg/logo.svg';

// [TODO] Authenication
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';

export default function ConfirmationPage() {
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [cognitoErrors, setCognitoErrors] = React.useState(''); // Changed here for consistency
  const [codeSent, setCodeSent] = React.useState(false);

  const params = useParams();

  const code_onchange = (event) => {
    setCode(event.target.value);
  }
  const email_onchange = (event) => {
    setEmail(event.target.value);
  }

  const resend_code = async (event) => {
  setCognitoErrors(''); // It's better to use one error state variable
  try {
    // Amplify v6's resendSignUpCode takes a 'username' object
    await resendSignUpCode({ username: email });
    console.log('code resent successfully');
    setCodeSent(true);
  } catch (err) {
    console.log(err);
    // Error messages may vary, so it's safer to not rely on specific strings
    setCognitoErrors(err.message);
  }
};

const onsubmit = async (event) => {
  event.preventDefault();
  setCognitoErrors('');
  try {
    // Amplify v6's confirmSignUp takes a 'username' and 'confirmationCode' object
    await confirmSignUp({ username: email, confirmationCode: code });
    // After confirmation, the user is signed in if autoSignIn was enabled
    // Redirect to the home page
    window.location.href = "/";
  } catch (error) {
    setCognitoErrors(error.message);
  }
  return false;
};


  let code_button;
  if (codeSent){
    code_button = <div className="sent-message">A new activation code has been sent to your email</div>
  } else {
    code_button = <button className="resend" onClick={resend_code}>Resend Activation Code</button>;
  }

  React.useEffect(()=>{
    if (params.email) {
      setEmail(params.email)
    }
  }, [params.email]) // Dependency array added

  return (
    <article className="confirm-article">
      <div className='recover-info'>
        <Logo className='logo' />
      </div>
      <div className='recover-wrapper'>
        <form
          className='confirm_form'
          onSubmit={onsubmit}
        >
          <h2>Confirm your Email</h2>
          <div className='fields'>
            <div className='field text_field email'>
              <label>Email</label>
              <input
                type="text"
                value={email}
                onChange={email_onchange} 
              />
            </div>
            <div className='field text_field code'>
              <label>Confirmation Code</label>
              <input
                type="text"
                value={code}
                onChange={code_onchange} 
              />
            </div>
          </div>
          {el_errors}
          <div className='submit'>
            <button type='submit'>Confirm Email</button>
          </div>
        </form>
      </div>
      {code_button}
    </article>
  );
}