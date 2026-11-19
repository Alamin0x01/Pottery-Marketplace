import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { TableSkeleton } from '../../components/ui/TableSkeleton.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Button, BUTTON_BASE, BUTTON_VARIANTS } from '../../components/ui/Button.jsx';
import { DetailList, PageHeader, TabPanel, Tabs } from '../../components/ui/Layout.jsx';
import { ConnectivityBadge, DeviceStatusBadge, LastSeen } from '../../features/devices/DeviceBits.jsx';
import { AssignDeviceDialog } from '../../features/devices/AssignDialogs.jsx';
import { SecretDialog } from '../../features/devices/SecretDialog.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { usePagedList } from '../../hooks/usePagedList.js';
import { usePolling } from '../../hooks/usePolling.js';
import { adminApi } from '../../services/adminApi.js';
import { ACTIVITY_VERBS } from '../../utils/constants.js';
import { actorLabel } from '../../utils/activity.js';
import { formatDateTime, formatDuration, formatRelative } from '../../utils/format.js';

const REFUSAL = {
  device_disabled: 'Refused: device is disabled',
  device_lost: 'Refused: device is marked lost',
  device_unassigned: 'Refused: device is not assigned to a potter',
  potter_inactive: 'Refused: the potter’s account is inactive',
};

