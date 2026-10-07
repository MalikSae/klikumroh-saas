// Renders the blocks of a guide page (see internal/playbook/playbook.go for the block types).
import React from 'react';
import type { PlaybookBlock } from '../../services/api';
import { CopyButton } from '../../ui';
import { fillTravelVars, type TravelVars } from './templateVars';

// A short stable id from the item text, so editing one item of a guide page only resets that item.
const hashOf = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Id of a checklist item as the server stores it: "<block index>:<hash of the text>" (see the API pattern). */
const checkItemId = (blockIndex: number, text: string): string => `${blockIndex}:${hashOf(text)}`;

interface ChecklistState {
  /** Ids of the checked items of this page (shared by the whole team of the travel). */
  checked: ReadonlySet<string>;
  onToggle: (itemId: string, checked: boolean) => void;
}

const Checklist: React.FC<{ items: string[]; blockIndex: number; state: ChecklistState }> = ({ items, blockIndex, state }) => (
  <ul className="pb-checklist">
    {items.map((item) => {
      const id = checkItemId(blockIndex, item);
      const on = state.checked.has(id);
      return (
        <li key={id}>
          <label className={`pb-check${on ? ' pb-check--on' : ''}`}>
            <input type="checkbox" checked={on} onChange={(e) => state.onToggle(id, e.target.checked)} />
            <span>{item}</span>
          </label>
        </li>
      );
    })}
  </ul>
);

/** `vars` fills the travel's own details (name, PPIU number, agent sign-up link) into the message templates. */
export const PlaybookBlocks: React.FC<{ blocks: PlaybookBlock[]; checks: ChecklistState; vars: TravelVars }> = ({ blocks, checks, vars }) => (
  <div className="pb-blocks">
    {blocks.map((b, i) => {
      switch (b.type) {
        case 'heading':
          return (
            <h3 key={i} className="pb-heading">
              {b.text}
            </h3>
          );
        case 'paragraph':
          return (
            <p key={i} className="pb-text">
              {b.text}
            </p>
          );
        case 'steps':
          return (
            <ol key={i} className="pb-steps">
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ol>
          );
        case 'checklist':
          return <Checklist key={i} items={b.items} blockIndex={i} state={checks} />;
        case 'template': {
          const text = fillTravelVars(b.text, vars);
          return (
            <div key={i} className="pb-template">
              <p className="pb-template__text">{text}</p>
              <CopyButton value={text}>Salin teks</CopyButton>
            </div>
          );
        }
        default:
          return null;
      }
    })}
  </div>
);
