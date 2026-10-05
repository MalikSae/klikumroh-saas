// Blocking notice when another tab replaced the dashboard session (another account, or staff opening
// another travel). The screen behind still shows the old account's data and every request is refused
// (services/tabSession.ts), so the only way on is a reload, which picks up the session that is active now.
import React, { useId, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { tabSession } from '../services/api';
import { Button } from '../ui';

export const SessionSwitchedNotice: React.FC = () => {
  const switched = useSyncExternalStore(tabSession.subscribe, tabSession.isSwitched, tabSession.isSwitched);
  const titleId = useId();
  if (!switched) return null;
  return (
    <div className="ku ku-modal-wrap ap-session-lock">
      <div className="ku-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ku-modal__head">
          <h2 id={titleId} className="ku-modal__title">Sesi berganti di tab lain</h2>
        </div>
        <div className="ku-modal__body">
          <p className="ku-modal__desc">
            Di tab lain, dashboard dibuka dengan akun atau travel lain, atau sesi sudah keluar. Halaman ini masih menampilkan data sesi sebelumnya, jadi perubahan dari tab ini tidak disimpan. Muat ulang untuk melanjutkan dengan sesi yang aktif sekarang.
          </p>
        </div>
        <div className="ku-modal__foot">
          <Button variant="primary" onClick={() => window.location.reload()} icon={<RefreshCw className="ku-icon--sm" />}>
            Muat ulang
          </Button>
        </div>
      </div>
    </div>
  );
};
