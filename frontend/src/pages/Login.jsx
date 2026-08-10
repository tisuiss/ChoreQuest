import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Swords } from 'lucide-react';

export default function Login() {
  const { t } = useTranslation();
  const { login, pinLogin } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [usePinMode, setUsePinMode] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(t('login.usernameRequired'));
      return;
    }

    if (usePinMode) {
      if (pin.length < 4) {
        setError(t('login.enterPin'));
        return;
      }
    } else if (!password) {
      setError(t('login.passwordRequired'));
      return;
    }

    setSubmitting(true);
    try {
      if (usePinMode) {
        await pinLogin(username.trim(), pin);
      } else {
        await login(username.trim(), password);
      }
      navigate('/');
    } catch (err) {
      setError(err?.message || t('login.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-navy">
      <form
        onSubmit={handleSubmit}
        className="game-panel w-full max-w-sm p-6"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
            <Swords size={16} className="text-navy" />
          </div>
          <h1 className="text-cream text-lg font-semibold">
            {t('common.appName')}
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm">
            {error}
          </div>
        )}

        {/* Username */}
        <div className="mb-3">
          <label className="block text-cream text-sm font-medium mb-1">
            {t('login.username')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('login.usernamePlaceholder')}
            autoComplete="username"
            className="field-input"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-muted text-sm">{t('login.loginWith')}</span>
          <button
            type="button"
            onClick={() => {
              setUsePinMode(!usePinMode);
              setError('');
            }}
            className="flex items-center gap-2 text-sm"
          >
            <div
              className={`relative w-9 h-5 rounded-full transition-colors ${
                usePinMode
                  ? 'bg-accent/30 border border-accent/40'
                  : 'bg-navy border border-border'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                  usePinMode
                    ? 'left-4 bg-accent'
                    : 'left-0.5 bg-muted/60'
                }`}
              />
            </div>
            <span className={`font-medium ${usePinMode ? 'text-accent' : 'text-muted'}`}>
              {usePinMode ? t('login.pin') : t('login.password')}
            </span>
          </button>
        </div>

        {/* Password */}
        {!usePinMode && (
          <div className="mb-5">
            <label className="block text-cream text-sm font-medium mb-1">
              {t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              autoComplete="current-password"
              className="field-input"
            />
          </div>
        )}

        {/* PIN entry */}
        {usePinMode && (
          <div className="mb-5">
            <label className="block text-cream text-sm font-medium mb-1">
              {t('login.pinCode')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('login.pinPlaceholder')}
              className="field-input text-center tracking-[0.3em]"
            />
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className={`game-btn game-btn-blue w-full text-sm ${submitting ? 'opacity-60 cursor-wait' : ''}`}
        >
          {submitting ? t('login.signingIn') : t('login.signIn')}
        </button>

        {/* Register link */}
        <p className="text-center mt-5 text-muted text-sm">
          {t('login.newHere')}{' '}
          <Link to="/register" className="text-accent hover:text-accent-light font-medium transition-colors">
            {t('login.createAccount')}
          </Link>
        </p>
      </form>
    </div>
  );
}
