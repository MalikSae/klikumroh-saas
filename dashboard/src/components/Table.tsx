import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, ChevronLeft, ChevronRight, SearchX, RefreshCw } from 'lucide-react';
import './Table.css';

export interface Column<T = any> {
  key: string;
  label: string;
  render?: (row: T, index: number) => React.ReactNode;
  searchable?: boolean;
}

export interface TableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
  loading?: boolean;

  // Search feature (defaults to true)
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchKeys?: (keyof T | string)[];

  // Filter & Toolbar slots
  filterSlot?: React.ReactNode;
  toolbarActions?: React.ReactNode;

  // Pagination feature (defaults to true)
  paginated?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  currentPage?: number;
  onPageChange?: (page: number) => void;

  // Row click callback
  onRowClick?: (row: T, index: number) => void;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  emptyMessage = 'Belum ada data',
  className = '',
  loading = false,

  searchable = true,
  searchPlaceholder = 'Cari data...',
  searchValue,
  onSearchChange,
  searchKeys,

  filterSlot,
  toolbarActions,

  paginated = true,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  currentPage,
  onPageChange,
  onRowClick,
}: TableProps<T>) {
  // Internal search state if uncontrolled
  const [internalSearch, setInternalSearch] = useState<string>('');
  const isSearchControlled = searchValue !== undefined;
  const currentSearch = isSearchControlled ? searchValue : internalSearch;

  // Internal pagination state if uncontrolled
  const [internalPage, setInternalPage] = useState<number>(1);
  const [currentPageSize, setCurrentPageSize] = useState<number>(initialPageSize);
  const isPageControlled = currentPage !== undefined;
  const activePage = isPageControlled ? currentPage : internalPage;

  const handleSearchUpdate = (val: string) => {
    if (!isSearchControlled) {
      setInternalSearch(val);
    }
    if (onSearchChange) {
      onSearchChange(val);
    }
    // Reset page to 1 on search
    if (!isPageControlled) {
      setInternalPage(1);
    } else if (onPageChange) {
      onPageChange(1);
    }
  };

  const handlePageChange = (page: number) => {
    if (!isPageControlled) {
      setInternalPage(page);
    }
    if (onPageChange) {
      onPageChange(page);
    }
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10) || 10;
    setCurrentPageSize(newSize);
    handlePageChange(1);
  };

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchable || !currentSearch.trim()) {
      return data;
    }

    const q = currentSearch.trim().toLowerCase();

    return data.filter((row) => {
      // If specific search keys are defined
      if (searchKeys && searchKeys.length > 0) {
        return searchKeys.some((k) => {
          const val = row[k as string];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      }

      // Check all defined columns marked searchable (or default to all columns)
      return columns.some((col) => {
        if (col.searchable === false) return false;
        const val = row[col.key];
        if (val === null || val === undefined) return false;
        if (typeof val === 'string' || typeof val === 'number') {
          return String(val).toLowerCase().includes(q);
        }
        return false;
      });
    });
  }, [data, currentSearch, searchable, searchKeys, columns]);

  // Total pages
  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / currentPageSize));

  // Reset page if activePage > totalPages
  useEffect(() => {
    if (activePage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, activePage]);

  // Paginated slice
  const paginatedData = useMemo(() => {
    if (!paginated) {
      return filteredData;
    }
    const startIndex = (activePage - 1) * currentPageSize;
    return filteredData.slice(startIndex, startIndex + currentPageSize);
  }, [filteredData, paginated, activePage, currentPageSize]);

  // Item range display
  const startItem = totalItems === 0 ? 0 : (activePage - 1) * currentPageSize + 1;
  const endItem = Math.min(activePage * currentPageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (activePage <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis', totalPages] as (number | string)[];
    }
    if (activePage >= totalPages - 3) {
      return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as (number | string)[];
    }
    return [1, 'ellipsis', activePage - 1, activePage, activePage + 1, 'ellipsis', totalPages] as (number | string)[];
  }, [totalPages, activePage]);

  const showToolbar = searchable || filterSlot || toolbarActions;

  return (
    <div className={`db-table-wrapper ${className}`}>
      {showToolbar && (
        <div className="db-table-toolbar">
          <div className="db-table-toolbar__left">
            {searchable && (
              <div className="db-table-search">
                <Search size={16} className="db-table-search__icon" />
                <input
                  type="text"
                  className="db-table-search__input"
                  placeholder={searchPlaceholder}
                  value={currentSearch}
                  onChange={(e) => handleSearchUpdate(e.target.value)}
                  aria-label="Cari data tabel"
                  disabled={loading}
                />
                {currentSearch && !loading && (
                  <button
                    type="button"
                    className="db-table-search__clear"
                    onClick={() => handleSearchUpdate('')}
                    title="Hapus pencarian"
                    aria-label="Hapus pencarian"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            {filterSlot && <div className="db-table-toolbar__filter">{filterSlot}</div>}
          </div>

          {toolbarActions && (
            <div className="db-table-toolbar__right">{toolbarActions}</div>
          )}
        </div>
      )}

      <div
        className={`db-table-container ${
          paginated ? 'db-table-container--paginated' : ''
        }`}
      >
        <table className="db-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="db-table__th">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="db-table__empty">
                  <div className="db-table__empty-state">
                    <RefreshCw size={24} className="db-spin db-table__empty-icon" />
                    <p className="db-table__empty-title">Memuat data...</p>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="db-table__empty">
                  <div className="db-table__empty-state">
                    <SearchX size={32} className="db-table__empty-icon" />
                    <p className="db-table__empty-title">
                      {currentSearch.trim()
                        ? 'Tidak ada hasil yang sesuai dengan pencarian'
                        : emptyMessage}
                    </p>
                    {currentSearch.trim() && (
                      <>
                        <p className="db-table__empty-desc">
                          Coba gunakan kata kunci lain atau reset filter pencarian Anda.
                        </p>
                        <button
                          type="button"
                          className="db-table__empty-reset"
                          onClick={() => handleSearchUpdate('')}
                        >
                          Reset Pencarian
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => {
                const globalIndex = (activePage - 1) * currentPageSize + rowIndex;
                return (
                  <tr
                    key={rowIndex}
                    className={`db-table__row ${onRowClick ? 'db-table__row--clickable' : ''}`}
                    onClick={() => onRowClick?.(row, globalIndex)}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="db-table__td">
                        {col.render ? col.render(row, globalIndex) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paginated && !loading && (
        <div className="db-table-pagination">
          <div className="db-table-pagination__info">
            <span>
              Menampilkan <strong>{startItem}</strong> - <strong>{endItem}</strong> dari{' '}
              <strong>{totalItems}</strong> data
            </span>
            {pageSizeOptions.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label htmlFor="db-table-page-size" style={{ color: 'var(--db-text-muted)' }}>
                  Per hal:
                </label>
                <select
                  id="db-table-page-size"
                  className="db-table-pagination__size-select"
                  value={currentPageSize}
                  onChange={handlePageSizeChange}
                >
                  {pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="db-table-pagination__nav">
            <button
              type="button"
              className="db-table-pagination__btn"
              onClick={() => handlePageChange(activePage - 1)}
              disabled={activePage <= 1}
              aria-label="Halaman Sebelumnya"
            >
              <ChevronLeft size={16} />
              <span>Sebelumnya</span>
            </button>

            {pageNumbers.map((p, idx) => {
              if (p === 'ellipsis') {
                return (
                  <span key={`ellipsis-${idx}`} className="db-table-pagination__ellipsis">
                    ...
                  </span>
                );
              }
              const pageNum = p as number;
              const isActive = pageNum === activePage;
              return (
                <button
                  key={pageNum}
                  type="button"
                  className={`db-table-pagination__page ${
                    isActive ? 'db-table-pagination__page--active' : ''
                  }`}
                  onClick={() => handlePageChange(pageNum)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              className="db-table-pagination__btn"
              onClick={() => handlePageChange(activePage + 1)}
              disabled={activePage >= totalPages || totalItems === 0}
              aria-label="Halaman Selanjutnya"
            >
              <span>Selanjutnya</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
