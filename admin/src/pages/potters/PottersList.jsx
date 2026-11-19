import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { TableSkeleton } from '../../components/ui/TableSkeleton.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { FilterSelect } from '../../components/ui/Fields.jsx';
import { Button, BUTTON_BASE, BUTTON_VARIANTS } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { usePagedList } from '../../hooks/usePagedList.js';
import { useUrlFilters } from '../../hooks/useUrlFilters.js';
import { adminApi } from '../../services/adminApi.js';
import { POTTER_STATUS_META } from '../../utils/constants.js';
import { formatDateTime } from '../../utils/format.js';
import { formatBdPhone } from '../../utils/phone.js';

const PAGE_SIZE = 15;

export function PottersListPage() {
  const [filters, setFilter] = useUrlFilters(['q', 'status', 'district']);
  const meta = useAsync((signal) => adminApi.meta(signal), []);
  const list = usePagedList((params) => adminApi.potters.list(params), { ...filters, limit: PAGE_SIZE });
  const filtered = Boolean(filters.q || filters.status || filters.district);

  const columns = [
    {
      key: 'name',
      header: 'Potter',
      render: (p) => (
        <Link to={`/potters/${p.id}`} className="group block">
          <span className="font-medium text-charcoal group-hover:text-terracotta-700">{p.name}</span>
          <span className="block font-mono text-xs text-charcoal-soft">{p.id}</span>
        </Link>
      ),
    },
    { key: 'phone', header: 'Phone', hideBelow: 'sm', render: (p) => <span className="whitespace-nowrap">{formatBdPhone(p.phone)}</span> },
    { key: 'place', header: 'Village, district', hideBelow: 'md', render: (p) => `${p.village}, ${p.district}` },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge value={p.status} meta={POTTER_STATUS_META} /> },
    { key: 'registered', header: 'Registered', hideBelow: 'lg', render: (p) => <span className="text-charcoal-soft">{formatDateTime(p.registrationDate)}</span> },
    { key: 'open', header: <span className="sr-only">Open</span>, hideBelow: 'sm', className: 'text-right', render: (p) => <Link to={`/potters/${p.id}`} className="text-xs font-medium text-terracotta-600 hover:text-terracotta-700">View</Link> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Potters"
        subtitle="Registered potters, their contact details and account status."
        actions={<Link to="/potters/new" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}>Register potter</Link>}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <SearchInput value={filters.q} onCommit={(v) => setFilter('q', v)} label="Search potters" placeholder="Search name, village, phone or POT-…" />
          <FilterSelect label="Filter by status" placeholder="All statuses" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <FilterSelect label="Filter by district" placeholder="All districts" value={filters.district} onChange={(e) => setFilter('district', e.target.value)} options={meta.data?.districts ?? (filters.district ? [filters.district] : [])} />
          {filtered && (
            <Button onClick={() => ['q', 'status', 'district'].forEach((k) => setFilter(k, ''))}>Clear filters</Button>
          )}
        </div>

        {list.loading && !list.data ? (
          <TableSkeleton />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon="potters"
            title={filtered ? 'No potters match these filters' : 'No potters registered yet'}
            description={filtered ? 'Try a different search or clear the filters.' : 'Register the first potter to start assigning devices.'}
            action={!filtered && <Link to="/potters/new" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}>Register potter</Link>}
          />
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={list.loading}>
            <DataTable columns={columns} rows={list.data.items} caption="Potters" />
            {list.data.truncated && (
              <p className="border-t border-line px-5 py-3 text-xs text-charcoal-soft">Showing the first matches only. Narrow the search to see others.</p>
            )}
            <Pagination page={list.page} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prev} onNext={list.next} loading={list.loading} count={list.data.items.length} />
          </div>
        )}
        {list.error && list.data && <p role="alert" className="border-t border-line px-5 py-3 text-sm text-red-700">Could not refresh: {list.error.message}</p>}
      </Card>
    </div>
  );
}
