import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Swords } from 'lucide-react';

export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('kid');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(t('register.usernameRequired'));
      return;
    }
    if (!password) {
      setError(t('register.passwordRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('register.passwordTooShort'));
      return;
    }
    if (!displayName.trim()) {
      setError(t('register.displayNameRequired'));
      return;
    }
    if (displayName.trim().length > 10) {
      setError(t('register.displayNameTooLong'));
      return;
    }

    setSubmitting(true);
    try {
      await register(
        username.trim(),
        password,
        displayName.trim(),
        role,
        inviteCode.trim() || undefined
      );
      navigate('/');
    } catch (err) {
      setError(err?.message || t('register.registrationFailed'));
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
            {t('register.createAccount')}
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
            placeholder={t('register.usernamePlaceholder')}
            autoComplete="username"
            className="field-input"
          />
        </div>

        {/* Password */}
        <div className="mb-3">
          <label className="block text-cream text-sm font-medium mb-1">
            {t('login.password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('register.passwordPlaceholder')}
            autoComplete="new-password"
            className="field-input"
          />
        </div>

        {/* Display Name */}
        <div className="mb-3">
          <label className="block text-cream text-sm font-medium mb-1">
            {t('profile.displayName')}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={10}
            placeholder={t('register.displayNamePlaceholder')}
            autoComplete="off"
            className="field-input"
          />
        </div>

        {/* Role */}
        <div className="mb-3">
          <label className="block text-cream text-sm font-medium mb-1">
            {t('register.role')}
          </label>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="field-input appearance-none cursor-pointer pr-10"
            >
              <option value="kid">{t('register.roleKid')}</option>
              <option value="parent">{t('register.roleParent')}</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </div>

        {/* Invite Code */}
        <div className="mb-5">
          <label className="block text-cream text-sm font-medium mb-1">
            {t('register.inviteCode')}
          </label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t('register.inviteCodePlaceholder')}
            autoComplete="off"
            className="field-input"
          />
          <p className="text-muted text-xs mt-1">
            {t('register.inviteCodeHint')}
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className={`game-btn game-btn-blue w-full text-sm ${submitting ? 'opacity-60 cursor-wait' : ''}`}
        >
          {submitting ? t('register.creatingAccount') : t('register.createAccount')}
        </button>

        {/* Login link */}
        <p className="text-center mt-5 text-muted text-sm">
          {t('register.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-accent hover:text-accent-light font-medium transition-colors">
            {t('login.signIn')}
          </Link>
        </p>
      </form>
    </div>
  );
}
