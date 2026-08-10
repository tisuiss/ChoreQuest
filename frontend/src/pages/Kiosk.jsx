import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Swords, ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import AvatarDisplay from '../components/AvatarDisplay';

export default function Kiosk() {
  const { t } = useTranslation();
  const { kioskLogin } = useAuth();
  const { applyDefaultIfUnset } = useLanguage();
  const navigate = useNavigate();

  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedKid, setSelectedKid] = useState(null);
  const [pin, setPin] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pinRefs = useRef([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/kiosk/kids');
        setKids(Array.isArray(data) ? data : []);
      } catch (err) {
        setLoadError(err.message || t('kiosk.loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/kiosk/settings');
        applyDefaultIfUnset(data?.default_language);
      } catch { /* non-critical — falls back to browser locale */ }
    })();
  }, [applyDefaultIfUnset]);

  const resetPinEntry = () => {
    setSelectedKid(null);
    setPin(['', '', '', '']);
    setPinError('');
  };

  const attemptLogin = useCallback(async (kidId, pinStr) => {
    setSubmitting(true);
    setPinError('');
    try {
      await kioskLogin(kidId, pinStr || null);
      navigate('/');
    } catch (err) {
      setPinError(err.message || t('kiosk.invalidPin'));
      setPin(['', '', '', '']);
      pinRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }, [kioskLogin, navigate, t]);

  const handleTileClick = (kid) => {
    if (submitting) return;
    if (kid.has_pin) {
      setSelectedKid(kid);
      setPin(['', '', '', '']);
      setPinError('');
      setTimeout(() => pinRefs.current[0]?.focus(), 50);
    } else {
      attemptLogin(kid.id, null);
    }
  };

  const handlePinChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    setPin((prev) => {
      const next = [...prev];
      next[index] = value;
      if (value && index === 3 && next.every((d) => d !== '')) {
        attemptLogin(selectedKid.id, next.join(''));
      }
      return next;
    });

    if (value && index < 3) {
      pinRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-navy">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
            <Swords size={16} className="text-navy" />
          </div>
          <h1 className="text-cream text-lg font-semibold">{t('common.appName')}</h1>
        </div>

        {selectedKid ? (
          <div className="game-panel w-full max-w-sm mx-auto p-6 flex flex-col items-center">
            <button
              onClick={resetPinEntry}
              className="self-start flex items-center gap-1.5 text-muted hover:text-cream text-sm mb-4 transition-colors"
            >
              <ArrowLeft size={14} />
              {t('common.back')}
            </button>

            <AvatarDisplay
              config={selectedKid.avatar_config}
              photoUrl={selectedKid.avatar_photo_url}
              size="lg"
              name={selectedKid.display_name}
            />
            <p className="text-cream text-base font-semibold mt-3 mb-5">
              {selectedKid.display_name}
            </p>

            {pinError && (
              <div className="mb-4 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm">
                {pinError}
              </div>
            )}

            <div className="flex gap-2.5">
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (pinRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={submitting}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl bg-navy border border-border text-accent rounded-md font-bold focus:border-accent focus:outline-none transition-colors"
                />
              ))}
            </div>

            {submitting && (
              <Loader2 size={18} className="text-accent animate-spin mt-4" />
            )}
          </div>
        ) : (
          <>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={24} className="text-accent animate-spin" />
              </div>
            ) : loadError ? (
              <div className="max-w-sm mx-auto p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm text-center">
                {loadError}
              </div>
            ) : kids.length === 0 ? (
              <p className="text-muted text-center text-sm">{t('kiosk.noKids')}</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-6">
                {kids.map((kid) => (
                  <button
                    key={kid.id}
                    onClick={() => handleTileClick(kid)}
                    className="flex flex-col items-center gap-2 min-w-[96px] group"
                  >
                    <div className="rounded-full ring-2 ring-transparent group-hover:ring-accent transition-all">
                      <AvatarDisplay config={kid.avatar_config} photoUrl={kid.avatar_photo_url} size="xl" name={kid.display_name} animate />
                    </div>
                    <span className="text-cream text-sm font-medium">{kid.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <p className="text-center mt-10 text-muted text-sm">
          <Link to="/login" className="text-accent hover:text-accent-light font-medium transition-colors">
            {t('kiosk.parentLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
