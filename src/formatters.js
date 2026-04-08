const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return numberFormatter.format(value);
}

export function formatSpeed(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return `${value.toFixed(2)}x`;
}

export function formatLoopMode(value) {
  if (value === 1) {
    return 'Loop';
  }

  if (value === 2) {
    return 'Hold';
  }

  return `Mode ${value ?? '--'}`;
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

export function formatTimeMs(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--:--';
  }

  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