function eventDetails(e) {
  if (e.type === 'rejected') return REFUSAL[e.reason] ?? `Refused (${e.reason})`;
  const parts = [
    typeof e.batteryPct === 'number' && `Battery ${e.batteryPct}%`,
    typeof e.signalCsq === 'number' && `Signal ${e.signalCsq}`,
    e.firmwareVersion && `Firmware ${e.firmwareVersion}`,
    typeof e.queuedUploads === 'number' && `Queued uploads ${e.queuedUploads}`,
    typeof e.droppedUploads === 'number' && e.droppedUploads > 0 && `Dropped uploads ${e.droppedUploads}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Contacted the server';
}

function CommunicationTab({ deviceId }) {
  const list = usePagedList((params) => adminApi.devices.events(deviceId, params), { limit: 15 });
  const columns = [
    { key: 'when', header: 'When', render: (e) => <time dateTime={e.at} title={formatDateTime(e.at)}>{formatDateTime(e.at)}</time> },
    { key: 'type', header: 'Result', render: (e) => <StatusBadge value={e.type} meta={{ heartbeat: { label: 'Connected', tone: 'success' }, rejected: { label: 'Refused', tone: 'warning' } }} /> },
    { key: 'details', header: 'Details', render: eventDetails },
  ];
  return (
    <Card title="Communication history" subtitle="Authenticated contacts from the device, newest first. Entries are kept for 30 days.">
      {list.loading && !list.data ? <TableSkeleton /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} compact /> : list.data.items.length === 0 ? (
        <EmptyState icon="clock" title="No communication yet" description="Once the device connects with its credentials, each contact is listed here." />
      ) : (
        <>
          <DataTable columns={columns} rows={list.data.items} caption="Device communication history" />
          <Pagination page={list.page} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prev} onNext={list.next} loading={list.loading} />
        </>
      )}
    </Card>
  );
}

function auditDetails(item) {
  const { before, after } = item;
  const bits = [];
  if (before?.status && after?.status && before.status !== after.status) bits.push(`${before.status} → ${after.status}`);
  else if (after?.status && !before) bits.push(`Status ${after.status}`);
  if (before?.potterId !== undefined && after?.potterId !== undefined && before.potterId !== after.potterId) bits.push(`${before.potterId ?? 'nobody'} → ${after.potterId}`);
  else if (after?.potterId && !before) bits.push(`Owner ${after.potterId}`);
  if (after?.credentialVersion) bits.push(`Credential version ${after.credentialVersion}`);
  if (after?.credentialRevoked) bits.push('Credentials revoked');
  if (after?.reason) bits.push(`Reason: ${after.reason}`);
  return bits.join(' · ') || '—';
}

function AuditTab({ deviceId }) {
  const list = usePagedList((params) => adminApi.devices.audit(deviceId, params), { limit: 15 });
  const columns = [
    { key: 'when', header: 'When', render: (i) => <span title={formatDateTime(i.timestamp)}>{formatDateTime(i.timestamp)}</span> },
    { key: 'who', header: 'By', hideBelow: 'sm', render: (i) => actorLabel(i.actor) },
    { key: 'what', header: 'Action', render: (i) => { const verb = ACTIVITY_VERBS[i.action] ?? i.action; return verb[0].toUpperCase() + verb.slice(1); } },
    { key: 'details', header: 'Details', hideBelow: 'md', render: auditDetails },
  ];
  return (
    <Card title="Administrative history" subtitle="Every change made to this device by an admin, newest first.">
      {list.loading && !list.data ? <TableSkeleton /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} compact /> : list.data.items.length === 0 ? (
        <EmptyState icon="check" title="No administrative changes yet" />
      ) : (
        <>
          <DataTable columns={columns} rows={list.data.items} caption="Device administrative history" />
          <Pagination page={list.page} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prev} onNext={list.next} loading={list.loading} />
        </>
      )}
    </Card>
  );
}

export function DeviceDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'admin' ? 'admin' : 'communication';
  const meta = useAsync((signal) => adminApi.meta(signal), []);
  const state = useAsync((signal) => adminApi.devices.get(id, signal), [id]);
  usePolling(() => state.reload({ silent: true }), 30_000);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice ?? null);
  const [provisioning, setProvisioning] = useState(null);
  const [historyKey, setHistoryKey] = useState(0); // remounts the history tabs after an action so they show it

  if (state.loading && !state.data) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (state.error && !state.data) {
    const missing = state.error.status === 404 || state.error.status === 400;
    return (
      <Card>
        {missing ? (
          <EmptyState icon="devices" title="Device not found" description={`There is no device with ID ${id}.`} action={<Link to="/devices" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}>Back to devices</Link>} />
        ) : (
          <ErrorState error={state.error} onRetry={state.reload} />
        )}
      </Card>
    );
  }

  const { device } = state.data;
  const afterAction = (message) => {
    if (message) setNotice(message);
    setHistoryKey((k) => k + 1);
    state.reload({ silent: true });
  };
  const lost = device.status === 'lost';
  const canAssign = device.status !== 'lost' && device.status !== 'disabled' && device.hasCredential;
  const assignHint = lost ? 'A lost device cannot be assigned.' : device.status === 'disabled' ? 'Enable the device before reassigning it.' : !device.hasCredential ? 'Issue new credentials first.' : undefined;
  const onlineWindow = meta.data?.onlineWindowSec;

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="font-mono">{device.id}</span>}
        badge={<DeviceStatusBadge device={device} />}
        subtitle={device.model ?? 'Model not set'}
        back={{ to: '/devices', label: 'All devices' }}
        actions={
          <>
            <Button variant="primary" onClick={() => setDialog('assign')} disabled={!canAssign} title={assignHint}>{device.potterId ? 'Reassign' : 'Assign to potter'}</Button>
            {device.status === 'active' && <Button onClick={() => setDialog('disable')}>Disable</Button>}
            {lost && <Button onClick={() => setDialog('recover')}>Recover device</Button>}
            {device.status === 'disabled' && <Button onClick={() => setDialog('enable')} disabled={!device.potterId || !device.hasCredential} title={!device.hasCredential ? 'Issue new credentials first.' : !device.potterId ? 'Assign the device to a potter first.' : undefined}>Enable</Button>}
          </>
        }
      />

      {notice && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-medium underline">Dismiss</button>
        </p>
      )}
      {lost && (
        <p role="status" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          This device is marked lost or stolen. Its credentials were revoked, so it can no longer authenticate. If it is found, use Recover device, then issue new credentials and enable it.
        </p>
      )}
      {device.status === 'unassigned' && device.hasCredential && (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">This device has credentials but no owner yet. It cannot act for any potter until you assign it.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Device" className="lg:col-span-2">
          <DetailList
            items={[
              { label: 'Device ID', value: <span className="font-mono">{device.id}</span> },
              {
                label: 'Assigned potter',
                always: true,
                value: device.potter ? (
                  <Link to={`/potters/${device.potter.id}`} className="font-medium text-terracotta-700 hover:underline">
                    {device.potter.name} <span className="font-mono text-xs text-charcoal-soft">({device.potter.id})</span>
                  </Link>
                ) : device.potterId,
              },
              { label: 'Network status', value: <span className="flex flex-wrap items-center gap-2"><ConnectivityBadge device={device} /><LastSeen value={device.lastSeen} /></span> },
              { label: 'Last seen', value: device.lastSeen ? formatDateTime(device.lastSeen) : 'Never' },
              { label: 'Model', value: device.model, always: true },
              { label: 'Firmware version', value: device.firmwareVersion, always: true },
              { label: 'Battery', value: typeof device.batteryPct === 'number' ? `${device.batteryPct}%` : null, always: true },
              { label: 'Signal (CSQ)', value: typeof device.signalCsq === 'number' ? `${device.signalCsq} of 31` : null, always: true },
              { label: 'Queued uploads', value: typeof device.queuedUploads === 'number' ? device.queuedUploads : null, always: true },
              { label: 'Polling interval', value: `${formatDuration(device.pollIntervalSec)}` },
              { label: 'Registered', value: formatDateTime(device.registeredAt) },
              { label: 'Assigned', value: device.assignedAt ? formatDateTime(device.assignedAt) : null, always: true },
            ]}
          />
          {onlineWindow && <p className="border-t border-line px-5 py-3 text-xs text-charcoal-soft">A device counts as online if it contacted the server within the last {formatDuration(onlineWindow)}.</p>}
        </Card>

        <Card title="Credentials" subtitle="Secrets are never stored or displayed after creation.">
          <div className="space-y-4 p-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-charcoal-soft">State</span>
              <StatusBadge value={device.hasCredential ? 'valid' : 'revoked'} meta={{ valid: { label: 'Valid', tone: 'success' }, revoked: { label: 'Revoked', tone: 'danger' } }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-charcoal-soft">Reference</span>
              <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">{device.credentialFingerprint ?? 'none'}</code>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-charcoal-soft">Version</span>
              <span>{device.credentialVersion}</span>
            </div>
            {device.credentialRevokedAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-charcoal-soft">Revoked</span>
                <span title={formatDateTime(device.credentialRevokedAt)}>{formatRelative(device.credentialRevokedAt)}</span>
              </div>
            )}
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <Button onClick={() => setDialog('issue')} disabled={lost} title={lost ? 'A lost device cannot receive credentials.' : undefined}>Issue new credentials</Button>
              <Button variant="dangerOutline" onClick={() => setDialog('revoke')} disabled={!device.hasCredential}>Revoke credentials</Button>
              {!lost && <Button variant="dangerOutline" onClick={() => setDialog('lost')}>Mark as lost or stolen</Button>}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Tabs
          tabs={[{ id: 'communication', label: 'Communication' }, { id: 'admin', label: 'Administrative history' }]}
          active={tab}
          onChange={(t) => setParams(t === 'admin' ? { tab: 'admin' } : {}, { replace: true })}
          label="Device history"
        />
        <TabPanel id={tab}>
          {tab === 'communication' ? <CommunicationTab key={historyKey} deviceId={device.id} /> : <AuditTab key={historyKey} deviceId={device.id} />}
        </TabPanel>
      </div>

      {dialog === 'assign' && <AssignDeviceDialog device={device} onClose={() => setDialog(null)} onAssigned={() => afterAction('Device assigned.')} />}
      {dialog === 'disable' && (
        <ConfirmDialog title={`Disable ${device.id}?`} confirmLabel="Disable device" askReason onClose={() => setDialog(null)} onConfirm={async (reason) => { await adminApi.devices.setStatus(device.id, 'disabled', reason); afterAction('Device disabled.'); }}>
          <p>The device will be refused by the server until you enable it again. Orders waiting for delivery to it are moved to the potter’s other active device, or flagged for follow-up.</p>
        </ConfirmDialog>
      )}
      {dialog === 'enable' && (
        <ConfirmDialog title={`Enable ${device.id}?`} confirmLabel="Enable device" tone="primary" onClose={() => setDialog(null)} onConfirm={async () => { await adminApi.devices.setStatus(device.id, 'active'); afterAction('Device enabled.'); }}>
          <p>The device can authenticate again with its current credentials.</p>
        </ConfirmDialog>
      )}
      {dialog === 'recover' && (
        <ConfirmDialog title={`Recover ${device.id}?`} confirmLabel="Set to disabled" tone="primary" askReason onClose={() => setDialog(null)} onConfirm={async (reason) => { await adminApi.devices.setStatus(device.id, 'disabled', reason); afterAction('Device is no longer marked lost. Issue new credentials, then enable it.'); }}>
          <p>Use this only if the device was found or the report was a mistake. It becomes <strong>Disabled</strong> with no credentials: you must issue new credentials and enable it before it can connect again.</p>
        </ConfirmDialog>
      )}
      {dialog === 'lost' && (
        <ConfirmDialog title={`Mark ${device.id} as lost or stolen?`} confirmLabel="Mark as lost" askReason onClose={() => setDialog(null)} onConfirm={async (reason) => { await adminApi.devices.setStatus(device.id, 'lost', reason); afterAction('Device marked as lost. Its credentials were revoked.'); }}>
          <p>This <strong>revokes the device’s credentials immediately</strong>: whoever holds it can no longer connect. Pending orders are moved to the potter’s other active device or flagged for follow-up.</p>
        </ConfirmDialog>
      )}
      {dialog === 'revoke' && (
        <ConfirmDialog title={`Revoke credentials of ${device.id}?`} confirmLabel="Revoke credentials" askReason onClose={() => setDialog(null)} onConfirm={async (reason) => { await adminApi.devices.revoke(device.id, reason); afterAction('Credentials revoked.'); }}>
          <p>The current secret stops working at once{device.status === 'active' ? ' and the device is disabled' : ''}. To use the device again, issue new credentials and enable it.</p>
        </ConfirmDialog>
      )}
      {dialog === 'issue' && (
        <ConfirmDialog title={`Issue new credentials for ${device.id}?`} confirmLabel="Generate new secret" tone="primary" onClose={() => setDialog(null)} onConfirm={async () => { const res = await adminApi.devices.issueCredentials(device.id); setProvisioning(res.provisioning); afterAction(); }}>
          <p>A new secret is generated and shown once. {device.hasCredential ? 'The current secret stops working immediately, so the device must be reconfigured with the new one.' : ''} The device’s status is not changed.</p>
        </ConfirmDialog>
      )}
      {provisioning && <SecretDialog provisioning={provisioning} reissued onDone={() => setProvisioning(null)} />}
    </div>
  );
}
