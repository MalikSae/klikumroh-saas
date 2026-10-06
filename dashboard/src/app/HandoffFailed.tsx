// Shown instead of the app when the #handoff= code could not be redeemed (main.tsx). Without it the tab
// would quietly open whatever session is still stored, e.g. another travel staff impersonated earlier.
import React, { useId } from 'react';
import { LogIn, X } from 'lucide-react';
import { webLoginUrl } from '../services/api';
import { HANDOFF_FAILED_KEY, handoffFailedText, type HandoffKind } from '../services/handoff';
import { Button } from '../ui';

const forget = () => {
  try {
    sessionStorage.removeItem(HANDOFF_FAILED_KEY);
  } catch {
    /* storage unavailable: nothing to forget */
  }
};

export const HandoffFailed: React.FC<{ kind: HandoffKind }> = ({ kind }) => {
  const titleId = useId();
  const text = handoffFailedText(kind);
  return (
    <div className="ku ku-modal-wrap">
      <div className="ku-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ku-modal__head">
          <h2 id={titleId} className="ku-modal__title">{text.title}</h2>
        </div>
        <div className="ku-modal__body">
          <p className="ku-modal__desc">{text.description}</p>
        </div>
        <div className="ku-modal__foot">
          {kind === 'staff' ? (
            <Button
              variant="primary"
              icon={<X className="ku-icon--sm" />}
              onClick={() => {
                forget();
                window.close();
              }}
            >
              Tutup tab
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<LogIn className="ku-icon--sm" />}
              onClick={() => {
                forget();
                window.location.href = webLoginUrl();
              }}
            >
              Masuk lagi
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
