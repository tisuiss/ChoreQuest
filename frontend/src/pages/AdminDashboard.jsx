import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';
import {
  Shield,
  Users,
  Key,
  Ticket,
  ScrollText,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';

const TABS = [
  { key: 'users', labelKey: 'admin.tabs.users', icon: Users },
  { key: 'api-keys', labelKey: 'admin.tabs.apiKeys', icon: Key },
  { key: 'invite-codes', labelKey: 'admin.tabs.inviteCodes', icon: Ticket },
  { key: 'audit-log', labelKey: 'admin.tabs.auditLog', icon: ScrollText },
];

// ─── Users Tab ───────────────────────────────────────────────────────
function UsersTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/admin/users');
      setUsers(Array.isArray(data) ? data : (data.users || []));
    } catch (err) {
      setError(err.message || t('admin.users.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateRole = async (userId, newRole) => {
    try {
      await api(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: { role: newRole },
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      setError(err.message || t('admin.users.roleUpdateError'));
    }
  };

  const resetPassword = async (usr) => {
    const newPassword = window.prompt(t('admin.users.resetPasswordPrompt', { name: usr.display_name || usr.username }));
    if (!newPassword) return;
    if (newPassword.length < 6) {
      setError(t('admin.users.passwordTooShort'));
      return;
    }
    try {
      await api(`/api/admin/users/${usr.id}/reset-password`, {
        method: 'POST',
        body: { new_password: newPassword },
      });
      setError('');
      alert(t('admin.users.passwordResetDone', { name: usr.display_name || usr.username }));
    } catch (err) {
      setError(err.message || t('admin.users.resetPasswordError'));
    }
  };

  const toggleActive = async (usr) => {
    try {
      await api(`/api/admin/users/${usr.id}`, {
        method: 'PUT',
        body: { is_active: !usr.is_active },
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === usr.id ? { ...u, is_active: !u.is_active } : u
        )
      );
    } catch (err) {
      setError(err.message || t('admin.users.toggleError'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={28} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <p className="text-muted text-center py-8 text-sm">
          {t('admin.users.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {users.map((usr) => (
            <div key={usr.id} className="p-3 rounded-md bg-surface-raised/30 border border-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-cream text-sm font-medium truncate">{usr.username}</p>
                  {usr.display_name && (
                    <p className="text-muted text-xs truncate">{usr.display_name}</p>
                  )}
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                    usr.is_active !== false
                      ? 'bg-emerald/10 text-emerald border border-emerald/30'
                      : 'bg-crimson/10 text-crimson border border-crimson/30'
                  }`}
                >
                  {usr.is_active !== false ? t('admin.users.active') : t('admin.users.inactive')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={usr.role}
                  onChange={(e) => updateRole(usr.id, e.target.value)}
                  className="field-input !py-1.5 !text-xs flex-1"
                >
                  <option value="kid">{t('common.roles.kid')}</option>
                  <option value="parent">{t('common.roles.parent')}</option>
                  <option value="admin">{t('common.roles.admin')}</option>
                </select>
                <button
                  onClick={() => resetPassword(usr)}
                  className="game-btn game-btn-blue !py-1.5 !px-3 !text-[10px] flex-shrink-0"
                >
                  <RotateCcw size={12} className="inline mr-1" />{t('admin.users.password')}
                </button>
                <button
                  onClick={() => toggleActive(usr)}
                  className={`game-btn !py-1.5 !px-3 !text-[10px] flex-shrink-0 ${
                    usr.is_active !== false ? 'game-btn-red' : 'game-btn-blue'
                  }`}
                >
                  {usr.is_active !== false ? (
                    <><EyeOff size={12} className="inline mr-1" />{t('admin.users.deactivate')}</>
                  ) : (
                    <><Eye size={12} className="inline mr-1" />{t('admin.users.activate')}</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── API Keys Tab ────────────────────────────────────────────────────
function ApiKeysTab() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/admin/api-keys');
      setKeys(Array.isArray(data) ? data : (data.keys || []));
    } catch (err) {
      setError(err.message || t('admin.apiKeys.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreateSubmitting(true);
    try {
      const data = await api('/api/admin/api-keys', {
        method: 'POST',
        body: { name: newKeyName.trim() },
      });
      setNewKeyValue(data.key || data.api_key || data.token || '');
      fetchKeys();
    } catch (err) {
      setError(err.message || t('admin.apiKeys.createError'));
      setCreateModal(false);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const deleteKey = async (id) => {
    try {
      await api(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err.message || t('admin.apiKeys.deleteError'));
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const closeCreateModal = () => {
    setCreateModal(false);
    setNewKeyName('');
    setNewKeyValue('');
    setCopied(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={28} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setCreateModal(true)}
          className="game-btn game-btn-blue flex items-center gap-2"
        >
          <Plus size={14} />
          {t('admin.apiKeys.createKey')}
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="text-muted text-center py-8 text-sm">
          {t('admin.apiKeys.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="p-3 rounded-md bg-surface-raised/30 border border-border">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-cream text-sm font-medium truncate min-w-0">
                  {k.name}
                </p>
                <button
                  onClick={() => deleteKey(k.id)}
                  className="p-1.5 rounded hover:bg-crimson/10 text-crimson/60 hover:text-crimson transition-colors flex-shrink-0"
                  title={t('admin.apiKeys.deleteTitle')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-muted text-xs">
                  {t('admin.apiKeys.prefix')} <span className="text-accent">{k.prefix || k.key_prefix || '***'}</span>
                </span>
                {k.scopes && (
                  <span className="text-muted text-xs">
                    {t('admin.apiKeys.scopes')} <span className="text-purple">{Array.isArray(k.scopes) ? k.scopes.join(', ') : k.scopes}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Key Modal */}
      <Modal
        isOpen={createModal}
        onClose={closeCreateModal}
        title={newKeyValue ? t('admin.apiKeys.keyCreated') : t('admin.apiKeys.createModalTitle')}
        actions={
          newKeyValue
            ? [
                {
                  label: t('common.done'),
                  onClick: closeCreateModal,
                  className: 'game-btn game-btn-blue',
                },
              ]
            : [
                {
                  label: t('common.cancel'),
                  onClick: closeCreateModal,
                  className: 'game-btn game-btn-red',
                },
                {
                  label: createSubmitting ? t('admin.apiKeys.creating') : t('common.create'),
                  onClick: createKey,
                  className: 'game-btn game-btn-blue',
                  disabled: createSubmitting || !newKeyName.trim(),
                },
              ]
        }
      >
        {newKeyValue ? (
          <div className="space-y-3">
            <p className="text-muted text-sm">
              {t('admin.apiKeys.copyNowWarning')}
            </p>
            <div className="flex gap-2">
              <code className="flex-1 bg-navy p-3 rounded border border-accent/30 text-accent text-sm break-all">
                {newKeyValue}
              </code>
              <button
                onClick={() => copyToClipboard(newKeyValue)}
                className="flex-shrink-0 p-2 rounded hover:bg-surface-raised transition-colors"
                title={t('common.copy')}
              >
                {copied ? (
                  <Check size={18} className="text-emerald" />
                ) : (
                  <Copy size={18} className="text-muted" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-cream text-sm font-medium mb-2">
              {t('admin.apiKeys.keyName')}
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t('admin.apiKeys.keyNamePlaceholder')}
              className="field-input"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Invite Codes Tab ────────────────────────────────────────────────
function InviteCodesTab() {
  const { t } = useTranslation();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [newRole, setNewRole] = useState('kid');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/admin/invite-codes');
      setCodes(Array.isArray(data) ? data : (data.codes || []));
    } catch (err) {
      setError(err.message || t('admin.inviteCodes.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const createCode = async () => {
    setCreateSubmitting(true);
    try {
      const body = { role: newRole };
      if (newMaxUses) body.max_uses = parseInt(newMaxUses, 10);
      await api('/api/admin/invite-codes', { method: 'POST', body });
      setCreateModal(false);
      setNewRole('kid');
      setNewMaxUses('');
      fetchCodes();
    } catch (err) {
      setError(err.message || t('admin.inviteCodes.createError'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const deleteCode = async (id) => {
    try {
      await api(`/api/admin/invite-codes/${id}`, { method: 'DELETE' });
      setCodes((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err.message || t('admin.inviteCodes.deleteError'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={28} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setCreateModal(true)}
          className="game-btn game-btn-blue flex items-center gap-2"
        >
          <Plus size={14} />
          {t('admin.inviteCodes.createCode')}
        </button>
      </div>

      {codes.length === 0 ? (
        <p className="text-muted text-center py-8 text-sm">
          {t('admin.inviteCodes.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {codes.map((c) => (
            <div key={c.id} className="p-3 rounded-md bg-surface-raised/30 border border-border">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-cream text-sm font-medium truncate min-w-0">
                  {c.code}
                </p>
                <button
                  onClick={() => deleteCode(c.id)}
                  className="p-1.5 rounded hover:bg-crimson/10 text-crimson/60 hover:text-crimson transition-colors flex-shrink-0"
                  title={t('admin.inviteCodes.deleteTitle')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-muted text-xs">
                  {t('admin.inviteCodes.role')} <span className="text-purple">{t(`common.roles.${c.role}`, c.role)}</span>
                </span>
                <span className="text-muted text-xs">
                  {t('admin.inviteCodes.uses')}{' '}
                  <span className="text-accent">
                    {c.times_used ?? 0}
                    {c.max_uses ? ` / ${c.max_uses}` : ' / ∞'}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Code Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title={t('admin.inviteCodes.createModalTitle')}
        actions={[
          {
            label: t('common.cancel'),
            onClick: () => setCreateModal(false),
            className: 'game-btn game-btn-red',
          },
          {
            label: createSubmitting ? t('admin.apiKeys.creating') : t('common.create'),
            onClick: createCode,
            className: 'game-btn game-btn-blue',
            disabled: createSubmitting,
          },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-cream text-sm font-medium mb-2">
              {t('admin.inviteCodes.role')}
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="field-input"
            >
              <option value="kid">{t('common.roles.kid')}</option>
              <option value="parent">{t('common.roles.parent')}</option>
              <option value="admin">{t('common.roles.admin')}</option>
            </select>
          </div>
          <div>
            <label className="block text-cream text-sm font-medium mb-2">
              {t('admin.inviteCodes.maxUses')}
            </label>
            <input
              type="number"
              min={1}
              value={newMaxUses}
              onChange={(e) => setNewMaxUses(e.target.value)}
              placeholder={t('admin.inviteCodes.unlimited')}
              className="field-input"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Audit Log Tab ───────────────────────────────────────────────────
function AuditLogTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchLog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/admin/audit-log?limit=${limit}&offset=${offset}`);
      setEntries(Array.isArray(data) ? data : (data.entries || data.logs || []));
    } catch (err) {
      setError(err.message || t('admin.auditLog.loadError'));
    } finally {
      setLoading(false);
    }
  }, [offset, t]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const formatTimestamp = (ts) => {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={28} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-muted text-center py-8 text-sm">
          {t('admin.auditLog.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <div key={entry.id || idx} className="p-3 rounded-md bg-surface-raised/30 border border-border">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-accent text-xs font-medium">{entry.action}</span>
                <span className="text-muted text-[10px] flex-shrink-0">{formatTimestamp(entry.created_at)}</span>
              </div>
              <p className="text-muted text-xs break-all">
                {entry.user_id != null ? t('admin.auditLog.userFallback', { id: entry.user_id }) : '--'}
                {(entry.details && entry.details !== '--') && (
                  <span className="ml-2 text-muted/70">
                    {typeof entry.details === 'object'
                      ? JSON.stringify(entry.details)
                      : entry.details}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className={`game-btn game-btn-blue !py-2 !px-3 flex items-center gap-1 ${
            offset === 0 ? 'opacity-30 cursor-not-allowed' : ''
          }`}
        >
          <ChevronLeft size={14} />
          {t('admin.auditLog.prev')}
        </button>

        <span className="text-muted text-xs">
          {t('admin.auditLog.showing', { from: offset + 1, to: offset + entries.length })}
        </span>

        <button
          onClick={() => setOffset(offset + limit)}
          disabled={entries.length < limit}
          className={`game-btn game-btn-blue !py-2 !px-3 flex items-center gap-1 ${
            entries.length < limit ? 'opacity-30 cursor-not-allowed' : ''
          }`}
        >
          {t('admin.auditLog.next')}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main AdminDashboard ─────────────────────────────────────────────
export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <Shield size={48} className="text-crimson/30 mx-auto mb-4" />
        <h1 className="text-cream text-base font-semibold mb-2">
          {t('admin.accessDenied')}
        </h1>
        <p className="text-muted text-sm">
          {t('admin.accessDeniedHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto overflow-hidden">
      {/* Back + Header */}
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-1.5 text-muted hover:text-cream transition-colors mb-4 text-sm"
      >
        <ArrowLeft size={16} />
        {t('layout.profile')}
      </button>
      <div className="flex items-center gap-3 mb-6">
        <Shield size={24} className="text-accent" />
        <h1 className="text-cream text-lg font-semibold">
          {t('admin.title')}
        </h1>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center gap-1 px-1 py-2.5 rounded-md border transition-colors text-[10px] sm:text-[11px] font-medium overflow-hidden ${
                isActive
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'border-border text-muted hover:text-cream hover:border-border-light'
              }`}
            >
              <Icon size={16} />
              <span className="truncate w-full text-center leading-tight">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="game-panel p-4">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'api-keys' && <ApiKeysTab />}
        {activeTab === 'invite-codes' && <InviteCodesTab />}
        {activeTab === 'audit-log' && <AuditLogTab />}
      </div>
    </div>
  );
}
