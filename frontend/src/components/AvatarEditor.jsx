import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import AvatarDisplay from './AvatarDisplay';
import { Save, Loader2, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

const HEAD_OPTIONS = [
  { id: 'round', labelKey: 'avatarEditor.head.round' },
  { id: 'oval', labelKey: 'avatarEditor.head.oval' },
  { id: 'square', labelKey: 'avatarEditor.head.square' },
  { id: 'diamond', labelKey: 'avatarEditor.head.diamond' },
  { id: 'heart', labelKey: 'avatarEditor.head.heart' },
  { id: 'long', labelKey: 'avatarEditor.head.long' },
  { id: 'triangle', labelKey: 'avatarEditor.head.triangle' },
  { id: 'pear', labelKey: 'avatarEditor.head.pear' },
  { id: 'wide', labelKey: 'avatarEditor.head.wide' },
];

const HAIR_OPTIONS = [
  { id: 'none', labelKey: 'avatarEditor.hair.none' },
  { id: 'short', labelKey: 'avatarEditor.hair.short' },
  { id: 'long', labelKey: 'avatarEditor.hair.long' },
  { id: 'spiky', labelKey: 'avatarEditor.hair.spiky' },
  { id: 'curly', labelKey: 'avatarEditor.hair.curly' },
  { id: 'mohawk', labelKey: 'avatarEditor.hair.mohawk' },
  { id: 'buzz', labelKey: 'avatarEditor.hair.buzz' },
  { id: 'ponytail', labelKey: 'avatarEditor.hair.ponytail' },
  { id: 'bun', labelKey: 'avatarEditor.hair.bun' },
  { id: 'pigtails', labelKey: 'avatarEditor.hair.pigtails' },
  { id: 'afro', labelKey: 'avatarEditor.hair.afro' },
  { id: 'braids', labelKey: 'avatarEditor.hair.braids' },
  { id: 'wavy', labelKey: 'avatarEditor.hair.wavy' },
  { id: 'side_part', labelKey: 'avatarEditor.hair.side_part' },
  { id: 'fade', labelKey: 'avatarEditor.hair.fade' },
  { id: 'dreadlocks', labelKey: 'avatarEditor.hair.dreadlocks' },
  { id: 'bob', labelKey: 'avatarEditor.hair.bob' },
  { id: 'shoulder', labelKey: 'avatarEditor.hair.shoulder' },
  { id: 'undercut', labelKey: 'avatarEditor.hair.undercut' },
  { id: 'twin_buns', labelKey: 'avatarEditor.hair.twin_buns' },
];

const EYES_OPTIONS = [
  { id: 'normal', labelKey: 'avatarEditor.eyes.normal' },
  { id: 'happy', labelKey: 'avatarEditor.eyes.happy' },
  { id: 'wide', labelKey: 'avatarEditor.eyes.wide' },
  { id: 'sleepy', labelKey: 'avatarEditor.eyes.sleepy' },
  { id: 'wink', labelKey: 'avatarEditor.eyes.wink' },
  { id: 'angry', labelKey: 'avatarEditor.eyes.angry' },
  { id: 'dot', labelKey: 'avatarEditor.eyes.dot' },
  { id: 'star', labelKey: 'avatarEditor.eyes.star' },
  { id: 'glasses', labelKey: 'avatarEditor.eyes.glasses' },
  { id: 'sunglasses', labelKey: 'avatarEditor.eyes.sunglasses' },
  { id: 'eye_patch', labelKey: 'avatarEditor.eyes.eye_patch' },
  { id: 'crying', labelKey: 'avatarEditor.eyes.crying' },
  { id: 'heart_eyes', labelKey: 'avatarEditor.eyes.heart_eyes' },
  { id: 'dizzy', labelKey: 'avatarEditor.eyes.dizzy' },
  { id: 'closed', labelKey: 'avatarEditor.eyes.closed' },
];

const MOUTH_OPTIONS = [
  { id: 'smile', labelKey: 'avatarEditor.mouth.smile' },
  { id: 'grin', labelKey: 'avatarEditor.mouth.grin' },
  { id: 'neutral', labelKey: 'avatarEditor.mouth.neutral' },
  { id: 'open', labelKey: 'avatarEditor.mouth.open' },
  { id: 'tongue', labelKey: 'avatarEditor.mouth.tongue' },
  { id: 'frown', labelKey: 'avatarEditor.mouth.frown' },
  { id: 'surprised', labelKey: 'avatarEditor.mouth.surprised' },
  { id: 'smirk', labelKey: 'avatarEditor.mouth.smirk' },
  { id: 'braces', labelKey: 'avatarEditor.mouth.braces' },
  { id: 'vampire', labelKey: 'avatarEditor.mouth.vampire' },
  { id: 'whistle', labelKey: 'avatarEditor.mouth.whistle' },
  { id: 'mask', labelKey: 'avatarEditor.mouth.mask' },
  { id: 'beard', labelKey: 'avatarEditor.mouth.beard' },
  { id: 'moustache', labelKey: 'avatarEditor.mouth.moustache' },
];

const BODY_OPTIONS = [
  { id: 'slim', labelKey: 'avatarEditor.body.slim' },
  { id: 'regular', labelKey: 'avatarEditor.body.regular' },
  { id: 'broad', labelKey: 'avatarEditor.body.broad' },
];

const HAT_OPTIONS = [
  { id: 'none', labelKey: 'avatarEditor.hat.none' },
  { id: 'crown', labelKey: 'avatarEditor.hat.crown' },
  { id: 'wizard', labelKey: 'avatarEditor.hat.wizard' },
  { id: 'beanie', labelKey: 'avatarEditor.hat.beanie' },
  { id: 'cap', labelKey: 'avatarEditor.hat.cap' },
  { id: 'pirate', labelKey: 'avatarEditor.hat.pirate' },
  { id: 'headphones', labelKey: 'avatarEditor.hat.headphones' },
  { id: 'tiara', labelKey: 'avatarEditor.hat.tiara' },
  { id: 'horns', labelKey: 'avatarEditor.hat.horns' },
  { id: 'bunny_ears', labelKey: 'avatarEditor.hat.bunny_ears' },
  { id: 'cat_ears', labelKey: 'avatarEditor.hat.cat_ears' },
  { id: 'halo', labelKey: 'avatarEditor.hat.halo' },
  { id: 'viking', labelKey: 'avatarEditor.hat.viking' },
];

const ACCESSORY_OPTIONS = [
  { id: 'scarf', labelKey: 'avatarEditor.accessory.scarf' },
  { id: 'necklace', labelKey: 'avatarEditor.accessory.necklace' },
  { id: 'bow_tie', labelKey: 'avatarEditor.accessory.bow_tie' },
  { id: 'cape', labelKey: 'avatarEditor.accessory.cape' },
  { id: 'wings', labelKey: 'avatarEditor.accessory.wings' },
  { id: 'shield', labelKey: 'avatarEditor.accessory.shield' },
  { id: 'sword', labelKey: 'avatarEditor.accessory.sword' },
];

const FACE_EXTRA_OPTIONS = [
  { id: 'none', labelKey: 'avatarEditor.faceExtra.none' },
  { id: 'freckles', labelKey: 'avatarEditor.faceExtra.freckles' },
  { id: 'blush', labelKey: 'avatarEditor.faceExtra.blush' },
  { id: 'face_paint', labelKey: 'avatarEditor.faceExtra.face_paint' },
  { id: 'scar', labelKey: 'avatarEditor.faceExtra.scar' },
  { id: 'bandage', labelKey: 'avatarEditor.faceExtra.bandage' },
  { id: 'stickers', labelKey: 'avatarEditor.faceExtra.stickers' },
];

const OUTFIT_PATTERN_OPTIONS = [
  { id: 'none', labelKey: 'avatarEditor.pattern.none' },
  { id: 'stripes', labelKey: 'avatarEditor.pattern.stripes' },
  { id: 'stars', labelKey: 'avatarEditor.pattern.stars' },
  { id: 'camo', labelKey: 'avatarEditor.pattern.camo' },
  { id: 'tie_dye', labelKey: 'avatarEditor.pattern.tie_dye' },
  { id: 'plaid', labelKey: 'avatarEditor.pattern.plaid' },
];

const SKIN_COLORS = [
  '#ffe0bd', '#ffcc99', '#f5d6b8', '#f8d9c0',
  '#e8b88a', '#d4a373', '#c68642', '#a67c52',
  '#8d5524', '#6b3a2a', '#4a2912', '#3b1f0e',
  '#f0c4a8', '#d4956a', '#b07848', '#8a6642',
];

const HAIR_COLORS = [
  '#4a3728', '#1a1a2e', '#8b4513', '#d4a017',
  '#c0392b', '#2e86c1', '#7d3c98', '#27ae60',
  '#e74c3c', '#f39c12', '#ecf0f1', '#ff6b9d',
];

const EYE_COLORS = [
  '#333333', '#1a5276', '#27ae60', '#8b4513',
  '#7d3c98', '#c0392b', '#2e86c1', '#e74c3c',
];

const MOUTH_COLORS = [
  '#cc6666', '#e74c3c', '#d4a373', '#c0392b',
  '#ff6b9d', '#a93226', '#8b4513', '#333333',
];

const BODY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#1a1a2e', '#ecf0f1',
];

