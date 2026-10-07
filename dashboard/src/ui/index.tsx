// Dashboard travel v2 — UI components. Visual source: dashboard/design/prototype.html (approved 30 Sep 2026).
import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Minus, User, X, Search, SlidersHorizontal } from 'lucide-react';
import { copyText } from '../utils/clipboard';
import './tokens.css';
import './ui.css';

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'light' | 'danger';
interface BtnBase {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  block?: boolean;
  children?: React.ReactNode;
  className?: string;
}
type BtnProps = BtnBase & React.ButtonHTMLAttributes<HTMLButtonElement>;
type LinkBtnProps = BtnBase & { to: string; external?: boolean; onClick?: () => void };

export function Button(props: BtnProps | LinkBtnProps) {
  const { variant = 'secondary', size = 'md', icon, block, children, className } = props;
  const cls = cx('ku-btn', variant !== 'secondary' && `ku-btn--${variant}`, size === 'sm' && 'ku-btn--sm', block && 'ku-btn--block', className);
  if ('to' in props) {
    return props.external ? (
      <a href={props.to} target="_blank" rel="noopener noreferrer" className={cls} onClick={props.onClick}>{icon}{children}</a>
    ) : (
      <Link to={props.to} className={cls} onClick={props.onClick}>{icon}{children}</Link>
    );
  }
  const { variant: _v, size: _s, icon: _i, block: _b, children: _c, className: _cn, ...rest } = props as BtnProps;
  return (
    <button type="button" className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** Copies a text (a link to share) and says so on the button for two seconds. */
export const CopyButton: React.FC<{ value: string; children: React.ReactNode; size?: 'sm' | 'md'; variant?: Variant; onCopied?: () => void }> = ({ value, children, size = 'sm', variant, onCopied }) => {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const copy = async () => {
    const ok = await copyText(value);
    setState(ok ? 'ok' : 'fail');
    if (ok) onCopied?.();
    window.setTimeout(() => setState('idle'), 2000);
  };
  return (
    <Button size={size} variant={variant} onClick={copy} icon={state === 'ok' ? <Check className="ku-icon--sm" /> : <Copy className="ku-icon--sm" />} aria-live="polite">
      {state === 'ok' ? 'Tersalin' : state === 'fail' ? 'Gagal menyalin' : children}
    </Button>
  );
};

/** variant 'ghost': no box (no border/background until hover), for close and overflow actions in
 * headers and rows (AGENTS.md 3.10: icons should not sit in boxes everywhere). */
export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; dot?: boolean; size?: 'sm' | 'md'; variant?: 'default' | 'ghost'; children: React.ReactNode }> = ({ label, dot, size = 'md', variant = 'default', children, className, ...rest }) => (
  <button type="button" className={cx('ku-ibtn', size === 'sm' && 'ku-ibtn--sm', variant === 'ghost' && 'ku-ibtn--ghost', className)} aria-label={label} title={label} {...rest}>
    {children}
    {dot && <span className="ku-ibtn__dot" aria-hidden="true" />}
  </button>
);

/* ---------- Card ---------- */
export const Card: React.FC<{ title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children?: React.ReactNode }> = ({ title, description, actions, className, children }) => (
  <section className={cx('ku-card', className)}>
    {(title || actions) && (
      <div className="ku-card__head">
        <div>
          {title && <h2 className="ku-card__title">{title}</h2>}
          {description && <p className="ku-card__desc">{description}</p>}
        </div>
        {actions && <div className="ku-card__actions">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);
/** Tabs that belong to a card (e.g. status tabs of a table) sit at the top inside the card. */
export const CardTabs: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="ku-card__tabs">{children}</div>;
export const CardBody: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="ku-card__body">{children}</div>;

/* ---------- Controls ---------- */
export const SearchField: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; size?: 'sm' | 'md'; onEnter?: () => void }> = ({ value, onChange, placeholder, size = 'md', onEnter }) => (
  <label className={cx('ku-search', size === 'sm' && 'ku-search--sm')}>
    <Search className="ku-icon--sm" aria-hidden="true" />
    <input
      type="search"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
    />
  </label>
);

/** Custom dropdown (never the native <select>): one look on every OS, keyboard and screen-reader friendly.
 * The list is position: fixed so it is never clipped by a modal or drawer, and it stays a DOM child of the
 * trigger so popovers that close on outside clicks (Filter) keep working. */
export const Select: React.FC<{ value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; label: string; id?: string; disabled?: boolean; invalid?: boolean; placeholder?: string }> = ({ value, onChange, options, label, id, disabled, invalid, placeholder }) => {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedIndex = options.findIndex((o) => o.value === value);
  const current = options[selectedIndex];

  const place = React.useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(280, options.length * 36 + 8);
    const up = below < want && above > below;
    setPos({ left: r.left, width: Math.max(r.width, 180), maxHeight: Math.max(120, Math.min(280, up ? above : below)), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }, [options.length]);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const reflow = (e: Event) => {
      if (e.type === 'scroll' && list.current && list.current.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') {
      // Close only the list, not the modal or drawer around it.
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const from = (active + 1) % options.length;
      const order = [...options.slice(from), ...options.slice(0, from)];
      const hit = order.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (hit >= 0) setActive((from + hit) % options.length);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className={cx('ku-select', open && 'ku-select--open', disabled && 'ku-select--disabled', invalid && 'ku-select--invalid')} ref={wrap}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="ku-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={id ? undefined : label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className={cx('ku-select__value', !current && 'ku-select__value--empty')}>{current ? current.label : placeholder || 'Pilih'}</span>
        <ChevronDown className="ku-select__chev" aria-hidden="true" />
      </button>
      {open && pos && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          className="ku-select__list"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              className={cx('ku-select__opt', i === active && 'ku-select__opt--active', o.value === value && 'ku-select__opt--on')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check className="ku-icon--sm" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }> = ({ checked, onChange, label }) => (
  <label className="ku-check">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {/* One flex item, so a label with mixed text and bold parts stays one line of text. */}
    <span>{label}</span>
  </label>
);

export const Field: React.FC<{ label: string; hint?: React.ReactNode; error?: string | null; optional?: boolean; children: (id: string) => React.ReactNode }> = ({ label, hint, error, optional, children }) => {
  const id = useId();
  return (
    <div className="ku-field">
      <label className="ku-field__label" htmlFor={id}>
        {label}
        {optional && <span className="ku-field__optional"> (opsional)</span>}
      </label>
      {children(id)}
      {hint && !error && <div className="ku-field__hint">{hint}</div>}
      {error && <div className="ku-field__error">{error}</div>}
    </div>
  );
};

/* ---------- Tabs ---------- */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  alert?: boolean;
}
export function Tabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="ku-tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} className={cx('ku-tab', t.id === value && 'ku-tab--on')} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className={cx('ku-tab__n', t.alert && t.count > 0 && 'ku-tab__n--alert')}>{t.count.toLocaleString('id-ID')}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Status & channel ---------- */
export type PillTone = 'gray' | 'blue' | 'amber' | 'violet' | 'green' | 'red';
export const Pill: React.FC<{ tone?: PillTone; children: React.ReactNode }> = ({ tone = 'gray', children }) => (
  <span className={cx('ku-pill', tone !== 'gray' && `ku-pill--${tone}`)}>{children}</span>
);

export const PROSPECT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  baru: { label: 'Baru', tone: 'blue' },
  dihubungi: { label: 'Dihubungi', tone: 'amber' },
  tertarik: { label: 'Tertarik', tone: 'violet' },
  closing: { label: 'Closing', tone: 'green' },
  tidak_lanjut: { label: 'Tidak lanjut', tone: 'gray' },
};
export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = PROSPECT_STATUS[status] ?? { label: status, tone: 'gray' as PillTone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
};

/** Acquisition channel: web (organic website), ads (paid ads), agen (agent referral). */
export type Channel = 'web' | 'ads' | 'agen';
export const CHANNEL_LABEL: Record<Channel, string> = { web: 'Website', ads: 'Iklan', agen: 'Agen' };
export const channelOf = (sourceChannel: string, agentId?: number | null): Channel => {
  if (agentId || sourceChannel === 'agen' || sourceChannel === 'agent') return 'agen';
  if (['paid', 'paid_ads', 'ads', 'meta_ads', 'google_ads', 'iklan'].includes(sourceChannel)) return 'ads';
  return 'web';
};
export const ChannelTag: React.FC<{ channel: Channel; detail?: string | null }> = ({ channel, detail }) => (
  <span className="ku-channel">
    <i className={`ku-dot ku-dot--${channel}`} aria-hidden="true" />
    {CHANNEL_LABEL[channel]}
    {detail ? ` · ${detail}` : ''}
  </span>
);

/* ---------- Phone layout ---------- */
// One breakpoint for the mobile app layout (bottom navigation, card lists, full-screen panels).
const MOBILE_QUERY = '(max-width: 768px)';
const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export const useIsMobile = () => useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);

/* ---------- Table ---------- */
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'right';
  /**
   * Phone card list. Default: text columns become plain lines (no label), right-aligned (numeric) columns
   * become small "label value" stats, a column keyed 'status' sits next to the title.
   * 'hide' leaves the column out (e.g. a row menu the detail page also has); 'aside' puts it next to the title;
   * 'labeled' shows a text column as a small 'Header value' line under the stats;
   * 'line' keeps a right-aligned (numeric) column as a plain line, e.g. the amount of a payout;
   * 'stat' shows a non-numeric column as a stat tile anyway (e.g. seats filled with its bar).
   */
  mobile?: 'hide' | 'aside' | 'labeled' | 'line' | 'stat';
  /** Desktop table: show the column only on wide screens (1440px and up), so the table fits a 1366px laptop. */
  wideOnly?: boolean;
  /** Phone card content for this column when it differs from the table cell (e.g. name + contact in one). */
  mobileCell?: (row: T) => React.ReactNode;
  /** Phone card: full-width media (e.g. a banner image) above the title. Read from the first column. */
  mobileMedia?: (row: T) => React.ReactNode;
}

const colClass = (c: { align?: 'right'; wideOnly?: boolean }) => [c.align === 'right' && 'ku-right', c.wideOnly && 'ku-col--wide'].filter(Boolean).join(' ') || undefined;

/** Phone: each row is a card. The first column is the card title, the rest follow without field labels. */
function MobileList<T>({ columns, rows, rowKey, onRowClick, loading, showEmpty, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; loading?: boolean; showEmpty: boolean; empty?: React.ReactNode }) {
  const cols = columns.filter((c) => c.mobile !== 'hide');
  const [head, ...others] = cols;
  const aside = others.filter((c) => c.mobile === 'aside' || c.key === 'status');
  // A column without a header holds row buttons (e.g. Setujui / Tolak): they get their own row at the bottom.
  const actions = others.filter((c) => !aside.includes(c) && !c.header);
  const labeled = others.filter((c) => c.mobile === 'labeled');
  const rest = others.filter((c) => !aside.includes(c) && !actions.includes(c) && !labeled.includes(c));
  const isStat = (c: Column<T>) => c.mobile === 'stat' || (c.align === 'right' && c.mobile !== 'line');
  const lines = rest.filter((c) => !isStat(c));
  const stats = rest.filter(isStat);
  if (loading) {
    return (
      <ul className="ku-mlist" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="ku-mcard">
            <div className="ku-skeleton" />
            <div className="ku-skeleton ku-skeleton--short" />
          </li>
        ))}
      </ul>
    );
  }
  if (showEmpty) return <div className="ku-mlist ku-mlist--empty">{empty}</div>;
  return (
    <ul className="ku-mlist">
      {rows.map((r) => {
        const body = (
          <>
            {head?.mobileMedia && <div className="ku-mcard__media">{head.mobileMedia(r)}</div>}
            <div className="ku-mcard__head">
              <div className="ku-mcard__title">{(head?.mobileCell ?? head?.cell)?.(r)}</div>
              {aside.map((c) => (
                <div key={c.key} className="ku-mcard__aside">{(c.mobileCell ?? c.cell)(r)}</div>
              ))}
              {onRowClick && <ChevronRight className="ku-icon--sm ku-mcard__go" aria-hidden="true" />}
            </div>
            {lines.map((c) => (
              <div key={c.key} className="ku-mcard__line">{(c.mobileCell ?? c.cell)(r)}</div>
            ))}
            {stats.length > 0 && (
              <dl className="ku-mcard__stats">
                {stats.map((c) => (
                  <div key={c.key}>
                    <dt>{c.header}</dt>
                    <dd>{(c.mobileCell ?? c.cell)(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {labeled.map((c) => (
              <div key={c.key} className="ku-mcard__labeled">
                <span>{c.header}</span> {(c.mobileCell ?? c.cell)(r)}
              </div>
            ))}
            {actions.map((c) => {
              // No buttons for this row (e.g. your own account): no empty action bar.
              const node = (c.mobileCell ?? c.cell)(r);
              return node == null || node === false ? null : <div key={c.key} className="ku-mcard__actions">{node}</div>;
            })}
          </>
        );
        return (
          <li key={rowKey(r)} className={onRowClick ? 'ku-mcard ku-mcard--link' : 'ku-mcard'} onClick={onRowClick ? () => onRowClick(r) : undefined}>
            {body}
          </li>
        );
      })}
    </ul>
  );
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; loading?: boolean; empty?: React.ReactNode }) {
  // An empty table keeps its column headers; the empty message sits inside the table area.
  const showEmpty = !loading && rows.length === 0 && !!empty;
  const mobile = useIsMobile();
  if (mobile) return <MobileList columns={columns} rows={rows} rowKey={rowKey} onRowClick={onRowClick} loading={loading} showEmpty={showEmpty} empty={empty} />;
  return (
    <div className="ku-table-wrap">
      <table className="ku-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={colClass(c)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={colClass(c)}><div className="ku-skeleton" /></td>
                  ))}
                </tr>
              ))
            : showEmpty
            ? (
                <tr>
                  <td className="ku-table__empty" colSpan={columns.length}>{empty}</td>
                </tr>
              )
            : rows.map((r) => (
                <tr key={rowKey(r)} className={onRowClick ? 'ku-row-link' : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={colClass(c)}>{c.cell(r)}</td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
export const Toolbar: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="ku-tools">
    {children}
    {right && <div className="ku-tools__right">{right}</div>}
  </div>
);

/* ---------- Metric strip (several KPIs in ONE panel, split by hairlines) ---------- */
export interface MetricDelta {
  text: string;
  trend: 'up' | 'down' | 'flat';
}
/**
 * One panel holding several metrics side by side (2 x 2 on narrow screens); not one card per metric.
 * `heading` names what all metrics share (e.g. the period) once above the panel, not in every cell.
 */
export const MetricStrip: React.FC<{ label: string; heading?: React.ReactNode; headingMeta?: React.ReactNode; children: React.ReactNode }> = ({ label, heading, headingMeta, children }) => {
  return (
    <div className="ku-metrics-group">
      {heading && (
        <p className="ku-metrics-head">
          <span className="ku-metrics-head__title">{heading}</span>
          {headingMeta && <span className="ku-metrics-head__meta">{headingMeta}</span>}
        </p>
      )}
      <section className="ku-metrics" aria-label={label}>{children}</section>
    </div>
  );
};
/**
 * A metric of a MetricStrip. Label, value and note each stay on ONE line (ellipsis if ever too long).
 * With `to` the whole metric is a link. `deltaLabel` says what the delta compares to. `hint` holds the longer
 * explanation as a tooltip on the whole metric, never as visible wrapping text.
 */
export const Metric: React.FC<{ label: string; value: React.ReactNode; delta?: MetricDelta; deltaLabel?: string; note?: React.ReactNode; hint?: string; to?: string; toLabel?: string }> = ({ label, value, delta, deltaLabel, note, hint, to, toLabel }) => {
  const DeltaIcon = delta?.trend === 'up' ? ArrowUpRight : delta?.trend === 'down' ? ArrowDownRight : Minus;
  const title = [hint, toLabel].filter(Boolean).join('. ') || undefined;
  const inner = (
    <>
      <span className="ku-metric__label">
        <span className="ku-metric__text">{label}</span>
        {to && <ChevronRight className="ku-icon--sm ku-metric__go" aria-hidden="true" />}
      </span>
      <span className="ku-metric__value">{value}</span>
      {(delta || note) && (
        <span className="ku-metric__foot">
          {delta && (
            <span className={cx('ku-metric__delta', delta.trend === 'up' && 'ku-up', delta.trend === 'down' && 'ku-down')} title={deltaLabel}>
              <DeltaIcon className="ku-icon--sm" aria-hidden="true" />
              {delta.text}
              {deltaLabel && <span className="ku-sr">{` ${deltaLabel}`}</span>}
            </span>
          )}
          {note && <span className="ku-metric__note">{note}</span>}
        </span>
      )}
      {hint && <span className="ku-sr">{` ${hint}`}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="ku-metric ku-metric--link" title={title}>{inner}</Link>
  ) : (
    <div className="ku-metric" title={title}>{inner}</div>
  );
};

/* ---------- Action list (what waits for the user, one panel) ---------- */
/** Items side by side in one panel with hairline dividers; stacked rows on narrow screens. */
export const ActionList: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <nav className="ku-actions" aria-label={label}>{children}</nav>
);
/**
 * One pending item; the whole item is a link. `urgent` (red) is reserved for the single most pressing item.
 * Title and meta each stay on one line (ellipsis if ever too long); `hint` is the full text as a tooltip.
 */
export const ActionItem: React.FC<{ icon: React.ReactNode; count: React.ReactNode; text: React.ReactNode; meta?: React.ReactNode; hint?: string; to: string; urgent?: boolean }> = ({ icon, count, text, meta, hint, to, urgent }) => (
  <Link to={to} className={cx('ku-action', urgent && 'ku-action--urgent')} title={hint}>
    <span className="ku-action__icon" aria-hidden="true">{icon}</span>
    <span className="ku-action__body">
      <span className="ku-action__title">
        <b className="ku-action__count">{count}</b> {text}
      </span>
      {meta && <span className="ku-action__meta">{meta}</span>}
    </span>
    <ChevronRight className="ku-icon--sm ku-action__go" aria-hidden="true" />
  </Link>
);

/* ---------- Row list (compact linked rows split by hairlines, e.g. inside a card) ---------- */
/** Use inside <ul className="ku-rowlist">. Secondary info sits under the title, so names wrap instead of being cut. */
export const RowLink: React.FC<{ to: string; lead?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; aside?: React.ReactNode }> = ({ to, lead, title, meta, aside }) => (
  <li>
    <Link to={to} className="ku-rowlist__link">
      {lead}
      <span className="ku-rowlist__main">
        <span className="ku-rowlist__title">{title}</span>
        {meta && <span className="ku-rowlist__meta">{meta}</span>}
      </span>
      {aside && <span className="ku-rowlist__aside">{aside}</span>}
    </Link>
  </li>
);

/** Horizontal fill bar (seats taken, share of a total). Neutral ink: the bar measures, it does not judge. */
export const Meter: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className="ku-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
};

/* ---------- Hero strip ---------- */
export const Strip: React.FC<{ tone?: 'accent' | 'warning' | 'danger'; icon: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; progress?: { done: number; total: number }; action?: React.ReactNode; onClose?: () => void }> = ({ tone = 'accent', icon, title, description, progress, action, onClose }) => (
  <div className={cx('ku-strip', tone !== 'accent' && `ku-strip--${tone}`)} role={tone === 'accent' ? 'status' : 'alert'}>
    <span className="ku-strip__icon" aria-hidden="true">{icon}</span>
    <div className="ku-strip__body">
      <div className="ku-strip__title">{title}</div>
      {description && <div className="ku-strip__desc">{description}</div>}
      {progress && (
        <div className="ku-strip__progress" aria-label={`${progress.done} dari ${progress.total} langkah selesai`}>
          {Array.from({ length: progress.total }, (_, i) => <i key={i} className={i < progress.done ? 'done' : undefined} />)}
        </div>
      )}
    </div>
    <div className="ku-strip__actions">
      {action}
      {onClose && (
        <button type="button" className="ku-strip__close" aria-label="Sembunyikan" onClick={onClose}>
          <X className="ku-icon--sm" />
        </button>
      )}
    </div>
  </div>
);

/* ---------- Notices ---------- */
export const Notice: React.FC<{ icon: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; when?: React.ReactNode; hot?: boolean; to?: string }> = ({ icon, title, meta, when, hot, to }) => {
  const inner = (
    <>
      <span className="ku-notice__icon" aria-hidden="true">{icon}</span>
      <span className="ku-notice__title">{title}</span>
      {when && <span className="ku-notice__when">{when}</span>}
      {meta && <span className="ku-notice__meta">{meta}</span>}
    </>
  );
  return to ? <Link to={to} className={cx('ku-notice', hot && 'ku-notice--hot')}>{inner}</Link> : <div className={cx('ku-notice', hot && 'ku-notice--hot')}>{inner}</div>;
};

/* ---------- Banner & empty ---------- */
export const Banner: React.FC<{ tone?: 'info' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({ tone = 'info', icon, children, action }) => (
  <div className={`ku-banner ku-banner--${tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
    {icon}
    <div className="ku-banner__body">{children}</div>
    {action}
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; compact?: boolean }> = ({ icon, title, description, action, compact }) => (
  <div className={cx('ku-empty', compact && 'ku-empty--compact')}>
    {icon && <span className="ku-empty__icon" aria-hidden="true">{icon}</span>}
    <div className="ku-empty__title">{title}</div>
    {description && <div className="ku-empty__desc">{description}</div>}
    {action && <div className="ku-empty__action">{action}</div>}
  </div>
);

/* ---------- Drawer & modal ---------- */
const useEscape = (open: boolean, onClose: () => void) => {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
};

// While a drawer or modal is open the page behind it must not scroll (otherwise its scrollbar shows next to
// the panel). A counter keeps the lock while a modal opens on top of a drawer; the padding stops the page
// from shifting sideways when its scrollbar disappears.
let scrollLocks = 0;
const useScrollLock = (open: boolean) => {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    if (scrollLocks++ === 0) {
      const gap = window.innerWidth - root.clientWidth;
      root.style.overflow = 'hidden';
      if (gap > 0) root.style.paddingRight = `${gap}px`;
    }
    return () => {
      if (--scrollLocks === 0) {
        root.style.overflow = '';
        root.style.paddingRight = '';
      }
    };
  }, [open]);
};

/** actions: optional header controls (e.g. an overflow Menu) shown on the right, next to the close button. */
export const Drawer: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }> = ({ open, onClose, title, subtitle, actions, footer, children }) => {
  useEscape(open, onClose);
  useScrollLock(open);
  const titleId = useId();
  if (!open) return null;
  return (
    <>
      <div className="ku-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="ku-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ku-drawer__head">
          <div className="ku-drawer__heading">
            <h2 id={titleId} className="ku-drawer__title">{title}</h2>
            {subtitle && <div className="ku-drawer__sub">{subtitle}</div>}
          </div>
          <div className="ku-drawer__actions">
            {actions}
            <IconButton label="Tutup" size="sm" variant="ghost" onClick={onClose}>
              <X className="ku-icon--sm" />
            </IconButton>
          </div>
        </div>
        <div className="ku-drawer__body">{children}</div>
        {footer && <div className="ku-drawer__foot">{footer}</div>}
      </aside>
    </>
  );
};

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; description?: React.ReactNode; footer?: React.ReactNode; wide?: boolean; children?: React.ReactNode }> = ({ open, onClose, title, description, footer, wide, children }) => {
  useEscape(open, onClose);
  useScrollLock(open);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="ku-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={cx('ku-modal', wide && 'ku-modal--wide')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ku-modal__head">
          <div style={{ flex: 1 }}>
            <h2 id={titleId} className="ku-modal__title">{title}</h2>
            {description && <p className="ku-modal__desc">{description}</p>}
          </div>
          <IconButton label="Tutup" size="sm" variant="ghost" onClick={onClose}>
            <X className="ku-icon--sm" />
          </IconButton>
        </div>
        <div className="ku-modal__body">{children}</div>
        {footer && <div className="ku-modal__foot">{footer}</div>}
      </div>
    </div>
  );
};

/* ---------- Formatting ---------- */
export const fmtNumber = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('id-ID'));
export const fmtRupiah = (n: number | null | undefined) => (n === null || n === undefined ? '—' : 'Rp ' + Math.round(n).toLocaleString('id-ID'));
export const fmtRupiahShort = (n: number) => {
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  return fmtRupiah(n);
};
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '—';
/** maxDigits: commission rates can have 2 decimals (2,25%); other percentages show 1. */
export const fmtPercent = (n: number, maxDigits = 1) => `${n.toLocaleString('id-ID', { maximumFractionDigits: maxDigits })}%`;
/** "12 mnt lalu", "3 jam lalu", "Kemarin", "4 hari lalu", then the date. */
export const fmtAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Kemarin';
  if (d < 7) return `${d} hari lalu`;
  return fmtDate(iso);
};

/* ---------- Pagination ---------- */
export const Pagination: React.FC<{ page: number; pageSize: number; total: number; onPage: (p: number) => void; pageSizes?: number[]; onPageSize?: (s: number) => void }> = ({ page, pageSize, total, onPage, pageSizes, onPageSize }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="ku-table-foot">
      <span className="ku-pager__range">
        {fmtNumber(from)}–{fmtNumber(to)} dari {fmtNumber(total)}
      </span>
      <div className="ku-pager">
        {pageSizes && onPageSize && (
          <Select label="Baris per halaman" value={String(pageSize)} onChange={(v) => onPageSize(Number(v))} options={pageSizes.map((s) => ({ value: String(s), label: `${s} per halaman` }))} />
        )}
        <IconButton label="Halaman sebelumnya" size="sm" className="ku-pager__prev" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="ku-icon--sm" />
        </IconButton>
        <IconButton label="Halaman berikutnya" size="sm" className="ku-pager__next" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="ku-icon--sm" />
        </IconButton>
      </div>
    </div>
  );
};

/* ---------- Overflow menu ---------- */
/** Action menu (three dots). The panel is position: fixed and opens upward when there is no room below
 * (e.g. in the sticky save bar), so it is never pushed off screen or clipped by a table or drawer. */
export const Menu: React.FC<{
  label: string;
  trigger: React.ReactNode;
  items: Array<{ label: string; onClick: () => void; danger?: boolean; icon?: React.ReactNode }>;
  /** 'end' (default): panel's right edge on the button's right edge. 'start': panel opens rightwards from the button. */
  align?: 'start' | 'end';
}> = ({ label, trigger, items, align = 'end' }) => {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left?: number; right?: number; top?: number; bottom?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const place = React.useCallback(() => {
    // Align to the button itself: the wrapper can be stretched by a flex parent.
    const r = ref.current?.querySelector('button')?.getBoundingClientRect();
    if (!r) return;
    const need = items.length * 36 + 16;
    const up = window.innerHeight - r.bottom < need + 8 && r.top > window.innerHeight - r.bottom;
    // clientWidth excludes the page scrollbar, like the box a fixed element is placed in.
    const vw = document.documentElement.clientWidth;
    // The panel is about 228px wide: an end-aligned panel that would run off the left edge (button near the
    // left, e.g. in a phone card) opens rightwards instead.
    const x = align === 'start' || r.right - 228 < 8 ? { left: Math.max(8, Math.min(r.left, vw - 228)) } : { right: Math.max(8, vw - r.right) };
    setPos(up ? { ...x, bottom: window.innerHeight - r.top + 6 } : { ...x, top: r.bottom + 6 });
  }, [items.length, align]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close only the menu, not the modal or drawer around it.
      e.stopPropagation();
      setOpen(false);
    };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, place]);

  return (
    <div className="ku-menu" ref={ref}>
      <IconButton
        label={label}
        size="sm"
        variant="ghost"
        onClick={() => {
          if (!open) place();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </IconButton>
      {open && pos && (
        <div className="ku-menu__panel" role="menu" style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={cx('ku-menu__item', it.danger && 'ku-menu__item--danger')} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------- Route tabs (sub-pages of an area) ---------- */
export const RouteTabs: React.FC<{ label: string; items: Array<{ to: string; label: string; count?: number; alert?: boolean; prefix?: boolean }> }> = ({ label, items }) => (
  <nav className="ku-tabs" aria-label={label}>
    {items.map((t) => (
      <NavLink key={t.to} to={t.to} end={!t.prefix} className={({ isActive }) => cx('ku-tab', isActive && 'ku-tab--on')}>
        {t.label}
        {t.count !== undefined && t.count > 0 && <span className={cx('ku-tab__n', t.alert && 'ku-tab__n--alert')}>{t.count.toLocaleString('id-ID')}</span>}
      </NavLink>
    ))}
  </nav>
);

/* ---------- Avatar (person icon) ---------- */
/** Round avatar: the photo when there is one (full URL), otherwise (or if it fails to load) a person icon, never initials (founder, 7 Oct 2026). `name` stays in the props for callers; the avatar is decorative. */
export const Avatar: React.FC<{ name: string; src?: string | null; size?: 'md' | 'lg' }> = ({ src, size = 'md' }) => {
  const [failed, setFailed] = React.useState(false);
  const cls = cx('ku-avatar', size === 'lg' && 'ku-avatar--lg');
  if (src && !failed) {
    return <img className={cx(cls, 'ku-avatar--img')} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <span className={cls} aria-hidden="true">
      <User size={size === 'lg' ? 24 : 16} />
    </span>
  );
};

/* ---------- Filter popover (all filters of a table behind one button) ---------- */
export const FilterMenu: React.FC<{ active: number; onReset: () => void; children: React.ReactNode }> = ({ active, onReset, children }) => {
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="ku-filter" ref={ref}>
      <Button size="sm" icon={<SlidersHorizontal className="ku-icon--sm" />} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Filter
        {active > 0 && <span className="ku-filter__count">{active}</span>}
      </Button>
      {open && (
        <div className="ku-filter__panel" role="dialog" aria-label="Filter">
          {children}
          <div className="ku-filter__foot">
            <Button size="sm" variant="ghost" onClick={onReset} disabled={active === 0}>Reset</Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>Selesai</Button>
          </div>
        </div>
      )}
    </div>
  );
};

/** API errors come as lowercase sentences from the backend; show them as a sentence. */
export const errorText = (e: unknown, fallback: string) => {
  const m = e instanceof Error && e.message ? e.message : fallback;
  return m.charAt(0).toUpperCase() + m.slice(1);
};

/* ---------- Money input: digits only, shown with thousand separators, "Rp" prefix ---------- */
export const MoneyInput: React.FC<{ id?: string; value: number | null; onChange: (v: number | null) => void; invalid?: boolean; placeholder?: string; disabled?: boolean }> = ({ id, value, onChange, invalid, placeholder, disabled }) => (
  <div className={cx('ku-money', invalid && 'ku-money--invalid', disabled && 'ku-money--disabled')}>
    <span className="ku-money__prefix" aria-hidden="true">Rp</span>
    <input
      id={id}
      className="ku-money__input"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={value === null ? '' : value.toLocaleString('id-ID')}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
        onChange(digits === '' ? null : Number(digits));
      }}
    />
  </div>
);
export { CityInput } from './CityInput';
