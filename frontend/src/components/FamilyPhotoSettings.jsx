import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Images, Trash2, Loader2, Plus } from 'lucide-react';
import { api } from '../api/client';

export default function FamilyPhotoSettings() {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const data = await api('/api/family-zone/photos');
      setPhotos(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const uploaded = await api('/api/uploads', { method: 'POST', body: fd });
        await api('/api/family-zone/photos', { method: 'POST', body: { url: uploaded.path } });
      }
      await fetchPhotos();
    } catch (err) {
      setError(err.message || t('familyPhotoSettings.uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = async (id) => {
    setRemovingId(id);
    try {
      await api(`/api/family-zone/photos/${id}`, { method: 'DELETE' });
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message || t('familyPhotoSettings.removeError'));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="game-panel p-4">
      <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
        <Images size={16} className="text-muted" />
        {t('familyPhotoSettings.title')}
      </h2>
      <p className="text-muted text-xs mb-3">
        {t('familyPhotoSettings.hint')}
      </p>

      {error && (
        <div className="mb-3 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="text-accent animate-spin" />
        </div>
      ) : (
        <>
          {photos.length === 0 ? (
            <p className="text-muted text-xs mb-3">{t('familyPhotoSettings.empty')}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group aspect-square rounded-md overflow-hidden border border-border">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(photo.id)}
                    disabled={removingId === photo.id}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={t('common.delete')}
                  >
                    {removingId === photo.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className={`game-btn game-btn-blue inline-flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-40 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {uploading ? t('common.saving') : t('familyPhotoSettings.addPhotos')}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </>
      )}
    </div>
  );
}
