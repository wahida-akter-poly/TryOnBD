import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ScanLine } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, ErrorState, Input, PasswordInput, Select } from '../../components/common/UI';
import DemoNotice from '../../components/common/DemoNotice';
import { useAsync } from '../../hooks/useAsync';
import { roles } from '../../utils/format';
import { services } from '../../services';

export default function Auth() {
  const { pathname } = useLocation();
  const mode = pathname.slice(1);
  const register = mode === 'register';
  const seller = mode === 'seller-register';
  const forgot = mode === 'forgot-password';
  const reset = mode === 'reset-password';
  const loginPage = mode === 'login';
  const { user, mutate, login, toast } = useApp();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    address: '',
    businessName: '',
    subscriptionStatus: 'BASIC',
    role: 'customer',
  });
  const [remember, setRemember] = useState(false);
  const [complete, setComplete] = useState(false);
  const { busy, error, run, setError } = useAsync();
  const change = (key) => (e) => setValues((old) => ({ ...old, [key]: e.target.value }));
  const title = seller
    ? 'Let your craft be seen.'
    : register
      ? 'A fresh start in style.'
      : forgot
        ? 'Let’s find your way back.'
        : reset
          ? 'A new beginning.'
          : 'Good to see you again.';
  function submit(e) {
    e.preventDefault();
    run(async () => {
      if ((register || reset) && values.password !== values.confirmPassword) {
        setError('Your passwords do not match.');
        return;
      }
      if (forgot || reset) {
        setComplete(true);
        toast(
          forgot
            ? 'Demo reset step completed. No email was sent.'
            : 'Reset preview complete. No password was stored or changed.',
        );
        return;
      }
      if (register || seller) {
        const requiredText = seller
          ? [values.businessName, values.phone]
          : [values.fullName, values.phone, values.address];
        if (requiredText.some((value) => !value.trim())) {
          setError('Please complete every required field with a nonblank value.');
          return;
        }
        if (!seller) {
          try {
            const { data } = await services.auth.register({
              fullName: values.fullName.trim(),
              email: values.email,
              password: values.password,
              phone: values.phone,
              address: values.address,
            });
            login('customer', remember, data.user.id, data.accessToken, data.user);
            toast('Account created successfully.');
            navigate('/products');
            return;
          } catch (error) {
            setError(error.response?.data?.message || 'Registration failed.');
            return;
          }
        }
        const payload = {
          userId: user.testId || 1,
          businessName: values.businessName.trim(),
          contactEmail: values.email,
          phone: values.phone,
          subscriptionStatus: values.subscriptionStatus,
        };
        const result = await mutate(
          'sellers',
          'create',
          payload,
          null,
          { userId: user.id, moderationStatus: 'PENDING' },
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        login('seller', remember, user.id);
        navigate('/dashboard/seller');
      } else {
        try {
          const { data } = await services.auth.login({
            email: values.email,
            password: values.password,
          });
          const nextRole = data.user.role?.toLowerCase() || values.role;
          login(nextRole, remember, data.user.id, data.accessToken, data.user);
          toast('Signed in successfully.');
          navigate(nextRole === 'seller' ? '/dashboard/seller' : '/products');
          return;
        } catch (error) {
          setError(error.response?.data?.message || 'Authentication failed.');
          return;
        }
      }
    });
  }
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <span className="eyebrow">A NEW PERSPECTIVE</span>
        <h2>
          Style is personal.
          <br />
          <em>Make it yours.</em>
        </h2>
        <div className="auth-orbit">
          <ScanLine size={84} strokeWidth={0.7} />
        </div>
        <p>
          Thoughtfully imagined for Bangladesh.
          <br />A little tradition. A world of possibility.
        </p>
      </aside>
      <section className="auth-form-wrap">
        <span className="eyebrow">{seller ? 'THE SELLER COLLECTIVE' : 'YOUR TRYONBD SPACE'}</span>
        <h1>{title}</h1>
        <p className="muted mb-6">
          {seller
            ? 'Bring your collection into our seller demonstration.'
            : 'Sign in with your TryOnBD account.'}
        </p>
        {complete ? (
          <div className="notice">
            <div>
              <h3>{forgot ? 'Demo reset step ready' : 'Reset preview complete'}</h3>
              <p>
                {forgot
                  ? 'No email was sent. Continue to the reset preview below.'
                  : 'Real password recovery requires backend authentication, which is a future feature.'}
              </p>
              <Link className="btn btn-primary mt-5" to={forgot ? '/reset-password' : '/login'}>
                {forgot ? 'Open reset preview' : 'Return to demo login'}
              </Link>
            </div>
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            {(register || seller) && <DemoNotice compact />}
            {loginPage && (
              <div className="notice text-sm">
                Use your registered email and password. Your session is secured with a bearer token.
              </div>
            )}
            {register && (
              <Input
                label="Full name"
                value={values.fullName}
                onChange={change('fullName')}
                required
              />
            )}
            {seller && (
              <Input
                label="Business name"
                value={values.businessName}
                onChange={change('businessName')}
                required
              />
            )}
            {!reset && (
              <Input
                label={seller ? 'Business email' : 'Email address'}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={values.email}
                onChange={change('email')}
                required
              />
            )}
            {(register || seller) && (
              <Input
                label="Phone number"
                type="tel"
                value={values.phone}
                onChange={change('phone')}
                required
              />
            )}
            {register && (
              <Input label="Address" value={values.address} onChange={change('address')} required />
            )}
            {!seller && !forgot && (
              <PasswordInput
                value={values.password}
                onChange={change('password')}
                minLength={8}
                autoComplete={loginPage ? 'current-password' : 'new-password'}
                required
              />
            )}
            {(register || reset) && (
              <PasswordInput
                label="Confirm password"
                value={values.confirmPassword}
                onChange={change('confirmPassword')}
                minLength={8}
                required
                autoComplete="new-password"
              />
            )}
            {loginPage && (
              <Select label="Demo role" value={values.role} onChange={change('role')}>
                {Object.entries(roles).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </Select>
            )}
            {seller && (
              <>
                <Select
                  label="Demo subscription"
                  value={values.subscriptionStatus}
                  onChange={change('subscriptionStatus')}
                >
                  <option value="BASIC">Basic</option>
                  <option value="PREMIUM">Premium</option>
                </Select>
                <small className="muted">
                  Using current demo user: {user.fullName}. Subscription billing is not active.
                </small>
              </>
            )}
            {(loginPage || register) && (
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember demo session
                </label>
                {loginPage && (
                  <Link className="text-link" to="/forgot-password">
                    Forgot password?
                  </Link>
                )}
              </div>
            )}
            {error && <ErrorState message={error} />}
            <Button type="submit" busy={busy} className="w-full">
              {seller
                ? 'Create demo seller'
                : register
                  ? 'Create account'
                  : forgot
                    ? 'Preview password recovery'
                    : reset
                      ? 'Preview password reset'
                      : 'Sign in'}
              <ArrowUpRight size={17} />
            </Button>
          </form>
        )}
        <p className="auth-bottom">
          {loginPage ? (
            <>
              New perspective? <Link to="/register">Create a demo account</Link>
            </>
          ) : (
            <Link to="/login">Back to demo sign in</Link>
          )}
        </p>
      </section>
    </div>
  );
}
