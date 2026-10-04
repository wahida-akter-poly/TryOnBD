import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { services } from '../../services';
import { errorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Button, Input, PasswordInput } from '../../components/common/UI';
export default function Auth() {
  const register = useLocation().pathname === '/register';
  const { login } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({
      fullName: '',
      email: '',
      password: '',
      phone: '',
      address: '',
    }),
    [remember, setRemember] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const change = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await services.auth[register ? 'register' : 'login'](
        register ? form : { email: form.email, password: form.password },
      );
      login(data.user.role.toLowerCase(), remember, data.user.id, data.accessToken, data.user);
      navigate(`/dashboard/${data.user.role.toLowerCase()}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <h2>
          Style is personal.
          <br />
          <em>Make it yours.</em>
        </h2>
        <p>Thoughtfully imagined for Bangladesh.</p>
      </aside>
      <section className="auth-form-wrap">
        <h1>{register ? 'Create your account' : 'Good to see you again.'}</h1>
        <form className="form-stack" onSubmit={submit}>
          {register && (
            <Input label="Full name" required value={form.fullName} onChange={change('fullName')} />
          )}
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={change('email')}
          />
          <PasswordInput
            autoComplete={register ? 'new-password' : 'current-password'}
            minLength={6}
            required
            value={form.password}
            onChange={change('password')}
          />
          {register && (
            <>
              <Input label="Phone" required value={form.phone} onChange={change('phone')} />
              <Input label="Address" required value={form.address} onChange={change('address')} />
            </>
          )}
          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />{' '}
            Keep me signed in
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button busy={busy}>{register ? 'Create account' : 'Sign in'}</Button>
        </form>
        <Link to={register ? '/login' : '/register'}>
          {register ? 'Already have an account?' : 'Create an account'}
        </Link>
      </section>
    </div>
  );
}