const BG_COLORS = [
  '#1a1a2e', '#0f0e17', '#16213e', '#1b4332',
  '#4a1942', '#2d1b69', '#1a3a3a', '#3d0c02',
  '#2e86c1', '#27ae60', '#f39c12', '#8e44ad',
];

const HAT_COLORS = [
  '#f39c12', '#e74c3c', '#3b82f6', '#10b981',
  '#a855f7', '#ec4899', '#f59e0b', '#1a1a2e',
  '#c0c0c0', '#f9d71c', '#8b4513', '#ecf0f1',
];

const ACCESSORY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f39c12',
  '#a855f7', '#ec4899', '#c0c0c0', '#f9d71c',
  '#8b4513', '#1a1a2e', '#ecf0f1', '#06b6d4',
];

const AVATAR_CONFIG_VERSION = 2;

const DEFAULT_CONFIG = {
  _v: AVATAR_CONFIG_VERSION,
  head: 'round',
  hair: 'short',
  eyes: 'normal',
  mouth: 'smile',
  body: 'regular',
  head_color: '#ffcc99',
  hair_color: '#4a3728',
  eye_color: '#333333',
  mouth_color: '#cc6666',
  body_color: '#3b82f6',
  bg_color: '#1a1a2e',
  hat: 'none',
  hat_color: '#f39c12',
  accessory: 'none',
  accessories: [],
  accessory_color: '#3b82f6',
  face_extra: 'none',
  outfit_pattern: 'none',
};

