import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, CircleAlert, LoaderCircle, X } from 'lucide-react';

/**
 * Presentational progress UI. Connect to actual upload/download task state;
 * this component does not perform transfers or invent completion status.
 */
export function TransferProgress({ direction = 'upload', filename, progress, status = 'active', onCancel, error }) {
  const value = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  const isDownload = direction === 'download';
  const Icon = status === 'complete' ? CheckCircle2 : status === 'error' ? CircleAlert : isDownload ? ArrowDownToLine : ArrowUpFromLine;
  const label = status === 'complete' ? (isDownload ? 'Download complete' : 'Upload complete')
    : status === 'error' ? (error || 'Transfer failed')
    : isDownload ? 'Downloading' : 'Uploading';

  return <section className={`transfer-card transfer-${status}`} aria-label={`${label}: ${filename || 'file'}`}>
    <span className="transfer-icon"><Icon size={18} aria-hidden="true"/></span>
    <div className="transfer-body">
      <div className="transfer-heading"><strong title={filename}>{filename || 'File'}</strong><span>{label}</span></div>
      {status === 'active' && <div className="transfer-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><span style={{ width: value + '%' }}/></div>}
      <div className="transfer-meta">{status === 'active' ? `${Math.round(value)}% · Keep this screen open while the transfer runs` : status === 'complete' ? 'Ready' : 'You can retry when the issue is resolved.'}</div>
    </div>
    {status === 'active' && onCancel && <button className="transfer-cancel" type="button" onClick={onCancel} aria-label={`Cancel transfer of ${filename || 'file'}`}><X size={16}/></button>}
    {status === 'active' && <LoaderCircle className="spin transfer-spinner" size={16} aria-hidden="true"/>}
  </section>;
}
