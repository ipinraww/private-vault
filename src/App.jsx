
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, LockKeyhole, Image as ImageIcon, Video, Music2, Upload,
  Search, Trash2, LogOut, HardDrive, X, Eye, EyeOff, FileAudio, FileVideo,
  FileImage, FolderLock, Plus, CheckCircle2, Settings, KeyRound,
  AlertTriangle, RefreshCw, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

import {
  createVerifier,
  decryptBytes,
  deriveKey,
  encryptBytes,
  randomBytes,
  verifyPassword
} from './crypto';

import {
  deleteRecord,
  getAllRecords,
  replaceAllRecords,
  saveRecord
} from './storage';

const META_KEY = 'private-vault-auth-v1';
const MAX_FILE_SIZE = 500 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function typeOf(file) {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

function App() {
  const [authMeta, setAuthMeta] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(META_KEY));
    } catch {
      return null;
    }
  });

  const [key, setKey] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [records, setRecords] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SIDEBAR: buka dan tutup
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // FITUR TAMBAHAN: Pengaturan dan ubah password
  const [showSettings, setShowSettings] = useState(false);
  const [showRecoveryInfo, setShowRecoveryInfo] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showChangePasswords, setShowChangePasswords] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const fileRef = useRef(null);
  const backupRef = useRef(null);

  const isSetup = !authMeta;

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function unlock() {
    setAuthError('');

    if (password.length < 10) {
      setAuthError('Gunakan password minimal 10 karakter.');
      return;
    }

    if (isSetup && password !== confirm) {
      setAuthError('Konfirmasi password tidak sama.');
      return;
    }

    setBusy(true);

    try {
      if (isSetup) {
        const salt = randomBytes(16);
        const derived = await deriveKey(password, salt);
        const verifier = await createVerifier(derived);

        const meta = {
          salt: Array.from(salt),
          verifier,
          createdAt: Date.now()
        };

        localStorage.setItem(META_KEY, JSON.stringify(meta));

        setAuthMeta(meta);
        setKey(derived);
        setPassword('');
        setConfirm('');

        await refreshRecords();
      } else {
        const derived = await deriveKey(
          password,
          new Uint8Array(authMeta.salt)
        );

        const valid = await verifyPassword(authMeta.verifier, derived);

        if (!valid) {
          setAuthError('Password salah. Data tetap terkunci.');
        } else {
          setKey(derived);
          setPassword('');
          await refreshRecords();
        }
      }
    } catch (err) {
      setAuthError(`Gagal membuka vault: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshRecords() {
    const rows = await getAllRecords();

    setRecords(
      rows.map(({ id, name, type, size, createdAt, mime }) => ({
        id,
        name,
        type,
        size,
        createdAt,
        mime
      }))
    );
  }

  function lockVault() {
    setKey(null);
    setRecords([]);
    setPreview(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl('');
    setSearch('');
    setActiveTab('all');
    setShowSettings(false);
  }

  async function addFiles(fileList) {
    if (!key) return;

    const files = Array.from(fileList || []);
    if (!files.length) return;

    setBusy(true);

    let added = 0;

    try {
      for (const file of files) {
        const type = typeOf(file);

        if (!type) continue;

        if (file.size > MAX_FILE_SIZE) {
          setNotice(`${file.name} dilewati: ukuran melebihi 500 MB.`);
          continue;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const encrypted = await encryptBytes(bytes, key);
        const id = crypto.randomUUID();

        await saveRecord({
          id,
          name: file.name,
          type,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          createdAt: Date.now(),
          iv: encrypted.iv,
          data: encrypted.data
        });

        added++;
      }

      await refreshRecords();

      if (added) {
        setNotice(`${added} file berhasil disimpan terenkripsi.`);
      } else {
        setNotice('Tidak ada file foto, video, atau audio yang didukung.');
      }
    } catch (err) {
      setNotice(`Gagal menyimpan file: ${err.message}`);
    } finally {
      setBusy(false);

      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  }

  async function openPreview(item) {
    try {
      const rows = await getAllRecords();
      const record = rows.find(row => row.id === item.id);

      if (!record) return;

      const bytes = await decryptBytes(record, key);
      const blob = new Blob([bytes], { type: record.mime });
      const url = URL.createObjectURL(blob);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewUrl(url);
      setPreview({ ...item, url });
    } catch {
      setNotice('File tidak dapat dibuka. Data mungkin rusak.');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    await deleteRecord(deleteTarget.id);

    setRecords(old =>
      old.filter(item => item.id !== deleteTarget.id)
    );

    if (preview?.id === deleteTarget.id) {
      setPreview(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewUrl('');
    }

    setDeleteTarget(null);
    setNotice('File berhasil dihapus dari penyimpanan lokal.');
  }

  async function exportBackup() {
    if (!key || !authMeta) return;

    setBusy(true);

    try {
      const encryptedRecords = await getAllRecords();

      const backup = {
        format: 'PRIVATE_VAULT_BACKUP',
        version: 1,
        createdAt: new Date().toISOString(),
        auth: authMeta,
        records: encryptedRecords
      };

      const blob = new Blob(
        [JSON.stringify(backup)],
        { type: 'application/json' }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = `private-vault-backup-${new Date().toISOString().slice(0, 10)}.pvault`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      setNotice(
        `Backup terenkripsi berhasil dibuat (${encryptedRecords.length} file).`
      );
    } catch (err) {
      setNotice(`Gagal membuat backup: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(file) {
    if (!file) return;

    setBusy(true);

    try {
      const backup = JSON.parse(await file.text());

      const validMeta =
        backup?.auth &&
        Array.isArray(backup.auth.salt) &&
        backup.auth.verifier?.iv &&
        backup.auth.verifier?.data;

      const validRecords =
        Array.isArray(backup?.records) &&
        backup.records.every(r =>
          r &&
          typeof r.id === 'string' &&
          typeof r.name === 'string' &&
          ['photo', 'video', 'audio'].includes(r.type) &&
          Number.isFinite(r.size) &&
          typeof r.iv === 'string' &&
          typeof r.data === 'string' &&
          typeof r.mime === 'string'
        );

      if (
        backup?.format !== 'PRIVATE_VAULT_BACKUP' ||
        backup.version !== 1 ||
        !validMeta ||
        !validRecords
      ) {
        throw new Error('Format file backup tidak valid.');
      }

      const confirmed = window.confirm(
        `Pulihkan ${backup.records.length} file dari backup? Data vault yang sekarang akan diganti.`
      );

      if (!confirmed) return;

      await replaceAllRecords(backup.records);

      localStorage.setItem(
        META_KEY,
        JSON.stringify(backup.auth)
      );

      setAuthMeta(backup.auth);
      setKey(null);
      setRecords([]);
      setPassword('');
      setConfirm('');

      setAuthError(
        'Backup berhasil dipulihkan. Masuk menggunakan password saat backup dibuat.'
      );
    } catch (err) {
      setAuthError(`Gagal memulihkan backup: ${err.message}`);
    } finally {
      setBusy(false);

      if (backupRef.current) {
        backupRef.current.value = '';
      }
    }
  }

  // UBAH PASSWORD: enkripsi ulang seluruh file dengan kunci baru.
  async function changePassword(e) {
    e.preventDefault();

    setPasswordError('');
    setPasswordSuccess('');

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Lengkapi semua kolom password.');
      return;
    }

    if (newPassword.length < 10) {
      setPasswordError('Password baru minimal 10 karakter.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Konfirmasi password baru tidak sama.');
      return;
    }

    if (oldPassword === newPassword) {
      setPasswordError('Password baru harus berbeda dari password lama.');
      return;
    }

    setBusy(true);

    let originalRecords = [];

    try {
      const oldSalt = new Uint8Array(authMeta.salt);
      const oldKey = await deriveKey(oldPassword, oldSalt);

      const valid = await verifyPassword(authMeta.verifier, oldKey);

      if (!valid) {
        throw new Error('Password lama tidak benar.');
      }

      originalRecords = await getAllRecords();

      const newSalt = randomBytes(16);
      const newKey = await deriveKey(newPassword, newSalt);
      const newVerifier = await createVerifier(newKey);

      const convertedRecords = [];

      for (let i = 0; i < originalRecords.length; i++) {
        const record = originalRecords[i];

        setNotice(
          `Mengamankan ulang file ${i + 1} dari ${originalRecords.length}...`
        );

        const plainBytes = await decryptBytes(record, oldKey);
        const encrypted = await encryptBytes(plainBytes, newKey);

        convertedRecords.push({
          ...record,
          iv: encrypted.iv,
          data: encrypted.data
        });
      }

      const newMeta = {
        salt: Array.from(newSalt),
        verifier: newVerifier,
        createdAt: authMeta.createdAt || Date.now(),
        passwordChangedAt: Date.now()
      };

      await replaceAllRecords(convertedRecords);

      try {
        localStorage.setItem(META_KEY, JSON.stringify(newMeta));
      } catch (storageError) {
        await replaceAllRecords(originalRecords);
        throw storageError;
      }

      setAuthMeta(newMeta);
      setKey(newKey);

      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');

      setPasswordSuccess('Password berhasil diubah. Semua file sudah dienkripsi ulang.');
      setNotice('Password berhasil diperbarui.');
      await refreshRecords();
    } catch (err) {
      setPasswordError(`Gagal mengubah password: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function closeSettings() {
    setShowSettings(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowChangePasswords(false);
  }

  const filtered = useMemo(() => {
    return records.filter(item => {
      const matchesTab =
        activeTab === 'all' || item.type === activeTab;

      const matchesSearch = item.name
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [records, activeTab, search]);

  const counts = useMemo(() => ({
    photo: records.filter(x => x.type === 'photo').length,
    video: records.filter(x => x.type === 'video').length,
    audio: records.filter(x => x.type === 'audio').length
  }), [records]);

  if (!key) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <div className="brand-mark">
            <FolderLock size={28} />
          </div>

          <div className="eyebrow">
            PERSONAL STORAGE · OFFLINE
          </div>

          <h1>
            {isSetup ? 'Buat vault pribadi' : 'Selamat datang kembali'}
          </h1>

          <p className="muted">
            {isSetup
              ? 'Buat password utama untuk mengenkripsi dan mengunci semua file.'
              : 'Masukkan password utama untuk membuka koleksi terenkripsi.'}
          </p>

          <form onSubmit={e => {
            e.preventDefault();
            unlock();
          }}>
            <label>Password utama</label>

            <div className="password-wrap">
              <input
                autoFocus
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimal 10 karakter"
                autoComplete={isSetup ? 'new-password' : 'current-password'}
              />

              <button
                className="icon-button"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Tampilkan password"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>

            {isSetup && (
              <>
                <label>Ulangi password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Masukkan ulang password"
                  autoComplete="new-password"
                />
              </>
            )}

            {authError && (
              <div className="error">{authError}</div>
            )}

            <button className="primary full" disabled={busy}>
              {busy
                ? 'Memproses...'
                : isSetup
                  ? 'Buat Private Vault'
                  : 'Buka Vault'}
              <LockKeyhole size={17} />
            </button>
          </form>

          <div className="security-note">
            <ShieldCheck size={17} />
            <span>
              Password tidak disimpan. File dienkripsi sebelum masuk ke penyimpanan browser.
            </span>
          </div>

          {!isSetup && (
            <div className="recovery-area">
              <button
                className="text-button"
                type="button"
                onClick={() => setShowRecoveryInfo(!showRecoveryInfo)}
              >
                Lupa password?
              </button>

              {showRecoveryInfo && (
                <div className="recovery-panel">
                  <div className="recovery-panel-title">
                    <AlertTriangle size={18} />
                    Password tidak dapat di-reset
                  </div>

                  <p>
                    File vault dienkripsi menggunakan password utama.
                    Jika password hilang, file tidak bisa dibuka hanya
                    dengan mengganti password.
                  </p>

                  <p>
                    Jika kamu memiliki backup <b>.pvault</b>, pulihkan
                    melalui tombol di bawah dan gunakan password yang
                    dipakai saat backup dibuat.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="auth-backup-tools">
            <input
              ref={backupRef}
              type="file"
              hidden
              accept=".pvault,application/json"
              onChange={e => importBackup(e.target.files?.[0])}
            />

            <button
              className="secondary full"
              type="button"
              onClick={() => backupRef.current?.click()}
              disabled={busy}
            >
              <HardDrive size={17} />
              Pulihkan dari backup
            </button>

            <small>
              Pilih file .pvault yang pernah kamu ekspor. Password backup tetap diperlukan.
            </small>
          </div>
        </div>

        <div className="auth-footer">
          PRIVATE VAULT <span>•</span> DATA TETAP DI PERANGKAT INI
        </div>
      </main>
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="brand">
          <div className="brand-mark small">
            <FolderLock size={21} />
          </div>

          <div className="brand-text">
            <b>           </b>
            <small>          </small>
          </div>

          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen(open => !open)}
            title={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
            aria-label={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
          >
            {sidebarOpen
              ? <PanelLeftClose size={19} />
              : <PanelLeftOpen size={19} />
            }
          </button>
        </div>

        <div className="side-label">LIBRARY</div>

        <nav>
          {[
            ['all', 'Semua file', FolderLock, records.length],
            ['photo', 'Foto', ImageIcon, counts.photo],
            ['video', 'Video', Video, counts.video],
            ['audio', 'Audio', Music2, counts.audio]
          ].map(([id, label, Icon, count]) => (
            <button
              key={id}
              className={`nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              <small>{count}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="local-card">
            <HardDrive size={18} />
            <div className="local-card-text">
              <b>Penyimpanan lokal</b>
              <small>Browser perangkat ini</small>
            </div>
            <span className="live-dot" />
          </div>

          <button
            className="nav-item settings-nav"
            onClick={() => setShowSettings(true)}
            title={!sidebarOpen ? 'Pengaturan' : undefined}
          >
            <Settings size={18} />
            <span>Pengaturan</span>
          </button>

          <button
            className="nav-item logout"
            onClick={lockVault}
            title={!sidebarOpen ? 'Kunci vault' : undefined}
          >
            <LogOut size={18} />
            <span>Kunci vault</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">RUANG PENYIMPANAN PRIBADI</div>
            <h1>Koleksi saya</h1>
          </div>

          <div className="top-actions">
            <span className="encrypted-label">
              <ShieldCheck size={16} />
              Terenkripsi
            </span>

            <button
              className="secondary backup-button"
              onClick={exportBackup}
              disabled={busy}
            >
              <HardDrive size={17} />
              Backup
            </button>

            <button
              className="primary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Plus size={18} />
              Tambah file
            </button>

            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*,video/*,audio/*"
              onChange={e => addFiles(e.target.files)}
            />
          </div>
        </header>

        <section className="welcome-panel">
          <div>
            <div className="eyebrow light">YOUR PRIVATE SPACE</div>
            <h2>
              Simpan yang berarti.
              <br />
              <span>Jaga tetap pribadi.</span>
            </h2>
            <p>
              Foto, video, dan audio tersimpan terenkripsi di perangkat ini.
            </p>
          </div>

          <div className="panel-art">
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="vault-graphic">
              <FolderLock size={58} />
              <span />
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <Stat icon={ImageIcon} label="Foto" count={counts.photo} color="purple" />
          <Stat icon={Video} label="Video" count={counts.video} color="blue" />
          <Stat icon={Music2} label="Audio" count={counts.audio} color="orange" />
          <Stat icon={HardDrive} label="Total file" count={records.length} color="green" />
        </section>

        <section className="library-section">
          <div className="library-heading">
            <div>
              <h2>
                {activeTab === 'all'
                  ? 'Semua file'
                  : activeTab === 'photo'
                    ? 'Foto'
                    : activeTab === 'video'
                      ? 'Video'
                      : 'Audio'}
              </h2>
              <p>{filtered.length} item dalam koleksi</p>
            </div>

            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama file..."
              />
            </div>
          </div>

          {busy && (
            <div className="progress-note">
              Sedang memproses data...
            </div>
          )}

          {filtered.length ? (
            <div className="media-grid media-gallery">
              {filtered.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  vaultKey={key}
                  onOpen={() => openPreview(item)}
                  onDelete={() => setDeleteTarget(item)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <Upload size={27} />
              </div>

              <h3>
                {search ? 'File tidak ditemukan' : 'Vault masih kosong'}
              </h3>

              <p>
                {search
                  ? 'Coba kata kunci lain.'
                  : 'Tambahkan foto, video, atau audio untuk memulai koleksi.'}
              </p>

              <button
                className="secondary"
                onClick={() => fileRef.current?.click()}
              >
                <Plus size={17} />
                Pilih file
              </button>
            </div>
          )}
        </section>

        <footer className="main-footer">
          <span>
            <ShieldCheck size={14} />
            AES-256-GCM ENCRYPTION
          </span>
          <span>Data hanya tersimpan di browser ini</span>
        </footer>
      </main>

      {notice && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onClick={closeSettings}>
          <div
            className="settings-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="settings-header">
              <div className="settings-heading-icon">
                <Settings size={23} />
              </div>

              <div>
                <h2>Pengaturan Vault</h2>
                <p>Kelola keamanan penyimpanan pribadimu.</p>
              </div>

              <button
                className="icon-button"
                onClick={closeSettings}
                aria-label="Tutup pengaturan"
              >
                <X />
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">
                <KeyRound size={19} />
                <div>
                  <b>Keamanan password</b>
                  <small>Perbarui password utama vault.</small>
                </div>
              </div>

              <form onSubmit={changePassword} className="change-password-form">
                <label>Password lama</label>
                <input
                  type={showChangePasswords ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="Masukkan password saat ini"
                  autoComplete="current-password"
                />

                <label>Password baru</label>
                <input
                  type={showChangePasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimal 10 karakter"
                  autoComplete="new-password"
                />

                <label>Konfirmasi password baru</label>
                <input
                  type={showChangePasswords ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="text-button settings-show-password"
                  onClick={() => setShowChangePasswords(!showChangePasswords)}
                >
                  {showChangePasswords ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showChangePasswords ? 'Sembunyikan password' : 'Tampilkan password'}
                </button>

                {passwordError && (
                  <div className="error">{passwordError}</div>
                )}

                {passwordSuccess && (
                  <div className="success-message">
                    <CheckCircle2 size={17} />
                    {passwordSuccess}
                  </div>
                )}

                <div className="password-warning">
                  <AlertTriangle size={17} />
                  <span>
                    Sebelum mengubah password, buat backup terlebih dahulu.
                    Proses ini akan mengenkripsi ulang seluruh file.
                    Jangan tutup halaman selama proses berlangsung.
                  </span>
                </div>

                <button
                  className="primary full"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <RefreshCw size={17} />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <KeyRound size={17} />
                      Simpan password baru
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="settings-info">
              <HardDrive size={18} />
              <div>
                <b>Penyimpanan lokal</b>
                <small>
                  File disimpan di browser perangkat ini, bukan di server cloud.
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div
          className="modal-backdrop"
          onClick={() => setPreview(null)}
        >
          <div
            className="preview-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <b>{preview.name}</b>
                <small>{formatBytes(preview.size)}</small>
              </div>

              <button
                className="icon-button"
                onClick={() => setPreview(null)}
              >
                <X />
              </button>
            </div>

            <div className="preview-body">
              {preview.type === 'photo' ? (
                <img src={preview.url} alt={preview.name} />
              ) : preview.type === 'video' ? (
                <video src={preview.url} controls autoPlay />
              ) : (
                <audio src={preview.url} controls autoPlay />
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="confirm-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="danger-icon">
              <Trash2 />
            </div>

            <h3>Hapus file ini?</h3>

            <p>
              <b>{deleteTarget.name}</b> akan dihapus permanen dari penyimpanan browser.
            </p>

            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>

              <button
                className="danger-button"
                onClick={confirmDelete}
              >
                Ya, hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, count, color }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <small>{label}</small>
        <strong>{count}</strong>
      </div>
    </div>
  );
}

function MediaCard({ item, vaultKey, onOpen, onDelete }) {
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailState, setThumbnailState] = useState('loading');
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  const Icon =
    item.type === 'photo'
      ? FileImage
      : item.type === 'video'
        ? FileVideo
        : FileAudio;

  // Decrypt only when the card approaches the visible gallery area.
  // Plaintext thumbnails exist only as temporary browser object URLs.
  useEffect(() => {
    const node = cardRef.current;
    if (!node) {
      setIsVisible(true);
      return;
    }

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: '240px', threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !vaultKey || item.type === 'audio') return;

    let cancelled = false;
    let sourceUrl = '';

    async function createThumbnail() {
      setThumbnailState('loading');

      try {
        const rows = await getAllRecords();
        if (cancelled) return;

        const record = rows.find(row => row.id === item.id);
        if (!record) throw new Error('File tidak ditemukan');

        const bytes = await decryptBytes(record, vaultKey);
        if (cancelled) return;

        const blob = new Blob([bytes], {
          type: record.mime || item.mime || 'application/octet-stream'
        });

        sourceUrl = URL.createObjectURL(blob);

        if (item.type === 'photo') {
          if (cancelled) return;
          setThumbnailUrl(sourceUrl);
          sourceUrl = '';
          setThumbnailState('ready');
          return;
        }

        // Extract one frame from the decrypted video in memory.
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = sourceUrl;

        const waitFor = (target, eventName, errorName = 'error') =>
          new Promise((resolve, reject) => {
            const onReady = () => {
              cleanup();
              resolve();
            };
            const onError = () => {
              cleanup();
              reject(new Error('Browser tidak dapat membaca video ini.'));
            };
            const cleanup = () => {
              target.removeEventListener(eventName, onReady);
              target.removeEventListener(errorName, onError);
            };
            target.addEventListener(eventName, onReady, { once: true });
            target.addEventListener(errorName, onError, { once: true });
          });

        await waitFor(video, 'loadeddata');

        if (cancelled) {
          video.removeAttribute('src');
          video.load();
          return;
        }

        // Move slightly into the video when possible so the frame is not black.
        if (Number.isFinite(video.duration) && video.duration > 0.15) {
          const seekTime = Math.min(0.15, video.duration / 2);
          const seekPromise = waitFor(video, 'seeked');
          try {
            video.currentTime = seekTime;
            await seekPromise;
          } catch {
            // Keep the first decoded frame if seeking is unsupported.
          }
        }

        if (cancelled) {
          video.removeAttribute('src');
          video.load();
          return;
        }

        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const maxDimension = 960;
        const scale = Math.min(1, maxDimension / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas tidak tersedia.');

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const thumbnailBlob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', 0.82);
        });

        video.pause();
        video.removeAttribute('src');
        video.load();

        if (!thumbnailBlob) throw new Error('Gagal membuat thumbnail video.');

        const frameUrl = URL.createObjectURL(thumbnailBlob);

        if (cancelled) {
          URL.revokeObjectURL(frameUrl);
          return;
        }

        setThumbnailUrl(frameUrl);
        setThumbnailState('ready');
      } catch (error) {
        if (!cancelled) setThumbnailState('error');
      } finally {
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      }
    }

    createThumbnail();

    return () => {
      cancelled = true;
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [isVisible, item.id, item.type, item.mime, vaultKey]);

  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);

  return (
    <article className="media-card" ref={cardRef}>
      <button
        className={`media-thumb ${item.type} ${thumbnailUrl ? 'has-thumbnail' : ''}`}
        onClick={onOpen}
        type="button"
        aria-label={`Buka ${item.name}`}
      >
        {thumbnailUrl && item.type === 'photo' ? (
          <img
            className="media-thumbnail-image"
            src={thumbnailUrl}
            alt={item.name}
            loading="lazy"
          />
        ) : thumbnailUrl && item.type === 'video' ? (
          <img
            className="media-thumbnail-image"
            src={thumbnailUrl}
            alt={`Cuplikan video ${item.name}`}
            loading="lazy"
          />
        ) : item.type === 'photo' ? (
          <div className="file-art photo-art">
            <ImageIcon size={34} />
            <span className="thumbnail-status">
              {thumbnailState === 'loading' ? 'Memuat foto...' : 'Preview tidak tersedia'}
            </span>
          </div>
        ) : item.type === 'video' ? (
          <div className="file-art video-art">
            <Video size={36} />
            <span className="play-dot">▶</span>
            <span className="thumbnail-status">
              {thumbnailState === 'loading' ? 'Memuat cuplikan...' : 'Preview tidak tersedia'}
            </span>
          </div>
        ) : (
          <div className="file-art audio-art">
            <Music2 size={38} />
            <div className="wave">
              <i /><i /><i /><i /><i /><i /><i /><i /><i />
            </div>
          </div>
        )}

        {item.type === 'video' && thumbnailUrl && (
          <span className="video-play-overlay">▶</span>
        )}
        <span className="open-hint">Buka preview</span>
      </button>

      <div className="media-info">
        <div className="file-type">
          <Icon size={14} />
          {item.type}
        </div>

        <b title={item.name}>{item.name}</b>

        <div className="file-meta">
          {formatBytes(item.size)}
          <span>•</span>
          {new Date(item.createdAt).toLocaleDateString('id-ID')}
        </div>
      </div>

      <button
        className="delete-icon"
        onClick={onDelete}
        type="button"
        title="Hapus file"
        aria-label={`Hapus ${item.name}`}
      >
        <Trash2 size={16} />
      </button>
    </article>
  );
}

export default App;