const CATEGORIES = [
  { id: 'head', labelKey: 'avatarEditor.categories.head' },
  { id: 'skin', labelKey: 'avatarEditor.categories.skin' },
  { id: 'hair', labelKey: 'avatarEditor.categories.hair' },
  { id: 'eyes', labelKey: 'avatarEditor.categories.eyes' },
  { id: 'mouth', labelKey: 'avatarEditor.categories.mouth' },
  { id: 'body', labelKey: 'avatarEditor.categories.body' },
  { id: 'outfit', labelKey: 'avatarEditor.categories.outfit' },
  { id: 'pattern', labelKey: 'avatarEditor.categories.pattern' },
  { id: 'background', labelKey: 'avatarEditor.categories.background' },
  { id: 'hat', labelKey: 'avatarEditor.categories.hat' },
  { id: 'face', labelKey: 'avatarEditor.categories.face' },
  { id: 'accessory', labelKey: 'avatarEditor.categories.accessory' },
];

function ColorSwatch({ colors, selected, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            selected === c ? 'border-accent' : 'border-transparent hover:border-border-light'
          }`}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function ShapeSelector({ options, selected, onSelect }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all select-none ${
            selected === opt.id
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-muted hover:border-border-light hover:text-cream'
          }`}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}

function MultiShapeSelector({ options, selected, onToggle }) {
  const { t } = useTranslation();
  // selected is an array of ids
  const selectedSet = new Set(selected || []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = selectedSet.has(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all select-none ${
              isActive
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted hover:border-border-light hover:text-cream'
            }`}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function CategoryContent({ category, config, set }) {
  const { t } = useTranslation();
  switch (category) {
    case 'head':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.shape')}</p>
          <ShapeSelector options={HEAD_OPTIONS} selected={config.head} onSelect={(v) => set('head', v)} />
        </div>
      );
    case 'skin':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={SKIN_COLORS} selected={config.head_color} onSelect={(v) => set('head_color', v)} />
        </div>
      );
    case 'hair':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.style')}</p>
          <ShapeSelector options={HAIR_OPTIONS} selected={config.hair} onSelect={(v) => set('hair', v)} />
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={HAIR_COLORS} selected={config.hair_color} onSelect={(v) => set('hair_color', v)} />
        </div>
      );
    case 'eyes':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.style')}</p>
          <ShapeSelector options={EYES_OPTIONS} selected={config.eyes} onSelect={(v) => set('eyes', v)} />
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={EYE_COLORS} selected={config.eye_color} onSelect={(v) => set('eye_color', v)} />
        </div>
      );
    case 'mouth':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.style')}</p>
          <ShapeSelector options={MOUTH_OPTIONS} selected={config.mouth} onSelect={(v) => set('mouth', v)} />
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={MOUTH_COLORS} selected={config.mouth_color} onSelect={(v) => set('mouth_color', v)} />
        </div>
      );
    case 'body':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.shape')}</p>
          <ShapeSelector options={BODY_OPTIONS} selected={config.body} onSelect={(v) => set('body', v)} />
        </div>
      );
    case 'outfit':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={BODY_COLORS} selected={config.body_color} onSelect={(v) => set('body_color', v)} />
        </div>
      );
    case 'pattern':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.categories.pattern')}</p>
          <ShapeSelector options={OUTFIT_PATTERN_OPTIONS} selected={config.outfit_pattern} onSelect={(v) => set('outfit_pattern', v)} />
        </div>
      );
    case 'background':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={BG_COLORS} selected={config.bg_color} onSelect={(v) => set('bg_color', v)} />
        </div>
      );
    case 'hat':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.style')}</p>
          <ShapeSelector options={HAT_OPTIONS} selected={config.hat} onSelect={(v) => set('hat', v)} />
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={HAT_COLORS} selected={config.hat_color} onSelect={(v) => set('hat_color', v)} />
        </div>
      );
    case 'face':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.extra')}</p>
          <ShapeSelector options={FACE_EXTRA_OPTIONS} selected={config.face_extra} onSelect={(v) => set('face_extra', v)} />
        </div>
      );
    case 'accessory': {
      // Multi-accessory: read from accessories array, fall back to legacy single
      const currentAccessories = Array.isArray(config.accessories) && config.accessories.length > 0
        ? config.accessories
        : (config.accessory && config.accessory !== 'none' ? [config.accessory] : []);
      const toggleAccessory = (id) => {
        const cur = new Set(currentAccessories);
        if (cur.has(id)) cur.delete(id); else cur.add(id);
        const arr = [...cur];
        // set() uses functional updates internally so sequential calls chain correctly
        set('accessories', arr);
        set('accessory', arr.length > 0 ? arr[0] : 'none');
      };
      const clearAll = () => {
        set('accessories', []);
        set('accessory', 'none');
      };
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">{t('avatarEditor.categories.accessory')} <span className="text-muted/50">{t('avatarEditor.selectMultiple')}</span></p>
          <MultiShapeSelector options={ACCESSORY_OPTIONS} selected={currentAccessories} onToggle={toggleAccessory} />
          {currentAccessories.length > 0 && (
            <button onClick={clearAll} className="text-[10px] text-crimson hover:text-crimson/80 transition-colors">
              {t('avatarEditor.clearAllGear')}
            </button>
          )}
          <p className="text-muted text-xs font-medium">{t('avatarEditor.colour')}</p>
          <ColorSwatch colors={ACCESSORY_COLORS} selected={config.accessory_color} onSelect={(v) => set('accessory_color', v)} />
        </div>
      );
    }
    default:
      return null;
  }
}

function CategoryStrip({ openCategory, onSelect }) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 120, behavior: 'smooth' });
  };

  return (
    <div className="flex-shrink-0 border-b border-border bg-surface px-1 py-2 relative">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-surface/90 border border-border text-muted hover:text-cream"
          aria-label={t('avatarEditor.scrollLeft')}
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-0.5 px-2 scrollbar-hide"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              openCategory === cat.id
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:border-border-light hover:text-cream'
            }`}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-surface/90 border border-border text-muted hover:text-cream"
          aria-label={t('avatarEditor.scrollRight')}
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

export default function AvatarEditor() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_CONFIG,
    ...(user?.avatar_config || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [openCategory, setOpenCategory] = useState('head');

  const goBack = useCallback(() => navigate(-1), [navigate]);

  // Reset config from user when avatar_config changes
  useEffect(() => {
    if (user?.avatar_config) {
      setConfig((prev) => {
        // Only reset if user config actually changed (e.g. after save from another tab)
        const userCfg = { ...DEFAULT_CONFIG, ...(user.avatar_config || {}) };
        if (JSON.stringify(prev) === JSON.stringify(userCfg)) return prev;
        return userCfg;
      });
    }
  }, [user?.avatar_config]);

  // Escape key to go back
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') goBack(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [goBack]);

  const set = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setMsg('');
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await api('/api/avatar', { method: 'PUT', body: { config } });
      updateUser({ avatar_config: res.avatar_config || config });
      setMsg(t('avatarEditor.saved'));
      setTimeout(() => goBack(), 600);
    } catch (err) {
      setMsg(err.message || t('avatarEditor.saveFailed'));
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* ─── Pinned top: back button + avatar preview ─── */}
      <div className="flex-shrink-0 border-b border-border bg-surface-raised/50 px-4 pt-3 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="p-1.5 rounded-lg hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('common.back')}
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-heading text-cream text-sm font-semibold">{t('avatarEditor.title')}</h2>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="game-btn game-btn-blue flex items-center gap-1.5 !py-1.5 !px-4 !text-xs"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? t('avatarEditor.saving') : msg || t('common.save')}
          </button>
        </div>
        <div className="flex justify-center">
          <div className="avatar-idle rounded-md transition-shadow duration-300">
            <AvatarDisplay config={config} size="xl" />
          </div>
        </div>
      </div>

      {/* ─── Category strip (pinned, horizontal scroll with arrows) ─── */}
      <CategoryStrip openCategory={openCategory} onSelect={setOpenCategory} />

      {/* ─── Scrollable options area ─── */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {openCategory && (
          <CategoryContent
            category={openCategory}
            config={config}
            set={set}
          />
        )}
      </div>
    </div>
  );
}
