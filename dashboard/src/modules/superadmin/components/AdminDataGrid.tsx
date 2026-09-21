import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Inbox } from 'lucide-react';

export interface AdminColumn<T = any> {
  key: string;
  label: string;
  render?: (row: T, index: number) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface AdminTabOption<K = string> {
  key: K;
  label: string;
  count?: number;
}

export interface AdminDataGridProps<T = any, K = string> {
  title?: string;
  data: T[];
  columns: AdminColumn<T>[];
  loading?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  tabs?: AdminTabOption<K>[];
  activeTab?: K;
  onTabChange?: (tab: K) => void;
  actions?: React.ReactNode;
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  pageSize?: number;
}

export function AdminDataGrid<T extends Record<string, any>, K = string>({
  title,
  data,
  columns,
  loading = false,
  searchPlaceholder = 'Cari...',
  searchKeys,
  tabs,
  activeTab,
  onTabChange,
  actions,
  onRowClick,
  emptyMessage = 'Belum ada data',
  pageSize = 10,
}: AdminDataGridProps<T, K>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Search filtering
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lower = searchTerm.toLowerCase().trim();

    return data.filter((item) => {
      if (searchKeys && searchKeys.length > 0) {
        return searchKeys.some((key) => {
          const val = item[key as string];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(lower);
        });
      }
      return Object.values(item).some((val) => {
        return val !== null && val !== undefined && String(val).toLowerCase().includes(lower);
      });
    });
  }, [data, searchTerm, searchKeys]);

  // Pagination calculation
  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="sa-panel">
      {/* Integrated Data Toolbar */}
      <div className="sa-panel__toolbar">
        <div className="sa-panel__toolbar-left">
          {title && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--sa-text-primary)' }}>
                {title}
              </span>
              <span className="sa-badge sa-badge--neutral">
                {totalItems}
              </span>
            </div>
          )}

          <div className="sa-input-search">
            <Search size={14} className="sa-input-search__icon" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="sa-input-search__field"
            />
          </div>
        </div>

        <div className="sa-panel__toolbar-right">
          {tabs && tabs.length > 0 && onTabChange && (
            <div className="sa-segmented-tabs">
              {tabs.map((tab) => (
                <button
                  key={String(tab.key)}
                  type="button"
                  onClick={() => {
                    onTabChange(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`sa-segmented-tab ${activeTab === tab.key ? 'sa-segmented-tab--active' : ''}`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span style={{ fontSize: '11px', opacity: activeTab === tab.key ? 1 : 0.7 }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {actions}
        </div>
      </div>

      {/* Table Surface */}
      <div className="sa-table-container">
        <table className="sa-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    textAlign: col.align || 'left',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--sa-text-muted)' }}>
                    <RefreshCw size={18} className="db-spin" />
                    <span>Memuat data...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '56px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--sa-text-muted)' }}>
                    <Inbox size={28} strokeWidth={1.5} />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr
                  key={row.id || index}
                  onClick={() => onRowClick && onRowClick(row, index)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        textAlign: col.align || 'left',
                      }}
                    >
                      {col.render ? col.render(row, index) : row[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Integrated Pagination Footer */}
      {!loading && totalItems > 0 && (
        <div className="sa-pagination">
          <span className="sa-pagination__info">
            Menampilkan {startIdx}–{endIdx} dari {totalItems} data
          </span>

          <div className="sa-pagination__controls">
            <button
              type="button"
              className="sa-pagination__btn"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '12px', fontWeight: 600, padding: '0 8px', color: 'var(--sa-text-secondary)' }}>
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              className="sa-pagination__btn"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
