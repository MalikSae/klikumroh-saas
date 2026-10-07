// Daily prospects per channel, stacked bars on one axis (dataviz: validated channel colors, legend,
// per-bar tooltip). Channels can be hidden with the legend toggles above the chart. Light horizontal
// gridlines at the y ticks only.
import React from 'react';
import type { DailyTrendItem } from '../../services/api';
import { CHANNEL_LABEL, useIsMobile, type Channel } from '../../ui';

const KEYS: Array<{ ch: Channel; key: 'organik' | 'meta_ads' | 'agent' }> = [
  { ch: 'web', key: 'organik' },
  { ch: 'ads', key: 'meta_ads' },
  { ch: 'agen', key: 'agent' },
];

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = Math.ceil(v / step);
  const m = n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return m * step;
};

export const ChannelChart: React.FC<{ data: DailyTrendItem[]; visible: Record<Channel, boolean> }> = ({ data, visible }) => {
  const shown = KEYS.filter((k) => visible[k.ch]);
  const totals = data.map((d) => shown.reduce((a, k) => a + d[k.key], 0));
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  // Phones have room for about 4 date labels, desktop for 8.
  const mobile = useIsMobile();
  const labelEvery = Math.ceil(data.length / (mobile ? 4 : 8));
  const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  return (
    <div className="db2-chart" role="img" aria-label={`Prospek per hari selama ${data.length} hari, total ${totals.reduce((a, b) => a + b, 0)}`}>
      <div className="db2-chart__y" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>
        ))}
      </div>
      <div className="db2-chart__plot">
        <div className="db2-chart__grid" aria-hidden="true">
          {ticks.map((t) => (
            <i key={t} />
          ))}
        </div>
        {data.map((d, i) => (
          <div key={d.date} className="db2-chart__col">
            <div className="db2-chart__tip" role="tooltip">
              <div className="db2-chart__tip-title">{day(d.date)}</div>
              {shown.map((k) => (
                <div key={k.ch}>
                  <i className={`ku-dot ku-dot--${k.ch}`} />
                  {CHANNEL_LABEL[k.ch]}
                  <b>{d[k.key]}</b>
                </div>
              ))}
              <div className="db2-chart__tip-total">
                Total<b>{totals[i]}</b>
              </div>
            </div>
            <div className="db2-chart__stack" style={{ height: `${(totals[i] / max) * 100}%` }}>
              {shown.map((k) => (d[k.key] > 0 ? <i key={k.ch} className={`db2-bar--${k.ch}`} style={{ flexGrow: d[k.key] }} /> : null))}
            </div>
            {/* The last day always gets a label; the one before it is dropped if it would touch it. */}
            {(i === data.length - 1 || (i % labelEvery === 0 && data.length - 1 - i >= labelEvery / 2)) && (
              <span className={`db2-chart__x${i === 0 ? ' db2-chart__x--first' : i === data.length - 1 ? ' db2-chart__x--last' : ''}`}>{day(d.date)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
